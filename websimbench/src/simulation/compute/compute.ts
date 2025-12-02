import Logger from "../helpers/logger";
import type { PerformanceMonitor } from "../performance";
import type { CompilationResult, Method, InputValues, Agent, RenderMode } from "../types";
import WebWorkers from "./webWorkers";
import type { WebGPURenderResources } from "./webGPU";
import WebGPU from "./webGPU";
import { WebAssemblyCompute } from "./webAssembly";

export type AgentFunction = (agent: Agent, inputs: InputValues) => Agent;

export class ComputeEngine {
    private readonly compilationResult: CompilationResult;
    private agentFunction: AgentFunction;
    private agentCount: number = 0;
    private workerCount?: number;
    private readonly Logger: Logger;

    private gpuDevice: GPUDevice | null = null;
    private readonly PerformanceMonitor: PerformanceMonitor;
    public gpuRenderState: WebGPURenderResources | undefined = undefined;

    private compileTimes: Record<string, number | undefined> = {};

    constructor(compilationResult: CompilationResult, performanceMonitor: PerformanceMonitor, agentCount: number, workerCount?: number) {
        this.compilationResult = compilationResult;
        this.PerformanceMonitor = performanceMonitor;
        this.workerCount = workerCount;

        this.agentFunction = this.buildAgentFunction();

        this.agentCount = agentCount;
        this.Logger = new Logger('ComputeEngine', 'purple');

        console.log("ComputeEngine initialized");
    }

    private _WebWorkers: WebWorkers | undefined;
    private get WebWorkersInstance(): WebWorkers {
        if (!this._WebWorkers) {
            const start = performance.now();
            this._WebWorkers = new WebWorkers(this.agentFunction, this.workerCount);
            const end = performance.now();
            this.compileTimes['WebWorkers'] = end - start;
        }
        return this._WebWorkers;
    }

    private _WebGPU: WebGPU | undefined;
    private _WebGPUInitPromise: Promise<void> | undefined;

    private async getWebGPUInstance(): Promise<WebGPU> {
        if (!this._WebGPU) {
            this._WebGPU = new WebGPU(this.compilationResult.wgslCode, this.compilationResult.requiredInputs, this.agentCount);
            // If device is already available, init immediately
            if (this.gpuDevice) {
                const start = performance.now();
                this._WebGPUInitPromise = this._WebGPU.init(this.gpuDevice, this.agentCount);
                await this._WebGPUInitPromise;
                this.compileTimes['WebGPU'] = performance.now() - start;
            }
        } else if (this._WebGPUInitPromise) {
            await this._WebGPUInitPromise;
        }
        return this._WebGPU;
    }

    private _WebAssembly: WebAssemblyCompute | undefined;
    private _WebAssemblyInitPromise: Promise<void> | undefined;

    private async getWebAssemblyInstance(): Promise<WebAssemblyCompute> {
        if (!this._WebAssembly) {
            const start = performance.now();
            this._WebAssembly = new WebAssemblyCompute(this.compilationResult.WASMCode, this.agentCount);
            this._WebAssemblyInitPromise = this._WebAssembly.init();
            await this._WebAssemblyInitPromise;
            this.compileTimes['WebAssembly'] = performance.now() - start;
        } else if (this._WebAssemblyInitPromise) {
            await this._WebAssemblyInitPromise;
        }
        return this._WebAssembly;
    }

    initGPU(device: GPUDevice) {
        console.log("Initializing ComputeEngine with GPU device:", device, "and agent count:", this.agentCount);
        this.gpuDevice = device;

        // If WebGPU instance exists but wasn't initialized with device (though the getter checks for device)
        if (this._WebGPU && !this._WebGPUInitPromise) {
            const start = performance.now();
            this._WebGPUInitPromise = this._WebGPU.init(device, this.agentCount).then(() => {
                this.compileTimes['WebGPU'] = performance.now() - start;
            });
        }
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
        const instance = await this.getWebAssemblyInstance();

        const { agents: updatedAgents, performance: wasmPerf } = instance.compute(agents, inputs);

        // totalExecutionTime excludes setup (writeTime is setup/overhead)
        const totalExecutionTime = wasmPerf.computeTime + wasmPerf.readTime;

        this.logPerformance("WebAssembly", agents.length, totalExecutionTime, {
            setupTime: wasmPerf.writeTime,
            computeTime: wasmPerf.computeTime,
            readbackTime: wasmPerf.readTime,
            specificStats: {
                "Memory Write": wasmPerf.writeTime,
                "WASM Execution": wasmPerf.computeTime,
                "Memory Read": wasmPerf.readTime
            }
        });

        return updatedAgents;
    }

