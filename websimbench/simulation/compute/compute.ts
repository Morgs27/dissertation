import Logger from "../helpers/logger";
import type { AgentPerformance, PerformanceMonitor } from "../performance";
import type { CompilationResult, Method, InputValues, Agent, RenderMode } from "../types";
import WebWorkers from "./webWorkers";
import type { WebGPURenderResources } from "./webGPU";
import WebGPU from "./webGPU";
import { compileWATtoWASM, WebAssemblyCompute } from "./webAssembly";

export type AgentFunction = (agent: Agent, inputs: InputValues) => Agent;

export class ComputeEngine {
    private readonly Logger: Logger;
    private PerformanceMonitor: PerformanceMonitor;

    private gpuDevice: GPUDevice | null = null;

    private WebWorkers: WebWorkers;
    private WebGPU: WebGPU;
    private WebAssembly: WebAssemblyCompute;

    private readonly compilationResult: CompilationResult;
    private agentFunction: AgentFunction;
    private agentCount: number = 0;

    public gpuRenderState: WebGPURenderResources | undefined = undefined;

    constructor(compilationResult: CompilationResult, performanceMonitor: PerformanceMonitor, agentCount: number) {
        this.compilationResult = compilationResult;
        this.PerformanceMonitor = performanceMonitor;

        this.agentFunction = this.buildAgentFunction();

        this.agentCount = agentCount;

        this.WebWorkers = new WebWorkers(this.agentFunction);

        this.WebGPU = new WebGPU(this.compilationResult.wgslCode, this.compilationResult.requiredInputs, this.agentCount);

        this.WebAssembly = new WebAssemblyCompute(this.compilationResult.WASMCode, this.agentCount);
        this.WebAssembly.init();

        this.Logger = new Logger('ComputeEngine', 'purple');

        console.log("ComputeEngine initialized");
    }

    initGPU(device: GPUDevice) {
        console.log("Initializing ComputeEngine with GPU device:", device, "and agent count:", this.agentCount);
        this.gpuDevice = device;
        this.WebGPU.init(device, this.agentCount);
    }

    async runFrame(method: Method, agents: Agent[], inputValues: InputValues, renderMode: RenderMode): Promise<Agent[]> {
        this.Logger.log(`Running Compute:`, method);

        switch (method) {
            case "WebWorkers":
                return this.runOnWebWorkers(agents, inputValues);
            case "WebGPU":
                return this.runOnWebGPU(agents, inputValues, renderMode);
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

    private async runOnWebGPU(agents: Agent[], inputs: InputValues, renderMode: RenderMode): Promise<Agent[]> {
        const totalStart = performance.now();

        const shouldReadback = renderMode !== "gpu";
        const { updatedAgents, renderResources } = await this.WebGPU.compute(agents, inputs, shouldReadback);
        const nextAgents = updatedAgents ?? agents;

        const totalEnd = performance.now();
        const totalExecutionTime = totalEnd - totalStart;

        this.PerformanceMonitor.logFrame({
            method: "WebGPU",
            agentCount: nextAgents.length,
            agentPerformance: [],
            totalExecutionTime: totalExecutionTime,
            frameTimestamp: Date.now(),
        });

        if (renderResources) {
            this.gpuRenderState = renderResources;
        }

        if (shouldReadback && updatedAgents) {
            this.Logger.log(`WebGPU compute completed (with readback). Agent[0]: x=${nextAgents[0].x.toFixed(2)}, y=${nextAgents[0].y.toFixed(2)}, vx=${nextAgents[0].vx.toFixed(2)}, vy=${nextAgents[0].vy.toFixed(2)}`);
        } else {
            this.Logger.log(`WebGPU compute completed (GPU-only, no readback). Original agent[0]: x=${nextAgents[0].x.toFixed(2)}, y=${nextAgents[0].y.toFixed(2)}, vx=${nextAgents[0].vx.toFixed(2)}, vy=${nextAgents[0].vy.toFixed(2)}`);
            this.Logger.warn("Note: Agent positions shown above are CPU-side values and may not reflect GPU computations.");
        }

        return nextAgents;
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
            agentPerformance: [],
            totalExecutionTime,
            frameTimestamp: Date.now(),
        });

        return updatedAgents;
    }

    private buildAgentFunction(): AgentFunction {
        return new Function(`return ${this.compilationResult.jsCode}`)() as AgentFunction;
    }
}
