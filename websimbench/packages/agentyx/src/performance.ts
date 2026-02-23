/**
 * @module performance
 * Performance monitoring utilities for tracking per-frame execution metrics.
 *
 * The {@link PerformanceMonitor} accumulates {@link FramePerformance} records
 * for every simulation frame and provides summary statistics.
 */

import Logger from "./helpers/logger";

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
export type FramePerformance = {
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
export type AgentPerformance = {
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
export class PerformanceMonitor {
  private readonly logger: Logger;
  private readonly _frames: FramePerformance[] = [];

  constructor() {
    this.logger = new Logger("PerformanceMonitor", "green");
  }

  /**
   * Record a completed frame's performance data.
   *
   * @param performance - The frame's timing and metric data.
   */
  public logFrame(performance: FramePerformance): void {
    this._frames.push(performance);
  }

  /**
   * All recorded frame performance entries.
   */
  public get frames(): FramePerformance[] {
    return this._frames;
  }

  /**
   * Log a warning when a frame is skipped because the previous frame
   * was still in progress.
   */
  public logMissingFrame(): void {
    this.logger.warn("Frame skipped - performance data not recorded.");
  }

  /**
   * Clear all recorded frame data.
   */
  public reset(): void {
    this._frames.length = 0;
  }

  /**
   * Print a human-readable performance summary to the console.
   *
   * Outputs average total, setup, compute, render, and readback times
   * as well as any backend-specific statistics.
   */
  public printSummary(): void {
    if (this._frames.length === 0) {
      this.logger.info("No performance data to report.");
      return;
    }

    const method = this._frames[0].method;
    const count = this._frames.length;
    const totalTime = this._frames.reduce(
      (sum, f) => sum + f.totalExecutionTime,
      0,
    );
    const avgTime = totalTime / count;

    const avgSetup =
      this._frames.reduce((sum, f) => sum + (f.setupTime || 0), 0) / count;
    const avgCompute =
      this._frames.reduce((sum, f) => sum + (f.computeTime || 0), 0) / count;
    const avgRender =
      this._frames.reduce((sum, f) => sum + (f.renderTime || 0), 0) / count;
    const avgReadback =
      this._frames.reduce((sum, f) => sum + (f.readbackTime || 0), 0) / count;

    this.logger.info(`Performance Summary for ${method}:`);
    this.logger.info(`  Frames: ${count}`);
    this.logger.info(`  Avg Total Time: ${avgTime.toFixed(2)} ms`);

    if (avgSetup > 0)
      this.logger.info(`  Avg Setup Time: ${avgSetup.toFixed(2)} ms`);
    if (avgCompute > 0)
      this.logger.info(`  Avg Compute Time: ${avgCompute.toFixed(2)} ms`);
    if (avgRender > 0)
      this.logger.info(`  Avg Render Time: ${avgRender.toFixed(2)} ms`);
    if (avgReadback > 0)
      this.logger.info(`  Avg Readback Time: ${avgReadback.toFixed(2)} ms`);

    const firstFrameStats = this._frames[0].specificStats;
    if (firstFrameStats) {
      this.logger.info(`  Specific Stats (Avg):`);
      for (const key of Object.keys(firstFrameStats)) {
        const avgStat =
          this._frames.reduce(
            (sum, f) => sum + (f.specificStats?.[key] || 0),
            0,
          ) / count;
        this.logger.info(`    ${key}: ${avgStat.toFixed(2)} ms`);
      }
    }
  }
}

export default PerformanceMonitor;
