// import Logger from "./helpers/logger";
import GPU from "./helpers/gpu";
import type { Agent, SimulationAppearance } from "./types";
import type { WebGPURenderResources } from "./compute/webGPU";

const GPU_FLOAT_SIZE = 4;
const GPU_AGENT_COMPONENTS = 5; // id, x, y, vx, vy
const GPU_AGENT_STRIDE = GPU_AGENT_COMPONENTS * GPU_FLOAT_SIZE;
const GPU_QUAD_VERTICES = new Float32Array([
    -1, -1, 1, -1, 1, 1,
    -1, -1, 1, 1, -1, 1,
]);

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

    renderBackground() {
        const ctx = this.ensureContext();
        ctx.fillStyle = this.appearance.backgroundColor;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderAgents(agents: Agent[]) {
        // this.Logger.log("Rendering agents with CPU"); // Commented out to reduce log spam
        const ctx = this.ensureContext();
        
        // Use appearance settings
        this.renderBackground();
        ctx.fillStyle = this.appearance.agentColor;
        
        const radius = this.appearance.agentSize;
        const isCircle = this.appearance.agentShape === 'circle';

        agents.forEach(agent => {
            ctx.beginPath();
            if (isCircle) {
                ctx.arc(agent.x, agent.y, radius, 0, Math.PI * 2);
            } else {
                ctx.rect(agent.x - radius, agent.y - radius, radius * 2, radius * 2);
            }
            ctx.fill();
        });
    }

    async renderAgentsGPU(agents: Agent[], resources?: WebGPURenderResources): Promise<void> {
        if (!this.gpuCanvas || !this.gpuDevice) return;

        this.gpuHelper.configureCanvas(this.gpuCanvas);
        this.gpuHelper.setupCanvasConfig(this.gpuDevice);

        this.configurePipeline(this.gpuDevice);

        const renderResources = resources ?? this.prepareAgentBuffer(this.gpuDevice, agents);

        this.executeRender(this.gpuDevice, renderResources);
    }

    private configurePipeline(device: GPUDevice) {
        if (this.gpuPipeline && this.gpuPipelineDevice === device) return;
        if (this.gpuPipeline && this.gpuPipelineDevice !== device) {
            this.resetGPUState();
        }

        this.gpuBindGroupLayout = device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
        });

        // WGSL Shader with appearance support
        const shaderCode = `
            struct RenderUniforms {
                width: f32, 
                height: f32, 
                radius: f32, 
                shape: f32, // 0 = square, 1 = circle
                colorR: f32,
                colorG: f32,
                colorB: f32,
                _pad: f32,
            };
            struct VertexOutput { 
                @builtin(position) position: vec4<f32>, 
                @location(0) uv: vec2<f32> 
            };
            @group(0) @binding(0) var<uniform> uniforms: RenderUniforms;

            @vertex fn vs_main(@location(0) quadPos: vec2<f32>, @location(1) agentPos: vec2<f32>) -> VertexOutput {
                var out: VertexOutput;
                let scaled = quadPos * uniforms.radius;
                let world = agentPos + scaled;
                let clipX = (world.x / uniforms.width) * 2.0 - 1.0;
                let clipY = 1.0 - (world.y / uniforms.height) * 2.0;
                out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
                out.uv = quadPos; // -1 to 1
                return out;
            }

            @fragment fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
                if (uniforms.shape > 0.5) {
                    // Circle: discard if outside unit circle
                    if (length(input.uv) > 1.0) {
                        discard;
                    }
                }
                return vec4<f32>(uniforms.colorR, uniforms.colorG, uniforms.colorB, 1.0);
            }
        `;

        const shaderModule = device.createShaderModule({ code: shaderCode });

        this.gpuPipeline = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.gpuBindGroupLayout] }),
            vertex: {
                module: shaderModule,
                entryPoint: "vs_main",
                buffers: [
                    { arrayStride: 2 * GPU_FLOAT_SIZE, attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }] },
                    { arrayStride: GPU_AGENT_STRIDE, stepMode: "instance", attributes: [{ shaderLocation: 1, format: "float32x2", offset: GPU_FLOAT_SIZE }] },
                ],
            },
            fragment: { module: shaderModule, entryPoint: "fs_main", targets: [{ format: this.gpuHelper.getFormat()! }] },
            primitive: { topology: "triangle-list" },
        });

        this.gpuQuadBuffer = this.gpuHelper.createBuffer(device, GPU_QUAD_VERTICES, GPUBufferUsage.VERTEX);
        this.gpuPipelineDevice = device;
    }

    private prepareAgentBuffer(device: GPUDevice, agents: Agent[]): WebGPURenderResources {
        const data = new Float32Array(agents.length * GPU_AGENT_COMPONENTS);
        for (let i = 0; i < agents.length; i++) {
            data.set([agents[i].id, agents[i].x, agents[i].y, agents[i].vx, agents[i].vy], i * GPU_AGENT_COMPONENTS);
        }

        if (!this.gpuAgentBuffer || this.gpuAgentBufferSize < data.byteLength) {
            this.gpuAgentBuffer = this.gpuHelper.createBuffer(device, data, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
            this.gpuAgentBufferSize = data.byteLength;
        } else {
            this.gpuHelper.writeBuffer(device, this.gpuAgentBuffer, data);
        }

        return { device, agentVertexBuffer: this.gpuAgentBuffer!, agentCount: agents.length, agentStride: GPU_AGENT_STRIDE };
    }

    private executeRender(device: GPUDevice, resources: WebGPURenderResources) {
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

        const bindGroup = device.createBindGroup({
            layout: this.gpuBindGroupLayout!,
            entries: [{ binding: 0, resource: { buffer: this.gpuUniformBuffer } }],
        });

        const bgRgb = hexToRgb(this.appearance.backgroundColor);
        const clearColor = { r: bgRgb.r, g: bgRgb.g, b: bgRgb.b, a: 1.0 };

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: clearColor, loadOp: "clear", storeOp: "store" }],
        });

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
        this.gpuQuadBuffer = null;
        this.gpuUniformBuffer = null;
        this.gpuUniformBufferSize = 0;
        this.gpuAgentBuffer = null;
        this.gpuAgentBufferSize = 0;
    }
}

export default Renderer;
