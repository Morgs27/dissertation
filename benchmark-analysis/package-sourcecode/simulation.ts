/**
 * @module simulation
 * Core simulation orchestrator.
 *
 * The {@link Simulation} class ties together the compiler, compute engine,
 * renderer, and tracker into a single cohesive API for running agent-based
 * simulations in the browser.
 */

import { Compiler } from "./compiler/compiler";
import { ComputeEngine } from "./compute/compute";
import Logger from "./helpers/logger";
import { PerformanceMonitor, type FrameMemoryStats } from "./performance";
import { Renderer } from "./renderer";
import {
  SimulationTracker,
  type SimulationTrackingFilter,
  type SimulationTrackingReport,
} from "./tracking";
import type {
  Agent,
  CompilationResult,
  CustomCodeSource,
  InputValues,
  Method,
  Obstacle,
  RenderMode,
  SimulationAppearance,
  SimulationConstructor,
  SimulationFrameResult,
  SimulationSource,
} from "./types";
import GPU from "./helpers/gpu";

/** Maximum number of agents a single simulation instance may create. */
export const MAX_AGENTS = 10_000_000;

/** @internal Default canvas width when none is provided. */
const DEFAULT_CANVAS_WIDTH = 600;
/** @internal Default canvas height when none is provided. */
const DEFAULT_CANVAS_HEIGHT = 600;

/** @internal Default visual appearance applied when no overrides are supplied. */
const DEFAULT_APPEARANCE: SimulationAppearance = {
  agentColor: "#00FFFF",
  backgroundColor: "#000000",
  agentSize: 3,
  agentShape: "circle",
  showTrails: true,
  trailOpacity: 1,
  trailColor: "#50FFFF",
  speciesColors: ["#00FFFF"],
  obstacleColor: "#FF0000",
  obstacleBorderColor: "#FF0000",
  obstacleOpacity: 0.2,
};

/**
 * Create a deterministic pseudo-random number generator from a numeric seed.
 *
 * Uses a simple linear congruential generator (LCG) that produces values in [0, 1).
 *
 * @param seed - Integer seed value.
 * @returns A function that returns the next pseudo-random number on each call.
 * @internal
 */
const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

/**
 * Normalise the constructor config into a canonical {@link SimulationSource}.
 *
 * Handles the shorthand `agentScript` field as well as the explicit `source` field.
 *
 * @param config - Simulation constructor configuration.
 * @returns Normalised simulation source.
 * @internal
 */
const normalizeSource = (config: SimulationConstructor): SimulationSource => {
  if (config.source) {
    return config.source;
  }

  return {
    kind: "dsl",
    code: config.agentScript ?? "",
  };
};

/**
 * Build a {@link CompilationResult} from a user-supplied {@link CustomCodeSource}.
 *
 * @param source - Custom code source with pre-written JS/WGSL/WAT.
 * @returns A compilation result compatible with the compute engine.
 * @internal
 */
const compileFromCustomSource = (
  source: CustomCodeSource,
): CompilationResult => {
  const jsCode =
    typeof source.js === "function" ? source.js.toString() : (source.js ?? "");

  return {
    requiredInputs: source.requiredInputs ? [...source.requiredInputs] : [],
    definedInputs: source.definedInputs
      ? source.definedInputs.map((input) => ({ ...input }))
      : [],
    wgslCode: source.wgsl ?? "",
    jsCode,
    WASMCode: source.wasmWat ?? "",
    speciesCount: source.speciesCount,
    numRandomCalls: source.numRandomCalls ?? 0,
  };
};

/**
 * Validate that the chosen compute method has the required compiled code available.
 *
 * @param method - The compute method to validate.
 * @param compilationResult - The compilation output to check against.
 * @returns An object indicating availability, with an optional reason string.
 * @internal
 */
const methodRequiresCode = (
  method: Method,
  compilationResult: CompilationResult,
): { available: boolean; reason?: string } => {
  if (
    (method === "JavaScript" || method === "WebWorkers") &&
    !compilationResult.jsCode.trim()
  ) {
    return {
      available: false,
      reason: `Method ${method} requested but no JavaScript code is available for the simulation source.`,
    };
  }

  if (method === "WebAssembly" && !compilationResult.WASMCode.trim()) {
    return {
      available: false,
      reason:
        "Method WebAssembly requested but no WAT/WASM code is available for the simulation source.",
    };
  }

  if (method === "WebGPU" && !compilationResult.wgslCode.trim()) {
    return {
      available: false,
      reason:
        "Method WebGPU requested but no WGSL code is available for the simulation source.",
    };
  }

  return { available: true };
};

