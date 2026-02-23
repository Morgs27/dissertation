/**
 * @module performance
 * Performance monitoring utilities for tracking per-frame execution metrics.
 *
 * The {@link PerformanceMonitor} accumulates {@link FramePerformance} records
 * for every simulation frame and provides summary statistics.
 */
/**
 * Per-frame performance data recorded during simulation execution.
 *
 * @property method - Compute method used (e.g. `'JavaScript'`, `'WebGPU'`).
 * @property agentCount - Number of agents processed in this frame.
 * @property agentPerformance - Per-agent timing breakdown (main-thread methods only).
 * @property totalExecutionTime - Wall-clock time for the entire frame in milliseconds.
 * @property frameTimestamp - High-resolution timestamp when the frame began.
 * @property setupTime - Time spent on buffer setup / serialisation.
 * @property computeTime - Time spent in the compute kernel.
 * @property renderTime - Time spent rendering (populated by {@link Simulation}).
 * @property readbackTime - Time spent reading results back from GPU/WASM memory.
 * @property compileTime - One-off pipeline compilation time (first frame only).
 * @property specificStats - Backend-specific timing breakdowns.
 */
type FramePerformance = {
  method: string;
  agentCount: number;
  agentPerformance: AgentPerformance[];
  totalExecutionTime: number;
  frameTimestamp: number;
  setupTime?: number;
  computeTime?: number;
  renderTime?: number;
  readbackTime?: number;
  compileTime?: number;
  specificStats?: Record<string, number>;
};
/**
 * Execution timing for a single agent (main-thread methods only).
 *
 * @property agentId - Agent identifier.
 * @property executionTime - Time taken to execute the agent function in milliseconds.
 */
type AgentPerformance = {
  agentId: number;
  executionTime: number;
};
/**
 * Accumulates per-frame performance data and provides summary statistics.
 *
 * Created internally by the {@link Simulation} class and shared with the
 * {@link ComputeEngine} so that each backend can record its own timing.
 *
 * @example
 * ```ts
 * const monitor = sim.getPerformanceMonitor();
 * monitor.printSummary();
 * console.log(`Total frames: ${monitor.frames.length}`);
 * ```
 */
declare class PerformanceMonitor {
  private readonly logger;
  private readonly _frames;
  constructor();
  /**
   * Record a completed frame's performance data.
   *
   * @param performance - The frame's timing and metric data.
   */
  logFrame(performance: FramePerformance): void;
  /**
   * All recorded frame performance entries.
   */
  get frames(): FramePerformance[];
  /**
   * Log a warning when a frame is skipped because the previous frame
   * was still in progress.
   */
  logMissingFrame(): void;
  /**
   * Clear all recorded frame data.
   */
  reset(): void;
  /**
   * Print a human-readable performance summary to the console.
   *
   * Outputs average total, setup, compute, render, and readback times
   * as well as any backend-specific statistics.
   */
  printSummary(): void;
}

/**
 * @module deviceInfo
 * Runtime environment metrics collection.
 *
 * Collects device, browser, and GPU metrics at simulation startup for
 * inclusion in tracking reports. Works in both browser and Node.js
 * environments.
 */
/**
 * Device-level hardware and platform metrics.
 *
 * @property userAgent - Browser user agent string.
 * @property platform - Operating system platform identifier.
 * @property hardwareConcurrency - Number of logical CPU cores.
 * @property deviceMemoryGb - Estimated device memory in GB (Chrome only).
 * @property language - Browser language preference.
 * @property timezone - IANA timezone identifier.
 * @property nodeVersion - Node.js version string (if running in Node).
 * @property runtime - Detected runtime environment.
 */
type RuntimeDeviceMetrics = {
  userAgent?: string;
  platform?: string;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  language?: string;
  timezone?: string;
  nodeVersion?: string;
  runtime?: "browser" | "node" | "unknown";
};
/**
 * Browser-specific environment metrics.
 *
 * @property online - Whether the browser reports network connectivity.
 * @property cookieEnabled - Whether cookies are enabled.
 * @property doNotTrack - Do-Not-Track header value.
 * @property url - Current page URL.
 * @property referrer - Document referrer.
 * @property viewport - Viewport dimensions and device pixel ratio.
 * @property performanceMemory - Chrome-specific JS heap memory info.
 */
type RuntimeBrowserMetrics = {
  online?: boolean;
  cookieEnabled?: boolean;
  doNotTrack?: string | null;
  url?: string;
  referrer?: string;
  viewport?: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  performanceMemory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
};
/**
 * WebGPU adapter and device capability metrics.
 *
 * @property vendor - GPU vendor name.
 * @property architecture - GPU architecture identifier.
 * @property description - Human-readable GPU description.
 * @property maxBufferSize - Maximum buffer size in bytes.
 * @property maxStorageBufferBindingSize - Maximum storage buffer binding size.
 * @property maxComputeWorkgroupsPerDimension - Maximum workgroups per dispatch dimension.
 * @property maxComputeInvocationsPerWorkgroup - Maximum invocations in a single workgroup.
 * @property maxComputeWorkgroupSizeX - Maximum workgroup size in the X dimension.
 * @property maxComputeWorkgroupSizeY - Maximum workgroup size in the Y dimension.
 * @property maxComputeWorkgroupSizeZ - Maximum workgroup size in the Z dimension.
 */
