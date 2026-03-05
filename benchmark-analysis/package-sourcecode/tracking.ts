/**
 * @module tracking
 * Simulation run tracking and telemetry.
 *
 * The {@link SimulationTracker} records per-frame agent states, input snapshots,
 * performance metrics, log entries, and errors throughout a simulation run. The
 * captured data is assembled into a {@link SimulationTrackingReport} that can be
 * exported as JSON for offline analysis and benchmarking.
 */

import type { FramePerformance } from "./performance";
import {
  collectRuntimeMetrics,
  type RuntimeMetrics,
} from "./helpers/deviceInfo";
import Logger, { LogLevel } from "./helpers/logger";
import type {
  Agent,
  CompilationResult,
  InputValues,
  Method,
  RenderMode,
  SimulationOptions,
  SimulationSource,
  TrackingOptions,
} from "./types";

/**
 * A single log message captured from the {@link Logger} system.
 *
 * @property timestamp - Unix timestamp in milliseconds.
 * @property level - Severity level of the log entry.
 * @property context - Logger context name (e.g. `'Compiler'`, `'WebGPUCompute'`).
 * @property message - The fully formatted log message.
 */
export type SimulationLogEntry = {
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
export type SimulationErrorEntry = {
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
export type SimulationFrameRecord = {
  frameNumber: number;
  timestamp: number;
  method: Method;
  renderMode: RenderMode;
  inputKeyCount: number;
  agentPositions?: Agent[];
  inputSnapshot?: Record<string, unknown>;
  performance?: FramePerformance;
};

/**
 * Per-method aggregate timing breakdown.
 *
 * @property method - Compute method name.
 * @property frameCount - Number of frames executed with this method.
 * @property avgSetupTime - Mean setup/buffer time (ms).
 * @property avgComputeTime - Mean compute kernel time (ms).
 * @property avgRenderTime - Mean render time (ms).
 * @property avgReadbackTime - Mean GPU/WASM readback time (ms).
 * @property avgTotalTime - Mean total frame time (ms).
 */
export type MethodSummary = {
  method: string;
  frameCount: number;
  avgSetupTime: number;
  avgComputeTime: number;
  avgRenderTime: number;
  avgReadbackTime: number;
  avgTotalTime: number;
  avgCompileTime: number;
  compileEvents: number;
};

/**
 * Per-method and per-render-mode aggregate timing breakdown.
 */
export type MethodRenderSummary = {
  method: string;
  renderMode: RenderMode;
  frameCount: number;
  avgSetupTime: number;
  avgComputeTime: number;
  avgRenderTime: number;
  avgReadbackTime: number;
  avgTotalTime: number;
  avgHostToGpuBridgeTime: number;
  avgGpuToHostBridgeTime: number;
  avgMethodMemoryFootprintBytes: number;
};

/**
 * Distribution statistics for numeric measurements.
 */
export type NumericDistributionStats = {
  min: number;
  max: number;
  average: number;
  stdDev: number;
  p50: number;
  p95: number;
  p99: number;
};

/**
 * Input key-count statistics aggregated across frames.
 */
export type InputKeyStats = {
  requiredInputCount: number;
  definedInputCount: number;
  minKeysPerFrame: number;
  maxKeysPerFrame: number;
  averageKeysPerFrame: number;
};

/**
 * Agent count statistics aggregated across frames.
 */
export type AgentCountStats = {
  minAgentsPerFrame: number;
  maxAgentsPerFrame: number;
  averageAgentsPerFrame: number;
};

/**
 * Summary of runtime JS heap sampling.
 */
export type JsHeapSummary = {
  sampleCount: number;
  startBytes: number;
  endBytes: number;
  deltaBytes: number;
  minBytes: number;
  maxBytes: number;
  averageBytes: number;
};

/**
 * Summary of runtime battery sampling.
 */
export type BatterySummary = {
  supported: boolean;
  sampleCount: number;
  startLevel?: number;
  endLevel?: number;
  deltaLevel?: number;
  startCharging?: boolean;
  endCharging?: boolean;
};

/**
 * Event-loop drift summary used as a thermal/load canary.
 */
export type ThermalCanarySummary = {
  sampleCount: number;
  sampleIntervalMs: number;
  avgDriftMs: number;
  p95DriftMs: number;
  maxDriftMs: number;
  throttlingEvents: number;
  throttlingEventThresholdMs: number;
};

/**
 * Aggregated runtime sampling summaries.
 */
export type RuntimeSamplingSummary = {
  jsHeap?: JsHeapSummary;
  battery?: BatterySummary;
  thermalCanary?: ThermalCanarySummary;
};

/**
 * A single periodic runtime sample.
 */
export type RuntimeSampleRecord = {
  timestamp: number;
  elapsedMs: number;
  frameNumber: number;
  jsHeap?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
  battery?: {
    supported: boolean;
    level?: number;
    charging?: boolean;
    chargingTime?: number;
    dischargingTime?: number;
  };
  thermalCanary?: {
    intervalMs: number;
    expectedTimestampMs: number;
    actualTimestampMs: number;
    driftMs: number;
  };
};

/**
 * Aggregate statistics for a simulation run.
 *
 * @property frameCount - Total number of frames in the report.
 * @property durationMs - Wall-clock duration of the run in milliseconds.
 * @property totalExecutionMs - Sum of all frame execution times.
 * @property averageExecutionMs - Mean execution time per frame.
 * @property errorCount - Number of errors recorded during the run.
 * @property methodSummaries - Per-method timing breakdowns.
 */
export type SimulationRunSummary = {
  frameCount: number;
  durationMs: number;
  totalExecutionMs: number;
  averageExecutionMs: number;
  errorCount: number;
  methodSummaries: MethodSummary[];
  methodRenderSummaries: MethodRenderSummary[];
  frameTimeStats: NumericDistributionStats;
  inputStats: InputKeyStats;
  agentStats: AgentCountStats;
  runtimeSampling?: RuntimeSamplingSummary;
};

/**
 * Metadata describing the simulation run configuration and environment.
 *
 * @property runId - Unique identifier for this run (UUID or fallback).
 * @property startedAt - Unix timestamp when the simulation was constructed.
 * @property endedAt - Unix timestamp when {@link SimulationTracker.complete} was called.
 * @property source - The simulation source kind and code.
 * @property configuration - Snapshot of the simulation options and inputs.
 * @property metadata - Arbitrary caller-supplied metadata.
 */
export type SimulationRunMetadata = {
  runId: string;
  startedAt: number;
  endedAt?: number;
  source: {
    kind: SimulationSource["kind"];
    code: string | { js?: string; wgsl?: string; wasmWat?: string };
  };
  configuration: {
    options: SimulationOptions;
    requiredInputs: string[];
    definedInputs: CompilationResult["definedInputs"];
    wasmCodeFeatures?: {
      simdInstructionsPresent: boolean;
      threadsInstructionsPresent: boolean;
    };
  };
  metadata?: Record<string, unknown>;
};

/**
 * Complete tracking report for a simulation run, combining metadata,
 * frame records, logs, errors, environment, and summary statistics.
 *
 * Environment is at the top level since it describes the session, not a
 * per-method property.
 */
export type SimulationTrackingReport = {
  run: SimulationRunMetadata;
  environment?: RuntimeMetrics;
  runtimeSamples: RuntimeSampleRecord[];
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
export type SimulationTrackingFilter = {
  fromFrame?: number;
  toFrame?: number;
  includeAgentPositions?: boolean;
  includeInputSnapshots?: boolean;
  includeLogs?: boolean;
};

/** @internal Default tracking options applied when no overrides are provided. */
const DEFAULT_TRACKING_OPTIONS: TrackingOptions = {
  enabled: true,
  captureFrameInputs: false,
  captureAgentStates: true,
  captureLogs: true,
  captureDeviceMetrics: true,
  captureRawArrays: false,
  captureRuntimeSamples: false,
  captureJsHeapSamples: true,
  captureBatteryStatus: false,
  captureThermalCanary: false,
  runtimeSampleIntervalMs: 1000,
};

/** @internal Minimum allowed runtime sample interval. */
const MIN_RUNTIME_SAMPLE_INTERVAL_MS = 100;
/** @internal Maximum allowed runtime sample interval. */
const MAX_RUNTIME_SAMPLE_INTERVAL_MS = 60_000;
/** @internal Canary drift threshold used to count potential throttling events. */
const DEFAULT_THROTTLING_THRESHOLD_MS = 120;

/**
 * Map the internal {@link LogLevel} enum to a human-readable severity string.
 *
 * @param level - Internal log level.
 * @returns Corresponding severity label.
 * @internal
 */
const mapLogLevel = (level: LogLevel): SimulationLogEntry["level"] => {
  if (level === LogLevel.Error) return "error";
  if (level === LogLevel.Warning) return "warning";
  if (level === LogLevel.Info) return "info";
  return "verbose";
};

/**
 * Generate a unique run identifier.
 *
 * Uses `crypto.randomUUID()` where available, falling back to a
 * timestamp-based identifier.
 *
 * @returns A unique run ID string.
 * @internal
 */
const generateRunId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

/**
 * Create a shallow clone of an agent array.
 *
 * @param agents - Source agent array.
 * @returns New array with spread-cloned agents.
 * @internal
 */
const cloneAgents = (agents: Agent[]): Agent[] => {
  return agents.map((agent) => ({ ...agent }));
};

/**
 * Recursively sanitise an input value for safe JSON serialisation.
 *
 * Typed arrays are replaced with `{ type, length }` descriptors by default;
 * when `keepArrays` is true they are converted to regular number arrays.
 * Functions are always replaced with `'[Function]'`.
 *
 * @param value - The raw input value.
 * @param keepArrays - Preserve full typed array contents.
 * @returns A JSON-safe representation.
 * @internal
 */
const sanitizeInputValue = (value: unknown, keepArrays = false): unknown => {
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [];

    if (typeof value[0] === "object") {
      return value.map((item) => {
        if (!item || typeof item !== "object") {
          return item;
        }

        const result: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(
          item as Record<string, unknown>,
        )) {
          if (
            typeof nested === "number" ||
            typeof nested === "string" ||
            typeof nested === "boolean" ||
            nested == null
          ) {
            result[key] = nested;
          }
        }

        return result;
      });
    }

    return value;
  }

  if (value instanceof Float32Array || value instanceof Uint32Array) {
    if (keepArrays) {
      return Array.from(value);
    }
    return {
      type: value.constructor.name,
      length: value.length,
    };
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      result[key] = sanitizeInputValue(nested, keepArrays);
    }
    return result;
  }

  return String(value);
};

