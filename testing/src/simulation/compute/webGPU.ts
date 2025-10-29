import GPU from "../helpers/gpu";
import Logger from "../helpers/logger";
import type { Agent, InputValues } from "../types";
import { WORKGROUP_SIZE } from "../compiler/WGSLcompiler";

const FLOAT_SIZE = 4;
const COMPONENTS_PER_AGENT = 3;

export type WebGPURenderResources = {
    device: GPUDevice;
    agentVertexBuffer: GPUBuffer;
    agentCount: number;
    agentStride: number;
};

export type WebGPUComputeResult = {
    updatedAgents?: Agent[];
    renderResources?: WebGPURenderResources;
};

export default class WebGPU {
    private Logger = new Logger("WebGPUCompute");
    private gpuHelper = new GPU("WebGPUComputeHelper");
    private wgslCode: string;
    private inputsExpected: string[];
    private device: GPUDevice | null = null;
    private computePipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;

    private agentStorageBuffer: GPUBuffer | null = null;
    private agentVertexBuffer: GPUBuffer | null = null;
    private agentCount = 0;
    private agentStorageBufferSize = 0;
    private agentVertexBufferSize = 0;
    private maxWorkgroupsPerDimension = 65535;

    constructor(wgslCode: string, inputsExpected: string[]) {
        this.wgslCode = wgslCode;
        this.inputsExpected = inputsExpected;
    }

    async init() {
        const device = await this.gpuHelper.getDevice();
        const module = device.createShaderModule({ code: this.wgslCode });

        this.bindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
            ],
        });

        this.computePipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: { module, entryPoint: "main" },
        });

        this.maxWorkgroupsPerDimension = device.limits?.maxComputeWorkgroupsPerDimension ?? this.maxWorkgroupsPerDimension;

        this.device = device;
        this.Logger.info("Compute pipeline initialized.");
    }

    async compute(agents: Agent[], inputs: InputValues, readback = true): Promise<WebGPUComputeResult> {
        if (!this.device || !this.computePipeline) await this.init();
        const device = this.device!;
        const pipeline = this.computePipeline!;
        const layout = this.bindGroupLayout!;

        this.ensureAgentBuffers(device, agents, readback);

        const inputData = new Float32Array(this.inputsExpected.map(n => Number(inputs[n] ?? 0)));
        const inputBuffer = this.gpuHelper.createBuffer(device, inputData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

        const bindGroup = device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: { buffer: this.agentStorageBuffer! } },
                { binding: 1, resource: { buffer: inputBuffer } },
            ],
        });

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        const totalWorkgroups = Math.ceil(this.agentCount / WORKGROUP_SIZE);
        const [dispatchX, dispatchY, dispatchZ] = this.computeDispatchDimensions(totalWorkgroups);
        if (dispatchX > 0) {
            pass.dispatchWorkgroups(dispatchX, dispatchY, dispatchZ);
        }
        pass.end();

        const copySize = this.agentCount * COMPONENTS_PER_AGENT * FLOAT_SIZE;
        if (copySize > 0) {
            encoder.copyBufferToBuffer(
                this.agentStorageBuffer!,
                0,
                this.agentVertexBuffer!,
                0,
                copySize,
            );
        }

        let readbackBuffer: GPUBuffer | undefined;
        if (readback) {
            readbackBuffer = device.createBuffer({
                size: Math.max(copySize, COMPONENTS_PER_AGENT * FLOAT_SIZE),
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            if (copySize > 0) {
                encoder.copyBufferToBuffer(this.agentStorageBuffer!, 0, readbackBuffer, 0, copySize);
            }
        }

        device.queue.submit([encoder.finish()]);

        let updatedAgents: Agent[] | undefined;
        if (readback && readbackBuffer) {
            await readbackBuffer.mapAsync(GPUMapMode.READ);
            const data = new Float32Array(readbackBuffer.getMappedRange());
            updatedAgents = Array.from({ length: this.agentCount }, (_, i) => ({
                id: data[i * COMPONENTS_PER_AGENT + 0],
                x: data[i * COMPONENTS_PER_AGENT + 1],
                y: data[i * COMPONENTS_PER_AGENT + 2],
            }));
            readbackBuffer.unmap();
        }

        return {
            updatedAgents,
            renderResources: {
                device,
                agentVertexBuffer: this.agentVertexBuffer!,
                agentCount: this.agentCount,
                agentStride: COMPONENTS_PER_AGENT * FLOAT_SIZE,
            },
        };
    }

    private ensureAgentBuffers(device: GPUDevice, agents: Agent[], syncFromCPU: boolean) {
        const requiredSize = Math.max(agents.length * COMPONENTS_PER_AGENT * FLOAT_SIZE, COMPONENTS_PER_AGENT * FLOAT_SIZE);
        const countChanged = agents.length !== this.agentCount;

        if (!this.agentStorageBuffer || this.agentStorageBufferSize < requiredSize || countChanged) {
            this.agentStorageBuffer = this.gpuHelper.createBuffer(
                device,
                null,
                GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                requiredSize
            );
            this.agentStorageBufferSize = requiredSize;
            syncFromCPU = true;
        }

        if (!this.agentVertexBuffer || this.agentVertexBufferSize < requiredSize || countChanged) {
            this.agentVertexBuffer = this.gpuHelper.createBuffer(
                device,
                null,
                GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                requiredSize
            );
            this.agentVertexBufferSize = requiredSize;
        }

        if (syncFromCPU && agents.length > 0) {
            const data = new Float32Array(agents.length * COMPONENTS_PER_AGENT);
            for (let i = 0; i < agents.length; i++) {
                data.set([agents[i].id, agents[i].x, agents[i].y], i * COMPONENTS_PER_AGENT);
            }
            this.gpuHelper.writeBuffer(device, this.agentStorageBuffer!, data);
        }

        this.agentCount = agents.length;
    }

    private computeDispatchDimensions(totalWorkgroups: number): [number, number, number] {
        if (!totalWorkgroups) return [0, 1, 1];
        const max = this.maxWorkgroupsPerDimension;

        const dispatchX = Math.min(totalWorkgroups, max);
        let remainingGroups = Math.ceil(totalWorkgroups / dispatchX);

        const dispatchY = Math.min(remainingGroups, max);
        remainingGroups = Math.ceil(remainingGroups / dispatchY);

        const dispatchZ = Math.min(remainingGroups, max);

        const capacity = dispatchX * dispatchY * dispatchZ;
        if (capacity < totalWorkgroups) {
            throw new Error(`Agent count ${this.agentCount} exceeds supported dispatch capacity for this device.`);
        }

        return [dispatchX, dispatchY, dispatchZ];
    }
}