type RuntimeGPUMetrics = {
  vendor: string;
  architecture: string;
  description: string;
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupsPerDimension: number;
  maxComputeInvocationsPerWorkgroup: number;
  maxComputeWorkgroupSizeX: number;
  maxComputeWorkgroupSizeY: number;
  maxComputeWorkgroupSizeZ: number;
};
/**
 * Combined runtime metrics covering device, browser, and GPU capabilities.
 */
type RuntimeMetrics = {
  device: RuntimeDeviceMetrics;
  browser: RuntimeBrowserMetrics;
  gpu?: RuntimeGPUMetrics;
};
/**
 * Collect comprehensive runtime metrics for the current environment.
 *
 * Automatically detects whether we are in a browser or Node.js context
 * and collects device, browser, and GPU metrics accordingly.
 *
 * @returns Combined runtime metrics.
 *
 * @example
 * ```ts
 * import { collectRuntimeMetrics } from '@websimbench/agentyx';
 *
 * const metrics = await collectRuntimeMetrics();
 * console.log(`Cores: ${metrics.device.hardwareConcurrency}`);
 * console.log(`GPU: ${metrics.gpu?.description}`);
 * ```
 */
declare const collectRuntimeMetrics: () => Promise<RuntimeMetrics>;

/**
 * @module types
 * Core type definitions for the Agentyx simulation engine.
 *
 * Defines the data structures used throughout the compilation, compute,
 * rendering, and tracking pipeline.
 */
/**
 * Configuration options for initialising a simulation.
 *
 * @property agents - Total number of agents to simulate (must be ≥ 1).
 * @property workers - Number of Web Workers to use when running the `WebWorkers` method.
 * @property width - Canvas / world width in pixels. Defaults to 600 if no canvas is provided.
 * @property height - Canvas / world height in pixels. Defaults to 600 if no canvas is provided.
 * @property seed - Optional seed for deterministic agent placement via a seeded PRNG.
 */
type SimulationOptions = {
  agents: number;
  workers?: number;
  width?: number;
  height?: number;
  seed?: number;
};
/**
 * Visual appearance settings for the simulation renderer.
 *
 * @property agentColor - Default hex colour for agents (e.g. `'#00FFFF'`).
 * @property backgroundColor - Canvas background hex colour.
 * @property agentSize - Radius (circle) or half-side-length (square) of each agent in pixels.
 * @property agentShape - Shape used to render each agent.
 * @property showTrails - Whether to render the trail map overlay.
 * @property trailOpacity - Opacity multiplier for the trail overlay (0–1).
 * @property trailColor - Hex colour used for trail rendering.
 * @property speciesColors - Per-species colour palette; cycles if fewer colours than species.
 * @property obstacleColor - Fill colour for obstacle rectangles.
 * @property obstacleBorderColor - Border colour for obstacle rectangles.
 * @property obstacleOpacity - Opacity of obstacle fills.
 */
type SimulationAppearance = {
  agentColor: string;
  backgroundColor: string;
  agentSize: number;
  agentShape: "circle" | "square";
  showTrails: boolean;
  trailOpacity?: number;
  trailColor: string;
  speciesColors?: string[];
  obstacleColor: string;
  obstacleBorderColor: string;
  obstacleOpacity: number;
};
/**
 * Dynamic key-value map of input values passed to the compute engine each frame.
 *
 * Built-in keys such as `width`, `height`, `agents`, `trailMap`, `randomValues`,
 * `obstacles`, and `obstacleCount` are populated automatically by the
 * {@link Simulation} class. User-defined inputs declared in DSL code are merged
 * from {@link Simulation.setInputs} and the per-frame `inputValues` argument.
 */
type InputValues = {
  [key: string]:
    | number
    | boolean
    | Agent[]
    | Float32Array
    | Uint32Array
    | Function
    | Obstacle[];
};
/**
 * Metadata for a user-defined input declared in DSL code via the `input` keyword.
 *
 * @property name - Input variable name (e.g. `'speed'`).
 * @property defaultValue - Default numeric value when the caller does not supply one.
 * @property min - Optional minimum value hint for UI sliders.
 * @property max - Optional maximum value hint for UI sliders.
 */
type InputDefinition = {
  name: string;
  defaultValue: number;
  min?: number;
  max?: number;
};
/**
 * Configuration for trail-map environment commands (`enableTrails`).
 *
 * @property depositAmountInput - Name of the input controlling deposit amount per agent.
 * @property decayFactorInput - Name of the input controlling per-frame decay factor.
 */
