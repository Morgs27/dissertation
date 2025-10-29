import { WORKGROUP_SIZE } from "../compiler/WGSLcompiler";
import Logger from "../logger";
import type { Agent, InputValues } from "../types";

const FLOAT_SIZE = 4;
const COMPONENTS_PER_AGENT = 3; // id, x, y
const RENDER_AGENT_RADIUS = 2; // pixels

const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
   1,  1,
  -1, -1,
   1,  1,
  -1,  1,
]);

export class WebGPU {
  private Logger: Logger;
  private wgslCode: string;
  private inputsExpected: string[] = [];

  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private computePipeline: GPUComputePipeline | null = null;
  private computeBindGroupLayout: GPUBindGroupLayout | null = null;

  private agentStorageBuffer: GPUBuffer | null = null;
  private agentVertexBuffer: GPUBuffer | null = null;
  private agentCount = 0;
  private agentBufferInitialized = false;

  private canvasContext: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private renderBindGroupLayout: GPUBindGroupLayout | null = null;
  private quadVertexBuffer: GPUBuffer | null = null;
  private computeUniformBuffer: GPUBuffer | null = null;
  private computeUniformBufferSize = 0;
  private renderUniformBuffer: GPUBuffer | null = null;
  private renderUniformBufferSize = 0;

  constructor(wgslCode: string, inputsExpected: string[]) {
    this.Logger = new Logger("WebGPUComputeEngine");
    this.wgslCode = wgslCode;
    this.inputsExpected = inputsExpected;
  }

