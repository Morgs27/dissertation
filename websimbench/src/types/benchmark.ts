import type {
  Method,
  RenderMode,
  RuntimeMetrics,
  SimulationTrackingReport,
} from "@websimbench/agentyx";

export type CanvasSizeOption = {
  width: number;
  height: number;
};

export type BenchmarkSweepConfig = {
  agentCounts: number[];
  methods: Method[];
  renderModes: RenderMode[];
  workerCounts: number[];
  canvasSizes: CanvasSizeOption[];
  framesPerRun: number;
  warmupFrames: number;
  runsPerConfig: number;
};

export type BenchmarkRunConfig = {
  agents: number;
  method: Method;
  renderMode: RenderMode;
  workers?: number;
  canvas: CanvasSizeOption;
  framesPerRun: number;
  warmupFrames: number;
  runIndex: number;
};

export type BenchmarkRunRecord = {
  id: string;
  startedAt: number;
  endedAt: number;
  status: "completed" | "failed";
  config: BenchmarkRunConfig;
  trackingReport: SimulationTrackingReport;
  runtimeMetrics?: RuntimeMetrics;
  error?: string;
};

export type BenchmarkSummary = {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalFrames: number;
  averageFrameExecutionMs: number;
  totalExecutionMs: number;
};

export type BenchmarkReport = {
  id: string;
  timestamp: number;
  name?: string;
  sourceCode: string;
  sweepConfig: BenchmarkSweepConfig;
  runs: BenchmarkRunRecord[];
  summary: BenchmarkSummary;
};

export type BenchmarkFilter = {
  methods?: Method[];
  renderModes?: RenderMode[];
  minAgents?: number;
  maxAgents?: number;
  status?: Array<BenchmarkRunRecord["status"]>;
};