type TrailEnvironmentConfig = {
  depositAmountInput?: string;
  decayFactorInput?: string;
};
/**
 * Output of the DSL compilation pipeline, containing code for every
 * supported compute backend.
 *
 * @property requiredInputs - Names of inputs the compiled code expects at runtime.
 * @property definedInputs - Input definitions extracted from `input` declarations.
 * @property wgslCode - Compiled WGSL compute-shader source.
 * @property jsCode - Compiled JavaScript agent-function source.
 * @property WASMCode - Compiled WebAssembly Text (WAT) source.
 * @property trailEnvironmentConfig - Trail configuration if `enableTrails` was used.
 * @property speciesCount - Number of distinct species declared via the `species` command.
 * @property numRandomCalls - Total random values required per agent per frame.
 */
type CompilationResult = {
  requiredInputs: string[];
  definedInputs: InputDefinition[];
  wgslCode: string;
  jsCode: string;
  WASMCode: string;
  trailEnvironmentConfig?: TrailEnvironmentConfig;
  speciesCount?: number;
  numRandomCalls: number;
  errors?: {
    message: string;
    lineIndex: number;
  }[];
};
/**
 * A single agent entity with position, velocity, and species index.
 *
 * The six-field layout (`id`, `x`, `y`, `vx`, `vy`, `species`) is mirrored
 * in the GPU/WASM memory layout as six contiguous `f32` values.
 *
 * @property id - Unique agent identifier (0-based index).
 * @property x - Horizontal position in world-space pixels.
 * @property y - Vertical position in world-space pixels.
 * @property vx - Horizontal velocity component.
 * @property vy - Vertical velocity component.
 * @property species - Species index for multi-species simulations.
 */
type Agent = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
};
/**
 * An axis-aligned rectangular obstacle in world space.
 *
 * @property x - Left edge x-coordinate.
 * @property y - Top edge y-coordinate.
 * @property w - Width in pixels.
 * @property h - Height in pixels.
 */
type Obstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
};
/**
 * Compute backend method identifiers.
 *
 * - `'JavaScript'` — Single-threaded main-thread execution.
 * - `'WebWorkers'` — Multi-threaded execution via Web Workers.
 * - `'WebAssembly'` — Compiled WAT executed via WASM.
 * - `'WebGPU'` — GPU compute via WGSL shaders.
 * - `'WebGL'` — Reserved / legacy. Not currently implemented.
 */
type Method = "WebGL" | "WebAssembly" | "JavaScript" | "WebWorkers" | "WebGPU";
/**
 * Rendering strategy for simulation output.
 *
 * - `'cpu'` — 2D Canvas rendering on the main thread.
 * - `'gpu'` — WebGPU-based rendering via instanced draw calls.
 * - `'none'` — Headless; no rendering (useful for benchmarking).
 */
type RenderMode = "cpu" | "gpu" | "none";
/**
 * User-supplied code for the `'custom'` simulation source kind.
 *
 * Allows callers to bypass the DSL compiler entirely by providing
 * pre-written JavaScript, WGSL, and/or WAT code directly.
 *
 * @property js - JavaScript agent function as a string or callable.
 * @property wgsl - WGSL compute-shader source string.
 * @property wasmWat - WebAssembly Text (WAT) source string.
 * @property requiredInputs - Input names the custom code expects.
 * @property definedInputs - Input definitions with defaults and ranges.
 * @property speciesCount - Number of species if applicable.
 * @property numRandomCalls - Random values needed per agent per frame.
 */
type CustomCodeSource = {
  js?: string | ((agent: Agent, inputs: InputValues) => Agent);
  wgsl?: string;
  wasmWat?: string;
  requiredInputs?: string[];
  definedInputs?: InputDefinition[];
  speciesCount?: number;
  numRandomCalls?: number;
};
/**
 * Discriminated union describing the simulation source.
 *
 * - `kind: 'dsl'` — DSL source code compiled at construction time.
 * - `kind: 'custom'` — Pre-compiled code supplied by the caller.
 */
type SimulationSource =
  | {
      kind: "dsl";
      code: string;
    }
  | {
      kind: "custom";
      code: CustomCodeSource;
    };
/**
 * Options controlling what the {@link SimulationTracker} captures.
 *
 * @property enabled - Master toggle for all tracking.
 * @property captureFrameInputs - Whether to snapshot input values each frame.
 * @property captureAgentStates - Whether to clone agent positions each frame.
 * @property captureLogs - Whether to intercept and store logger output.
 * @property captureDeviceMetrics - Whether to collect runtime device/browser/GPU metrics.
 */
