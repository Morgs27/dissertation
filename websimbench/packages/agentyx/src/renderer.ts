// import Logger from "./helpers/logger";
import GPU from "./helpers/gpu";
import type { Agent, SimulationAppearance } from "./types";
import type { WebGPURenderResources } from "./compute/webGPU";

const GPU_FLOAT_SIZE = 4;
const GPU_AGENT_COMPONENTS = 6; // id, x, y, vx, vy, species
const GPU_AGENT_STRIDE = GPU_AGENT_COMPONENTS * GPU_FLOAT_SIZE;
const GPU_QUAD_VERTICES = new Float32Array([
    -1, -1, 1, -1, 1, 1,
    -1, -1, 1, 1, -1, 1,
]);

// 8 distinct species colors
const SPECIES_PALETTE = [
    '#00FFFF', // Cyan (species 0 - default)
    '#FF4466', // Red-pink
    '#44FF66', // Green
    '#FFAA22', // Orange
    '#AA66FF', // Purple
    '#FFFF44', // Yellow
    '#FF66AA', // Pink
    '#66AAFF', // Light blue
];

// Helper to convert hex to rgb 0-1
function hexToRgb(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { r, g, b, a: 1 };
}

export class Renderer {
    canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null = null;
    private gpuCanvas: HTMLCanvasElement | null = null;
    private appearance: SimulationAppearance;

    private gpuHelper: GPU;
    private gpuDevice: GPUDevice | null = null;
    private gpuPipeline: GPURenderPipeline | null = null;
    private gpuBindGroupLayout: GPUBindGroupLayout | null = null;
    private gpuQuadBuffer: GPUBuffer | null = null;
    private gpuUniformBuffer: GPUBuffer | null = null;
    private gpuUniformBufferSize = 0;
    private gpuAgentBuffer: GPUBuffer | null = null;
    private gpuAgentBufferSize = 0;
    private gpuPipelineDevice: GPUDevice | null = null;

    // For manual upload of trails (CPU compute -> GPU render)
    private gpuManualTrailBuffer: GPUBuffer | null = null;
    private gpuManualTrailBufferSize = 0;

    private gpuTrailPipeline: GPURenderPipeline | null = null;
    private gpuTrailBindGroupLayout: GPUBindGroupLayout | null = null;

    // private Logger: Logger;

    constructor(canvas: HTMLCanvasElement, gpuCanvas: HTMLCanvasElement | null, appearance: SimulationAppearance) {
        // this.Logger = new Logger('Renderer');
        this.canvas = canvas;

        this.gpuCanvas = gpuCanvas;
        this.appearance = appearance;
        this.gpuHelper = new GPU("RendererGPU");
    }

    initGPU(device: GPUDevice) {
        this.gpuDevice = device;
    }

    getAppearance(): SimulationAppearance {
        return this.appearance;
    }

    setAppearance(appearance: SimulationAppearance) {
        this.appearance = appearance;
    }