/**
 * The main simulation class that orchestrates compilation, computation,
 * rendering, and tracking.
 *
 * @example
 * ```ts
 * import { Simulation } from '@websimbench/agentyx';
 *
 * const sim = new Simulation({
 *   agentScript: `
 *     moveForward 1
 *     borderWrapping
 *   `,
 *   options: { agents: 500 },
 *   canvas: document.getElementById('sim') as HTMLCanvasElement,
 * });
 *
 * // Run frames in a requestAnimationFrame loop
 * async function tick() {
 *   const result = await sim.runFrame('JavaScript');
 *   requestAnimationFrame(tick);
 * }
 * tick();
 * ```
 */
export class Simulation {
  private readonly logger = new Logger("Simulation", "blue");
  private readonly performanceMonitor: PerformanceMonitor;
  private readonly compiler: Compiler;
  private readonly computeEngine: ComputeEngine;
  private readonly source: SimulationSource;
  private readonly tracker: SimulationTracker;

  private renderer: Renderer | null = null;
  private width: number;
  private height: number;
  private frameInProgress = false;
  private frameNumber = 0;

  private frameInputs: InputValues = {};
  private obstacles: Obstacle[] = [];
  private appearance: SimulationAppearance;

  /** Current agent state array. Updated after each successful frame. */
  public agents: Agent[] = [];
  /** Compilation output from the DSL compiler or custom source. */
  public compilationResult: CompilationResult | null = null;
  /** Trail intensity map (width × height `Float32Array`), or `null` if trails are not active. */
  public trailMap: Float32Array | null = null;
  /** Pre-generated random values buffer for the current frame, or `null` if not needed. */
  public randomValues: Float32Array | null = null;

  /**
   * Create a new simulation instance.
   *
   * Compiles the provided DSL or custom code, initialises agents with random
   * (or seeded) positions, and sets up the compute engine, renderer, and
   * tracker.
   *
   * @param config - Full simulation configuration.
   * @throws {Error} If `options.agents` is not a positive integer or exceeds {@link MAX_AGENTS}.
   */
  constructor(config: SimulationConstructor) {
    const { options } = config;

    if (!Number.isFinite(options.agents) || options.agents < 1) {
      throw new Error('Simulation option "agents" must be a positive integer.');
    }

    if (options.agents > MAX_AGENTS) {
      const message = `Number of agents exceeds maximum limit of ${MAX_AGENTS}.`;
      this.logger.error(message);
      throw new Error(message);
    }

    this.width = config.canvas?.width ?? options.width ?? DEFAULT_CANVAS_WIDTH;
    this.height =
      config.canvas?.height ?? options.height ?? DEFAULT_CANVAS_HEIGHT;

    this.appearance = {
      ...DEFAULT_APPEARANCE,
      ...(config.appearance ?? {}),
    };

    this.performanceMonitor = new PerformanceMonitor();
    this.compiler = new Compiler();

    this.source = normalizeSource(config);

    const compilationResult =
      this.source.kind === "dsl"
        ? this.compiler.compileAgentCode(this.source.code)
        : compileFromCustomSource(this.source.code);

    this.compilationResult = compilationResult;

    this.computeEngine = new ComputeEngine(
      compilationResult,
      this.performanceMonitor,
      options.agents,
      options.workers,
      options.wasmExecutionMode ?? "auto",
    );

    if (config.canvas) {
      config.canvas.width = this.width;
      config.canvas.height = this.height;
      if (config.gpuCanvas) {
        config.gpuCanvas.width = this.width;
        config.gpuCanvas.height = this.height;
      }
      this.renderer = new Renderer(
        config.canvas,
        config.gpuCanvas ?? null,
        this.appearance,
      );
    }

    this.agents = this.createInitialAgents(
      options.agents,
      compilationResult.speciesCount ?? 1,
      options.seed,
    );

    this.tracker = new SimulationTracker({
      source: this.source,
      options,
      compilationResult,
      tracking: config.tracking,
      metadata: config.metadata,
    });

    void this.tracker.collectEnvironmentMetrics();
  }

