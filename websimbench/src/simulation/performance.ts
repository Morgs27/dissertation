import Logger from "./helpers/logger";

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
}

export type AgentPerformance = {
    agentId: number;
    executionTime: number;
}

export class PerformanceMonitor {
    private readonly Logger: Logger;
    private readonly _frames: FramePerformance[] = [];

    constructor() {
        this.Logger = new Logger('PerformanceMonitor', 'green');
    }

    public logFrame(performance: FramePerformance) {
        this._frames.push(performance);
        // Do not log every frame to console as per user request
    }

    public get frames() {
        return this._frames;
    }

    logMissingFrame() {
        this.Logger.warn('Frame skipped - performance data not recorded.');
    }

    public reset() {
        this._frames.length = 0;
    }

    public printSummary() {
        if (this._frames.length === 0) {
            this.Logger.info("No performance data to report.");
            return;
        }

        const method = this._frames[0].method;
        const count = this._frames.length;
        const totalTime = this._frames.reduce((sum, f) => sum + f.totalExecutionTime, 0);
        const avgTime = totalTime / count;
        
        const avgSetup = this._frames.reduce((sum, f) => sum + (f.setupTime || 0), 0) / count;
        const avgCompute = this._frames.reduce((sum, f) => sum + (f.computeTime || 0), 0) / count;
        const avgRender = this._frames.reduce((sum, f) => sum + (f.renderTime || 0), 0) / count;
        const avgReadback = this._frames.reduce((sum, f) => sum + (f.readbackTime || 0), 0) / count;

        this.Logger.info(`Performance Summary for ${method}:`);
        this.Logger.info(`  Frames: ${count}`);
        this.Logger.info(`  Avg Total Time: ${avgTime.toFixed(2)} ms`);
        
        if (avgSetup > 0) this.Logger.info(`  Avg Setup Time: ${avgSetup.toFixed(2)} ms`);
        if (avgCompute > 0) this.Logger.info(`  Avg Compute Time: ${avgCompute.toFixed(2)} ms`);
        if (avgRender > 0) this.Logger.info(`  Avg Render Time: ${avgRender.toFixed(2)} ms`);
        if (avgReadback > 0) this.Logger.info(`  Avg Readback Time: ${avgReadback.toFixed(2)} ms`);

        // Aggregate specific stats if available
        const firstFrameStats = this._frames[0].specificStats;
        if (firstFrameStats) {
            this.Logger.info(`  Specific Stats (Avg):`);
            for (const key of Object.keys(firstFrameStats)) {
                const avgStat = this._frames.reduce((sum, f) => sum + (f.specificStats?.[key] || 0), 0) / count;
                this.Logger.info(`    ${key}: ${avgStat.toFixed(2)} ms`);
            }
        }
    }
}

export default PerformanceMonitor;