type TrackingOptions = {
  enabled: boolean;
  captureFrameInputs: boolean;
  captureAgentStates: boolean;
  captureLogs: boolean;
  captureDeviceMetrics: boolean;
};
/**
 * Constructor configuration for the {@link Simulation} class.
 *
 * @property canvas - Optional 2D canvas element for CPU rendering.
 * @property gpuCanvas - Optional dedicated canvas element for WebGPU rendering.
 *   If omitted, Agentyx reuses `canvas` for GPU output. Supplying a dedicated
 *   canvas is recommended when switching between `'cpu'` and `'gpu'` render
 *   modes at runtime.
 * @property options - Core simulation options (agent count, dimensions, etc.).
 * @property appearance - Visual appearance overrides.
 * @property source - Simulation source (DSL or custom code). Mutually exclusive with `agentScript`.
 * @property agentScript - Shorthand DSL code string. Equivalent to `{ source: { kind: 'dsl', code } }`.
 * @property tracking - Partial tracking options (merged with defaults).
 * @property metadata - Arbitrary metadata attached to tracking reports.
 */
type SimulationConstructor = {
  canvas?: HTMLCanvasElement | null;
  gpuCanvas?: HTMLCanvasElement | null;
  options: SimulationOptions;
  appearance?: Partial<SimulationAppearance>;
  source?: SimulationSource;
  agentScript?: string;
  tracking?: Partial<TrackingOptions>;
  metadata?: Record<string, unknown>;
};
/**
 * Result returned by {@link Simulation.runFrame} for a single simulation step.
 *
 * @property frameNumber - Zero-based frame index.
 * @property agents - Updated agent state array after the compute step.
 * @property skipped - `true` if the frame was dropped because the previous frame was still in progress.
 */
type SimulationFrameResult = {
  frameNumber: number;
  agents: Agent[];
  skipped: boolean;
};

/**
 * @module tracking
 * Simulation run tracking and telemetry.
 *
 * The {@link SimulationTracker} records per-frame agent states, input snapshots,
 * performance metrics, log entries, and errors throughout a simulation run. The
 * captured data is assembled into a {@link SimulationTrackingReport} that can be
 * exported as JSON for offline analysis and benchmarking.
 */

/**
 * A single log message captured from the {@link Logger} system.
 *
 * @property timestamp - Unix timestamp in milliseconds.
 * @property level - Severity level of the log entry.
 * @property context - Logger context name (e.g. `'Compiler'`, `'WebGPUCompute'`).
 * @property message - The fully formatted log message.
 */
type SimulationLogEntry = {
  timestamp: number;
  level: "verbose" | "info" | "warning" | "error";
  context: string;
  message: string;
};
/**
 * An error captured during a simulation frame.
 *
 * @property timestamp - Unix timestamp in milliseconds.
 * @property message - Error message string.
 * @property stack - Optional stack trace.
 */
type SimulationErrorEntry = {
  timestamp: number;
  message: string;
  stack?: string;
};
/**
 * Data recorded for a single simulation frame.
 *
 * @property frameNumber - Zero-based frame index.
 * @property timestamp - Unix timestamp when the frame was recorded.
 * @property method - Compute method used for this frame.
 * @property renderMode - Rendering strategy used for this frame.
 * @property agentPositions - Cloned agent snapshot (if agent state capture is enabled).
 * @property inputSnapshot - Serialisable copy of frame inputs (if input capture is enabled).
 * @property performance - Per-frame performance metrics.
 */
type SimulationFrameRecord = {
  frameNumber: number;
  timestamp: number;
  method: Method;
  renderMode: RenderMode;
  agentPositions?: Agent[];
  inputSnapshot?: Record<string, unknown>;
  performance?: FramePerformance;
};
/**
 * Aggregate statistics for a simulation run.
 *
 * @property frameCount - Total number of frames in the report.
 * @property durationMs - Wall-clock duration of the run in milliseconds.
 * @property totalExecutionMs - Sum of all frame execution times.
 * @property averageExecutionMs - Mean execution time per frame.
 * @property errorCount - Number of errors recorded during the run.
 */
type SimulationRunSummary = {
  frameCount: number;
  durationMs: number;
  totalExecutionMs: number;
  averageExecutionMs: number;
  errorCount: number;
};
/**
 * Metadata describing the simulation run configuration and environment.
 *
 * @property runId - Unique identifier for this run (UUID or fallback).
 * @property startedAt - Unix timestamp when the simulation was constructed.
 * @property endedAt - Unix timestamp when {@link SimulationTracker.complete} was called.
 * @property source - The simulation source kind and code.
 * @property configuration - Snapshot of the simulation options, appearance, and inputs.
 * @property environment - Runtime device, browser, and GPU metrics.
 * @property metadata - Arbitrary caller-supplied metadata.
 */
type SimulationRunMetadata = {
  runId: string;
  startedAt: number;
  endedAt?: number;
  source: {
    kind: SimulationSource["kind"];
    code:
      | string
      | {
          js?: string;
          wgsl?: string;
          wasmWat?: string;
        };
  };
  configuration: {
    options: SimulationOptions;
    appearance: SimulationAppearance;
    requiredInputs: string[];
    definedInputs: CompilationResult["definedInputs"];
  };
  environment?: RuntimeMetrics;
  metadata?: Record<string, unknown>;
};
/**
 * Complete tracking report for a simulation run, combining metadata,
 * frame records, logs, errors, and summary statistics.
 */