  /**
   * Generate the initial agent population with random or seeded positions.
   *
   * @param count - Number of agents to create.
   * @param speciesCount - Number of distinct species (for round-robin assignment).
   * @param seed - Optional PRNG seed for reproducible placement.
   * @returns Array of initialised agents.
   */
  private createInitialAgents(
    count: number,
    speciesCount: number,
    seed?: number,
  ): Agent[] {
    const random =
      typeof seed === "number" ? createSeededRandom(seed) : Math.random;

    return Array.from({ length: count }, (_, index) => ({
      id: index,
      x: random() * this.width,
      y: random() * this.height,
      vx: (random() - 0.5) * 2,
      vy: (random() - 0.5) * 2,
      species: index % Math.max(speciesCount, 1),
    }));
  }

  /**
   * Allocate or resize the trail-map buffer to match the given dimensions.
   *
   * @param width - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   */
  private ensureTrailMap(width: number, height: number): void {
    const expectedLength = width * height;
    if (!this.trailMap || this.trailMap.length !== expectedLength) {
      this.trailMap = new Float32Array(expectedLength);
    }
  }

  /**
   * Fill the random values buffer with fresh random numbers for this frame.
   *
   * @param requiredCalls - Number of random values needed per agent.
   */
  private populateRandomValues(requiredCalls: number): void {
    if (requiredCalls <= 0) {
      return;
    }

    const totalRandomValues = this.agents.length * requiredCalls;

    if (!this.randomValues || this.randomValues.length !== totalRandomValues) {
      this.randomValues = new Float32Array(totalRandomValues);
    }

    for (let i = 0; i < totalRandomValues; i++) {
      this.randomValues[i] = Math.random();
    }
  }

  /**
   * Resolve the current simulation dimensions from the renderer canvas
   * or the manually set width/height.
   *
   * @returns Current width and height.
   */
  private resolveDimensions(): { width: number; height: number } {
    if (this.renderer) {
      this.width = this.renderer.canvas.width;
      this.height = this.renderer.canvas.height;
    }

    return { width: this.width, height: this.height };
  }

  private captureJsHeapSnapshot(): FrameMemoryStats | undefined {
    if (typeof performance === "undefined") {
      return undefined;
    }

    const perf = performance as Performance & {
      memory?: {
        jsHeapSizeLimit: number;
        totalJSHeapSize: number;
        usedJSHeapSize: number;
      };
    };

    if (!perf.memory) {
      return undefined;
    }

    return {
      jsHeapSizeLimitBytes: perf.memory.jsHeapSizeLimit,
      totalJsHeapSizeBytes: perf.memory.totalJSHeapSize,
      usedJsHeapSizeBytes: perf.memory.usedJSHeapSize,
    };
  }

  /**
   * Merge user-supplied frame inputs with system inputs (dimensions, agents,
   * trail map, random values, obstacles, and defined input defaults) to produce
   * the final input map for the compute engine.
   *
   * @param frameInputValues - Per-frame input overrides from the caller.
   * @returns Fully resolved input values map.
   * @throws {Error} If any required input is missing.
   */
  private buildInputs(frameInputValues: InputValues): InputValues {
    if (!this.compilationResult) {
      throw new Error("Simulation compilation result is unavailable.");
    }

    const { width, height } = this.resolveDimensions();
    const needsTrailMap =
      this.compilationResult.requiredInputs.includes("trailMap");
    const needsRandomValues =
      this.compilationResult.requiredInputs.includes("randomValues");

    if (needsTrailMap) {
      this.ensureTrailMap(width, height);
    } else {
      this.trailMap = null;
    }

    if (needsRandomValues) {
      this.populateRandomValues(this.compilationResult.numRandomCalls ?? 0);
    } else {
      this.randomValues = null;
    }

    const mergedInputs: InputValues = {
      width,
      height,
      agents: this.agents,
      ...this.frameInputs,
      ...frameInputValues,
    };

    if (needsTrailMap && this.trailMap) {
      mergedInputs.trailMap = this.trailMap;
    }

    if (needsRandomValues && this.randomValues) {
      mergedInputs.randomValues = this.randomValues;
    }

    const needsObstacles =
      this.compilationResult.requiredInputs.includes("obstacles");
    if (needsObstacles) {
      mergedInputs.obstacles =
        (mergedInputs.obstacles as Obstacle[] | undefined) ?? this.obstacles;
      mergedInputs.obstacleCount = (
        mergedInputs.obstacles as Obstacle[]
      ).length;
    }

    this.compilationResult.definedInputs.forEach((input) => {
      if (!(input.name in mergedInputs)) {
        mergedInputs[input.name] = input.defaultValue;
      }
    });

    const missingInputs = this.compilationResult.requiredInputs.filter(
      (name) => !(name in mergedInputs),
    );
    if (missingInputs.length > 0) {
      const message = `Missing required input values: ${missingInputs.join(", ")}`;
      this.logger.error(message);
      throw new Error(message);
    }

    return mergedInputs;
  }

