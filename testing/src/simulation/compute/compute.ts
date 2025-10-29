import Logger from "../logger";
import type { AgentPerformance, PerformanceMonitor } from "../performance";
import type { CompilationResult, Method, InputValues, Agent } from "../types";
import { WebGPU } from "./webGPU";
import WebWorkers from "./webWorkers";
import WebAssembly from "./webAssembly";

export type AgentFunction = (agent: Agent, inputs: InputValues) => Agent;


export class ComputeEngine {
    private readonly Logger: Logger;
    private PerformanceMonitor: PerformanceMonitor;
    
    private WebWorkers: WebWorkers;
    private WebGPU: WebGPU;
    private WebAssembly: WebAssembly;
    
    private readonly compilationResult: CompilationResult;
    private agentFunction: AgentFunction;

    constructor(compilationResult: CompilationResult, performanceMonitor: PerformanceMonitor) {
        this.compilationResult = compilationResult;
        this.PerformanceMonitor = performanceMonitor;

        this.agentFunction = this.buildAgentFunction();

        this.WebWorkers = new WebWorkers(this.agentFunction);
        this.WebGPU = new WebGPU(this.compilationResult.wgslCode, this.compilationResult.requiredInputs);
        this.WebAssembly = new WebAssembly(this.compilationResult.WASMCode);

        this.Logger = new Logger('ComputeEngine');
    }

    async runFrame(method: Method, agents: Agent[], inputValues: InputValues): Promise<Agent[]> {
        this.Logger.info(`Running Compute:`, method, agents, inputValues);

        switch (method) {
            case "WebWorkers":
                return this.runOnWebWorkers(agents, inputValues);
            case "WebGPU":
                return this.runOnWebGPU(agents, inputValues);
            case "WebAssembly":
                return this.runOnWASM(agents, inputValues);
            default:
                return this.runOnMainThread(agents, inputValues);
        }
    }

    private async runOnWASM(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
        const totalStart = performance.now();

        const agentTimings: AgentPerformance[] = [];

        const updatedAgents = await this.WebAssembly.compute(agents, inputs);

        const totalEnd = performance.now();
        const totalExecutionTime = totalEnd - totalStart;

        this.PerformanceMonitor.logFrame({
            method: "WebAssembly",
            agentCount: agents.length,
            agentPerformance: agentTimings,
            totalExecutionTime,
            frameTimestamp: Date.now(),
        });

        return updatedAgents;
    }

    private async runOnWebGPU(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
        const totalStart = performance.now();

        const updatedAgents = await this.WebGPU.compute(agents, inputs);
        
        const totalEnd = performance.now();
        const totalExecutionTime = totalEnd - totalStart;

        this.PerformanceMonitor.logFrame({
            method: "WebGPU",
            agentCount: agents.length,
            agentPerformance: [],
            totalExecutionTime: totalExecutionTime, 
            frameTimestamp: Date.now(),
        });

        return updatedAgents;
    }

    private async runOnWebWorkers(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
        const totalStart = performance.now();

        const updatedAgents = await this.WebWorkers.compute(agents, inputs);
        
        const totalEnd = performance.now();
        const totalExecutionTime = totalEnd - totalStart;

        this.PerformanceMonitor.logFrame({
            method: "WebWorkers",
            agentCount: agents.length,
            agentPerformance: [],
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
        return new Function(`return ${this.compilationResult.jsCode}`)() as AgentFunction;
    }
}
