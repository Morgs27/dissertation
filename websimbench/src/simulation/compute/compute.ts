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

    // Double-buffer for trail map parity across all compute methods
    private trailMapRead: Float32Array | null = null;
    private trailMapWrite: Float32Array | null = null;
    private trailMapSeeded: boolean = false;

    constructor(compilationResult: CompilationResult, performanceMonitor: PerformanceMonitor, agentCount: number, workerCount?: number) {
        this.compilationResult = compilationResult;
        this.PerformanceMonitor = performanceMonitor;
        this.workerCount = workerCount;

        this.agentFunction = this.buildAgentFunction();

        this.agentCount = agentCount;
        this.Logger = new Logger('ComputeEngine', 'purple');

        console.log("ComputeEngine initialized");
    }

    /**
     * Ensure double-buffer trail maps are allocated for the given dimensions
     */
    private ensureTrailMapBuffers(width: number, height: number): void {
        const size = width * height;
        if (!this.trailMapRead || this.trailMapRead.length !== size) {
            this.trailMapRead = new Float32Array(size);
            this.trailMapWrite = new Float32Array(size);
            this.trailMapSeeded = false;
        }
    }

    /**
     * Apply diffuse and decay to trail map (blur + decay)
     * This creates consistent post-processing across all compute methods
     */
    private applyDiffuseDecay(width: number, height: number, decayFactor: number): void {
        if (!this.trailMapRead || !this.trailMapWrite) return;

        // First, add deposits from write buffer to read buffer
        for (let i = 0; i < this.trailMapRead.length; i++) {
            this.trailMapRead[i] += this.trailMapWrite[i];
        }

        // Clear write buffer for next frame
        this.trailMapWrite.fill(0);

        // Apply blur (3x3 kernel) and decay
        const temp = new Float32Array(this.trailMapRead.length);

        const f = Math.fround; // Alias for readability

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = f(0);
                let count = f(0);

                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        let nx = x + dx;
                        let ny = y + dy;

                        // Wrap around
                        if (nx < 0) nx += width;
                        if (nx >= width) nx -= width;
                        if (ny < 0) ny += height;
                        if (ny >= height) ny -= height;

                        sum = f(sum + this.trailMapRead[ny * width + nx]);
                        count = f(count + 1);
                    }
                }

                const idx = y * width + x;
                const blurred = f(sum / count);
                const current = this.trailMapRead[idx];

                // Formula: diffused = current * 0.1 + blurred * 0.9
                // Must wrap each step
                const term1 = f(current * f(0.1));
                const term2 = f(blurred * f(0.9));
                const diffused = f(term1 + term2);

                // temp[idx] = diffused * (1.0 - decayFactor)
                const decayMult = f(f(1.0) - f(decayFactor));
                temp[idx] = f(diffused * decayMult);
            }
        }

        // Copy result back to read buffer
        this.trailMapRead.set(temp);
    }

    /**
     * Swap buffers and sync with external trailMap if provided
     */
    private syncTrailMapToExternal(externalTrailMap: Float32Array): void {
        if (this.trailMapRead) {
            externalTrailMap.set(this.trailMapRead);
        }
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

        // Setup double-buffered trail maps if trailMap exists
        const hasTrailMap = inputValues.trailMap !== undefined;
        const width = (inputValues.width as number) || 0;
        const height = (inputValues.height as number) || 0;
        const decayFactor = (inputValues.decayFactor as number) || 0.05;

        if (hasTrailMap && width > 0 && height > 0) {
            this.ensureTrailMapBuffers(width, height);

            // Seed buffers on first frame
            if (!this.trailMapSeeded && inputValues.trailMap) {
                this.trailMapRead!.set(inputValues.trailMap as Float32Array);
                this.trailMapWrite!.fill(0);
                this.trailMapSeeded = true;
            }

            // Provide separate read/write buffers to compute methods
            inputValues.trailMapRead = this.trailMapRead!;
            inputValues.trailMapWrite = this.trailMapWrite!;
        }

        // Inject print function for debugging (used by JS backend)
        // For WASM, it's handled via imports in webAssembly.ts
        // For WebWorkers, we don't inject it to avoid cloning errors (workers don't support print yet)
        if (method !== "WebWorkers") {
            inputValues.print = (id: number, val: number) => {
                this.Logger.info(`AGENT[${id}] PRINT:`, val);
            };
        }

        let result: Agent[];

        switch (method) {
            case "WebWorkers":
                result = await this.runOnWebWorkers(agents, inputValues);
                break;
            case "WebGPU":
                result = await this.runOnWebGPU(agents, inputValues, renderMode);
                break;
            case "WebAssembly":
                result = await this.runOnWASM(agents, inputValues);
                break;
            default:
                result = await this.runOnMainThread(agents, inputValues);
                break;
        }

        // Apply diffuse/decay and sync back to external trailMap
        // (Skip for WebGPU which handles this on GPU)
        if (hasTrailMap && method !== "WebGPU" && inputValues.trailMap) {
            this.applyDiffuseDecay(width, height, decayFactor);
            this.syncTrailMapToExternal(inputValues.trailMap as Float32Array);
        }

        return result;
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

        const { agents: updatedAgents, trailMap: depositDeltas, performance: workerPerf } = await instance.compute(agents, inputs);

        // Write worker deposits to the write buffer (not the original trailMap)
        // The deposits will be merged with the read buffer in applyDiffuseDecay
        if (depositDeltas && inputs.trailMapWrite) {
            const writeBuffer = inputs.trailMapWrite as Float32Array;
            for (let i = 0; i < depositDeltas.length; i++) {
                writeBuffer[i] += depositDeltas[i];
            }
        }

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
