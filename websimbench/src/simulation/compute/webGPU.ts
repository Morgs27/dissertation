import Logger from "../helpers/logger";
import GPU from "../helpers/gpu";
import type { Agent, InputValues } from "../types";
import { WORKGROUP_SIZE } from "../compiler/WGSLcompiler";

const MAX_AGENTS = 100_000;
const FLOAT_SIZE = 4;
const COMPONENTS_PER_AGENT = 5; // id, x, y, vx, vy

export type WebGPURenderResources = {
    device: GPUDevice;
    agentVertexBuffer: GPUBuffer;
    agentCount: number;
    agentStride: number;
};

export type WebGPUComputeResult = {
    updatedAgents?: Agent[];
    renderResources?: WebGPURenderResources;
    performance: {
        setupTime: number;
        dispatchTime: number;
        readbackTime: number;
    };
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


    constructor(wgslCode: string, inputsExpected: string[], agentCount: number) {
        this.wgslCode = wgslCode;
        this.inputsExpected = inputsExpected;
        this.agentCount = agentCount;
    }

    async init(device: GPUDevice, agentCount: number) {
        const AGENT_BUFFER_SIZE = agentCount * COMPONENTS_PER_AGENT * FLOAT_SIZE;

        console.log("Initializing WebGPU with device:", device);
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
            AGENT_BUFFER_SIZE,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            "AgentStorage"
        );

        this.stagingReadbackBuffer = this.gpuHelper.createEmptyBuffer(
            device,
            AGENT_BUFFER_SIZE,
            GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            "StagingReadback"
        );

        this.device = device;
        this.Logger.info(
            `Initialized. Preallocated for ${MAX_AGENTS.toLocaleString()} agents (~${Math.round(
                AGENT_BUFFER_SIZE / (1024 * 1024)
            )} MB per buffer).`
        );
    }

    public async runGPU(agents: Agent[], inputs: InputValues): Promise<WebGPUComputeResult> {
        return this._compute(agents, inputs, false);
    }

    public async runGPUReadback(agents: Agent[], inputs: InputValues): Promise<WebGPUComputeResult> {
        return this._compute(agents, inputs, true);
    }

    /**
     * When `readback === true`, we assume CPU rendering:
     *  - Skip creating/copying to the GPU vertex buffer.
     *  - Copy storage -> staging -> CPU only for the active agent range.
     */
    private async _compute(agents: Agent[], inputs: InputValues, readback: boolean): Promise<WebGPUComputeResult> {
        this.Logger.log(`Starting WebGPU compute for ${agents.length} agents (readback: ${readback})`);

        if (!this.device || !this.computePipeline) throw new Error("WebGPU not initialized");

        const setupStart = performance.now();

        const device = this.device;
        const pipeline = this.computePipeline;
        const layout = this.bindGroupLayout!;
        
        const incomingAgentCount = agents.length;
        const needsAgentSync =
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
        
        const setupEnd = performance.now();
        const setupTime = setupEnd - setupStart;

        const dispatchStart = performance.now();

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

        const dispatchEnd = performance.now();
        const dispatchTime = dispatchEnd - dispatchStart;

        // Perform CPU readback if requested
        const readbackStart = performance.now();
        let updatedAgents: Agent[] | undefined;
        if (doReadback) {
            await this.stagingReadbackBuffer!.mapAsync(GPUMapMode.READ, 0, copySize);
            try {
                const data = new Float32Array(this.stagingReadbackBuffer!.getMappedRange(0, copySize));
                
                // IMPORTANT: Update agents in-place to preserve array reference
                // This prevents unnecessary re-syncs on the next frame
                updatedAgents = agents; // Reuse the same array reference
                for (let i = 0; i < this.agentCount; i++) {
                    const base = i * COMPONENTS_PER_AGENT;
                    updatedAgents[i].id = data[base];
                    updatedAgents[i].x = data[base + 1];
                    updatedAgents[i].y = data[base + 2];
                    updatedAgents[i].vx = data[base + 3];
                    updatedAgents[i].vy = data[base + 4];
                }
                
                this.Logger.log(`Readback complete: Agent[0] updated to x=${updatedAgents[0].x.toFixed(2)}, y=${updatedAgents[0].y.toFixed(2)}`);
            } finally {
                this.stagingReadbackBuffer!.unmap(); // reuse next call
            }
        }
        const readbackEnd = performance.now();
        const readbackTime = readbackEnd - readbackStart;

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
            performance: {
                setupTime,
                dispatchTime,
                readbackTime: doReadback ? readbackTime : 0
            }
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
            data[base + 3] = a.vx;
            data[base + 4] = a.vy;
        }

        this.gpuHelper.writeBuffer(device, this.agentStorageBuffer!, data);
        // Only the populated portion of the buffer is considered valid this frame.
    }

    private ensureAndWriteInputs(device: GPUDevice, inputs: InputValues) {
        const values = this.inputsExpected.map((n) => {
            const value = inputs[n];
            // Only convert numeric inputs, default to 0 for non-numeric
            return typeof value === 'number' ? value : 0;
        });
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
                this.agentCount * COMPONENTS_PER_AGENT * FLOAT_SIZE,
                GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
                "AgentVertex"
            );
            this.Logger.info(
                `Allocated GPU vertex buffer for up to ${this.agentCount.toLocaleString()} agents.`
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