  /**
   * Initialise the WebGPU device and configure both the compute engine
   * and the renderer for GPU operation.
   *
   * Must be called before using `'WebGPU'` as a compute method or `'gpu'`
   * as a render mode.
   *
   * @throws {Error} If WebGPU is not available or the adapter cannot be obtained.
   */
  public async initGPU(): Promise<void> {
    const gpuHelper = new GPU("SimulationGPU");
    const gpuDevice = (await gpuHelper.getDevice()) as GPUDevice;

    this.computeEngine.initGPU(gpuDevice);

    if (this.renderer) {
      this.renderer.initGPU(gpuDevice);
    }
  }

  /**
   * Update the visual appearance at runtime.
   *
   * Only the provided properties are changed; all others remain as-is.
   *
   * @param nextAppearance - Partial appearance overrides.
   */
  public updateAppearance(nextAppearance: Partial<SimulationAppearance>): void {
    this.appearance = {
      ...this.appearance,
      ...nextAppearance,
    };

    if (this.renderer) {
      this.renderer.setAppearance(this.appearance);
    }
  }

  /**
   * Merge dynamic input values that persist across frames.
   *
   * Values set here are included in every subsequent `runFrame` call
   * unless overridden by the per-frame `inputValues` argument.
   *
   * @param nextInputs - Input key-value pairs to merge.
   */
  public setInputs(nextInputs: InputValues): void {
    this.frameInputs = {
      ...this.frameInputs,
      ...nextInputs,
    };
  }

  /**
   * Replace the obstacle list used for `avoidObstacles` commands.
   *
   * @param obstacles - Array of rectangular obstacles.
   */
  public setObstacles(obstacles: Obstacle[]): void {
    this.obstacles = [...obstacles];
    this.frameInputs.obstacles = this.obstacles;
  }

