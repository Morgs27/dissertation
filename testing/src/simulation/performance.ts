import Logger from "./logger";

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
        this.Logger = new Logger('PerformanceMonitor');
    }

    public logFrame(performance: FramePerformance) {
        this.Logger.success(`Frame Performance: ${performance.method} with ${performance.agentCount} agents took ${performance.totalExecutionTime.toFixed(2)} ms`); 
        this.Logger.success(performance.agentPerformance.join(""))
    }

    logMissingFrame() {
        console.warn('Frame skipped - performance data not recorded.');
    }
}

export default PerformanceMonitor;