type SimulationTrackingReport = {
  run: SimulationRunMetadata;
  frames: SimulationFrameRecord[];
  logs: SimulationLogEntry[];
  errors: SimulationErrorEntry[];
  summary: SimulationRunSummary;
};
/**
 * Filter options for {@link SimulationTracker.getReport}.
 *
 * @property fromFrame - Minimum frame number (inclusive).
 * @property toFrame - Maximum frame number (inclusive).
 * @property includeAgentPositions - Set to `false` to strip agent snapshots.
 * @property includeInputSnapshots - Set to `false` to strip input snapshots.
 * @property includeLogs - Set to `false` to strip log entries.
 */
type SimulationTrackingFilter = {
  fromFrame?: number;
  toFrame?: number;
  includeAgentPositions?: boolean;
  includeInputSnapshots?: boolean;
  includeLogs?: boolean;
};
/**
 * Records telemetry data throughout a simulation run and produces
 * structured tracking reports.
 *
 * Created internally by the {@link Simulation} class. Listens to the
 * global {@link Logger} for log capture and collects runtime environment
 * metrics on construction.
 */
declare class SimulationTracker {
  private readonly options;
  private readonly logger;
  private readonly run;
  private readonly frames;
  private readonly logs;
  private readonly errors;
  private readonly logListener?;
  /**
   * Create a new tracker for a simulation run.
   *
   * @param params - Initial run configuration used to populate metadata.
   */
  constructor(params: {
    source: SimulationSource;
    options: SimulationOptions;
    appearance: SimulationAppearance;
    compilationResult: CompilationResult;
    tracking?: Partial<TrackingOptions>;
    metadata?: Record<string, unknown>;
  });
  /**
   * Asynchronously collect runtime device, browser, and GPU metrics.
   *
   * The results are stored in `run.environment` for inclusion in
   * tracking reports.
   */
  collectEnvironmentMetrics(): Promise<void>;
  /**
   * Record data for a completed simulation frame.
   *
   * @param params - Frame data including agents, inputs, and performance.
   */
  recordFrame(params: {
    frameNumber: number;
    method: Method;
    renderMode: RenderMode;
    agents: Agent[];
    performance?: FramePerformance;
    inputs?: InputValues;
  }): void;
  /**
   * Record an error that occurred during frame execution.
   *
   * @param error - The caught error or unknown thrown value.
   */
  recordError(error: unknown): void;
  /**
   * Mark the simulation run as complete by recording the end timestamp.
   */
  complete(): void;
  /**
   * Generate a deep-cloned tracking report, optionally filtered by
   * frame range and content inclusions.
   *
   * @param filter - Optional filter constraints.
   * @returns A self-contained tracking report.
   */
  getReport(filter?: SimulationTrackingFilter): SimulationTrackingReport;
  /**
   * Remove the global log listener registered by this tracker.
   *
   * Should be called during simulation teardown to prevent memory leaks.
   */
  dispose(): void;
  /**
   * Whether this tracker is configured to capture per-frame agent states.
   *
   * @returns `true` if tracking is enabled and agent state capture is on.
   */
  capturesAgentStates(): boolean;
}

/**
 * @module simulation
 * Core simulation orchestrator.
 *
 * The {@link Simulation} class ties together the compiler, compute engine,
 * renderer, and tracker into a single cohesive API for running agent-based
 * simulations in the browser.
 */

