/**
 * @module compute
 * Multi-backend compute engine orchestrator.
 *
 * The {@link ComputeEngine} lazily instantiates and delegates work to one of
 * four compute backends (main-thread JavaScript, WebWorkers, WebAssembly, or
 * WebGPU) depending on the requested {@link Method}. It also manages the
 * double-buffered trail map used for pheromone simulations.
 */

import Logger from "../helpers/logger";
import type {
  BridgeTimingBreakdown,
  FrameMemoryStats,
  PerformanceMonitor,
} from "../performance";
import type {
  CompilationResult,
  Method,
  InputValues,
  Agent,
  RenderMode,
  WasmExecutionMode,
} from "../types";
import WebWorkers from "./webWorkers";
import type { WebGPURenderResources } from "./webGPU";
import WebGPU from "./webGPU";
import { WebAssemblyCompute } from "./webAssembly";

/** Function signature of a compiled agent update kernel. */
export type AgentFunction = (agent: Agent, inputs: InputValues) => Agent;

/** @internal Trail map state for a single frame. */
type TrailMapFrameState = {
  hasTrailMap: boolean;
  width: number;
  height: number;
  decayFactor: number;
  externalTrailMap?: Float32Array;
};

/** @internal Prepared inputs and trail state for a frame dispatch. */
type PreparedFrame = {
  inputs: InputValues;
  trail: TrailMapFrameState;
};

/** @internal Timing breakdown returned by each backend. */
type MethodPerformanceDetails = {
  setupTime: number;
  computeTime: number;
  readbackTime: number;
  specificStats: Record<string, number>;
  bridgeTimings?: BridgeTimingBreakdown;
  memoryStats?: FrameMemoryStats;
};

/**
 * Multi-backend compute engine.
 *
 * Lazily instantiates WebWorkers, WebAssembly, and WebGPU backends on first
 * use and routes each {@link runFrame} call to the requested backend,
 * collecting timing metrics through the injected {@link PerformanceMonitor}.
 */
export class ComputeEngine {
  private readonly compilationResult: CompilationResult;
  private agentFunction: AgentFunction;
  private agentCount: number = 0;
  private workerCount?: number;
  private readonly wasmExecutionMode: WasmExecutionMode;
  private readonly logger: Logger;

  private gpuDevice: GPUDevice | null = null;
  private readonly PerformanceMonitor: PerformanceMonitor;
  public gpuRenderState: WebGPURenderResources | undefined = undefined;

  private compileTimes: Record<string, number | undefined> = {};

  // Double-buffer for trail map parity across all compute methods
  private trailMapRead: Float32Array | null = null;
  private trailMapWrite: Float32Array | null = null;
  private trailMapSeeded: boolean = false;

  constructor(
    compilationResult: CompilationResult,
    performanceMonitor: PerformanceMonitor,
    agentCount: number,
    workerCount?: number,
    wasmExecutionMode: WasmExecutionMode = "auto",
  ) {
    this.compilationResult = compilationResult;
    this.PerformanceMonitor = performanceMonitor;
    this.workerCount = workerCount;
    this.wasmExecutionMode = wasmExecutionMode;

    const jsCompileStart = performance.now();
    this.agentFunction = this.buildAgentFunction();
    this.compileTimes["JavaScript"] = performance.now() - jsCompileStart;

    this.agentCount = agentCount;
    this.logger = new Logger("ComputeEngine", "purple");

    this.logger.log("ComputeEngine initialized");
  }

  /**
   * Ensure double-buffer trail maps are allocated for the given dimensions.
   */
  private ensureTrailMapBuffers(width: number, height: number): void {
    const size = width * height;
    if (!this.trailMapRead || this.trailMapRead.length !== size) {
      this.trailMapRead = new Float32Array(size);
      this.trailMapWrite = new Float32Array(size);
      this.trailMapSeeded = false;
    }
  }

