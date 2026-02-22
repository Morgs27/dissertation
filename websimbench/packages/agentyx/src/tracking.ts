import type { FramePerformance } from './performance';
import { collectRuntimeMetrics, type RuntimeMetrics } from './helpers/deviceInfo';
import Logger, { LogLevel } from './helpers/logger';
import type {
  Agent,
  CompilationResult,
  InputValues,
  Method,
  RenderMode,
  SimulationAppearance,
  SimulationOptions,
  SimulationSource,
  TrackingOptions,
} from './types';

export type SimulationLogEntry = {
  timestamp: number;
  level: 'verbose' | 'info' | 'warning' | 'error';
  context: string;
  message: string;
};

export type SimulationErrorEntry = {
  timestamp: number;
  message: string;
  stack?: string;
};

export type SimulationFrameRecord = {
  frameNumber: number;
  timestamp: number;
  method: Method;
  renderMode: RenderMode;
  agentPositions?: Agent[];
  inputSnapshot?: Record<string, unknown>;
  performance?: FramePerformance;
};

export type SimulationRunSummary = {
  frameCount: number;
  durationMs: number;
  totalExecutionMs: number;
  averageExecutionMs: number;
  errorCount: number;
};

export type SimulationRunMetadata = {
  runId: string;
  startedAt: number;
  endedAt?: number;
  source: {
    kind: SimulationSource['kind'];
    code: string | { js?: string; wgsl?: string; wasmWat?: string };
  };
  configuration: {
    options: SimulationOptions;
    appearance: SimulationAppearance;
    requiredInputs: string[];
    definedInputs: CompilationResult['definedInputs'];
  };
  environment?: RuntimeMetrics;
  metadata?: Record<string, unknown>;
};

export type SimulationTrackingReport = {
  run: SimulationRunMetadata;
  frames: SimulationFrameRecord[];
  logs: SimulationLogEntry[];
  errors: SimulationErrorEntry[];
  summary: SimulationRunSummary;
};

export type SimulationTrackingFilter = {
  fromFrame?: number;
  toFrame?: number;
  includeAgentPositions?: boolean;
  includeInputSnapshots?: boolean;
  includeLogs?: boolean;
};

const DEFAULT_TRACKING_OPTIONS: TrackingOptions = {
  enabled: true,
  captureFrameInputs: false,
  captureAgentStates: true,
  captureLogs: true,
  captureDeviceMetrics: true,
};

const mapLogLevel = (level: LogLevel): SimulationLogEntry['level'] => {
  if (level === LogLevel.Error) return 'error';
  if (level === LogLevel.Warning) return 'warning';
  if (level === LogLevel.Info) return 'info';
  return 'verbose';
};

const generateRunId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const cloneAgents = (agents: Agent[]): Agent[] => {
  return agents.map((agent) => ({ ...agent }));
};

const sanitizeInputValue = (value: unknown): unknown => {
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return [];

    if (typeof value[0] === 'object') {
      return value.map((item) => {
        if (!item || typeof item !== 'object') {
          return item;
        }

        const result: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(item as Record<string, unknown>)) {
          if (typeof nested === 'number' || typeof nested === 'string' || typeof nested === 'boolean' || nested == null) {
            result[key] = nested;
          }
        }

        return result;
      });
    }

    return value;
  }

  if (value instanceof Float32Array || value instanceof Uint32Array) {
    return {
      type: value.constructor.name,
      length: value.length,
    };
  }

  if (typeof value === 'function') {
    return '[Function]';
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = sanitizeInputValue(nested);
    }
    return result;
  }

  return String(value);
};

export class SimulationTracker {
  private readonly options: TrackingOptions;
  private readonly logger = new Logger('SimulationTracker', 'teal');
  private readonly run: SimulationRunMetadata;
  private readonly frames: SimulationFrameRecord[] = [];
  private readonly logs: SimulationLogEntry[] = [];
  private readonly errors: SimulationErrorEntry[] = [];
  private readonly logListener?: (
    level: LogLevel,
    context: string,
    message: string,
    args: unknown[]
  ) => void;

