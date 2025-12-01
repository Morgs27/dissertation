import Logger from "./helpers/logger";

export type FramePerformance = {
    method: string;
    agentCount: number;
    agentPerformance: AgentPerformance[];
    totalExecutionTime: number;
    frameTimestamp: number;
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
        this.Logger.log(`${performance.method} with ${performance.agentCount} agents took ${performance.totalExecutionTime.toFixed(2)} ms`);
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
}

export default PerformanceMonitor;