    renderBackground() {
        const ctx = this.ensureContext();
        ctx.fillStyle = this.appearance.backgroundColor;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderTrails(trailMap: Float32Array, width: number, height: number) {
        const ctx = this.ensureContext();
        // Create ImageData if dimensions mismatch or doesn't exist (optimization: cache it)
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Get trail color
        const { r, g, b } = hexToRgb(this.appearance.trailColor);
        const R = r * 255;
        const G = g * 255;
        const B = b * 255;

        // We need to blend with background because putImageData is not composited
        // Or simpler: just write pixels where trail > 0 and assume background is already there?
        // No, putImageData overwrites. So we must either:
        // 1. Read current canvas back (slow)
        // 2. Clear canvas to background color within this loop? No, that's what renderBackground did.
        // 3. Since we decoupled renderBackground, the canvas has the BG color now.
        //    But putImageData will wipe it out with the imageData buffer (which is fully opaque or transparent).
        //    If we leave alpha 0, it won't overwrite? NO. putImageData is a block copy.
        // Option: Write to a transparent ImageData and put it? 
        //         Canvas implicitly composites if we use valid alpha? 
        //         MDN: "putImageData() puts the data... not affected by globalCompositeOperation etc."
        //         It REPLACES target pixels.
        // So efficient way: We assume consistent background color.

        const bgRgb = hexToRgb(this.appearance.backgroundColor);
        const bgR = bgRgb.r * 255;
        const bgG = bgRgb.g * 255;
        const bgB = bgRgb.b * 255;

        for (let i = 0; i < trailMap.length; i++) {
            const intensity = trailMap[i] * (this.appearance.trailOpacity ?? 1.0); // 0 to 1

            // Optimization: if intensity is 0, just write background color
            // (Since putImageData replaces, we must write BG color for empty pixels too, 
            // OR we must read the previous frame? No, we cleared it manually in simulation.ts)

            // Linear interpolate between BG and Trail Color
            // out = trail * intensity + bg * (1 - intensity)

            const inv = 1 - Math.min(1, Math.max(0, intensity));
            const safeInt = 1 - inv;

            data[i * 4] = R * safeInt + bgR * inv;
            data[i * 4 + 1] = G * safeInt + bgG * inv;
            data[i * 4 + 2] = B * safeInt + bgB * inv;
            data[i * 4 + 3] = 255; // Full alpha
        }

        ctx.putImageData(imageData, 0, 0);
    }

    renderAgents(agents: Agent[]) {
        // this.Logger.log("Rendering agents with CPU"); // Commented out to reduce log spam
        const ctx = this.ensureContext();

        const radius = this.appearance.agentSize;
        const isCircle = this.appearance.agentShape === 'circle';

        // Use configured species colors or fallback to default palette
        const palette = this.appearance.speciesColors && this.appearance.speciesColors.length > 0
            ? this.appearance.speciesColors
            : SPECIES_PALETTE;

        agents.forEach(agent => {
            const speciesIdx = agent.species || 0;
            ctx.fillStyle = palette[speciesIdx % palette.length];
            ctx.beginPath();
            if (isCircle) {
                ctx.arc(agent.x, agent.y, radius, 0, Math.PI * 2);
            } else {
                ctx.rect(agent.x - radius, agent.y - radius, radius * 2, radius * 2);
            }
            ctx.fill();
        });
    }

    async renderAgentsGPU(agents: Agent[], resources?: WebGPURenderResources, trailMap?: Float32Array): Promise<void> {
        if (!this.gpuCanvas || !this.gpuDevice) return;

        this.gpuHelper.configureCanvas(this.gpuCanvas);
        this.gpuHelper.setupCanvasConfig(this.gpuDevice);

        this.configurePipeline(this.gpuDevice);
        this.configureTrailPipeline(this.gpuDevice);

        const renderResources = resources ?? this.prepareAgentBuffer(this.gpuDevice, agents);

        // Determine trail buffer strategy
        let trailBuffer = renderResources.trailMapBuffer;

        // If no GPU-resident trail buffer (from WebGPU compute), but we have a CPU trail map
        if (!trailBuffer && trailMap) {
            trailBuffer = this.prepareManualTrailBuffer(this.gpuDevice, trailMap);
        }

        this.executeRender(this.gpuDevice, renderResources, trailBuffer);
    }

    private configurePipeline(device: GPUDevice) {
        if (this.gpuPipeline && this.gpuPipelineDevice === device) return;
        if (this.gpuPipeline && this.gpuPipelineDevice !== device) {
            this.resetGPUState();
        }

        this.gpuBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            ],
        });

        // WGSL Shader with species color support
        const shaderCode = `
            struct RenderUniforms {
                width: f32, 
                height: f32, 
                radius: f32, 
                shape: f32, // 0 = square, 1 = circle
                colorR: f32,
                colorG: f32,
                colorB: f32,
                speciesCount: f32,
            };
            struct SpeciesColors {
                colors: array<vec4<f32>, 8>,
            };
            struct VertexOutput { 
                @builtin(position) position: vec4<f32>, 
                @location(0) uv: vec2<f32>,
                @location(1) @interpolate(flat) speciesIdx: u32 
            };
            @group(0) @binding(0) var<uniform> uniforms: RenderUniforms;
            @group(0) @binding(1) var<uniform> speciesColors: SpeciesColors;

            @vertex fn vs_main(@location(0) quadPos: vec2<f32>, @location(1) agentPos: vec2<f32>, @location(2) agentSpecies: f32) -> VertexOutput {
                var out: VertexOutput;
                let scaled = quadPos * uniforms.radius;
                let world = agentPos + scaled;
                let clipX = (world.x / uniforms.width) * 2.0 - 1.0;
                let clipY = 1.0 - (world.y / uniforms.height) * 2.0;
                out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
                out.uv = quadPos; // -1 to 1
                out.speciesIdx = u32(agentSpecies);
                return out;
            }

            @fragment fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
                if (uniforms.shape > 0.5) {
                    // Circle: discard if outside unit circle
                    if (length(input.uv) > 1.0) {
                        discard;
                    }
                }
                let idx = input.speciesIdx % 8u;
                let col = speciesColors.colors[idx];
                return vec4<f32>(col.r, col.g, col.b, 1.0);
            }
        `;

        const shaderModule = device.createShaderModule({ code: shaderCode });

        this.gpuPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.gpuBindGroupLayout] }),
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [
                    { arrayStride: 2 * GPU_FLOAT_SIZE, attributes: [{ shaderLocation: 0, format: "float32x2" as GPUVertexFormat, offset: 0 }] },
                    {
                        arrayStride: GPU_AGENT_STRIDE, stepMode: "instance" as GPUVertexStepMode, attributes: [
                            { shaderLocation: 1, format: "float32x2" as GPUVertexFormat, offset: GPU_FLOAT_SIZE },  // x, y (skip id)
                            { shaderLocation: 2, format: "float32" as GPUVertexFormat, offset: 5 * GPU_FLOAT_SIZE }, // species
                        ]
                    },
                ],
            },
            fragment: { module: shaderModule, entryPoint: "fs_main", targets: [{ format: this.gpuHelper.getFormat()! }] },
            primitive: { topology: "triangle-list" },
        });

        this.gpuQuadBuffer = this.gpuHelper.createBuffer(device, GPU_QUAD_VERTICES, GPUBufferUsage.VERTEX);
        this.gpuPipelineDevice = device;
    }

    private configureTrailPipeline(device: GPUDevice) {
        if (this.gpuTrailPipeline && this.gpuPipelineDevice === device) return;

        this.gpuTrailBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
            ],
        });

        const shaderCode = `
            struct TrailUniforms {
                width: f32,
                height: f32,
                colorR: f32,
                colorG: f32,
                colorB: f32,
                opacity: f32,
            }
            @group(0) @binding(0) var<storage, read> trailMap: array<f32>;
            @group(0) @binding(1) var<uniform> uniforms: TrailUniforms;

            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) uv: vec2<f32>,
            }

            @vertex fn vs_main(@location(0) pos: vec2<f32>) -> VertexOutput {
                var out: VertexOutput;
                out.position = vec4<f32>(pos, 0.0, 1.0);
                out.uv = pos * 0.5 + 0.5; // 0 to 1
                return out;
            }

            @fragment fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
                let x = u32(in.uv.x * uniforms.width);
                let y = u32((1.0 - in.uv.y) * uniforms.height); // Flip Y match
                let idx = y * u32(uniforms.width) + x;
                
                // Safety check
                let total = u32(uniforms.width * uniforms.height);
                if (idx >= total) { discard; }

                let val = trailMap[idx];
                if (val < 0.01) { discard; }

                // Using pre-multiplied alpha or just alpha?
                // Visual preference: use color with alpha = intensity
                return vec4<f32>(uniforms.colorR, uniforms.colorG, uniforms.colorB, val * uniforms.opacity);
            }
        `;

        const shaderModule = device.createShaderModule({ code: shaderCode });

        this.gpuTrailPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.gpuTrailBindGroupLayout] }),
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [
                    { arrayStride: 2 * GPU_FLOAT_SIZE, attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }] }
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fs_main",
                targets: [{
                    format: this.gpuHelper.getFormat()!,
                    blend: {
                        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
                    }
                }]
            },
            primitive: { topology: "triangle-list" },
        });
    }

    private prepareAgentBuffer(device: GPUDevice, agents: Agent[]): WebGPURenderResources {
        const data = new Float32Array(agents.length * GPU_AGENT_COMPONENTS);
        for (let i = 0; i < agents.length; i++) {
            data.set([agents[i].id, agents[i].x, agents[i].y, agents[i].vx, agents[i].vy, agents[i].species || 0], i * GPU_AGENT_COMPONENTS);
        }

        if (!this.gpuAgentBuffer || this.gpuAgentBufferSize < data.byteLength) {
            this.gpuAgentBuffer = this.gpuHelper.createBuffer(device, data, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
            this.gpuAgentBufferSize = data.byteLength;
        } else {
            this.gpuHelper.writeBuffer(device, this.gpuAgentBuffer, data);
        }

        return { device, agentVertexBuffer: this.gpuAgentBuffer!, agentCount: agents.length, agentStride: GPU_AGENT_STRIDE };
    }

    private prepareManualTrailBuffer(device: GPUDevice, trailMap: Float32Array): GPUBuffer {
        const byteSize = trailMap.byteLength;
        if (!this.gpuManualTrailBuffer || this.gpuManualTrailBufferSize < byteSize) {
            // Reallocate
            this.gpuManualTrailBuffer = this.gpuHelper.createBuffer(
                device,
                trailMap,
                GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            );
            this.gpuManualTrailBufferSize = byteSize;
        } else {
            // Update existing
            this.gpuHelper.writeBuffer(device, this.gpuManualTrailBuffer, trailMap);
        }
        return this.gpuManualTrailBuffer;
    }

    private executeRender(device: GPUDevice, resources: WebGPURenderResources, trailBuffer?: GPUBuffer) {
        const ctx = this.gpuHelper.getContext();
        if (!ctx || !this.gpuPipeline || !this.gpuBindGroupLayout) return;

        // Prepare uniforms
        const { r, g, b } = hexToRgb(this.appearance.agentColor);
        const shape = this.appearance.agentShape === 'circle' ? 1 : 0;

        // 8 floats: width, height, radius, shape, r, g, b, pad
        const uniformData = new Float32Array([
            this.canvas.width,
            this.canvas.height,
            this.appearance.agentSize,
            shape,
            r, g, b, 0
        ]);

        if (!this.gpuUniformBuffer || this.gpuUniformBufferSize < uniformData.byteLength) {
            this.gpuUniformBuffer = this.gpuHelper.createBuffer(
                device,
                null,
                GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                uniformData.byteLength
            );
            this.gpuUniformBufferSize = uniformData.byteLength;
        }
        this.gpuHelper.writeBuffer(device, this.gpuUniformBuffer, uniformData);

        // Create species color palette uniform (8 colors × vec4<f32>)
        // Use configured or fallback
        const paletteSource = this.appearance.speciesColors && this.appearance.speciesColors.length > 0
            ? this.appearance.speciesColors
            : SPECIES_PALETTE;

        const paletteData = new Float32Array(8 * 4);
        for (let i = 0; i < 8; i++) {
            // Cycle through available colors if we need more than we have
            const colorHex = paletteSource[i % paletteSource.length];
            const { r, g, b } = hexToRgb(colorHex);
            paletteData[i * 4] = r;
            paletteData[i * 4 + 1] = g;
            paletteData[i * 4 + 2] = b;
            paletteData[i * 4 + 3] = 1.0;
        }
        const paletteBuffer = this.gpuHelper.createBuffer(
            device,
            paletteData,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        );

        const bindGroup = device.createBindGroup({
            layout: this.gpuBindGroupLayout!,
            entries: [
                { binding: 0, resource: { buffer: this.gpuUniformBuffer } },
                { binding: 1, resource: { buffer: paletteBuffer } },
            ],
        });

        const bgRgb = hexToRgb(this.appearance.backgroundColor);
        const clearColor = { r: bgRgb.r, g: bgRgb.g, b: bgRgb.b, a: 1.0 };

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: clearColor, loadOp: "clear", storeOp: "store" }],
        });

        // 1. Render Trails
        // Use either the resource provided buffer (WebGPU compute) or manual buffer (CPU compute) passed as arg
        const activeTrailBuffer = trailBuffer || this.gpuManualTrailBuffer || resources.trailMapBuffer;

        // Ensure we really have it (sometimes resources.trailMapBuffer might be undefined if not in GPU mode)
        // If we are in CPU render mode (manual trail upload), we rely on trailBuffer passed in.

        if (this.appearance.showTrails && activeTrailBuffer && this.gpuTrailPipeline && this.gpuTrailBindGroupLayout) {
            const { r, g, b } = hexToRgb(this.appearance.trailColor);

            // Create uniform buffer for trails (width, height, r, g, b, pad)
            // 6 floats -> round to 8 for alignment if needed, or Float32Array length check
            const trailUniformData = new Float32Array([
                this.canvas.width,
                this.canvas.height,
                r, g, b,
                this.appearance.trailOpacity ?? 1.0
            ]);
            const trailUniformBuffer = this.gpuHelper.createBuffer(
                device,
                trailUniformData,
                GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            );

            const trailBindGroup = device.createBindGroup({
                layout: this.gpuTrailBindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: activeTrailBuffer } },
                    { binding: 1, resource: { buffer: trailUniformBuffer } }
                ]
            });

            pass.setPipeline(this.gpuTrailPipeline);
            pass.setBindGroup(0, trailBindGroup);
            pass.setVertexBuffer(0, this.gpuQuadBuffer!);
            pass.draw(6); // 6 vertices for quad
        }

        pass.setPipeline(this.gpuPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, this.gpuQuadBuffer!);
        pass.setVertexBuffer(1, resources.agentVertexBuffer);
        if (resources.agentCount > 0) {
            pass.draw(GPU_QUAD_VERTICES.length / 2, resources.agentCount);
        }
        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    private ensureContext(): CanvasRenderingContext2D {
        if (!this.ctx) {
            this.ctx = this.canvas.getContext("2d");
        }
        return this.ctx!;
    }

    resetGPUState() {
        this.gpuPipeline = null;
        this.gpuPipelineDevice = null;
        this.gpuBindGroupLayout = null;
        this.gpuTrailPipeline = null;
        this.gpuTrailBindGroupLayout = null;
        this.gpuQuadBuffer = null;
        this.gpuUniformBuffer = null;
        this.gpuUniformBufferSize = 0;
        this.gpuAgentBuffer = null;
        this.gpuAgentBufferSize = 0;
        this.gpuManualTrailBuffer = null;
        this.gpuManualTrailBufferSize = 0;
    }
}

export default Renderer;