const sanitizeInputSnapshotEntry = (
  key: string,
  value: unknown,
  keepArrays: boolean,
): unknown => {
  // Avoid blowing up benchmark reports with full per-frame agent snapshots.
  if (key === "agents" && Array.isArray(value) && !keepArrays) {
    return {
      type: "AgentArray",
      length: value.length,
    };
  }

  return sanitizeInputValue(value, keepArrays);
};

const detectWasmCodeFeatures = (
  compilationResult: CompilationResult,
): {
  simdInstructionsPresent: boolean;
  threadsInstructionsPresent: boolean;
} => {
  const wat = compilationResult.WASMCode ?? "";
  const simdInstructionsPresent = /\bv128\b|\bi(8|16|32|64)x(8|16|4|2)\b/.test(
    wat,
  );
  const threadsInstructionsPresent =
    /\batomic\./.test(wat) || /\bmemory\.atomic\./.test(wat);

  return {
    simdInstructionsPresent,
    threadsInstructionsPresent,
  };
};

const clampSampleInterval = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_TRACKING_OPTIONS.runtimeSampleIntervalMs;
  }

  return Math.min(
    MAX_RUNTIME_SAMPLE_INTERVAL_MS,
    Math.max(MIN_RUNTIME_SAMPLE_INTERVAL_MS, Math.round(value)),
  );
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);

  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const distribution = (values: number[]): NumericDistributionStats => {
  if (values.length === 0) {
    return {
      min: 0,
      max: 0,
      average: 0,
      stdDev: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    values.length;

  return {
    min,
    max,
    average,
    stdDev: Math.sqrt(variance),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  };
};

type BatteryManagerLike = {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
};

/**
 * Records telemetry data throughout a simulation run and produces
 * structured tracking reports.
 *
 * Created internally by the {@link Simulation} class. Listens to the
 * global {@link Logger} for log capture and collects runtime environment
 * metrics on construction.
 */
export class SimulationTracker {
  private readonly options: TrackingOptions;
  private readonly logger = new Logger("SimulationTracker", "teal");
  private readonly run: SimulationRunMetadata;
  private readonly frames: SimulationFrameRecord[] = [];
  private readonly logs: SimulationLogEntry[] = [];
  private readonly errors: SimulationErrorEntry[] = [];
  private readonly runtimeSamples: RuntimeSampleRecord[] = [];
  private environment?: RuntimeMetrics;
  private environmentMetricsPromise?: Promise<void>;
  private latestFrameNumber = -1;
  private runtimeSampleIntervalMs: number;
  private finalized = false;
  private runtimeSampler?: ReturnType<typeof setInterval>;
  private canaryExpectedTimestampMs?: number;
  private batteryManagerPromise?: Promise<BatteryManagerLike | null>;
  private readonly logListener?: (
    level: LogLevel,
    context: string,
    message: string,
    args: unknown[],
  ) => void;

  /**
   * Create a new tracker for a simulation run.
   *
   * @param params - Initial run configuration used to populate metadata.
   */
  constructor(params: {
    source: SimulationSource;
    options: SimulationOptions;
    compilationResult: CompilationResult;
    tracking?: Partial<TrackingOptions>;
    metadata?: Record<string, unknown>;
  }) {
    this.options = { ...DEFAULT_TRACKING_OPTIONS, ...(params.tracking ?? {}) };
    this.runtimeSampleIntervalMs = clampSampleInterval(
      this.options.runtimeSampleIntervalMs,
    );

    this.run = {
      runId: generateRunId(),
      startedAt: Date.now(),
      source: {
        kind: params.source.kind,
        code:
          params.source.kind === "dsl"
            ? params.source.code
            : {
                js:
                  typeof params.source.code.js === "function"
                    ? params.source.code.js.toString()
                    : params.source.code.js,
                wgsl: params.source.code.wgsl,
                wasmWat: params.source.code.wasmWat,
              },
      },
      configuration: {
        options: { ...params.options },
        requiredInputs: [...params.compilationResult.requiredInputs],
        definedInputs: params.compilationResult.definedInputs.map((def) => ({
          ...def,
        })),
        wasmCodeFeatures: detectWasmCodeFeatures(params.compilationResult),
      },
      metadata: params.metadata,
    };

    if (this.options.captureLogs) {
      this.logListener = (level, context, message) => {
        if (!this.options.enabled) return;

        this.logs.push({
          timestamp: Date.now(),
          level: mapLogLevel(level),
          context,
          message,
        });
      };

      Logger.addListener(this.logListener);
    }

    this.startRuntimeSampling();
  }

  /**
   * Asynchronously collect runtime device, browser, and GPU metrics.
   *
   * The results are stored for inclusion in tracking reports.
   */
  public async collectEnvironmentMetrics(): Promise<void> {
    if (!this.options.enabled || !this.options.captureDeviceMetrics) {
      return;
    }

    if (!this.environmentMetricsPromise) {
      this.environmentMetricsPromise = (async () => {
        try {
          this.environment = await collectRuntimeMetrics();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to collect runtime metrics: ${message}`);
        }
      })();
    }

    await this.environmentMetricsPromise;
  }

  private startRuntimeSampling(): void {
    if (!this.options.enabled || !this.options.captureRuntimeSamples) {
      return;
    }

    if (this.runtimeSampler) {
      clearInterval(this.runtimeSampler);
    }

    this.canaryExpectedTimestampMs =
      performance.now() + this.runtimeSampleIntervalMs;

    this.runtimeSampler = setInterval(() => {
      void this.captureRuntimeSample();
    }, this.runtimeSampleIntervalMs);

    void this.captureRuntimeSample();
  }

  private stopRuntimeSampling(): void {
    if (this.runtimeSampler) {
      clearInterval(this.runtimeSampler);
      this.runtimeSampler = undefined;
    }
  }

  private getBatteryManager(): Promise<BatteryManagerLike | null> {
    if (this.batteryManagerPromise) {
      return this.batteryManagerPromise;
    }

    this.batteryManagerPromise = (async () => {
      if (typeof navigator === "undefined") return null;

      const nav = navigator as Navigator & {
        getBattery?: () => Promise<BatteryManagerLike>;
      };

      if (typeof nav.getBattery !== "function") {
        return null;
      }

      try {
        return await nav.getBattery();
      } catch {
        return null;
      }
    })();

    return this.batteryManagerPromise;
  }

  private async captureRuntimeSample(): Promise<void> {
    if (!this.options.enabled || !this.options.captureRuntimeSamples) {
      return;
    }

    const nowDate = Date.now();
    const sample: RuntimeSampleRecord = {
      timestamp: nowDate,
      elapsedMs: Math.max(0, nowDate - this.run.startedAt),
      frameNumber: this.latestFrameNumber,
    };

    if (
      this.options.captureJsHeapSamples &&
      typeof performance !== "undefined"
    ) {
      const perf = performance as Performance & {
        memory?: {
          jsHeapSizeLimit: number;
          totalJSHeapSize: number;
          usedJSHeapSize: number;
        };
      };
      if (perf.memory) {
        sample.jsHeap = {
          jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
          totalJSHeapSize: perf.memory.totalJSHeapSize,
          usedJSHeapSize: perf.memory.usedJSHeapSize,
        };
      }
    }

    if (this.options.captureBatteryStatus) {
      const batteryManager = await this.getBatteryManager();
      sample.battery = batteryManager
        ? {
            supported: true,
            level: batteryManager.level,
            charging: batteryManager.charging,
            chargingTime: batteryManager.chargingTime,
            dischargingTime: batteryManager.dischargingTime,
          }
        : { supported: false };
    }

    if (this.options.captureThermalCanary) {
      const actualTimestampMs = performance.now();
      const expectedTimestampMs =
        this.canaryExpectedTimestampMs ??
        actualTimestampMs + this.runtimeSampleIntervalMs;
      const driftMs = actualTimestampMs - expectedTimestampMs;

      sample.thermalCanary = {
        intervalMs: this.runtimeSampleIntervalMs,
        expectedTimestampMs,
        actualTimestampMs,
        driftMs,
      };

      this.canaryExpectedTimestampMs =
        expectedTimestampMs + this.runtimeSampleIntervalMs;
    }

    this.runtimeSamples.push(sample);
  }

  /**
   * Record data for a completed simulation frame.
   *
   * @param params - Frame data including agents, inputs, and performance.
   */
  public recordFrame(params: {
    frameNumber: number;
    method: Method;
    renderMode: RenderMode;
    agents: Agent[];
    performance?: FramePerformance;
    inputs?: InputValues;
  }): void {
    if (!this.options.enabled) {
      return;
    }

    this.latestFrameNumber = params.frameNumber;

    this.frames.push({
      frameNumber: params.frameNumber,
      timestamp: Date.now(),
      method: params.method,
      renderMode: params.renderMode,
      inputKeyCount: Object.keys(params.inputs ?? {}).length,
      agentPositions: this.options.captureAgentStates
        ? cloneAgents(params.agents)
        : undefined,
      inputSnapshot: this.options.captureFrameInputs
        ? Object.fromEntries(
            Object.entries(params.inputs ?? {}).map(([key, value]) => [
              key,
              sanitizeInputSnapshotEntry(
                key,
                value,
                this.options.captureRawArrays,
              ),
            ]),
          )
        : undefined,
      performance: params.performance ? { ...params.performance } : undefined,
    });
  }

  /**
   * Record an error that occurred during frame execution.
   *
   * @param error - The caught error or unknown thrown value.
   */
  public recordError(error: unknown): void {
    if (!this.options.enabled) {
      return;
    }

    if (error instanceof Error) {
      this.errors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack,
      });
      return;
    }

    this.errors.push({
      timestamp: Date.now(),
      message: String(error),
    });
  }

  /**
   * Mark the simulation run as complete by recording the end timestamp.
   */
  public complete(): void {
    void this.finalize();
  }

  /**
   * Finalize tracking state and await pending async metric collection.
   *
   * This is useful for benchmark orchestration code that needs a stable
   * report snapshot (ended timestamp + final runtime sample + environment).
   */
  public async finalize(): Promise<void> {
    if (!this.options.enabled) {
      return;
    }

    if (this.finalized) {
      return;
    }

    this.finalized = true;
    this.stopRuntimeSampling();
    this.run.endedAt = Date.now();

    if (this.options.captureRuntimeSamples) {
      await this.captureRuntimeSample();
    }

    if (this.environmentMetricsPromise) {
      await this.environmentMetricsPromise;
    }
  }

  /**
   * Generate a deep-cloned tracking report, optionally filtered by
   * frame range and content inclusions.
   *
   * @param filter - Optional filter constraints.
   * @returns A self-contained tracking report.
   */
  public getReport(
    filter?: SimulationTrackingFilter,
  ): SimulationTrackingReport {
    const fromFrame = filter?.fromFrame;
    const toFrame = filter?.toFrame;

    const filteredFrames = this.frames.filter((frame) => {
      if (typeof fromFrame === "number" && frame.frameNumber < fromFrame) {
        return false;
      }
      if (typeof toFrame === "number" && frame.frameNumber > toFrame) {
        return false;
      }
      return true;
    });

    const filteredRuntimeSamples = this.runtimeSamples.filter((sample) => {
      if (
        typeof fromFrame === "number" &&
        sample.frameNumber >= 0 &&
        sample.frameNumber < fromFrame
      ) {
        return false;
      }
      if (
        typeof toFrame === "number" &&
        sample.frameNumber >= 0 &&
        sample.frameNumber > toFrame
      ) {
        return false;
      }
      return true;
    });

    const frameView = filteredFrames.map((frame) => ({
      ...frame,
      agentPositions:
        filter?.includeAgentPositions === false
          ? undefined
          : frame.agentPositions?.map((agent) => ({ ...agent })),
      inputSnapshot:
        filter?.includeInputSnapshots === false
          ? undefined
          : frame.inputSnapshot
            ? { ...frame.inputSnapshot }
            : undefined,
      performance: frame.performance ? { ...frame.performance } : undefined,
    }));

    const endedAt = this.run.endedAt ?? Date.now();

    const totalExecutionMs = filteredFrames.reduce(
      (total, frame) => total + (frame.performance?.totalExecutionTime ?? 0),
      0,
    );

    const inputCounts = filteredFrames.map((frame) => frame.inputKeyCount ?? 0);
    const inputTotal = inputCounts.reduce((total, count) => total + count, 0);
    const inputStats: InputKeyStats = {
      requiredInputCount: this.run.configuration.requiredInputs.length,
      definedInputCount: this.run.configuration.definedInputs.length,
      minKeysPerFrame: inputCounts.length > 0 ? Math.min(...inputCounts) : 0,
      maxKeysPerFrame: inputCounts.length > 0 ? Math.max(...inputCounts) : 0,
      averageKeysPerFrame:
        inputCounts.length > 0 ? inputTotal / inputCounts.length : 0,
    };

    const agentCounts = filteredFrames.map(
      (frame) =>
        frame.performance?.agentCount ?? frame.agentPositions?.length ?? 0,
    );
    const agentTotal = agentCounts.reduce((total, count) => total + count, 0);
    const agentStats: AgentCountStats = {
      minAgentsPerFrame: agentCounts.length > 0 ? Math.min(...agentCounts) : 0,
      maxAgentsPerFrame: agentCounts.length > 0 ? Math.max(...agentCounts) : 0,
      averageAgentsPerFrame:
        agentCounts.length > 0 ? agentTotal / agentCounts.length : 0,
    };

    // Build per-method summaries
    const methodGroups = new Map<
      string,
      {
        setup: number;
        compute: number;
        render: number;
        readback: number;
        total: number;
        compile: number;
        compileEvents: number;
        count: number;
      }
    >();
    const methodRenderGroups = new Map<
      string,
      {
        method: Method;
        renderMode: RenderMode;
        setup: number;
        compute: number;
        render: number;
        readback: number;
        total: number;
        hostToGpu: number;
        gpuToHost: number;
        memory: number;
        memoryCount: number;
        count: number;
      }
    >();

    for (const frame of filteredFrames) {
      const perf = frame.performance;
      if (!perf) continue;
      let group = methodGroups.get(frame.method);
      if (!group) {
        group = {
          setup: 0,
          compute: 0,
          render: 0,
          readback: 0,
          total: 0,
          compile: 0,
          compileEvents: 0,
          count: 0,
        };
        methodGroups.set(frame.method, group);
      }
      group.setup += perf.setupTime ?? 0;
      group.compute += perf.computeTime ?? 0;
      group.render += perf.renderTime ?? 0;
      group.readback += perf.readbackTime ?? 0;
      group.total += perf.totalExecutionTime;
      if (typeof perf.compileTime === "number") {
        group.compile += perf.compileTime;
        group.compileEvents += 1;
      }
      group.count += 1;

      const renderGroupKey = `${frame.method}::${frame.renderMode}`;
      let renderGroup = methodRenderGroups.get(renderGroupKey);
      if (!renderGroup) {
        renderGroup = {
          method: frame.method,
          renderMode: frame.renderMode,
          setup: 0,
          compute: 0,
          render: 0,
          readback: 0,
          total: 0,
          hostToGpu: 0,
          gpuToHost: 0,
          memory: 0,
          memoryCount: 0,
          count: 0,
        };
        methodRenderGroups.set(renderGroupKey, renderGroup);
      }
      renderGroup.setup += perf.setupTime ?? 0;
      renderGroup.compute += perf.computeTime ?? 0;
      renderGroup.render += perf.renderTime ?? 0;
      renderGroup.readback += perf.readbackTime ?? 0;
      renderGroup.total += perf.totalExecutionTime;
      renderGroup.hostToGpu += perf.bridgeTimings?.hostToGpuTime ?? 0;
      renderGroup.gpuToHost += perf.bridgeTimings?.gpuToHostTime ?? 0;

      if (typeof perf.memoryStats?.methodMemoryFootprintBytes === "number") {
        renderGroup.memory += perf.memoryStats.methodMemoryFootprintBytes;
        renderGroup.memoryCount += 1;
      }
      renderGroup.count += 1;
    }

    const methodSummaries: MethodSummary[] = [];
    for (const [method, g] of methodGroups) {
      methodSummaries.push({
        method,
        frameCount: g.count,
        avgSetupTime: g.count > 0 ? g.setup / g.count : 0,
        avgComputeTime: g.count > 0 ? g.compute / g.count : 0,
        avgRenderTime: g.count > 0 ? g.render / g.count : 0,
        avgReadbackTime: g.count > 0 ? g.readback / g.count : 0,
        avgTotalTime: g.count > 0 ? g.total / g.count : 0,
        avgCompileTime: g.compileEvents > 0 ? g.compile / g.compileEvents : 0,
        compileEvents: g.compileEvents,
      });
    }

    const methodRenderSummaries: MethodRenderSummary[] = [];
    for (const [, g] of methodRenderGroups) {
      methodRenderSummaries.push({
        method: g.method,
        renderMode: g.renderMode,
        frameCount: g.count,
        avgSetupTime: g.count > 0 ? g.setup / g.count : 0,
        avgComputeTime: g.count > 0 ? g.compute / g.count : 0,
        avgRenderTime: g.count > 0 ? g.render / g.count : 0,
        avgReadbackTime: g.count > 0 ? g.readback / g.count : 0,
        avgTotalTime: g.count > 0 ? g.total / g.count : 0,
        avgHostToGpuBridgeTime: g.count > 0 ? g.hostToGpu / g.count : 0,
        avgGpuToHostBridgeTime: g.count > 0 ? g.gpuToHost / g.count : 0,
        avgMethodMemoryFootprintBytes:
          g.memoryCount > 0 ? g.memory / g.memoryCount : 0,
      });
    }

    const frameTimeStats = distribution(
      filteredFrames
        .map((frame) => frame.performance?.totalExecutionTime ?? 0)
        .filter((value) => Number.isFinite(value)),
    );

    const runtimeSampling = this.buildRuntimeSamplingSummary(
      filteredRuntimeSamples,
      filteredFrames,
    );

    return {
      run: {
        ...this.run,
        configuration: {
          options: { ...this.run.configuration.options },
          requiredInputs: [...this.run.configuration.requiredInputs],
          definedInputs: this.run.configuration.definedInputs.map((input) => ({
            ...input,
          })),
          wasmCodeFeatures: this.run.configuration.wasmCodeFeatures
            ? { ...this.run.configuration.wasmCodeFeatures }
            : undefined,
        },
        metadata: this.run.metadata ? { ...this.run.metadata } : undefined,
      },
      environment: this.environment
        ? {
            device: { ...this.environment.device },
            browser: { ...this.environment.browser },
            gpu: this.environment.gpu ? { ...this.environment.gpu } : undefined,
            wasm: { ...this.environment.wasm },
            battery: this.environment.battery
              ? { ...this.environment.battery }
              : undefined,
          }
        : undefined,
      runtimeSamples: filteredRuntimeSamples.map((sample) => ({
        ...sample,
        jsHeap: sample.jsHeap ? { ...sample.jsHeap } : undefined,
        battery: sample.battery ? { ...sample.battery } : undefined,
        thermalCanary: sample.thermalCanary
          ? { ...sample.thermalCanary }
          : undefined,
      })),
      frames: frameView,
      logs:
        filter?.includeLogs === false
          ? []
          : this.logs.map((entry) => ({ ...entry })),
      errors: this.errors.map((entry) => ({ ...entry })),
      summary: {
        frameCount: filteredFrames.length,
        durationMs: Math.max(0, endedAt - this.run.startedAt),
        totalExecutionMs,
        averageExecutionMs:
          filteredFrames.length > 0
            ? totalExecutionMs / filteredFrames.length
            : 0,
        errorCount: this.errors.length,
        methodSummaries,
        methodRenderSummaries,
        frameTimeStats,
        inputStats,
        agentStats,
        runtimeSampling,
      },
    };
  }

  private buildRuntimeSamplingSummary(
    samples: RuntimeSampleRecord[],
    frames: SimulationFrameRecord[],
  ): RuntimeSamplingSummary | undefined {
    const jsHeapSamples = samples
      .map((sample) => sample.jsHeap?.usedJSHeapSize)
      .filter((value): value is number => typeof value === "number");

    // Fallback: use per-frame heap samples if periodic sampling is disabled.
    if (jsHeapSamples.length === 0) {
      for (const frame of frames) {
        const used = frame.performance?.memoryStats?.usedJsHeapSizeBytes;
        if (typeof used === "number") {
          jsHeapSamples.push(used);
        }
      }
    }

    const runtimeSampling: RuntimeSamplingSummary = {};

    if (jsHeapSamples.length > 0) {
      const total = jsHeapSamples.reduce((sum, value) => sum + value, 0);
      runtimeSampling.jsHeap = {
        sampleCount: jsHeapSamples.length,
        startBytes: jsHeapSamples[0],
        endBytes: jsHeapSamples[jsHeapSamples.length - 1],
        deltaBytes: jsHeapSamples[jsHeapSamples.length - 1] - jsHeapSamples[0],
        minBytes: Math.min(...jsHeapSamples),
        maxBytes: Math.max(...jsHeapSamples),
        averageBytes: total / jsHeapSamples.length,
      };
    }

    const batterySamples = samples
      .map((sample) => sample.battery)
      .filter(
        (battery): battery is NonNullable<RuntimeSampleRecord["battery"]> =>
          Boolean(battery),
      );

    if (batterySamples.length > 0) {
      const levelSamples = batterySamples
        .map((battery) => battery.level)
        .filter((level): level is number => typeof level === "number");

      runtimeSampling.battery = {
        supported: batterySamples.some((battery) => battery.supported),
        sampleCount: batterySamples.length,
        startLevel: levelSamples.length > 0 ? levelSamples[0] : undefined,
        endLevel:
          levelSamples.length > 0
            ? levelSamples[levelSamples.length - 1]
            : undefined,
        deltaLevel:
          levelSamples.length > 1
            ? levelSamples[levelSamples.length - 1] - levelSamples[0]
            : undefined,
        startCharging: batterySamples[0]?.charging,
        endCharging: batterySamples[batterySamples.length - 1]?.charging,
      };
    }

    const canaryDrifts = samples
      .map((sample) => sample.thermalCanary?.driftMs)
      .filter((value): value is number => typeof value === "number");

    if (canaryDrifts.length > 0) {
      const stats = distribution(canaryDrifts);
      const threshold = Math.max(
        DEFAULT_THROTTLING_THRESHOLD_MS,
        this.runtimeSampleIntervalMs * 0.75,
      );

      runtimeSampling.thermalCanary = {
        sampleCount: canaryDrifts.length,
        sampleIntervalMs: this.runtimeSampleIntervalMs,
        avgDriftMs: stats.average,
        p95DriftMs: stats.p95,
        maxDriftMs: stats.max,
        throttlingEvents: canaryDrifts.filter((value) => value > threshold)
          .length,
        throttlingEventThresholdMs: threshold,
      };
    }

    return Object.keys(runtimeSampling).length > 0
      ? runtimeSampling
      : undefined;
  }

  /**
   * Remove the global log listener registered by this tracker.
   *
   * Should be called during simulation teardown to prevent memory leaks.
   */
  public dispose(): void {
    this.stopRuntimeSampling();
    if (this.logListener) {
      Logger.removeListener(this.logListener);
    }
  }

  /**
   * Whether this tracker is configured to capture per-frame agent states.
   *
   * @returns `true` if tracking is enabled and agent state capture is on.
   */
  public capturesAgentStates(): boolean {
    return this.options.enabled && this.options.captureAgentStates;
  }
}
