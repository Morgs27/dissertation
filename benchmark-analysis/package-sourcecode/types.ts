/**
 * @module types
 * Core type definitions for the Agentyx simulation engine.
 *
 * Defines the data structures used throughout the compilation, compute,
 * rendering, and tracking pipeline.
 */

/**
 * WebAssembly execution mode.
 *
 * - `'auto'` — Use SIMD mode when available, otherwise scalar mode.
 * - `'scalar'` — Force scalar-only WASM execution.
 * - `'simd'` — Require SIMD-enabled WASM execution.
 */
export type WasmExecutionMode = "auto" | "scalar" | "simd";

/**
 * Configuration options for initialising a simulation.
 *
 * @property agents - Total number of agents to simulate (must be ≥ 1).
 * @property workers - Number of Web Workers to use when running the `WebWorkers` method.
 * @property width - Canvas / world width in pixels. Defaults to 600 if no canvas is provided.
 * @property height - Canvas / world height in pixels. Defaults to 600 if no canvas is provided.
 * @property seed - Optional seed for deterministic agent placement via a seeded PRNG.
 * @property wasmExecutionMode - Controls scalar vs SIMD execution for the WebAssembly backend.
 */
export type SimulationOptions = {
  agents: number;
  workers?: number;
  width?: number;
  height?: number;
  seed?: number;
  wasmExecutionMode?: WasmExecutionMode;
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
export type SimulationAppearance = {
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
export type InputValues = {
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
export type InputDefinition = {
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
export type TrailEnvironmentConfig = {
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
export type CompilationResult = {
  requiredInputs: string[];
  definedInputs: InputDefinition[];
  wgslCode: string;
  jsCode: string;
  WASMCode: string;
  trailEnvironmentConfig?: TrailEnvironmentConfig;
  speciesCount?: number;
  numRandomCalls: number;
  errors?: { message: string; lineIndex: number }[];
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
export type Agent = {
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
export type Obstacle = {
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
export type Method =
  | "WebGL"
  | "WebAssembly"
  | "JavaScript"
  | "WebWorkers"
  | "WebGPU";

/**
 * Rendering strategy for simulation output.
 *
 * - `'cpu'` — 2D Canvas rendering on the main thread.
 * - `'gpu'` — WebGPU-based rendering via instanced draw calls.
 * - `'none'` — Headless; no rendering (useful for benchmarking).
 */
export type RenderMode = "cpu" | "gpu" | "none";

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
export type CustomCodeSource = {
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
export type SimulationSource =
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
 * @property captureRawArrays - Whether to preserve full typed arrays (trailMap, randomValues) in input snapshots instead of replacing them with `{type, length}` descriptors.
 * @property captureRuntimeSamples - Whether to collect periodic runtime samples during execution.
 * @property captureJsHeapSamples - Whether to include JS heap snapshots in runtime samples when supported.
 * @property captureBatteryStatus - Whether to sample `navigator.getBattery()` state when available.
 * @property captureThermalCanary - Whether to include event-loop drift samples as a thermal/load proxy.
 * @property runtimeSampleIntervalMs - Interval (ms) for periodic runtime sampling.
 */
export type TrackingOptions = {
  enabled: boolean;
  captureFrameInputs: boolean;
  captureAgentStates: boolean;
  captureLogs: boolean;
  captureDeviceMetrics: boolean;
  captureRawArrays: boolean;
  captureRuntimeSamples: boolean;
  captureJsHeapSamples: boolean;
  captureBatteryStatus: boolean;
  captureThermalCanary: boolean;
  runtimeSampleIntervalMs: number;
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
export type SimulationConstructor = {
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
export type SimulationFrameResult = {
  frameNumber: number;
  agents: Agent[];
  skipped: boolean;
};
