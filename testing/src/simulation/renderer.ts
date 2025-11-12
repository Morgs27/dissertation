import Logger from "./helpers/logger";
import GPU from "./helpers/gpu";
import type { Agent } from "./types";
import type { WebGPURenderResources } from "./compute/webGPU";

const BACKGROUND_COLOR = 'blue';
const AGENT_COLOR = 'red';
const AGENT_RADIUS = 1;
const GPU_AGENT_RADIUS = 2;
const GPU_FLOAT_SIZE = 4;
const GPU_AGENT_COMPONENTS = 3;
const GPU_AGENT_STRIDE = GPU_AGENT_COMPONENTS * GPU_FLOAT_SIZE;
const GPU_CLEAR_COLOR: GPUColor = { r: 0, g: 0, b: 1, a: 1 };
const GPU_QUAD_VERTICES = new Float32Array([
    -1, -1, 1, -1, 1, 1,
    -1, -1, 1, 1, -1, 1,
]);

export class Renderer {
    canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null = null;

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

    private Logger: Logger;

    constructor(canvas: HTMLCanvasElement) {
        this.Logger = new Logger('Renderer');
        this.canvas = canvas;
        this.gpuHelper = new GPU("RendererGPU");
    }

    renderBackground() {
        const ctx = this.ensureContext();
        ctx.fillStyle = BACKGROUND_COLOR;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderAgents(agents: Agent[]) {
        this.Logger.log("Rendering agents with CPU");
        const ctx = this.ensureContext();
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.renderBackground();
        ctx.fillStyle = AGENT_COLOR;

        agents.forEach(agent => {
            ctx.beginPath();
            ctx.arc(agent.x, agent.y, AGENT_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    async renderAgentsGPU(agents: Agent[], resources?: WebGPURenderResources): Promise<void> {
        if (resources?.device && this.gpuDevice && this.gpuDevice !== resources.device) {
            this.resetGPUState();
        }

        if (resources?.device) {
            this.gpuDevice = resources.device;
        } else if (!this.gpuDevice) {
            this.gpuDevice = await this.gpuHelper.getDevice();
        }

        const device = this.gpuDevice!;

        this.gpuHelper.configureCanvas(this.canvas);
        this.gpuHelper.setupCanvasConfig(device);

        this.configurePipeline(device);

        const renderResources = resources ?? this.prepareAgentBuffer(device, agents);

        this.executeRender(device, renderResources);
    }

    private configurePipeline(device: GPUDevice) {
        if (this.gpuPipeline && this.gpuPipelineDevice === device) return;
        if (this.gpuPipeline && this.gpuPipelineDevice !== device) {
            this.resetGPUState();
        }

        this.gpuBindGroupLayout = device.createBindGroupLayout({
            entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
        });

        const shaderModule = device.createShaderModule({
            code: `
                struct RenderUniforms {
                    width: f32, height: f32, radius: f32, _pad: f32,
                };
                struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) color: vec3<f32> };
                @group(0) @binding(0) var<uniform> uniforms: RenderUniforms;

                @vertex fn vs_main(@location(0) quadPos: vec2<f32>, @location(1) agentPos: vec2<f32>) -> VertexOutput {
                    var out: VertexOutput;
                    let scaled = quadPos * uniforms.radius;
                    let world = agentPos + scaled;
                    let clipX = (world.x / uniforms.width) * 2.0 - 1.0;
                    let clipY = 1.0 - (world.y / uniforms.height) * 2.0;
                    out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
                    out.color = vec3<f32>(1.0, 0.0, 0.0);
                    return out;
                }

                @fragment fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
                    return vec4<f32>(input.color, 1.0);
                }
            `,
        });

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
            data.set([agents[i].id, agents[i].x, agents[i].y], i * GPU_AGENT_COMPONENTS);
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

        const uniformData = new Float32Array([this.canvas.width, this.canvas.height, GPU_AGENT_RADIUS, 0]);
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

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: GPU_CLEAR_COLOR, loadOp: "clear", storeOp: "store" }],
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
            const ctx = this.canvas.getContext("2d");
            if (!ctx) throw new Error("2D context not available");
            this.ctx = ctx;
        }
        return this.ctx;
    }

    private resetGPUState() {
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
