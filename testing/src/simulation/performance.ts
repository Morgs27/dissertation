import Logger from "./helpers/logger";

// should track 

type FramePerformance = {
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

    constructor() {
        this.Logger = new Logger('PerformanceMonitor', 'green');
    }

    public logFrame(performance: FramePerformance) {
        this.Logger.log(`${performance.method} with ${performance.agentCount} agents took ${performance.totalExecutionTime.toFixed(2)} ms`);
    }

    logMissingFrame() {
        this.Logger.warn('Frame skipped - performance data not recorded.');
    }
}

export default PerformanceMonitor;
