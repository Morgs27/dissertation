import Logger from "../logger";
import type { AgentPerformance, PerformanceMonitor } from "../performance";
import type { CompiledAgentCode, Method, InputValues, Agent, SimulationOptions } from "../types";
import WebWorkers from "./webWorkers";

export type AgentFunction = (agent: Agent, inputs: InputValues) => Agent;


export class ComputeEngine {
    private readonly compiledCode: CompiledAgentCode;
    private readonly Logger: Logger;
    private WebWorkers: WebWorkers;
    private PerformanceMonitor: PerformanceMonitor;

    private agentFunction: AgentFunction;

    constructor(compiledCode: CompiledAgentCode, performanceMonitor: PerformanceMonitor) {
        this.compiledCode = compiledCode;
        this.PerformanceMonitor = performanceMonitor;

        this.agentFunction = this.buildAgentFunction();

        this.WebWorkers = new WebWorkers(this.agentFunction);

        this.Logger = new Logger('ComputeEngine');
    }

    async runFrame(method: Method, agents: Agent[], inputValues: InputValues): Promise<Agent[]> {
        this.Logger.info(`Running Compute:`, method, agents, inputValues);

        switch (method) {
            case "WebWorkers":
                return this.runOnWebWorkers(agents, inputValues);
            default:
                return this.runOnMainThread(agents, inputValues);
        }
    }

    private async runOnWebWorkers(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
        const totalStart = performance.now();

        const updatedAgents = await this.WebWorkers.compute(agents, inputs);
        
        const totalEnd = performance.now();
        const totalExecutionTime = totalEnd - totalStart;

        this.PerformanceMonitor.logFrame({
            method: "WebWorkers",
            agentCount: agents.length,
            agentPerformance: [], // TODO: add per agent performance
            totalExecutionTime: totalExecutionTime, 
            frameTimestamp: Date.now(),
        });

        return updatedAgents;
    }

    private async runOnMainThread(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
        const totalStart = performance.now();

        const agentTimings: AgentPerformance[] = [];

        const updatedAgents = await Promise.all(
            agents.map(async (agent) => {
                const start = performance.now();
                const result = this.agentFunction({ ...agent }, inputs);
                const end = performance.now();

                const executionTime = end - start;
                agentTimings.push({
                    agentId: agent.id,
                    executionTime,
                });

                return result;
            })
        );

        const totalEnd = performance.now();
        const totalExecutionTime = totalEnd - totalStart;

        this.PerformanceMonitor.logFrame({
            method: "JavaScript",
            agentCount: agents.length,
            agentPerformance: agentTimings,
            totalExecutionTime,
            frameTimestamp: Date.now(),
        });

        return updatedAgents;
    }

    private buildAgentFunction(): AgentFunction {
        return new Function(`return ${this.compiledCode.jsCode}`)() as AgentFunction;
    }
}