/** Maximum number of agents a single simulation instance may create. */
declare const MAX_AGENTS = 10000000;
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
declare class Simulation {
  private readonly logger;
  private readonly performanceMonitor;
  private readonly compiler;
  private readonly computeEngine;
  private readonly source;
  private readonly tracker;
  private renderer;
  private width;
  private height;
  private frameInProgress;
  private frameNumber;
  private frameInputs;
  private obstacles;
  private appearance;
  /** Current agent state array. Updated after each successful frame. */
  agents: Agent[];
  /** Compilation output from the DSL compiler or custom source. */
  compilationResult: CompilationResult | null;
  /** Trail intensity map (width × height `Float32Array`), or `null` if trails are not active. */
  trailMap: Float32Array | null;
  /** Pre-generated random values buffer for the current frame, or `null` if not needed. */
  randomValues: Float32Array | null;
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
  constructor(config: SimulationConstructor);
  /**
   * Generate the initial agent population with random or seeded positions.
   *
   * @param count - Number of agents to create.
   * @param speciesCount - Number of distinct species (for round-robin assignment).
   * @param seed - Optional PRNG seed for reproducible placement.
   * @returns Array of initialised agents.
   */
  private createInitialAgents;
  /**
   * Allocate or resize the trail-map buffer to match the given dimensions.
   *
   * @param width - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   */
  private ensureTrailMap;
  /**
   * Fill the random values buffer with fresh random numbers for this frame.
   *
   * @param requiredCalls - Number of random values needed per agent.
   */
  private populateRandomValues;
  /**
   * Resolve the current simulation dimensions from the renderer canvas
   * or the manually set width/height.
   *
   * @returns Current width and height.
   */
  private resolveDimensions;
  /**
   * Merge user-supplied frame inputs with system inputs (dimensions, agents,
   * trail map, random values, obstacles, and defined input defaults) to produce
   * the final input map for the compute engine.
   *
   * @param frameInputValues - Per-frame input overrides from the caller.
   * @returns Fully resolved input values map.
   * @throws {Error} If any required input is missing.
   */
  private buildInputs;
  /**
   * Initialise the WebGPU device and configure both the compute engine
   * and the renderer for GPU operation.
   *
   * Must be called before using `'WebGPU'` as a compute method or `'gpu'`
   * as a render mode.
   *
   * @throws {Error} If WebGPU is not available or the adapter cannot be obtained.
   */
  initGPU(): Promise<void>;
  /**
   * Update the visual appearance at runtime.
   *
   * Only the provided properties are changed; all others remain as-is.
   *
   * @param nextAppearance - Partial appearance overrides.
   */
  updateAppearance(nextAppearance: Partial<SimulationAppearance>): void;
  /**
   * Merge dynamic input values that persist across frames.
   *
   * Values set here are included in every subsequent `runFrame` call
   * unless overridden by the per-frame `inputValues` argument.
   *
   * @param nextInputs - Input key-value pairs to merge.
   */
  setInputs(nextInputs: InputValues): void;
  /**
   * Replace the obstacle list used for `avoidObstacles` commands.
   *
   * @param obstacles - Array of rectangular obstacles.
   */
  setObstacles(obstacles: Obstacle[]): void;
  /**
   * Manually set the simulation world dimensions when no canvas is attached.
   *
   * If a trail map exists and its size no longer matches the new dimensions,
   * it is reallocated.
   *
   * @param width - New width in pixels.
   * @param height - New height in pixels.
   */
  setCanvasDimensions(width: number, height: number): void;
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
  runFrame(
    method: Method,
    inputValues?: InputValues,
    renderMode?: RenderMode,
  ): Promise<SimulationFrameResult>;
  /**
   * Access the internal performance monitor for detailed frame-level metrics.
   *
   * @returns The shared {@link PerformanceMonitor} instance.
   */
  getPerformanceMonitor(): PerformanceMonitor;
  /**
   * Generate a structured tracking report covering the simulation run.
   *
   * @param filter - Optional filter to restrict the frame range and inclusions.
   * @returns A deep-cloned tracking report.
   */
  getTrackingReport(
    filter?: SimulationTrackingFilter,
  ): SimulationTrackingReport;
  /**
   * Export the tracking report as a formatted JSON string.
   *
   * @param filter - Optional filter to restrict the frame range and inclusions.
   * @returns Pretty-printed JSON string of the tracking report.
   */
  exportTrackingReport(filter?: SimulationTrackingFilter): string;
  /**
   * Tear down the simulation, releasing all resources.
   *
   * Completes the tracking session, disposes the log listener, destroys
   * the compute engine, and clears all buffers.
   */
  destroy(): void;
}

/**
 * @module compiler
 * DSL-to-multi-target compiler orchestrator.
 *
 * The {@link Compiler} class takes Agentyx DSL source code and produces
 * compiled output for all three supported compute backends (JavaScript,
 * WGSL, and WAT) in a single pass. It handles preprocessing (input
 * extraction, trail configuration, species detection) before delegating
 * to the individual backend compilers.
 */

/**
 * Compiles Agentyx DSL source code into JavaScript, WGSL, and WAT output.
 *
 * @example
 * ```ts
 * import { Compiler } from '@websimbench/agentyx';
 *
 * const compiler = new Compiler();
 * const result = compiler.compileAgentCode('moveForward 1\nborderWrapping');
 * console.log(result.jsCode);
 * ```
 */
declare class Compiler {
  private logger;
  constructor();
  /**
   * Compile DSL source code into a multi-target {@link CompilationResult}.
   *
   * Preprocesses the DSL to extract inputs, trail config, and species
   * declarations, then delegates to each backend compiler.
   *
   * @param agentCode - Raw Agentyx DSL source code.
   * @returns Compilation output with JS, WGSL, and WAT code.
   */
  compileAgentCode(agentCode?: string): CompilationResult;
  /**
   * Preprocess DSL source: parse lines, extract inputs, trail config,
   * species count, and random value requirements.
   *
   * @param dsl - Raw DSL source code.
   * @returns Preprocessed data for the compilation pipeline.
   */
  private preprocessDSL;
  /** Count `random()` call sites across all DSL lines. */
  private countInlineRandomCalls;
  /** Parse raw DSL source into structured lines, extracting input and random declarations. */
  private parseLines;
  /** Remove `//` and `#` comments from a source line. */
  private stripComments;
  /** Parse an `input name = value` declaration, returning metadata or `null`. */
  private parseInputDeclaration;
  /** Extract the numeric value and optional `[min, max]` range from a value part. */
  private parseValueWithRange;
  /** Split a line at `;` boundaries, expanding braceless `if` into block form. */
  private splitStatements;
  /** Collect all required input names from explicit references and command dependencies. */
  private extractInputs;
  /** Add implicit input dependencies required by DSL commands. */
  private addCommandDependencies;
  /** Extract trail environment configuration from `enableTrails` commands. */
  private extractTrailConfig;
  /** Extract the species count from a `species` command declaration. */
  private extractSpeciesCount;
  /** Ensure `randomValues` is listed as a required input when random is used. */
  private ensureRandomValuesDependency;
  /** Compile preprocessed DSL to all three backends (JS, WGSL, WAT). */
  private compileToAllTargets;
  /** Log all compiled output and extracted inputs to the console. */
  private logCompilationResults;
  /** Assemble the final {@link CompilationResult} from preprocessed and compiled data. */
  private buildCompilationResult;
}