  /**
   * Apply diffuse and decay to trail map (blur + decay).
   */
  private applyDiffuseDecay(
    width: number,
    height: number,
    decayFactor: number,
  ): void {
    if (!this.trailMapRead || !this.trailMapWrite) return;

    for (let i = 0; i < this.trailMapRead.length; i++) {
      this.trailMapRead[i] += this.trailMapWrite[i];
    }

    this.trailMapWrite.fill(0);

    const temp = new Float32Array(this.trailMapRead.length);
    const f = Math.fround;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = f(0);
        let count = f(0);

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            let nx = x + dx;
            let ny = y + dy;

            if (nx < 0) nx += width;
            if (nx >= width) nx -= width;
            if (ny < 0) ny += height;
            if (ny >= height) ny -= height;

            sum = f(sum + this.trailMapRead[ny * width + nx]);
            count = f(count + 1);
          }
        }

        const idx = y * width + x;
        const blurred = f(sum / count);
        const current = this.trailMapRead[idx];

        const term1 = f(current * f(0.1));
        const term2 = f(blurred * f(0.9));
        const diffused = f(term1 + term2);
        const decayMult = f(f(1.0) - f(decayFactor));
        temp[idx] = f(diffused * decayMult);
      }
    }

    this.trailMapRead.set(temp);
  }

  private syncTrailMapToExternal(externalTrailMap: Float32Array): void {
    if (this.trailMapRead) {
      externalTrailMap.set(this.trailMapRead);
    }
  }

  private prepareFrameInputs(
    method: Method,
    inputValues: InputValues,
  ): PreparedFrame {
    const inputs: InputValues = { ...inputValues };

    const width = typeof inputs.width === "number" ? inputs.width : 0;
    const height = typeof inputs.height === "number" ? inputs.height : 0;
    const decayFactor =
      typeof inputs.decayFactor === "number" ? inputs.decayFactor : 0.05;
    const externalTrailMap =
      inputs.trailMap instanceof Float32Array ? inputs.trailMap : undefined;

    const hasTrailMap = Boolean(externalTrailMap) && width > 0 && height > 0;

    if (hasTrailMap && externalTrailMap) {
      this.ensureTrailMapBuffers(width, height);

      if (!this.trailMapSeeded) {
        this.trailMapRead!.set(externalTrailMap);
        this.trailMapWrite!.fill(0);
        this.trailMapSeeded = true;
      }

      inputs.trailMapRead = this.trailMapRead!;
      inputs.trailMapWrite = this.trailMapWrite!;
    }

    if (method !== "WebWorkers") {
      inputs.print = (id: number, val: number) => {
        this.logger.info(`AGENT[${id}] PRINT:`, val);
      };
    }

    return {
      inputs,
      trail: {
        hasTrailMap,
        width,
        height,
        decayFactor,
        externalTrailMap,
      },
    };
  }

  private finalizeTrailMap(method: Method, trail: TrailMapFrameState): void {
    if (!trail.hasTrailMap || method === "WebGPU" || !trail.externalTrailMap) {
      return;
    }

    this.applyDiffuseDecay(trail.width, trail.height, trail.decayFactor);
    this.syncTrailMapToExternal(trail.externalTrailMap);
  }

  private _WebWorkers: WebWorkers | undefined;
  private get WebWorkersInstance(): WebWorkers {
    if (!this._WebWorkers) {
      const start = performance.now();
      this._WebWorkers = new WebWorkers(this.agentFunction, this.workerCount);
      this.compileTimes["WebWorkers"] = performance.now() - start;
    }
    return this._WebWorkers;
  }

  private _WebGPU: WebGPU | undefined;
  private _WebGPUInitPromise: Promise<void> | undefined;

  private async getWebGPUInstance(): Promise<WebGPU> {
    if (!this._WebGPU) {
      this._WebGPU = new WebGPU(
        this.compilationResult.wgslCode,
        this.compilationResult.requiredInputs,
        this.agentCount,
      );

      if (this.gpuDevice) {
        const start = performance.now();
        this._WebGPUInitPromise = this._WebGPU.init(
          this.gpuDevice,
          this.agentCount,
        );
        await this._WebGPUInitPromise;
        this.compileTimes["WebGPU"] = performance.now() - start;
      }
    } else if (this._WebGPUInitPromise) {
      await this._WebGPUInitPromise;
    }

    return this._WebGPU;
  }

  private _WebAssembly: WebAssemblyCompute | undefined;
  private _WebAssemblyInitPromise: Promise<void> | undefined;

  private async getWebAssemblyInstance(): Promise<WebAssemblyCompute> {
    if (!this._WebAssembly) {
      const start = performance.now();
      this._WebAssembly = new WebAssemblyCompute(
        this.compilationResult.WASMCode,
        this.agentCount,
        { executionMode: this.wasmExecutionMode },
      );
      this._WebAssemblyInitPromise = this._WebAssembly.init();
      await this._WebAssemblyInitPromise;
      this.compileTimes["WebAssembly"] = performance.now() - start;
    } else if (this._WebAssemblyInitPromise) {
      await this._WebAssemblyInitPromise;
    }

    return this._WebAssembly;
  }

  /**
   * Provide a GPU device for the WebGPU backend.
   *
   * If the WebGPU instance already exists, initialises it immediately;
   * otherwise the device is stored for deferred initialisation.
   *
   * @param device - The WebGPU device obtained from the Renderer.
   */
  initGPU(device: GPUDevice) {
    this.logger.log(
      "Initializing ComputeEngine with GPU device:",
      device,
      "and agent count:",
      this.agentCount,
    );
    this.gpuDevice = device;

    if (this._WebGPU && !this._WebGPUInitPromise) {
      const start = performance.now();
      this._WebGPUInitPromise = this._WebGPU
        .init(device, this.agentCount)
        .then(() => {
          this.compileTimes["WebGPU"] = performance.now() - start;
        });
    }
  }

  /**
   * Execute a single simulation frame on the specified compute backend.
   *
   * @param method - Compute backend to use.
   * @param agents - Current agent state array.
   * @param inputValues - Per-frame input values (width, height, trailMap, etc.).
   * @param renderMode - Determines whether GPU results are read back to CPU.
   * @returns Updated agent array after one step.
   */
  async runFrame(
    method: Method,
    agents: Agent[],
    inputValues: InputValues,
    renderMode: RenderMode,
  ): Promise<Agent[]> {
    this.logger.log("Running Compute:", method);
    this.agentCount = agents.length;

    const prepared = this.prepareFrameInputs(method, inputValues);
    const inputs = prepared.inputs;

    let result: Agent[];

    switch (method) {
      case "WebWorkers":
        result = await this.runOnWebWorkers(agents, inputs);
        break;
      case "WebGPU":
        result = await this.runOnWebGPU(agents, inputs, renderMode);
        break;
      case "WebAssembly":
        result = await this.runOnWASM(agents, inputs);
        break;
      default:
        result = await this.runOnMainThread(agents, inputs);
        break;
    }

    this.finalizeTrailMap(method, prepared.trail);

    return result;
  }

  private async runOnWASM(
    agents: Agent[],
    inputs: InputValues,
  ): Promise<Agent[]> {
    const instance = await this.getWebAssemblyInstance();
    const { agents: updatedAgents, performance: wasmPerf } = instance.compute(
      agents,
      inputs,
    );
    const wasmExecInfo = instance.getExecutionInfo();
    const memoryFootprint = instance.getMemoryFootprintBytes();

    this.logPerformance("WebAssembly", updatedAgents.length, {
      setupTime: wasmPerf.writeTime,
      computeTime: wasmPerf.computeTime,
      readbackTime: wasmPerf.readTime,
      specificStats: {
        "Memory Write": wasmPerf.writeTime,
        "WASM Execution": wasmPerf.computeTime,
        "Memory Read": wasmPerf.readTime,
        "WASM SIMD Memcpy": wasmPerf.simdMemcpyTime,
        "WASM SIMD Requested":
          wasmExecInfo.requestedMode === "simd"
            ? 1
            : wasmExecInfo.requestedMode === "auto"
              ? 0.5
              : 0,
        "WASM SIMD Active": wasmExecInfo.effectiveMode === "simd" ? 1 : 0,
        "WASM SIMD Supported": wasmExecInfo.simdSupported ? 1 : 0,
        "Linear Memory (bytes)": memoryFootprint,
      },
      memoryStats: {
        methodMemoryFootprintBytes: memoryFootprint,
        methodMemoryFootprintType: "exact",
      },
    });

    return updatedAgents;
  }

  private async runOnWebGPU(
    agents: Agent[],
    inputs: InputValues,
    renderMode: RenderMode,
  ): Promise<Agent[]> {
    const instance = await this.getWebGPUInstance();
    const shouldReadback = renderMode !== "gpu";

    const result = shouldReadback
      ? await instance.runGPUReadback(agents, inputs)
      : await instance.runGPU(agents, inputs);

    const { updatedAgents, renderResources, performance: gpuPerf } = result;
    const nextAgents = updatedAgents ?? agents;
    const gpuMemory = instance.getMemoryFootprintBytes();

    this.logPerformance("WebGPU", nextAgents.length, {
      setupTime: gpuPerf.setupTime,
      computeTime: gpuPerf.dispatchTime,
      readbackTime: gpuPerf.readbackTime,
      specificStats: {
        "Buffer Setup": gpuPerf.setupTime,
        "GPU Dispatch": gpuPerf.dispatchTime,
        Readback: gpuPerf.readbackTime,
        "Host->GPU": gpuPerf.hostToGpuTime,
        "GPU->Host": gpuPerf.gpuToHostTime,
        "Queue Submit": gpuPerf.queueSubmitTime,
        "GPU Memory (bytes)": gpuMemory.totalBytes,
      },
      bridgeTimings: {
        hostToGpuTime: gpuPerf.hostToGpuTime,
        hostToGpuAgentUploadTime: gpuPerf.hostToGpuAgentUploadTime,
        hostToGpuInputUploadTime: gpuPerf.hostToGpuInputUploadTime,
        hostToGpuUniformUploadTime: gpuPerf.hostToGpuUniformUploadTime,
        hostToGpuTrailUploadTime: gpuPerf.hostToGpuTrailUploadTime,
        hostToGpuRandomUploadTime: gpuPerf.hostToGpuRandomUploadTime,
        hostToGpuObstacleUploadTime: gpuPerf.hostToGpuObstacleUploadTime,
        gpuToHostTime: gpuPerf.gpuToHostTime,
        gpuToHostAgentReadbackTime: gpuPerf.gpuToHostAgentReadbackTime,
        gpuToHostTrailReadbackTime: gpuPerf.gpuToHostTrailReadbackTime,
        gpuToHostLogReadbackTime: gpuPerf.gpuToHostLogReadbackTime,
        queueSubmitTime: gpuPerf.queueSubmitTime,
      },
      memoryStats: {
        methodMemoryFootprintBytes: gpuMemory.totalBytes,
        methodMemoryFootprintType: "exact",
      },
    });

    if (renderResources) {
      this.gpuRenderState = renderResources;
    }

    return nextAgents;
  }

  private async runOnWebWorkers(
    agents: Agent[],
    inputs: InputValues,
  ): Promise<Agent[]> {
    const instance = this.WebWorkersInstance;

    const {
      agents: updatedAgents,
      trailMap: depositDeltas,
      performance: workerPerf,
    } = await instance.compute(agents, inputs);

    if (depositDeltas && inputs.trailMapWrite) {
      const writeBuffer = inputs.trailMapWrite as Float32Array;
      for (let i = 0; i < depositDeltas.length; i++) {
        writeBuffer[i] += depositDeltas[i];
      }
    }

    const memoryEstimate = instance.estimateMemoryFootprintBytes(
      updatedAgents.length,
      inputs,
    );
    const workers = instance.getWorkerCount();

    this.logPerformance("WebWorkers", updatedAgents.length, {
      setupTime: workerPerf.serializationTime,
      computeTime: workerPerf.workerTime,
      readbackTime: workerPerf.deserializationTime,
      specificStats: {
        Serialization: workerPerf.serializationTime,
        "Worker Compute": workerPerf.workerTime,
        Deserialization: workerPerf.deserializationTime,
        Workers: workers,
        "Estimated Transfer Footprint (bytes)": memoryEstimate,
      },
      memoryStats: {
        methodMemoryFootprintBytes: memoryEstimate,
        methodMemoryFootprintType: "estimate",
      },
    });

    return updatedAgents;
  }

  private async runOnMainThread(
    agents: Agent[],
    inputs: InputValues,
  ): Promise<Agent[]> {
    const computeStart = performance.now();
    const updatedAgents = agents.map((agent) =>
      this.agentFunction({ ...agent }, inputs),
    );
    const computeEnd = performance.now();

    const computeTime = computeEnd - computeStart;
    const memoryEstimate = this.estimateMainThreadMemoryBytes(
      updatedAgents.length,
      inputs,
    );

    this.logPerformance("JavaScript", updatedAgents.length, {
      setupTime: 0,
      computeTime,
      readbackTime: 0,
      specificStats: {
        "JS Execution": computeTime,
        "Estimated State Footprint (bytes)": memoryEstimate,
      },
      memoryStats: {
        methodMemoryFootprintBytes: memoryEstimate,
        methodMemoryFootprintType: "estimate",
      },
    });

    return updatedAgents;
  }

  private estimateMainThreadMemoryBytes(
    agentCount: number,
    inputs: InputValues,
  ): number {
    const agentsBytes = Math.max(0, Math.floor(agentCount)) * 6 * 8;
    const trailBytes =
      inputs.trailMapRead instanceof Float32Array
        ? inputs.trailMapRead.byteLength
        : inputs.trailMap instanceof Float32Array
          ? inputs.trailMap.byteLength
          : 0;
    const randomBytes =
      inputs.randomValues instanceof Float32Array
        ? inputs.randomValues.byteLength
        : 0;
    const obstacleBytes = Array.isArray(inputs.obstacles)
      ? inputs.obstacles.length * 4 * 8
      : 0;

    return agentsBytes + trailBytes + randomBytes + obstacleBytes;
  }

  private logPerformance(
    method: string,
    agentCount: number,
    details: MethodPerformanceDetails,
  ) {
    const compileTime = this.compileTimes[method];
    if (compileTime !== undefined) {
      this.compileTimes[method] = undefined;
    }

    const totalExecutionTime =
      details.setupTime + details.computeTime + details.readbackTime;

    this.PerformanceMonitor.logFrame({
      method,
      agentCount,
      agentPerformance: [],
      totalExecutionTime,
      frameTimestamp: Date.now(),
      setupTime: details.setupTime,
      computeTime: details.computeTime,
      readbackTime: details.readbackTime,
      compileTime,
      specificStats: details.specificStats,
      bridgeTimings: details.bridgeTimings,
      memoryStats: details.memoryStats,
    });
  }

  /** Release all backend instances and buffers. */
  destroy(): void {
    this._WebWorkers?.destroy();
    this._WebWorkers = undefined;

    this._WebGPU?.destroy();
    this._WebGPU = undefined;
    this._WebGPUInitPromise = undefined;

    this._WebAssembly?.destroy();
    this._WebAssembly = undefined;
    this._WebAssemblyInitPromise = undefined;

    this.trailMapRead = null;
    this.trailMapWrite = null;
    this.trailMapSeeded = false;

    this.gpuRenderState = undefined;
    this.gpuDevice = null;
    this.compileTimes = {};
  }

  /** Build the agent update function from compiled JavaScript source. */
  private buildAgentFunction(): AgentFunction {
    try {
      return new Function(
        `return ${this.compilationResult.jsCode}`,
      )() as AgentFunction;
    } catch (err) {
      this.logger?.error(
        "Failed to build agent function from compiled JS:",
        err,
      );
      throw new Error(
        `Failed to compile agent function: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
