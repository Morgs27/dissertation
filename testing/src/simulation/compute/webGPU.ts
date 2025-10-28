import { WORKGROUP_SIZE } from "../compiler/WGSLcompiler";
import Logger from "../logger";
import type { Agent, InputValues } from "../types";

export class WebGPU {
  private Logger: Logger;
  private wgslCode: string;
  private inputsExpected: string[] = [];

  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;

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

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      ],
    });

    this.pipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      compute: { module: shaderModule, entryPoint: "main" },
    });

    this.Logger.info("WebGPU initialized successfully.");
  }

  async compute(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
    
    if (!this.device || !this.pipeline || !this.bindGroupLayout) {
        await this.init();
        
        if (!this.device || !this.pipeline || !this.bindGroupLayout) {
            const message = "WebGPU not properly initialized.";
            this.Logger.error(message);
            throw new Error(message);
        }
    }

    const device = this.device;

    // Pack agent data: id, x, y -> 3 floats per agent
    const agentData = new Float32Array(agents.length * 3);
    for (let i = 0; i < agents.length; i++) {
      agentData[i * 3 + 0] = agents[i].id;
      agentData[i * 3 + 1] = agents[i].x;
      agentData[i * 3 + 2] = agents[i].y;
    }

    const inputData = new Float32Array(
        this.inputsExpected.map(name => Number(inputs[name] ?? 0))
    );

    const inputBuffer = this.createBuffer(inputData, GPUBufferUsage.UNIFORM);

    const agentBuffer = this.createBuffer(agentData, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
        
    const readbackBuffer = device.createBuffer({
      size: agentData.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: agentBuffer } },
        { binding: 1, resource: { buffer: inputBuffer } },
      ],
    });

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);

    pass.dispatchWorkgroups(Math.ceil(agents.length / WORKGROUP_SIZE));

    pass.end();

    encoder.copyBufferToBuffer(agentBuffer, 0, readbackBuffer, 0, agentData.byteLength);
    device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);

    const arrayBuffer = readbackBuffer.getMappedRange();
    const result = new Float32Array(arrayBuffer.slice(0));

    readbackBuffer.unmap();

    // Rebuild updated agents from GPU output
    const updatedAgents: Agent[] = [];
    for (let i = 0; i < agents.length; i++) {
      updatedAgents.push({
        id: result[i * 3 + 0],
        x: result[i * 3 + 1],
        y: result[i * 3 + 2],
      });
    }

    return updatedAgents;
  }

  private createBuffer(data: Float32Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const device = this.device!;
    
    const buffer = device.createBuffer({
      size: data.byteLength,
      usage: usage | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    
    new Float32Array(buffer.getMappedRange()).set(data);
    
    buffer.unmap();
    
    return buffer;
  }
}

export default WebGPU;