  async init(): Promise<void> {
    if (!navigator.gpu) {
      const message = "WebGPU not supported in this browser.";
      this.Logger.error(message);
      throw new Error(message);
    }

    this.adapter = await navigator.gpu.requestAdapter();

    if (!this.adapter) {
      const message = "Failed to get GPU adapter.";
      this.Logger.error(message);
      throw new Error(message);
    }

    this.device = await this.adapter.requestDevice();
    const shaderModule = this.device.createShaderModule({ code: this.wgslCode });

    this.computeBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.computeBindGroupLayout] }),
      compute: { module: shaderModule, entryPoint: "main" },
    });

    this.Logger.info("WebGPU compute pipeline initialised.");
  }

  async compute(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
    await this.ensureComputePipeline();

    if (!this.device || !this.computePipeline || !this.computeBindGroupLayout) {
      const message = "WebGPU not properly initialised.";
      this.Logger.error(message);
      throw new Error(message);
    }

    const device = this.device;

    const agentData = this.packAgentData(agents);
    const inputData = this.packInputData(inputs);

    const inputBuffer = this.createBuffer(inputData, GPUBufferUsage.UNIFORM);
    const agentBuffer = this.createBuffer(agentData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);

    const readbackBuffer = device.createBuffer({
      size: agentData.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const bindGroup = device.createBindGroup({
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: agentBuffer } },
        { binding: 1, resource: { buffer: inputBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(this.computePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(agents.length / WORKGROUP_SIZE));
    pass.end();

    encoder.copyBufferToBuffer(agentBuffer, 0, readbackBuffer, 0, agentData.byteLength);
    device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = readbackBuffer.getMappedRange();
    const result = new Float32Array(arrayBuffer.slice(0));
    readbackBuffer.unmap();

    const updatedAgents: Agent[] = [];
    for (let i = 0; i < agents.length; i++) {
      updatedAgents.push({
        id: result[i * COMPONENTS_PER_AGENT + 0],
        x: result[i * COMPONENTS_PER_AGENT + 1],
        y: result[i * COMPONENTS_PER_AGENT + 2],
      });
    }

    return updatedAgents;
  }

  async computeAndRender(canvas: HTMLCanvasElement, agents: Agent[], inputs: InputValues): Promise<void> {
    await this.ensureComputePipeline();
    await this.ensureRenderPipeline(canvas);
    this.ensureAgentBuffers(agents);

    if (!this.device || !this.computePipeline || !this.computeBindGroupLayout || !this.renderPipeline || !this.canvasContext) {
      const message = "WebGPU rendering pipeline not correctly initialised.";
      this.Logger.error(message);
      throw new Error(message);
    }

    const device = this.device;

    const inputData = this.packInputData(inputs);
    const inputBuffer = this.prepareComputeUniformBuffer(inputData);
    const renderUniformBuffer = this.prepareRenderUniformBuffer(canvas);

    const computeBindGroup = device.createBindGroup({
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.agentStorageBuffer! } },
        { binding: 1, resource: { buffer: inputBuffer } },
      ],
    });

    const renderBindGroup = device.createBindGroup({
      layout: this.renderBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: renderUniformBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    if (this.agentCount > 0) {
      computePass.dispatchWorkgroups(Math.ceil(this.agentCount / WORKGROUP_SIZE));
    }
    computePass.end();

    if (this.agentCount > 0) {
      encoder.copyBufferToBuffer(
        this.agentStorageBuffer!,
        0,
        this.agentVertexBuffer!,
        0,
        this.agentCount * COMPONENTS_PER_AGENT * FLOAT_SIZE,
      );
    }

    const textureView = this.canvasContext.getCurrentTexture().createView();

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0, g: 0, b: 1, a: 1 }, // blue background
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.setVertexBuffer(0, this.quadVertexBuffer!);
    renderPass.setVertexBuffer(1, this.agentVertexBuffer!);
    renderPass.draw(QUAD_VERTICES.length / 2, this.agentCount);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
  }

  private async ensureComputePipeline(): Promise<void> {
    if (this.device && this.computePipeline && this.computeBindGroupLayout) {
      return;
    }

    await this.init();
  }

  private async ensureRenderPipeline(canvas: HTMLCanvasElement): Promise<void> {
    await this.ensureComputePipeline();

    if (!this.device) {
      const message = "Cannot configure render pipeline without GPU device.";
      this.Logger.error(message);
      throw new Error(message);
    }

    if (!this.canvasContext) {
      const context = canvas.getContext("webgpu");
      if (!context) {
        const message = "Failed to acquire WebGPU rendering context.";
        this.Logger.error(message);
        throw new Error(message);
      }
      this.canvasContext = context;
      this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    }

    this.canvasContext.configure({
      device: this.device,
      format: this.canvasFormat!,
      alphaMode: "opaque",
    });

    if (!this.renderPipeline) {
      this.renderBindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: "uniform" },
          },
        ],
      });

      const module = this.device.createShaderModule({
        code: `
          struct RenderUniforms {
            width: f32,
            height: f32,
            radius: f32,
            _pad: f32,
          };

          struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec3<f32>,
          };

          @group(0) @binding(0) var<uniform> uniforms: RenderUniforms;

          @vertex
          fn vs_main(
            @location(0) quadPos: vec2<f32>,
            @location(1) agentPos: vec2<f32>
          ) -> VertexOutput {
            var output: VertexOutput;
            let scaled = quadPos * uniforms.radius;
            let world = agentPos + scaled;
            let clipX = (world.x / uniforms.width) * 2.0 - 1.0;
            let clipY = 1.0 - (world.y / uniforms.height) * 2.0;
            output.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
            output.color = vec3<f32>(1.0, 0.0, 0.0);
            return output;
          }

          @fragment
          fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
            return vec4<f32>(input.color, 1.0);
          }
        `,
      });

      this.renderPipeline = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({
          bindGroupLayouts: [this.renderBindGroupLayout],
        }),
        vertex: {
          module,
          entryPoint: "vs_main",
          buffers: [
            {
              arrayStride: 2 * FLOAT_SIZE,
              attributes: [
                {
                  shaderLocation: 0,
                  format: "float32x2",
                  offset: 0,
                },
              ],
            },
            {
              arrayStride: COMPONENTS_PER_AGENT * FLOAT_SIZE,
              stepMode: "instance",
              attributes: [
                {
                  shaderLocation: 1,
                  format: "float32x2",
                  offset: FLOAT_SIZE, // skip id component
                },
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: "fs_main",
          targets: [{ format: this.canvasFormat! }],
        },
        primitive: {
          topology: "triangle-list",
        },
      });

      this.ensureQuadVertexBuffer();
    }
  }

  private ensureQuadVertexBuffer() {
    if (this.quadVertexBuffer || !this.device) return;

    this.quadVertexBuffer = this.device.createBuffer({
      size: QUAD_VERTICES.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(this.quadVertexBuffer.getMappedRange()).set(QUAD_VERTICES);
    this.quadVertexBuffer.unmap();
  }

  private ensureAgentBuffers(agents: Agent[]) {
    if (!this.device) {
      const message = "Device unavailable when preparing agent buffers.";
      this.Logger.error(message);
      throw new Error(message);
    }

    const requiredSize = agents.length * COMPONENTS_PER_AGENT * FLOAT_SIZE;
    const needsRecreate =
      !this.agentStorageBuffer ||
      !this.agentVertexBuffer ||
      this.agentCount !== agents.length;

    if (needsRecreate) {
      this.agentStorageBuffer?.destroy();
      this.agentVertexBuffer?.destroy();

      const bufferSize = Math.max(requiredSize, FLOAT_SIZE);

      this.agentStorageBuffer = this.device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });

      const mapped = new Float32Array(this.agentStorageBuffer.getMappedRange());
      mapped.set(this.packAgentData(agents));
      this.agentStorageBuffer.unmap();

      this.agentVertexBuffer = this.device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });

      this.agentCount = agents.length;
      this.agentBufferInitialized = true;
      return;
    }

    const storageBuffer = this.agentStorageBuffer;

    if (!storageBuffer || !this.agentVertexBuffer) {
      const message = "Agent buffers missing during reuse.";
      this.Logger.error(message);
      throw new Error(message);
    }

    if (!this.agentBufferInitialized) {
      const agentData = this.packAgentData(agents);
      this.device.queue.writeBuffer(
        storageBuffer,
        0,
        agentData.buffer,
        agentData.byteOffset,
        agentData.byteLength,
      );
      this.agentBufferInitialized = true;
    }
  }

  private prepareComputeUniformBuffer(data: Float32Array): GPUBuffer {
    if (!this.device) {
      const message = "GPU device unavailable when updating compute uniforms.";
      this.Logger.error(message);
      throw new Error(message);
    }

    const requiredSize = Math.max(data.byteLength, FLOAT_SIZE);

    if (!this.computeUniformBuffer || this.computeUniformBufferSize < requiredSize) {
      this.computeUniformBuffer?.destroy();
      this.computeUniformBuffer = this.device.createBuffer({
        size: requiredSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.computeUniformBufferSize = requiredSize;
    }

    this.device.queue.writeBuffer(this.computeUniformBuffer, 0, data.buffer, data.byteOffset, data.byteLength);
    return this.computeUniformBuffer!;
  }

  private prepareRenderUniformBuffer(canvas: HTMLCanvasElement): GPUBuffer {
    if (!this.device) {
      const message = "GPU device unavailable when updating render uniforms.";
      this.Logger.error(message);
      throw new Error(message);
    }

    const uniformData = new Float32Array([
      canvas.width,
      canvas.height,
      RENDER_AGENT_RADIUS,
      0,
    ]);

    const requiredSize = Math.max(uniformData.byteLength, FLOAT_SIZE);

    if (!this.renderUniformBuffer || this.renderUniformBufferSize < requiredSize) {
      this.renderUniformBuffer?.destroy();
      this.renderUniformBuffer = this.device.createBuffer({
        size: requiredSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.renderUniformBufferSize = requiredSize;
    }

    this.device.queue.writeBuffer(
      this.renderUniformBuffer,
      0,
      uniformData.buffer,
      uniformData.byteOffset,
      uniformData.byteLength,
    );

    return this.renderUniformBuffer!;
  }

  private packAgentData(agents: Agent[]): Float32Array {
    const data = new Float32Array(agents.length * COMPONENTS_PER_AGENT);

    for (let i = 0; i < agents.length; i++) {
      data[i * COMPONENTS_PER_AGENT + 0] = agents[i].id;
      data[i * COMPONENTS_PER_AGENT + 1] = agents[i].x;
      data[i * COMPONENTS_PER_AGENT + 2] = agents[i].y;
    }

    return data;
  }

  private packInputData(inputs: InputValues): Float32Array {
    return new Float32Array(this.inputsExpected.map(name => Number(inputs[name] ?? 0)));
  }

  private createBuffer(data: Float32Array, usage: GPUBufferUsageFlags): GPUBuffer {
    if (!this.device) {
      const message = "GPU device unavailable during buffer creation.";
      this.Logger.error(message);
      throw new Error(message);
    }

    const buffer = this.device.createBuffer({
      size: Math.max(data.byteLength, FLOAT_SIZE),
      usage: usage | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });

    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();

    return buffer;
  }
}

export default WebGPU;
