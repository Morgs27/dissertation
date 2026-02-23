/**
 * @module webGPU
 * WebGPU compute backend.
 *
 * Manages GPU buffer allocation, compute shader dispatch, optional agent
 * readback, and the GPU-side diffuse/decay trail-map pipeline. When the
 * render mode is `'gpu'`, agent data stays on the GPU and a vertex buffer
 * reference is returned for zero-copy rendering.
 */

import Logger from "../helpers/logger";
import GPU from "../helpers/gpu";
import type { Agent, InputValues } from "../types";
import { WORKGROUP_SIZE } from "../compiler/WGSLcompiler";

const FLOAT_SIZE = 4;
/** Agent layout: id, x, y, vx, vy, species (6 × f32). */
const COMPONENTS_PER_AGENT = 6;

/** GPU resources passed to the Renderer for zero-copy GPU rendering. */
export type WebGPURenderResources = {
  device: GPUDevice;
  agentVertexBuffer: GPUBuffer;
  agentCount: number;
  agentStride: number;
  trailMapBuffer?: GPUBuffer;
};

/** Result of a WebGPU compute dispatch with optional readback. */
export type WebGPUComputeResult = {
  updatedAgents?: Agent[];
  renderResources?: WebGPURenderResources;
  performance: {
    setupTime: number;
    dispatchTime: number;
    readbackTime: number;
  };
};

/**
 * WebGPU compute backend.
 *
 * Creates a compute pipeline from DSL-generated WGSL, manages grow-only
 * GPU buffers for agents, inputs, trail maps, and random values, and
 * dispatches agent-update work with optional CPU readback.
 */
export default class WebGPU {
  private logger = new Logger("WebGPUCompute");
  private gpuHelper = new GPU("WebGPUComputeHelper");
  private wgslCode: string;
  private inputsExpected: string[];

  private device: GPUDevice | null = null;
  private computePipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;

  // Preallocated buffers
  private agentStorageBuffer: GPUBuffer | null = null; // STORAGE | COPY_SRC | COPY_DST
  private agentsReadBuffer: GPUBuffer | null = null; // STORAGE (read-only snapshot for neighbor queries)
  private stagingReadbackBuffer: GPUBuffer | null = null; // COPY_DST | MAP_READ
  private agentVertexBuffer: GPUBuffer | null = null; // VERTEX | COPY_DST (lazy, only if needed)
  private agentLogBuffer: GPUBuffer | null = null; // STORAGE | COPY_SRC | COPY_DST
  private stagingLogBuffer: GPUBuffer | null = null; // COPY_DST | MAP_READ
  private stagingTrailReadbackBuffer: GPUBuffer | null = null;
  private stagingTrailReadbackCapacity = 0;
  private agentVertexCapacity = 0;

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
  private randomValuesBuffer: GPUBuffer | null = null;
  private randomValuesCapacity = 0;
  private obstaclesBuffer: GPUBuffer | null = null;
  private obstaclesCapacity = 0;
  private hasTrailMap = false;
  private hasObstacles = false;
  private trailMapGPUSeeded = false; // Track if trail map is initialized on GPU

  // Diffuse/decay compute pipeline
  private diffuseDecayPipeline: GPUComputePipeline | null = null;
  private diffuseDecayBindGroupLayout: GPUBindGroupLayout | null = null;
  private diffuseUniformBuffer: GPUBuffer | null = null;
  private readonly diffuseUniformData = new ArrayBuffer(16);
  private readonly diffuseUniformView = new DataView(this.diffuseUniformData);

  private agentCount = 0;
  private gpuStateSeeded = false;
  private lastSyncedAgentsRef: Agent[] | null = null;
  private maxWorkgroupsPerDimension = 65535;

  constructor(wgslCode: string, inputsExpected: string[], agentCount: number) {
    this.wgslCode = wgslCode;
    this.inputsExpected = inputsExpected;
    this.agentCount = agentCount;
  }

