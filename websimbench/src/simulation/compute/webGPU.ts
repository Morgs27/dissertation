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
    trailMapBuffer?: GPUBuffer;
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
    private agentsReadBuffer: GPUBuffer | null = null;        // STORAGE (read-only snapshot for neighbor queries)
    private stagingReadbackBuffer: GPUBuffer | null = null;   // COPY_DST | MAP_READ
    private agentVertexBuffer: GPUBuffer | null = null;       // VERTEX | COPY_DST (lazy, only if needed)
    private agentLogBuffer: GPUBuffer | null = null;          // STORAGE | COPY_SRC | COPY_DST
    private stagingLogBuffer: GPUBuffer | null = null;        // COPY_DST | MAP_READ

    // Reused uniform buffer (grow-only)
    private inputUniformBuffer: GPUBuffer | null = null;
    private inputUniformCapacity = 0;

    // Optional trail map buffers (triple-buffered for double-buffering + diffuse/decay)
    // trailMapBuffer: read buffer for sensing (previous frame state)
    // trailMapBuffer2: output buffer for diffuse/decay pass
    // trailMapDeposits: write buffer for agent deposits (cleared each frame)
    private trailMapBuffer: GPUBuffer | null = null;
    private trailMapBuffer2: GPUBuffer | null = null;
    private trailMapDeposits: GPUBuffer | null = null;
    private trailMapCapacity = 0;
    private randomValuesBuffer: GPUBuffer | undefined;
    private hasTrailMap = false;
    private trailMapGPUSeeded = false; // Track if trail map is initialized on GPU

    // Diffuse/decay compute pipeline
    private diffuseDecayPipeline: GPUComputePipeline | null = null;
    private diffuseDecayBindGroupLayout: GPUBindGroupLayout | null = null;

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

        this.hasTrailMap = this.inputsExpected.includes('trailMap');

        const bindGroupEntries: GPUBindGroupLayoutEntry[] = [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        ];

        if (this.hasTrailMap) {
            // trailMapRead: binding 2, read-only for sensing
            bindGroupEntries.push({
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" }
            });
            // trailMapWrite: binding 4, read-write for deposits
            bindGroupEntries.push({
                binding: 4,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" }
            });
        }

        if (this.inputsExpected.includes('randomValues')) {
            bindGroupEntries.push({
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" }
            });
        }

        // agentsRead: binding 5, read-only snapshot for neighbor queries
        bindGroupEntries.push({
            binding: 5,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "read-only-storage" }
        });

        // agentLogs: binding 6, read-write for logging
        bindGroupEntries.push({
            binding: 6,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "storage" }
        });

        this.bindGroupLayout = device.createBindGroupLayout({
            entries: bindGroupEntries,
        });

        this.computePipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
            compute: { module, entryPoint: "main" },
        });

        this.maxWorkgroupsPerDimension =
            device.limits?.maxComputeWorkgroupsPerDimension ?? this.maxWorkgroupsPerDimension;

        // Initialize diffuse/decay compute shader if trail map is used
        if (this.hasTrailMap) {
            this.initDiffuseDecayPipeline(device);
        }

        // Preallocate worst-case buffers once
        this.agentStorageBuffer = this.gpuHelper.createEmptyBuffer(
            device,
            AGENT_BUFFER_SIZE,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            "AgentStorage"
        );

        // Read-only buffer for neighbor queries (snapshot of agent positions)
        this.agentsReadBuffer = this.gpuHelper.createEmptyBuffer(
            device,
            AGENT_BUFFER_SIZE,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            "AgentsRead"
        );

        this.stagingReadbackBuffer = this.gpuHelper.createEmptyBuffer(
            device,
            AGENT_BUFFER_SIZE,
            GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            "StagingReadback"
        );

        const LOG_BUFFER_SIZE = agentCount * 2 * FLOAT_SIZE; // vec2<f32> per agent
        this.agentLogBuffer = this.gpuHelper.createEmptyBuffer(
            device,
            LOG_BUFFER_SIZE,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            "AgentLogBuffer"
        );

        this.stagingLogBuffer = this.gpuHelper.createEmptyBuffer(
            device,
            LOG_BUFFER_SIZE,
            GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            "StagingLogReadback"
        );

        this.device = device;
        this.Logger.info(
            `Initialized. Preallocated for ${MAX_AGENTS.toLocaleString()} agents (~${Math.round(
                AGENT_BUFFER_SIZE / (1024 * 1024)
            )} MB per buffer).`
        );
    }

    /**
     * Initialize the GPU compute pipeline for diffuse and decay effects on the trail map.
     * This shader applies a 3x3 blur kernel with wrapping and decay, matching the CPU implementation.
     */
    private initDiffuseDecayPipeline(device: GPUDevice) {
        const DIFFUSE_DECAY_WGSL = `
        struct Inputs {
            width: f32,
            height: f32,
            decayFactor: f32,
        }

        @group(0) @binding(0) var<storage, read> inputMap: array<f32>;
        @group(0) @binding(1) var<storage, read_write> outputMap: array<f32>;
        @group(0) @binding(2) var<storage, read> trailMapDeposits: array<i32>;
        @group(0) @binding(3) var<uniform> inputs: Inputs;

        @compute @workgroup_size(8, 8)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
            let width = i32(inputs.width);
            let height = i32(inputs.height);
            
            if (i32(id.x) >= width || i32(id.y) >= height) { return; }
            
            let x = i32(id.x);
            let y = i32(id.y);
            let idx = u32(y * width + x);

            // Exactly match JS: sum += (inputMap[neighbor] + deposit[neighbor]) for all 9 neighbors
            var sum: f32 = 0.0;
            var count: f32 = 0.0;
            
            for(var dy: i32 = -1; dy <= 1; dy++) {
                for(var dx: i32 = -1; dx <= 1; dx++) {
                    var nx = x + dx;
                    var ny = y + dy;
                    
                    // Wrap around
                    if (nx < 0) { nx = nx + width; }
                    if (nx >= width) { nx = nx - width; }
                    if (ny < 0) { ny = ny + height; }
                    if (ny >= height) { ny = ny - height; }
                    
                    let nidx = u32(ny * width + nx);
                    
                    // Get value with deposit added (matching JS where deposits were added first)
                    let base = inputMap[nidx];
                    let deposit = f32(trailMapDeposits[nidx]) / 1000000.0;
                    let val = base + deposit;
                    
                    sum = sum + val;
                    count = count + 1.0;
                }
            }
            
            let blurred = sum / count;
            
            // Current value with deposit
            let currentDeposit = f32(trailMapDeposits[idx]) / 1000000.0;
            let current = inputMap[idx] + currentDeposit;

            // Formula: diffused = current * 0.1 + blurred * 0.9
            let term1 = current * 0.1;
            let term2 = blurred * 0.9;
            let diffused = term1 + term2;
            
            // Decay
            let decayMult = 1.0 - inputs.decayFactor;
            let decayed = diffused * decayMult;
            
            outputMap[idx] = decayed;
        }
        `;

        const diffuseModule = device.createShaderModule({ code: DIFFUSE_DECAY_WGSL });

        this.diffuseDecayBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }, // deposits
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
            ],
        });

        this.diffuseDecayPipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.diffuseDecayBindGroupLayout] }),
            compute: { module: diffuseModule, entryPoint: "main" },
        });

        this.Logger.info("Diffuse/decay GPU compute pipeline initialized.");
    }

    private prepareDiffuseDecayPass(encoder: GPUCommandEncoder, device: GPUDevice, width: number, height: number, decayFactor: number): void {
        const trailMapSize = width * height * 4;

        if (!this.diffuseDecayBindGroupLayout || !this.trailMapBuffer || !this.trailMapBuffer2 || !this.trailMapDeposits) return;

        const uniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        const uniformData = new Float32Array([width, height, decayFactor, 0]);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        const bindGroup = device.createBindGroup({
            layout: this.diffuseDecayBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.trailMapBuffer } },
                { binding: 1, resource: { buffer: this.trailMapBuffer2 } },
                { binding: 2, resource: { buffer: this.trailMapDeposits } },
                { binding: 3, resource: { buffer: uniformBuffer } },
            ],
        });

        const pass = encoder.beginComputePass();
        pass.setPipeline(this.diffuseDecayPipeline!);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
        pass.end();

        encoder.copyBufferToBuffer(this.trailMapBuffer2, 0, this.trailMapBuffer, 0, trailMapSize);
        encoder.clearBuffer(this.trailMapDeposits, 0, trailMapSize);
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

        // Copy agent data to read buffer (snapshot for neighbor queries)
        // This must happen before the compute pass so all agents see consistent positions
        const snapshotCopySize = this.byteSizeForAgents(this.agentCount);
        if (snapshotCopySize > 0) {
            const copyEncoder = device.createCommandEncoder();
            copyEncoder.copyBufferToBuffer(this.agentStorageBuffer!, 0, this.agentsReadBuffer!, 0, snapshotCopySize);
            device.queue.submit([copyEncoder.finish()]);
        }

        const dispatchStart = performance.now();

        const bindGroupEntries: GPUBindGroupEntry[] = [
            { binding: 0, resource: { buffer: this.agentStorageBuffer! } },
            { binding: 1, resource: { buffer: this.inputUniformBuffer! } },
            { binding: 6, resource: { buffer: this.agentLogBuffer! } },
        ];

        if (this.hasTrailMap && this.trailMapBuffer && this.trailMapDeposits) {
            // trailMapRead (binding 2): agents read from this for sensing
            bindGroupEntries.push({ binding: 2, resource: { buffer: this.trailMapBuffer } });
            // trailMapWrite (binding 4): agents write deposits here
            bindGroupEntries.push({ binding: 4, resource: { buffer: this.trailMapDeposits } });
        }

        if (this.randomValuesBuffer && this.inputsExpected.includes('randomValues')) {
            bindGroupEntries.push({ binding: 3, resource: { buffer: this.randomValuesBuffer } });
        }

        // agentsRead (binding 5): read-only snapshot for neighbor queries
        bindGroupEntries.push({ binding: 5, resource: { buffer: this.agentsReadBuffer! } });

        const bindGroup = device.createBindGroup({
            layout,
            entries: bindGroupEntries,
        });

        const copySize = this.byteSizeForAgents(this.agentCount);

        // Create command encoder for all operations in the frame
        const encoder = device.createCommandEncoder();

        // Pass 1: Agent Compute (Move, Sense, Deposit)
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        const totalWorkgroups = Math.ceil(this.agentCount / WORKGROUP_SIZE);
        const [dx, dy, dz] = this.computeDispatchDimensions(totalWorkgroups);
        if (dx > 0) pass.dispatchWorkgroups(dx, dy, dz);
        pass.end();

        // Pass 2: Diffuse and Decay (Blur trails)
        if (this.hasTrailMap && this.diffuseDecayPipeline) {
            const width = typeof inputs.width === 'number' ? inputs.width : 0;
            const height = typeof inputs.height === 'number' ? inputs.height : 0;
            const decayFactor = typeof inputs.decayFactor === 'number' ? inputs.decayFactor : 0.05;

            this.prepareDiffuseDecayPass(encoder, device, width, height, decayFactor);
        }

        // Skip unnecessary copies: only copy to vertex buffer when readback === false (GPU rendering)
        if (!readback && copySize > 0) {
            this.ensureVertexBuffer(device);
            encoder.copyBufferToBuffer(this.agentStorageBuffer!, 0, this.agentVertexBuffer!, 0, copySize);
        }

        // Handle agent readback if requested (copy from agentsBuffer to stagingReadbackBuffer)
        let doReadback = false;
        if (readback && copySize > 0) {
            encoder.copyBufferToBuffer(this.agentStorageBuffer!, 0, this.stagingReadbackBuffer!, 0, copySize);

            // Also copy log buffer if in readback mode
            const logCopySize = this.agentCount * 2 * FLOAT_SIZE;
            encoder.copyBufferToBuffer(this.agentLogBuffer!, 0, this.stagingLogBuffer!, 0, logCopySize);

            doReadback = true;
        }

        // Submit all commands in a single batch
        device.queue.submit([encoder.finish()]);

        // Clear log buffer for next frame immediately after submit (or could be done at start of frame)
        if (readback) {
            const clearEncoder = device.createCommandEncoder();
            clearEncoder.clearBuffer(this.agentLogBuffer!, 0, this.agentCount * 2 * FLOAT_SIZE);
            device.queue.submit([clearEncoder.finish()]);
        }

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

                this.Logger.info(`Readback complete: Agent[0] updated to x=${updatedAgents[0].x.toFixed(4)}, y=${updatedAgents[0].y.toFixed(4)}`);
            } finally {
                this.stagingReadbackBuffer!.unmap(); // reuse next call
            }

            // Only readback trailMap in CPU render mode (when doReadback is true)
            // In GPU render mode, the trail map stays on GPU and is not read back
            if (this.hasTrailMap && this.trailMapBuffer && inputs.trailMap) {
                const trailMap = inputs.trailMap as Float32Array;
                const size = trailMap.byteLength;

                // Create a temporary staging buffer for trail map if we don't have one cached
                // (For simplicity creating one here, but optimally should cache)
                const stagingTrail = this.gpuHelper.createEmptyBuffer(
                    device,
                    size,
                    GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
                    "StagingTrailReader"
                );

                // Encode copy
                const readEncoder = device.createCommandEncoder();
                readEncoder.copyBufferToBuffer(this.trailMapBuffer, 0, stagingTrail, 0, size);
                device.queue.submit([readEncoder.finish()]);

                await stagingTrail.mapAsync(GPUMapMode.READ);
                const src = new Float32Array(stagingTrail.getMappedRange());

                // Debug trail map stats
                let nonZero = 0;
                let maxVal = 0;
                for (let i = 0; i < src.length; i++) {
                    if (src[i] > 0) {
                        nonZero++;
                        maxVal = Math.max(maxVal, src[i]);
                    }
                }
                this.Logger.info(`Trail Map Readback: nonZero=${nonZero}, maxVal=${maxVal.toFixed(6)}`);

                trailMap.set(src);
                stagingTrail.unmap();
                stagingTrail.destroy();
            }

            // Readback logs
            const logCopySize = this.agentCount * 2 * FLOAT_SIZE;
            await this.stagingLogBuffer!.mapAsync(GPUMapMode.READ, 0, logCopySize);
            try {
                const logData = new Float32Array(this.stagingLogBuffer!.getMappedRange(0, logCopySize));
                for (let i = 0; i < this.agentCount; i++) {
                    const isEnabled = logData[i * 2];
                    const value = logData[i * 2 + 1];
                    if (isEnabled > 0.5) {
                        this.Logger.info(`AGENT[${agents[i].id}] PRINT:`, value);
                    }
                }
            } finally {
                this.stagingLogBuffer!.unmap();
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
                        trailMapBuffer: this.hasTrailMap ? this.trailMapBuffer! : undefined
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
        const inputValues = this.inputsExpected
            .filter(n => n !== 'trailMap' && n !== 'randomValues') // don't put buffer types in uniform buffer
            .map((n) => {
                const value = inputs[n];
                // Only convert numeric inputs, default to 0 for non-numeric
                return typeof value === 'number' ? value : 0;
            });

        const values = [this.agentCount, ...inputValues];
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

        const f32Buffer = new Float32Array(values);
        device.queue.writeBuffer(this.inputUniformBuffer!, 0, f32Buffer.buffer, f32Buffer.byteOffset, byteLen);

        // Handle TrailMap - only upload from CPU on first frame
        // After initial seeding, the trail map lives entirely on GPU
        if (this.hasTrailMap && inputs.trailMap) {
            const trailMap = inputs.trailMap as Float32Array;
            const size = trailMap.byteLength;

            // Check if we need to recreate buffers (size changed or not created yet)
            const needsRecreate = !this.trailMapBuffer || this.trailMapCapacity < size;

            if (needsRecreate) {
                if (this.trailMapBuffer) this.trailMapBuffer.destroy();
                if (this.trailMapBuffer2) this.trailMapBuffer2.destroy();
                if (this.trailMapDeposits) this.trailMapDeposits.destroy();

                this.trailMapBuffer = this.gpuHelper.createEmptyBuffer(
                    device,
                    size,
                    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                    "TrailMapRead"
                );
                this.trailMapBuffer2 = this.gpuHelper.createEmptyBuffer(
                    device,
                    size,
                    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                    "TrailMapTemp"
                );
                this.trailMapDeposits = this.gpuHelper.createEmptyBuffer(
                    device,
                    size,
                    GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                    "TrailMapDeposits"
                );
                this.trailMapCapacity = size;
                this.trailMapGPUSeeded = false; // Need to re-seed after buffer recreation
            }

            // Only upload from CPU on first frame - after that, trail map lives on GPU
            if (!this.trailMapGPUSeeded) {
                device.queue.writeBuffer(this.trailMapBuffer!, 0, trailMap.buffer, trailMap.byteOffset, trailMap.byteLength);
                // Clear the other buffers
                const zeros = new Float32Array(trailMap.length);
                device.queue.writeBuffer(this.trailMapBuffer2!, 0, zeros);
                device.queue.writeBuffer(this.trailMapDeposits!, 0, zeros);
                this.trailMapGPUSeeded = true;
                this.Logger.info("Trail map seeded to GPU (first frame only)");
            }
        }

        // Handle RandomValues
        if (inputs.randomValues) {
            const randomValues = inputs.randomValues as Float32Array;
            const size = Math.max(randomValues.byteLength, 4); // Min 4 bytes
            if (!this.randomValuesBuffer || this.randomValuesBuffer.size < size) {
                if (this.randomValuesBuffer) this.randomValuesBuffer.destroy();
                this.randomValuesBuffer = device.createBuffer({
                    size,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                    label: "RandomValues"
                });
            }
            device.queue.writeBuffer(this.randomValuesBuffer, 0, randomValues.buffer, randomValues.byteOffset, randomValues.byteLength);
        }
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