  /**
   * Manually set the simulation world dimensions when no canvas is attached.
   *
   * If a trail map exists and its size no longer matches the new dimensions,
   * it is reallocated.
   *
   * @param width - New width in pixels.
   * @param height - New height in pixels.
   */
  public setCanvasDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.trailMap && this.trailMap.length !== width * height) {
      this.trailMap = new Float32Array(width * height);
    }
  }

  /**
   * Run a single simulation frame: compute agent updates, render, and record
   * tracking data.
   *
   * If a previous frame is still in progress, the call returns immediately
   * with `skipped: true`.
   *
   * @param method - Compute backend to use (e.g. `'JavaScript'`, `'WebGPU'`).
   * @param inputValues - Per-frame input overrides (merged with persistent inputs).
   * @param renderMode - Rendering strategy: `'cpu'`, `'gpu'`, or `'none'`.
   * @returns The frame result including updated agent positions.
   * @throws {Error} If the required compiled code is unavailable, or the render mode
   *   requires a canvas that was not provided.
   */
  public async runFrame(
    method: Method,
    inputValues: InputValues = {},
    renderMode: RenderMode = "cpu",
  ): Promise<SimulationFrameResult> {
    if (!this.compilationResult) {
      throw new Error("Simulation cannot run without compilation results.");
    }

    if (this.frameInProgress) {
      this.performanceMonitor.logMissingFrame();
      return {
        frameNumber: this.frameNumber,
        agents: this.agents,
        skipped: true,
      };
    }

    const availability = methodRequiresCode(method, this.compilationResult);
    if (!availability.available) {
      throw new Error(availability.reason);
    }

    if ((renderMode === "cpu" || renderMode === "gpu") && !this.renderer) {
      throw new Error(
        `Render mode "${renderMode}" requires a canvas renderer. Use render mode "none" for headless execution.`,
      );
    }

    const forceReadbackForTracking =
      method === "WebGPU" &&
      renderMode === "gpu" &&
      this.tracker.capturesAgentStates();
    const computeRenderMode =
      renderMode === "gpu" && !forceReadbackForTracking ? "gpu" : "cpu";
    const mergedInputs = this.buildInputs(inputValues);

    this.frameInProgress = true;

    try {
      const nextAgents = await this.computeEngine.runFrame(
        method,
        this.agents,
        mergedInputs,
        computeRenderMode,
      );

      this.agents = nextAgents;

      let renderTime = 0;

      if (renderMode !== "none" && this.renderer) {
        const renderStart = performance.now();

        if (renderMode === "gpu") {
          await this.renderer.renderAgentsGPU(
            nextAgents,
            this.computeEngine.gpuRenderState,
            this.trailMap ?? undefined,
          );
        } else {
          this.renderer.renderBackground();
          if (this.trailMap && this.renderer.getAppearance().showTrails) {
            this.renderer.renderTrails(
              this.trailMap,
              this.renderer.canvas.width,
              this.renderer.canvas.height,
            );
          }
          this.renderer.renderAgents(nextAgents);
        }

        renderTime = performance.now() - renderStart;
      }

      const frames = this.performanceMonitor.frames;
      const lastFrame =
        frames.length > 0 ? frames[frames.length - 1] : undefined;

      if (lastFrame) {
        lastFrame.renderTime = renderTime;
        lastFrame.totalExecutionTime += renderTime;
        const jsHeapSnapshot = this.captureJsHeapSnapshot();
        if (jsHeapSnapshot) {
          lastFrame.memoryStats = {
            ...(lastFrame.memoryStats ?? {}),
            ...jsHeapSnapshot,
          };
        }
      }

      const currentFrameNumber = this.frameNumber;
      this.frameNumber += 1;

      this.tracker.recordFrame({
        frameNumber: currentFrameNumber,
        method,
        renderMode,
        agents: nextAgents,
        inputs: mergedInputs,
        performance: lastFrame,
      });

      return {
        frameNumber: currentFrameNumber,
        agents: nextAgents,
        skipped: false,
      };
    } catch (error) {
      this.tracker.recordError(error);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to run simulation frame: ${message}`);
      throw error;
    } finally {
      this.frameInProgress = false;
    }
  }

  /**
   * Access the internal performance monitor for detailed frame-level metrics.
   *
   * @returns The shared {@link PerformanceMonitor} instance.
   */
  public getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * Generate a structured tracking report covering the simulation run.
   *
   * @param filter - Optional filter to restrict the frame range and inclusions.
   * @returns A deep-cloned tracking report.
   */
  public getTrackingReport(
    filter?: SimulationTrackingFilter,
  ): SimulationTrackingReport {
    return this.tracker.getReport(filter);
  }

  /**
   * Finalize tracking and wait for pending async metric capture to settle.
   *
   * Useful before exporting a benchmark report to ensure end timestamps,
   * environment metrics, and the final runtime sample are present.
   */
  public async finalizeTracking(): Promise<void> {
    await this.tracker.finalize();
  }

  /**
   * Export the tracking report as a formatted JSON string.
   *
   * @param filter - Optional filter to restrict the frame range and inclusions.
   * @returns Pretty-printed JSON string of the tracking report.
   */
  public exportTrackingReport(filter?: SimulationTrackingFilter): string {
    return JSON.stringify(this.getTrackingReport(filter), null, 2);
  }

  /**
   * Export the tracking report as a Blob containing a JSON string.
   *
   * This is more memory-efficient than `exportTrackingReport` for very large
   * reports, as it avoids the JavaScript engine's maximum string length limit.
   *
   * @param filter - Optional filter to restrict the frame range and inclusions.
   * @returns A Blob containing the pretty-printed JSON tracking report.
   */
  public exportTrackingReportBlob(filter?: SimulationTrackingFilter): Blob {
    const report = this.getTrackingReport(filter);
    const json = JSON.stringify(report, null, 2);
    return new Blob([json], { type: "application/json" });
  }

  /**
   * Tear down the simulation, releasing all resources.
   *
   * Completes the tracking session, disposes the log listener, destroys
   * the compute engine, and clears all buffers.
   */
  public destroy(): void {
    this.tracker.complete();
    this.tracker.dispose();
    this.renderer?.resetGPUState();
    this.renderer = null;
    this.computeEngine.destroy();
    this.agents = [];
    this.trailMap = null;
    this.randomValues = null;
  }
}

export default Simulation;