/**
 * @module webGPU
 * WebGPU compute backend.
 *
 * Manages GPU buffer allocation, compute shader dispatch, optional agent
 * readback, and the GPU-side diffuse/decay trail-map pipeline. When the
 * render mode is `'gpu'`, agent data stays on the GPU and a vertex buffer
 * reference is returned for zero-copy rendering.
 */

/** GPU resources passed to the Renderer for zero-copy GPU rendering. */
type WebGPURenderResources = {
  device: GPUDevice;
  agentVertexBuffer: GPUBuffer;
  agentCount: number;
  agentStride: number;
  trailMapBuffer?: GPUBuffer;
};

/**
 * @module compute
 * Multi-backend compute engine orchestrator.
 *
 * The {@link ComputeEngine} lazily instantiates and delegates work to one of
 * four compute backends (main-thread JavaScript, WebWorkers, WebAssembly, or
 * WebGPU) depending on the requested {@link Method}. It also manages the
 * double-buffered trail map used for pheromone simulations.
 */

/**
 * Multi-backend compute engine.
 *
 * Lazily instantiates WebWorkers, WebAssembly, and WebGPU backends on first
 * use and routes each {@link runFrame} call to the requested backend,
 * collecting timing metrics through the injected {@link PerformanceMonitor}.
 */
declare class ComputeEngine {
  private readonly compilationResult;
  private agentFunction;
  private agentCount;
  private workerCount?;
  private readonly logger;
  private gpuDevice;
  private readonly PerformanceMonitor;
  gpuRenderState: WebGPURenderResources | undefined;
  private compileTimes;
  private trailMapRead;
  private trailMapWrite;
  private trailMapSeeded;
  constructor(
    compilationResult: CompilationResult,
    performanceMonitor: PerformanceMonitor,
    agentCount: number,
    workerCount?: number,
  );
  /**
   * Ensure double-buffer trail maps are allocated for the given dimensions.
   */
  private ensureTrailMapBuffers;
  /**
   * Apply diffuse and decay to trail map (blur + decay).
   */
  private applyDiffuseDecay;
  private syncTrailMapToExternal;
  private prepareFrameInputs;
  private finalizeTrailMap;
  private _WebWorkers;
  private get WebWorkersInstance();
  private _WebGPU;
  private _WebGPUInitPromise;
  private getWebGPUInstance;
  private _WebAssembly;
  private _WebAssemblyInitPromise;
  private getWebAssemblyInstance;
  /**
   * Provide a GPU device for the WebGPU backend.
   *
   * If the WebGPU instance already exists, initialises it immediately;
   * otherwise the device is stored for deferred initialisation.
   *
   * @param device - The WebGPU device obtained from the Renderer.
   */
  initGPU(device: GPUDevice): void;
  /**
   * Execute a single simulation frame on the specified compute backend.
   *
   * @param method - Compute backend to use.
   * @param agents - Current agent state array.
   * @param inputValues - Per-frame input values (width, height, trailMap, etc.).
   * @param renderMode - Determines whether GPU results are read back to CPU.
   * @returns Updated agent array after one step.
   */
  runFrame(
    method: Method,
    agents: Agent[],
    inputValues: InputValues,
    renderMode: RenderMode,
  ): Promise<Agent[]>;
  private runOnWASM;
  private runOnWebGPU;
  private runOnWebWorkers;
  private runOnMainThread;
  private logPerformance;
  /** Release all backend instances and buffers. */
  destroy(): void;
  /** Build the agent update function from compiled JavaScript source. */
  private buildAgentFunction;
}

/**
 * @module logger
 * Structured, colour-coded console logger with global listeners.
 *
 * The {@link Logger} class provides context-aware logging with configurable
 * verbosity via {@link LogLevel}. A global listener mechanism allows the
 * {@link SimulationTracker} to intercept all log output for inclusion in
 * tracking reports.
 */
