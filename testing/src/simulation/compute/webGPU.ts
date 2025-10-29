import Logger from "../helpers/logger";
import GPU from "../helpers/gpu";
import type { Agent, InputValues } from "../types";
import { WORKGROUP_SIZE } from "../compiler/WGSLcompiler";

const MAX_AGENTS = 10_000_000;
const FLOAT_SIZE = 4;
const COMPONENTS_PER_AGENT = 3;

// Preallocate worst case: 10,000,000 agents
const MAX_BYTES = Math.max(
    MAX_AGENTS * COMPONENTS_PER_AGENT * FLOAT_SIZE,
    COMPONENTS_PER_AGENT * FLOAT_SIZE
);

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

    // Preallocated buffers
    private agentStorageBuffer: GPUBuffer | null = null;      // STORAGE | COPY_SRC | COPY_DST
    private stagingReadbackBuffer: GPUBuffer | null = null;   // COPY_DST | MAP_READ
    private agentVertexBuffer: GPUBuffer | null = null;       // VERTEX | COPY_DST (lazy, only if needed)

    // Reused uniform buffer (grow-only)
    private inputUniformBuffer: GPUBuffer | null = null;
    private inputUniformCapacity = 0;

    private agentCount = 0;
    private gpuStateSeeded = false;
    private lastSyncedAgentsRef: Agent[] | null = null;
    private maxWorkgroupsPerDimension = 65535;

    constructor(wgslCode: string, inputsExpected: string[]) {
        this.wgslCode = wgslCode;
        this.inputsExpected = inputsExpected;
    }

    async init() {
        if (this.device) return;

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

        this.maxWorkgroupsPerDimension =
            device.limits?.maxComputeWorkgroupsPerDimension ?? this.maxWorkgroupsPerDimension;

        // Preallocate worst-case buffers once
        this.agentStorageBuffer = this.gpuHelper.createEmptyBuffer(
            device,
            MAX_BYTES,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            "AgentStorage"
        );

        this.stagingReadbackBuffer = this.gpuHelper.createEmptyBuffer(
            device,
            MAX_BYTES,
            GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            "StagingReadback"
        );

        this.device = device;
        this.Logger.info(
            `Initialized. Preallocated for ${MAX_AGENTS.toLocaleString()} agents (~${Math.round(
                MAX_BYTES / (1024 * 1024)
            )} MB per buffer).`
        );
    }

    /**
     * When `readback === true`, we assume CPU rendering:
     *  - Skip creating/copying to the GPU vertex buffer.
     *  - Copy storage -> staging -> CPU only for the active agent range.
     */
    async compute(agents: Agent[], inputs: InputValues, readback = true): Promise<WebGPUComputeResult> {
        if (!this.device || !this.computePipeline) await this.init();

        this.Logger.log(`Starting WebGPU compute for ${agents.length} agents (readback: ${readback})`);

        const device = this.device!;
        const pipeline = this.computePipeline!;
        const layout = this.bindGroupLayout!;

        const incomingAgentCount = agents.length;
        const needsAgentSync =
            readback ||
            !this.gpuStateSeeded ||
            incomingAgentCount !== this.agentCount ||
            agents !== this.lastSyncedAgentsRef;

        if (needsAgentSync) {
            this.syncAgentsToGPU(device, agents);
            this.gpuStateSeeded = true;
            this.lastSyncedAgentsRef = agents;
        } else {
            // Agents live on the GPU already; just carry the latest count forward.
            this.agentCount = incomingAgentCount;
        }

        // Ensure uniform buffer and write inputs
        this.ensureAndWriteInputs(device, inputs);

        const bindGroup = device.createBindGroup({
            layout,
            entries: [
                { binding: 0, resource: { buffer: this.agentStorageBuffer! } },
                { binding: 1, resource: { buffer: this.inputUniformBuffer! } },
            ],
        });

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);

        const totalWorkgroups = Math.ceil(this.agentCount / WORKGROUP_SIZE);
        const [dx, dy, dz] = this.computeDispatchDimensions(totalWorkgroups);
        if (dx > 0) pass.dispatchWorkgroups(dx, dy, dz);
        pass.end();

        const copySize = this.byteSizeForAgents(this.agentCount);

        // Skip unnecessary copies: only copy to vertex buffer when readback === false (GPU rendering)
        if (!readback && copySize > 0) {
            this.ensureVertexBuffer(device);
            encoder.copyBufferToBuffer(this.agentStorageBuffer!, 0, this.agentVertexBuffer!, 0, copySize);
        }

        // CPU readback path: storage -> staging (reused)
        let doReadback = false;
        if (readback && copySize > 0) {
            encoder.copyBufferToBuffer(this.agentStorageBuffer!, 0, this.stagingReadbackBuffer!, 0, copySize);
            doReadback = true;
        }

        device.queue.submit([encoder.finish()]);

        // Perform CPU readback if requested
        let updatedAgents: Agent[] | undefined;
        if (doReadback) {
            await this.stagingReadbackBuffer!.mapAsync(GPUMapMode.READ, 0, copySize);
            try {
                const data = new Float32Array(this.stagingReadbackBuffer!.getMappedRange(0, copySize));
                updatedAgents = new Array(this.agentCount);
                for (let i = 0; i < this.agentCount; i++) {
                    const base = i * COMPONENTS_PER_AGENT;
                    updatedAgents[i] = { id: data[base], x: data[base + 1], y: data[base + 2] };
                }
            } finally {
                this.stagingReadbackBuffer!.unmap(); // reuse next call
            }
        }

        return {
            updatedAgents,
            renderResources:
                !readback && this.agentVertexBuffer
                    ? {
                        device,
                        agentVertexBuffer: this.agentVertexBuffer,
                        agentCount: this.agentCount,
                        agentStride: COMPONENTS_PER_AGENT * FLOAT_SIZE,
                    }
                    : undefined,
        };
    }

    // --- Internals ---

    private syncAgentsToGPU(device: GPUDevice, agents: Agent[]) {
        this.agentCount = agents.length;
        if (this.agentCount === 0) return;

        const data = new Float32Array(this.agentCount * COMPONENTS_PER_AGENT);

        for (let i = 0; i < this.agentCount; i++) {
            const a = agents[i];
            const base = i * COMPONENTS_PER_AGENT;
            data[base] = a.id;
            data[base + 1] = a.x;
            data[base + 2] = a.y;
        }

        this.gpuHelper.writeBuffer(device, this.agentStorageBuffer!, data);
        // Only the populated portion of the buffer is considered valid this frame.
    }

    private ensureAndWriteInputs(device: GPUDevice, inputs: InputValues) {
        const values = this.inputsExpected.map((n) => Number(inputs[n] ?? 0));
        const byteLen = values.length * FLOAT_SIZE;

        if (!this.inputUniformBuffer || this.inputUniformCapacity < byteLen) {
            // grow-only; align to 256 bytes for uniform buffers
            const aligned = Math.ceil(Math.max(byteLen, 256) / 256) * 256;
            if (this.inputUniformBuffer) this.inputUniformBuffer.destroy();
            this.inputUniformBuffer = this.gpuHelper.createEmptyBuffer(
                device,
                aligned,
                GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                "InputUniform"
            );
            this.inputUniformCapacity = aligned;
        }

        const f32 = new Float32Array(values);
        device.queue.writeBuffer(this.inputUniformBuffer!, 0, f32.buffer, f32.byteOffset, byteLen);
    }

    private ensureVertexBuffer(device: GPUDevice) {
        if (!this.agentVertexBuffer) {
            this.agentVertexBuffer = this.gpuHelper.createEmptyBuffer(
                device,
                MAX_BYTES,
                GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                "AgentVertex"
            );
            this.Logger.info(
                `Allocated GPU vertex buffer for up to ${MAX_AGENTS.toLocaleString()} agents.`
            );
        }
    }

    private byteSizeForAgents(n: number) {
        return Math.max(n * COMPONENTS_PER_AGENT * FLOAT_SIZE, COMPONENTS_PER_AGENT * FLOAT_SIZE);
    }

    private computeDispatchDimensions(totalWorkgroups: number): [number, number, number] {
        if (!totalWorkgroups) return [0, 1, 1];
        const max = this.maxWorkgroupsPerDimension;

        const dispatchX = Math.min(totalWorkgroups, max);
        let remaining = Math.ceil(totalWorkgroups / dispatchX);

        const dispatchY = Math.min(remaining, max);
        remaining = Math.ceil(remaining / dispatchY);

        const dispatchZ = Math.min(remaining, max);

        const capacity = dispatchX * dispatchY * dispatchZ;
        if (capacity < totalWorkgroups) {
            throw new Error(
                `Agent count ${this.agentCount} exceeds supported dispatch capacity for this device.`
            );
        }
        return [dispatchX, dispatchY, dispatchZ];
    }

    destroy() {
        this.agentStorageBuffer?.destroy();
        this.stagingReadbackBuffer?.destroy();
        this.agentVertexBuffer?.destroy();
        this.inputUniformBuffer?.destroy();

        this.agentStorageBuffer = null;
        this.stagingReadbackBuffer = null;
        this.agentVertexBuffer = null;
        this.inputUniformBuffer = null;

        this.device = null;
        this.computePipeline = null;
        this.bindGroupLayout = null;
        this.gpuStateSeeded = false;
        this.lastSyncedAgentsRef = null;
    }
}
