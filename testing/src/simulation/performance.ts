import Logger from "./logger";
import type { Agent } from "./types";

export class PerformanceMonitor {
    private readonly Logger: Logger;

    constructor() {
        this.Logger = new Logger('PerformanceMonitor');
    }

    recordFrame(agents: Agent[]) {
        this.Logger.log('Recording frame with agents:', agents);
    }
}

export default PerformanceMonitor;