/**
 * Log verbosity levels, ordered from most restrictive to most verbose.
 *
 * | Level     | Value | Description                                |
 * |-----------|-------|--------------------------------------------|
 * | `None`    | 0     | Suppress all output.                       |
 * | `Error`   | 1     | Errors only.                               |
 * | `Warning` | 2     | Errors and warnings.                       |
 * | `Info`    | 3     | Errors, warnings, and informational output.|
 * | `Verbose` | 4     | All output including debug-level messages. |
 */
declare enum LogLevel {
  None = 0,
  Error = 1,
  Warning = 2,
  Info = 3,
  Verbose = 4,
}
/** @internal Supported code languages for the {@link Logger.code} method. */
type Language = "js" | "wgsl" | "wasm" | "dsl";
/**
 * Structured, colour-coded console logger with global listener support.
 *
 * Each instance is bound to a named context (e.g. `'Compiler'`, `'WebGPU'`)
 * and a CSS colour for styled `console.log` output.
 *
 * @example
 * ```ts
 * import Logger, { LogLevel } from '@websimbench/agentyx';
 *
 * Logger.setGlobalLogLevel(LogLevel.Info);
 *
 * const log = new Logger('MyModule', 'purple');
 * log.info('Initialised');
 * log.error('Something went wrong');
 * ```
 */
declare class Logger {
  private context;
  private color;
  /** @internal Global listener registry for log interception. */
  private static listeners;
  /**
   * Create a new logger instance.
   *
   * @param context - Human-readable context name shown in log prefixes.
   * @param color - CSS colour string for styled console output.
   */
  constructor(context: string, color?: string);
  /**
   * Set the global minimum log level for all Logger instances.
   *
   * Messages below this level are silently discarded.
   *
   * @param level - The new minimum log level.
   */
  static setGlobalLogLevel(level: LogLevel): void;
  /**
   * Register a global listener that receives all log messages.
   *
   * @param listener - Callback invoked for each log message.
   */
  static addListener(
    listener: (
      level: LogLevel,
      context: string,
      message: string,
      args: unknown[],
    ) => void,
  ): void;
  /**
   * Remove a previously registered global listener.
   *
   * @param listener - The listener callback to remove.
   */
  static removeListener(
    listener: (
      level: LogLevel,
      context: string,
      message: string,
      args: unknown[],
    ) => void,
  ): void;
  /**
   * Emit a log message to all registered listeners.
   *
   * @param level - Log level of the message.
   * @param message - Primary message string.
   * @param args - Additional arguments (serialised into the message for listeners).
   * @internal
   */
  private emit;
  /**
   * Log a verbose/debug message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  log(message: string, ...args: unknown[]): void;
  /**
   * Log an informational message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  info(message: string, ...args: unknown[]): void;
  /**
   * Log a warning message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  warn(message: string, ...args: unknown[]): void;
  /**
   * Log an error message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  error(message: string, ...args: unknown[]): void;
  /**
   * Log an error with surrounding source-code context.
   *
   * Shows 2 lines above and below the error line with a `>` marker
   * pointing to the offending line.
   *
   * @param message - Error description.
   * @param code - Full source code string.
   * @param lineIndex - Zero-based line index where the error occurred.
   */
  codeError(message: string, code: string, lineIndex: number): void;
  /**
   * Pretty-print a code snippet to the console with syntax-appropriate formatting.
   *
   * JavaScript code is formatted with Prettier; WGSL and WAT use a simple
   * indentation-based formatter.
   *
   * @param label - Descriptive label for the code block.
   * @param code - The source code to format and display.
   * @param language - Language identifier for formatting.
   */
  code(label: string, code: string, language: Language): Promise<void>;
  /**
   * Format JavaScript code using Prettier.
   *
   * @param code - Raw JavaScript source.
   * @returns Formatted JavaScript source.
   * @internal
   */
  private formatJS;
  /**
   * Apply simple indentation-based formatting to WGSL/WAT code.
   *
   * Adjusts indentation based on brace/bracket nesting.
   *
   * @param code - Raw WGSL or WAT source.
   * @returns Re-indented source.
   * @internal
   */
  private formatGeneralCode;
}

export {
  type Agent,
  Simulation as AgentyxSimulation,
  type CompilationResult,
  Compiler,
  ComputeEngine,
  type CustomCodeSource,
  type InputDefinition,
  type InputValues,
  LogLevel,
  Logger,
  MAX_AGENTS,
  type Method,
  type Obstacle,
  PerformanceMonitor,
  type RenderMode,
  type RuntimeBrowserMetrics,
  type RuntimeDeviceMetrics,
  type RuntimeGPUMetrics,
  type RuntimeMetrics,
  Simulation,
  type SimulationAppearance,
  type SimulationConstructor,
  type SimulationErrorEntry,
  type SimulationFrameRecord,
  type SimulationFrameResult,
  type SimulationLogEntry,
  type SimulationOptions,
  type SimulationRunMetadata,
  type SimulationRunSummary,
  type SimulationSource,
  SimulationTracker,
  type SimulationTrackingFilter,
  type SimulationTrackingReport,
  type TrackingOptions,
  collectRuntimeMetrics,
  Simulation as default,
};