  /**
   * Initialise the compute pipeline, bind-group layout, and preallocate
   * worst-case GPU buffers for the given agent count.
   *
   * @param device - An initialised `GPUDevice`.
   * @param agentCount - Maximum number of agents to allocate for.
   */
  async init(device: GPUDevice, agentCount: number) {
    const AGENT_BUFFER_SIZE = agentCount * COMPONENTS_PER_AGENT * FLOAT_SIZE;
    this.agentCount = agentCount;

    this.logger.log("Initializing WebGPU with device:", device);

    // Push error scope to capture initialization errors
    device.pushErrorScope("validation");

    const module = device.createShaderModule({ code: this.wgslCode });

    // Check for compilation errors
    this.logger.log("Generated WGSL shader for WebGPU");
    module.getCompilationInfo().then((info) => {
      for (const message of info.messages) {
        const type = message.type === "error" ? "error" : "warning";
        this.logger[type === "error" ? "error" : "warn"](
          `WGSL ${message.type}: ${message.message} at line ${message.lineNum}, col ${message.linePos}`,
        );
      }
    });

    this.hasTrailMap = this.inputsExpected.includes("trailMap");
    this.hasObstacles = this.inputsExpected.includes("obstacles");

    const bindGroupEntries: GPUBindGroupLayoutEntry[] = [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
    ];

    if (this.hasTrailMap) {
      // trailMapRead: binding 2, read-only for sensing
      bindGroupEntries.push({
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      });
      // trailMapWrite: binding 4, read-write for deposits
      bindGroupEntries.push({
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      });
    }

    if (this.inputsExpected.includes("randomValues")) {
      bindGroupEntries.push({
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      });
    }

    // agentsRead: binding 5, read-only snapshot for neighbor queries
    bindGroupEntries.push({
      binding: 5,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" },
    });

    // agentLogs: binding 6, read-write for logging
    bindGroupEntries.push({
      binding: 6,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" },
    });

    // obstacles: binding 7, read-only for obstacle avoidance
    if (this.hasObstacles) {
      bindGroupEntries.push({
        binding: 7,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      });
    }

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: bindGroupEntries,
    });

    this.computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.bindGroupLayout],
      }),
      compute: { module, entryPoint: "main" },
    });

    // Pop validation error scope and log any errors
    device.popErrorScope().then((error) => {
      if (error) {
        this.logger.error(
          "WebGPU Validation Error during initialization:",
          error.message,
        );
      }
    });

    this.maxWorkgroupsPerDimension =
      device.limits?.maxComputeWorkgroupsPerDimension ??
      this.maxWorkgroupsPerDimension;

    // Initialize diffuse/decay compute shader if trail map is used
    if (this.hasTrailMap) {
      this.initDiffuseDecayPipeline(device);
      this.diffuseUniformBuffer = this.gpuHelper.createEmptyBuffer(
        device,
        16,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        "DiffuseDecayUniforms",
      );
    }

    // Preallocate worst-case buffers once
    this.agentStorageBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      AGENT_BUFFER_SIZE,
      GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
      "AgentStorage",
    );

    // Read-only buffer for neighbor queries (snapshot of agent positions)
    this.agentsReadBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      AGENT_BUFFER_SIZE,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      "AgentsRead",
    );

    this.stagingReadbackBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      AGENT_BUFFER_SIZE,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      "StagingReadback",
    );

    const LOG_BUFFER_SIZE = agentCount * 2 * FLOAT_SIZE; // vec2<f32> per agent
    this.agentLogBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      LOG_BUFFER_SIZE,
      GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
      "AgentLogBuffer",
    );

    this.stagingLogBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      LOG_BUFFER_SIZE,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      "StagingLogReadback",
    );

    this.device = device;
    this.logger.info(
      `Initialized. Preallocated for ${agentCount.toLocaleString()} agents (~${Math.round(
        AGENT_BUFFER_SIZE / (1024 * 1024),
      )} MB per buffer).`,
    );
  }

  /**
   * Initialize the GPU compute pipeline for diffuse and decay effects on the trail map.
   * This shader applies a 3x3 blur kernel with wrapping and decay, matching the CPU implementation.
   */
  private initDiffuseDecayPipeline(device: GPUDevice) {
    // Shader that merges deposits and applies diffuse/decay
    // Reads from: inputMap (previous frame state) + depositMap (new deposits)
    // Writes to: outputMap (result with blur and decay)
    const DIFFUSE_DECAY_WGSL = `
            struct DiffuseUniforms {
                width: u32,
                height: u32,
                decayFactor: f32,
                _pad: f32,
            }

            @group(0) @binding(0) var<storage, read> inputMap: array<f32>;
            @group(0) @binding(1) var<storage, read_write> outputMap: array<f32>;
            @group(0) @binding(2) var<uniform> uniforms: DiffuseUniforms;
            @group(0) @binding(3) var<storage, read> depositMap: array<i32>;

            @compute @workgroup_size(${WORKGROUP_SIZE}, 1, 1)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let idx = global_id.x;
                let w = uniforms.width;
                let h = uniforms.height;
                let total = w * h;

                if (idx >= total) { return; }

                let x = idx % w;
                let y = idx / w;

                // First, merge deposits into the current value (convert fixed-point back to float)
                let depositVal = f32(depositMap[idx]) / 10000.0;
                let currentWithDeposits = inputMap[idx] + depositVal;

                // 3x3 blur kernel with wrapping
                var sum: f32 = 0.0;
                var count: f32 = 0.0;

                for (var dy: i32 = -1; dy <= 1; dy++) {
                    for (var dx: i32 = -1; dx <= 1; dx++) {
                        var nx = i32(x) + dx;
                        var ny = i32(y) + dy;

                        // Wrap around
                        if (nx < 0) { nx += i32(w); }
                        if (nx >= i32(w)) { nx -= i32(w); }
                        if (ny < 0) { ny += i32(h); }
                        if (ny >= i32(h)) { ny -= i32(h); }

                        // Sample from merged value (inputMap + depositMap at that location)
                        let neighborIdx = u32(ny) * w + u32(nx);
                        let neighborDeposit = f32(depositMap[neighborIdx]) / 10000.0;
                        sum += inputMap[neighborIdx] + neighborDeposit;
                        count += 1.0;
                    }
                }

                let blurred = sum / count;
                
                // Explicit steps to match JS fround() behavior and prevent FMA
                let term1 = currentWithDeposits * 0.1;
                let term2 = blurred * 0.9;
                let diffused = term1 + term2;
                
                let decayMult = 1.0 - uniforms.decayFactor;
                outputMap[idx] = diffused * decayMult;
            }
        `;

    const diffuseModule = device.createShaderModule({
      code: DIFFUSE_DECAY_WGSL,
    });

    this.diffuseDecayBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        }, // deposit map
      ],
    });

    this.diffuseDecayPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.diffuseDecayBindGroupLayout],
      }),
      compute: { module: diffuseModule, entryPoint: "main" },
    });

    this.logger.info("Diffuse/decay GPU compute pipeline initialized.");
  }

  /**
   * Encode the diffuse+decay pass in the current command encoder and ping-pong the trail buffers.
   */
  private encodeDiffuseDecayGPU(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    width: number,
    height: number,
    decayFactor: number,
  ) {
    if (
      !this.diffuseDecayPipeline ||
      !this.diffuseDecayBindGroupLayout ||
      !this.diffuseUniformBuffer
    )
      return;
    if (!this.trailMapBuffer || !this.trailMapBuffer2 || !this.trailMapDeposits)
      return;
    if (width <= 0 || height <= 0) return;

    this.diffuseUniformView.setUint32(0, width, true);
    this.diffuseUniformView.setUint32(4, height, true);
    this.diffuseUniformView.setFloat32(8, decayFactor, true);
    this.diffuseUniformView.setFloat32(12, 0, true);
    device.queue.writeBuffer(
      this.diffuseUniformBuffer,
      0,
      this.diffuseUniformData,
    );

    const bindGroup = device.createBindGroup({
      layout: this.diffuseDecayBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.trailMapBuffer } },
        { binding: 1, resource: { buffer: this.trailMapBuffer2 } },
        { binding: 2, resource: { buffer: this.diffuseUniformBuffer } },
        { binding: 3, resource: { buffer: this.trailMapDeposits } },
      ],
    });

    const pass = encoder.beginComputePass();
    pass.setPipeline(this.diffuseDecayPipeline);
    pass.setBindGroup(0, bindGroup);

    const totalPixels = width * height;
    const workgroups = Math.ceil(totalPixels / WORKGROUP_SIZE);
    if (workgroups > 0) {
      pass.dispatchWorkgroups(workgroups);
    }
    pass.end();

    const trailMapSize = width * height * FLOAT_SIZE;
    encoder.clearBuffer(this.trailMapDeposits, 0, trailMapSize);

    // Ping-pong: output becomes the next frame's read buffer.
    [this.trailMapBuffer, this.trailMapBuffer2] = [
      this.trailMapBuffer2,
      this.trailMapBuffer,
    ];
  }

  /**
   * Run the compute shader with results kept on GPU (for GPU rendering).
   *
   * @param agents - Current agent array (used for initial GPU upload).
   * @param inputs - Per-frame input values.
   * @returns Render resources referencing GPU-side vertex buffer.
   */
  public async runGPU(
    agents: Agent[],
    inputs: InputValues,
  ): Promise<WebGPUComputeResult> {
    return this._compute(agents, inputs, false);
  }

  /**
   * Run the compute shader and read agent data back to CPU.
   *
   * @param agents - Current agent array.
   * @param inputs - Per-frame input values.
   * @returns Updated agent array copied from GPU staging buffer.
   */
  public async runGPUReadback(
    agents: Agent[],
    inputs: InputValues,
  ): Promise<WebGPUComputeResult> {
    return this._compute(agents, inputs, true);
  }

  /**
   * When `readback === true`, we assume CPU rendering:
   *  - Skip creating/copying to the GPU vertex buffer.
   *  - Copy storage -> staging -> CPU only for the active agent range.
   */
  private async _compute(
    agents: Agent[],
    inputs: InputValues,
    readback: boolean,
  ): Promise<WebGPUComputeResult> {
    this.logger.log(
      `Starting WebGPU compute for ${agents.length} agents (readback: ${readback})`,
    );

    if (!this.device || !this.computePipeline)
      throw new Error("WebGPU not initialized");

    const setupStart = performance.now();

    const device = this.device;
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
    const encoder = device.createCommandEncoder();
    const copySize =
      this.agentCount > 0 ? this.byteSizeForAgents(this.agentCount) : 0;

    if (copySize > 0) {
      // Snapshot copy keeps neighbor queries deterministic within a frame.
      encoder.copyBufferToBuffer(
        this.agentStorageBuffer!,
        0,
        this.agentsReadBuffer!,
        0,
        copySize,
      );
    }

    let doAgentReadback = false;
    let logCopySize = 0;

    if (this.agentCount > 0) {
      const bindGroupEntries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: this.agentStorageBuffer! } },
        { binding: 1, resource: { buffer: this.inputUniformBuffer! } },
        { binding: 6, resource: { buffer: this.agentLogBuffer! } },
      ];

      if (this.hasTrailMap && this.trailMapBuffer && this.trailMapDeposits) {
        bindGroupEntries.push({
          binding: 2,
          resource: { buffer: this.trailMapBuffer },
        });
        bindGroupEntries.push({
          binding: 4,
          resource: { buffer: this.trailMapDeposits },
        });
      }

      if (
        this.randomValuesBuffer &&
        this.inputsExpected.includes("randomValues")
      ) {
        bindGroupEntries.push({
          binding: 3,
          resource: { buffer: this.randomValuesBuffer },
        });
      }

      bindGroupEntries.push({
        binding: 5,
        resource: { buffer: this.agentsReadBuffer! },
      });

      if (this.hasObstacles && this.obstaclesBuffer) {
        bindGroupEntries.push({
          binding: 7,
          resource: { buffer: this.obstaclesBuffer },
        });
      }

      const bindGroup = device.createBindGroup({
        layout: this.bindGroupLayout!,
        entries: bindGroupEntries,
      });

      if (readback) {
        logCopySize = this.agentCount * 2 * FLOAT_SIZE;
        if (logCopySize > 0) {
          encoder.clearBuffer(this.agentLogBuffer!, 0, logCopySize);
        }
      }

      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipeline);
      pass.setBindGroup(0, bindGroup);

      const totalWorkgroups = Math.ceil(this.agentCount / WORKGROUP_SIZE);
      const [dx, dy, dz] = this.computeDispatchDimensions(totalWorkgroups);
      if (dx > 0) {
        pass.dispatchWorkgroups(dx, dy, dz);
      }
      pass.end();

      if (!readback && copySize > 0) {
        this.ensureVertexBuffer(device, copySize);
        encoder.copyBufferToBuffer(
          this.agentStorageBuffer!,
          0,
          this.agentVertexBuffer!,
          0,
          copySize,
        );
      }

      if (readback && copySize > 0) {
        encoder.copyBufferToBuffer(
          this.agentStorageBuffer!,
          0,
          this.stagingReadbackBuffer!,
          0,
          copySize,
        );
        if (logCopySize > 0) {
          encoder.copyBufferToBuffer(
            this.agentLogBuffer!,
            0,
            this.stagingLogBuffer!,
            0,
            logCopySize,
          );
        }
        doAgentReadback = true;
      }
    }

    // Run diffuse and decay on the GPU always if we have a trail map
    // This ensures the GPU state (trailMapBuffer) is updated for the next frame
    if (this.hasTrailMap) {
      const width = typeof inputs.width === "number" ? inputs.width : 0;
      const height = typeof inputs.height === "number" ? inputs.height : 0;
      const decayFactor =
        typeof inputs.decayFactor === "number" ? inputs.decayFactor : 0.1;
      this.encodeDiffuseDecayGPU(device, encoder, width, height, decayFactor);
    }

    const outputTrailMap =
      inputs.trailMap instanceof Float32Array ? inputs.trailMap : undefined;
    let doTrailReadback = false;
    let trailReadbackSize = 0;
    if (readback && outputTrailMap && this.hasTrailMap && this.trailMapBuffer) {
      trailReadbackSize = outputTrailMap.byteLength;
      if (trailReadbackSize > 0) {
        this.ensureTrailReadbackBuffer(device, trailReadbackSize);
        encoder.copyBufferToBuffer(
          this.trailMapBuffer,
          0,
          this.stagingTrailReadbackBuffer!,
          0,
          trailReadbackSize,
        );
        doTrailReadback = true;
      }
    }

    device.queue.submit([encoder.finish()]);

    const dispatchEnd = performance.now();
    const dispatchTime = dispatchEnd - dispatchStart;

    // Perform CPU readback if requested
    const readbackStart = performance.now();
    let updatedAgents: Agent[] | undefined;
    if (doAgentReadback) {
      await this.stagingReadbackBuffer!.mapAsync(GPUMapMode.READ, 0, copySize);
      try {
        const data = new Float32Array(
          this.stagingReadbackBuffer!.getMappedRange(0, copySize),
        );

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
          updatedAgents[i].species = data[base + 5];
        }
      } finally {
        this.stagingReadbackBuffer!.unmap(); // reuse next call
      }
    }

    if (doTrailReadback && outputTrailMap) {
      await this.stagingTrailReadbackBuffer!.mapAsync(
        GPUMapMode.READ,
        0,
        trailReadbackSize,
      );
      try {
        const src = new Float32Array(
          this.stagingTrailReadbackBuffer!.getMappedRange(0, trailReadbackSize),
        );
        outputTrailMap.set(src);
      } finally {
        this.stagingTrailReadbackBuffer!.unmap();
      }
    }

    if (doAgentReadback && logCopySize > 0) {
      await this.stagingLogBuffer!.mapAsync(GPUMapMode.READ, 0, logCopySize);
      try {
        const logData = new Float32Array(
          this.stagingLogBuffer!.getMappedRange(0, logCopySize),
        );
        for (let i = 0; i < this.agentCount; i++) {
          const isEnabled = logData[i * 2];
          const value = logData[i * 2 + 1];
          if (isEnabled > 0.5) {
            this.logger.info(`AGENT[${agents[i].id}] PRINT:`, value);
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
              trailMapBuffer: this.hasTrailMap
                ? this.trailMapBuffer!
                : undefined,
            }
          : undefined,
      performance: {
        setupTime,
        dispatchTime,
        readbackTime: readback ? readbackTime : 0,
      },
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
      data[base + 5] = a.species || 0;
    }

    this.gpuHelper.writeBuffer(device, this.agentStorageBuffer!, data);
    // Only the populated portion of the buffer is considered valid this frame.
  }

  private ensureAndWriteInputs(device: GPUDevice, inputs: InputValues) {
    const bufferInputs = ["trailMap", "randomValues", "obstacles"]; // these have their own storage bindings

    // If obstacles are used, derive obstacleCount locally for uniform packing.
    const obstacleCount = this.hasObstacles
      ? Array.isArray(inputs.obstacles)
        ? (inputs.obstacles as any[]).length
        : 0
      : 0;

    const values = this.inputsExpected
      .filter((n) => !bufferInputs.includes(n))
      .map((n) => {
        if (n === "obstacleCount") {
          return obstacleCount;
        }
        const value = inputs[n];
        // Only convert numeric inputs, default to 0 for non-numeric
        return typeof value === "number" ? value : 0;
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
        "InputUniform",
      );
      this.inputUniformCapacity = aligned;
    }

    const f32 = new Float32Array(values);
    device.queue.writeBuffer(
      this.inputUniformBuffer!,
      0,
      f32.buffer,
      f32.byteOffset,
      byteLen,
    );

    // Handle TrailMap - only upload from CPU on first frame
    // After initial seeding, the trail map lives entirely on GPU
    if (this.hasTrailMap && inputs.trailMap) {
      const trailMap = inputs.trailMap as Float32Array;
      const size = trailMap.byteLength;

      // Check if we need to recreate buffers (size changed or not created yet)
      const needsRecreate =
        !this.trailMapBuffer || this.trailMapCapacity < size;

      if (needsRecreate) {
        if (this.trailMapBuffer) this.trailMapBuffer.destroy();
        if (this.trailMapBuffer2) this.trailMapBuffer2.destroy();
        if (this.trailMapDeposits) this.trailMapDeposits.destroy();

        this.trailMapBuffer = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE |
            GPUBufferUsage.COPY_SRC |
            GPUBufferUsage.COPY_DST,
          "TrailMapRead",
        );
        this.trailMapBuffer2 = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE |
            GPUBufferUsage.COPY_SRC |
            GPUBufferUsage.COPY_DST,
          "TrailMapTemp",
        );
        this.trailMapDeposits = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE |
            GPUBufferUsage.COPY_SRC |
            GPUBufferUsage.COPY_DST,
          "TrailMapDeposits",
        );
        this.trailMapCapacity = size;
        this.trailMapGPUSeeded = false; // Need to re-seed after buffer recreation
      }

      // Only upload from CPU on first frame - after that, trail map lives on GPU
      if (!this.trailMapGPUSeeded) {
        device.queue.writeBuffer(
          this.trailMapBuffer!,
          0,
          trailMap.buffer,
          trailMap.byteOffset,
          trailMap.byteLength,
        );
        // Clear the other buffers
        const zeros = new Float32Array(trailMap.length);
        device.queue.writeBuffer(this.trailMapBuffer2!, 0, zeros);
        device.queue.writeBuffer(this.trailMapDeposits!, 0, zeros);
        this.trailMapGPUSeeded = true;
        this.logger.info("Trail map seeded to GPU (first frame only)");
      }
    }

    // Handle RandomValues
    if (inputs.randomValues) {
      const randomValues = inputs.randomValues as Float32Array;
      const size = randomValues.byteLength;

      if (!this.randomValuesBuffer || this.randomValuesCapacity < size) {
        if (this.randomValuesBuffer) this.randomValuesBuffer.destroy();
        this.randomValuesBuffer = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
          "RandomValues",
        );
        this.randomValuesCapacity = size;
      }

      device.queue.writeBuffer(
        this.randomValuesBuffer!,
        0,
        randomValues.buffer,
        randomValues.byteOffset,
        randomValues.byteLength,
      );
    }

    // Handle Obstacles — written every frame so real-time changes propagate
    if (this.hasObstacles) {
      const obstacleArray = Array.isArray(inputs.obstacles)
        ? (inputs.obstacles as any[])
        : [];
      // Each obstacle: 4 floats (x, y, w, h) = 16 bytes
      // Minimum 16 bytes to avoid zero-size buffer
      const numObstacles = Math.max(obstacleArray.length, 1);
      const size = numObstacles * 4 * FLOAT_SIZE;

      if (!this.obstaclesBuffer || this.obstaclesCapacity < size) {
        if (this.obstaclesBuffer) this.obstaclesBuffer.destroy();
        this.obstaclesBuffer = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
          "Obstacles",
        );
        this.obstaclesCapacity = size;
      }

      const obstacleData = new Float32Array(numObstacles * 4);
      for (let i = 0; i < obstacleArray.length; i++) {
        const ob = obstacleArray[i];
        obstacleData[i * 4] = ob.x;
        obstacleData[i * 4 + 1] = ob.y;
        obstacleData[i * 4 + 2] = ob.w;
        obstacleData[i * 4 + 3] = ob.h;
      }

      device.queue.writeBuffer(
        this.obstaclesBuffer!,
        0,
        obstacleData.buffer,
        obstacleData.byteOffset,
        obstacleData.byteLength,
      );
    }
  }

  private ensureTrailReadbackBuffer(device: GPUDevice, size: number) {
    if (
      !this.stagingTrailReadbackBuffer ||
      this.stagingTrailReadbackCapacity < size
    ) {
      this.stagingTrailReadbackBuffer?.destroy();
      this.stagingTrailReadbackBuffer = this.gpuHelper.createEmptyBuffer(
        device,
        size,
        GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        "StagingTrailReadback",
      );
      this.stagingTrailReadbackCapacity = size;
    }
  }

  private ensureVertexBuffer(device: GPUDevice, requiredSize: number) {
    if (!this.agentVertexBuffer || this.agentVertexCapacity < requiredSize) {
      this.agentVertexBuffer?.destroy();
      this.agentVertexBuffer = this.gpuHelper.createEmptyBuffer(
        device,
        requiredSize,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        "AgentVertex",
      );
      this.agentVertexCapacity = requiredSize;
      this.logger.info(
        `Allocated GPU vertex buffer for up to ${this.agentCount.toLocaleString()} agents.`,
      );
    }
  }

  private byteSizeForAgents(n: number) {
    return Math.max(
      n * COMPONENTS_PER_AGENT * FLOAT_SIZE,
      COMPONENTS_PER_AGENT * FLOAT_SIZE,
    );
  }

  private computeDispatchDimensions(
    totalWorkgroups: number,
  ): [number, number, number] {
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
        `Agent count ${this.agentCount} exceeds supported dispatch capacity for this device.`,
      );
    }
    return [dispatchX, dispatchY, dispatchZ];
  }

  destroy() {
    this.agentStorageBuffer?.destroy();
    this.agentsReadBuffer?.destroy();
    this.stagingReadbackBuffer?.destroy();
    this.agentVertexBuffer?.destroy();
    this.agentLogBuffer?.destroy();
    this.stagingLogBuffer?.destroy();
    this.stagingTrailReadbackBuffer?.destroy();
    this.inputUniformBuffer?.destroy();
    this.diffuseUniformBuffer?.destroy();
    this.trailMapBuffer?.destroy();
    this.trailMapBuffer2?.destroy();
    this.trailMapDeposits?.destroy();
    this.randomValuesBuffer?.destroy();
    this.obstaclesBuffer?.destroy();

    this.agentStorageBuffer = null;
    this.agentsReadBuffer = null;
    this.stagingReadbackBuffer = null;
    this.agentVertexBuffer = null;
    this.agentLogBuffer = null;
    this.stagingLogBuffer = null;
    this.stagingTrailReadbackBuffer = null;
    this.inputUniformBuffer = null;
    this.diffuseUniformBuffer = null;
    this.trailMapBuffer = null;
    this.trailMapBuffer2 = null;
    this.trailMapDeposits = null;
    this.randomValuesBuffer = null;
    this.obstaclesBuffer = null;

    this.device = null;
    this.computePipeline = null;
    this.bindGroupLayout = null;
    this.diffuseDecayPipeline = null;
    this.diffuseDecayBindGroupLayout = null;
    this.gpuStateSeeded = false;
    this.lastSyncedAgentsRef = null;
    this.trailMapGPUSeeded = false;
    this.inputUniformCapacity = 0;
    this.trailMapCapacity = 0;
    this.randomValuesCapacity = 0;
    this.obstaclesCapacity = 0;
    this.stagingTrailReadbackCapacity = 0;
    this.agentVertexCapacity = 0;
  }
}