  constructor(params: {
    source: SimulationSource;
    options: SimulationOptions;
    appearance: SimulationAppearance;
    compilationResult: CompilationResult;
    tracking?: Partial<TrackingOptions>;
    metadata?: Record<string, unknown>;
  }) {
    this.options = { ...DEFAULT_TRACKING_OPTIONS, ...(params.tracking ?? {}) };

    this.run = {
      runId: generateRunId(),
      startedAt: Date.now(),
      source: {
        kind: params.source.kind,
        code:
          params.source.kind === 'dsl'
            ? params.source.code
            : {
                js:
                  typeof params.source.code.js === 'function'
                    ? params.source.code.js.toString()
                    : params.source.code.js,
                wgsl: params.source.code.wgsl,
                wasmWat: params.source.code.wasmWat,
              },
      },
      configuration: {
        options: { ...params.options },
        appearance: { ...params.appearance },
        requiredInputs: [...params.compilationResult.requiredInputs],
        definedInputs: params.compilationResult.definedInputs.map((def) => ({ ...def })),
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
  }

  async collectEnvironmentMetrics(): Promise<void> {
    if (!this.options.enabled || !this.options.captureDeviceMetrics) {
      return;
    }

    try {
      this.run.environment = await collectRuntimeMetrics();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to collect runtime metrics: ${message}`);
    }
  }

  recordFrame(params: {
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

    this.frames.push({
      frameNumber: params.frameNumber,
      timestamp: Date.now(),
      method: params.method,
      renderMode: params.renderMode,
      agentPositions: this.options.captureAgentStates ? cloneAgents(params.agents) : undefined,
      inputSnapshot: this.options.captureFrameInputs
        ? Object.fromEntries(
            Object.entries(params.inputs ?? {}).map(([key, value]) => [key, sanitizeInputValue(value)])
          )
        : undefined,
      performance: params.performance ? { ...params.performance } : undefined,
    });
  }

  recordError(error: unknown): void {
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

  complete(): void {
    if (!this.options.enabled) {
      return;
    }

    this.run.endedAt = Date.now();
  }

  getReport(filter?: SimulationTrackingFilter): SimulationTrackingReport {
    const fromFrame = filter?.fromFrame;
    const toFrame = filter?.toFrame;

    const filteredFrames = this.frames.filter((frame) => {
      if (typeof fromFrame === 'number' && frame.frameNumber < fromFrame) {
        return false;
      }
      if (typeof toFrame === 'number' && frame.frameNumber > toFrame) {
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
      0
    );

    return {
      run: {
        ...this.run,
        configuration: {
          options: { ...this.run.configuration.options },
          appearance: { ...this.run.configuration.appearance },
          requiredInputs: [...this.run.configuration.requiredInputs],
          definedInputs: this.run.configuration.definedInputs.map((input) => ({ ...input })),
        },
        environment: this.run.environment
          ? {
              device: { ...this.run.environment.device },
              browser: { ...this.run.environment.browser },
              gpu: this.run.environment.gpu ? { ...this.run.environment.gpu } : undefined,
            }
          : undefined,
        metadata: this.run.metadata ? { ...this.run.metadata } : undefined,
      },
      frames: frameView,
      logs: filter?.includeLogs === false ? [] : this.logs.map((entry) => ({ ...entry })),
      errors: this.errors.map((entry) => ({ ...entry })),
      summary: {
        frameCount: filteredFrames.length,
        durationMs: Math.max(0, endedAt - this.run.startedAt),
        totalExecutionMs,
        averageExecutionMs: filteredFrames.length > 0 ? totalExecutionMs / filteredFrames.length : 0,
        errorCount: this.errors.length,
      },
    };
  }

  dispose(): void {
    if (this.logListener) {
      Logger.removeListener(this.logListener);
    }
  }

  capturesAgentStates(): boolean {
    return this.options.enabled && this.options.captureAgentStates;
  }
}