    private async runOnWebGPU(agents: Agent[], inputs: InputValues, renderMode: RenderMode): Promise<Agent[]> {
        const instance = await this.getWebGPUInstance();

        const shouldReadback = renderMode !== "gpu";

        const result = shouldReadback
            ? await instance.runGPUReadback(agents, inputs)
            : await instance.runGPU(agents, inputs);

        const { updatedAgents, renderResources, performance: gpuPerf } = result;
        const nextAgents = updatedAgents ?? agents;

        // totalExecutionTime excludes setup (setupTime is overhead)
        const totalExecutionTime = gpuPerf.dispatchTime + gpuPerf.readbackTime;

        this.logPerformance("WebGPU", nextAgents.length, totalExecutionTime, {
            setupTime: gpuPerf.setupTime,
            computeTime: gpuPerf.dispatchTime,
            readbackTime: gpuPerf.readbackTime,
            specificStats: {
                "Buffer Setup": gpuPerf.setupTime,
                "GPU Dispatch": gpuPerf.dispatchTime,
                "Readback": gpuPerf.readbackTime
            }
        });

        if (renderResources) {
            this.gpuRenderState = renderResources;
        }

        return nextAgents;
    }

    private async runOnWebWorkers(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
        const instance = this.WebWorkersInstance;

        const { agents: updatedAgents, performance: workerPerf } = await instance.compute(agents, inputs);

        // totalExecutionTime excludes setup (serializationTime is setup/overhead)
        const totalExecutionTime = workerPerf.workerTime + workerPerf.deserializationTime;

        this.logPerformance("WebWorkers", agents.length, totalExecutionTime, {
            setupTime: workerPerf.serializationTime,
            computeTime: workerPerf.workerTime,
            readbackTime: workerPerf.deserializationTime,
            specificStats: {
                "Serialization": workerPerf.serializationTime,
                "Worker Compute": workerPerf.workerTime,
                "Deserialization": workerPerf.deserializationTime
            }
        });

        return updatedAgents;
    }

    private async runOnMainThread(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
        const computeStart = performance.now();
        const updatedAgents = agents.map(agent => this.agentFunction({ ...agent }, inputs));
        const computeEnd = performance.now();

        const computeTime = computeEnd - computeStart;
        // JavaScript has no setup or readback overhead, so totalExecutionTime = computeTime
        const totalExecutionTime = computeTime;

        this.logPerformance("JavaScript", agents.length, totalExecutionTime, {
            computeTime: computeTime,
            setupTime: 0,
            readbackTime: 0,
            specificStats: {
                "JS Execution": computeTime
            }
        });

        return updatedAgents;
    }

    private logPerformance(
        method: string,
        agentCount: number,
        totalExecutionTime: number,
        details: {
            setupTime: number,
            computeTime: number,
            readbackTime: number,
            specificStats: Record<string, number>
        }
    ) {
        const compileTime = this.compileTimes[method];
        if (compileTime !== undefined) {
            // Clear it so it's only logged once
            this.compileTimes[method] = undefined;
        }

        this.PerformanceMonitor.logFrame({
            method,
            agentCount,
            agentPerformance: [],
            totalExecutionTime,
            frameTimestamp: Date.now(),
            setupTime: details.setupTime,
            computeTime: details.computeTime,
            readbackTime: details.readbackTime,
            compileTime: compileTime, // Undefined if already logged
            specificStats: details.specificStats
        });
    }

    private buildAgentFunction(): AgentFunction {
        return new Function(`return ${this.compilationResult.jsCode}`)() as AgentFunction;
    }
}
