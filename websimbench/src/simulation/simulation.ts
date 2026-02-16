import { Compiler } from "./compiler/compiler";
import { ComputeEngine } from "./compute/compute";
import { Grapher } from "./helpers/grapher";
import Logger from "./helpers/logger";
import { PerformanceMonitor } from "./performance";
import { Renderer } from "./renderer";
import type { SimulationConstructor, Method, InputValues, Agent, CompilationResult, RenderMode } from "./types";
import GPU from "./helpers/gpu";
export const MAX_AGENTS = 10_000_000;

export class Simulation {
    private readonly Renderer: Renderer;
    private readonly ComputeEngine: ComputeEngine;
    private readonly PerformanceMonitor: PerformanceMonitor;
    private readonly Compiler: Compiler;
    private readonly Logger: Logger;
    private readonly Grapher: Grapher;

    private frameInProgress = false;
    public agents: Agent[] = [];
    public compilationResult: CompilationResult | null = null;

    public trailMap: Float32Array | null = null;
    private nextTrailMap: Float32Array | null = null;
    public randomValues: Float32Array | null = null;

    constructor({ canvas, gpuCanvas, options, agentScript, appearance }: SimulationConstructor) {
        this.Logger = new Logger('Simulation', 'blue');

        if (options.agents > MAX_AGENTS) {
            const message = `Number of agents exceeds maximum limit of ${MAX_AGENTS}.`;
            this.Logger.error(message);
            throw new Error(message);
        }

        this.PerformanceMonitor = new PerformanceMonitor();

        this.Compiler = new Compiler();
        const compilationResult = this.Compiler.compileAgentCode(agentScript);
        this.compilationResult = compilationResult;

        this.Renderer = new Renderer(canvas, gpuCanvas, appearance);
        this.Grapher = new Grapher(canvas);

        this.ComputeEngine = new ComputeEngine(compilationResult, this.PerformanceMonitor, options.agents, options.workers);

        const speciesCount = compilationResult.speciesCount || 1;
        this.agents = Array.from({ length: options.agents }, (_, i) => ({
            id: i,
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 2, // Random velocity between -1 and 1
            vy: (Math.random() - 0.5) * 2,
            species: i % speciesCount
        }));

        this.initTrailMap(canvas.width, canvas.height);
        // Random values will be initialized on demand in runFrame
        // this.randomValues = new Float32Array(options.agents); 
    }

    private initTrailMap(width: number, height: number) {
        this.trailMap = new Float32Array(width * height);
        this.nextTrailMap = new Float32Array(width * height);
    }

    private diffuseAndDecay(width: number, height: number, decayFactor: number) {
        if (!this.trailMap || !this.nextTrailMap) return;

        const map = this.trailMap;
        const nextMap = this.nextTrailMap;
        // Simple 3x3 blur kernel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let sum = 0;
                let count = 0;

                // Average over 3x3 (wrap around)
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        let nx = x + dx;
                        let ny = y + dy;

                        // Wrap
                        if (nx < 0) nx += width;
                        if (nx >= width) nx -= width;
                        if (ny < 0) ny += height;
                        if (ny >= height) ny -= height;

                        sum += map[ny * width + nx];
                        count++;
                    }
                }

                const blurred = sum / count;
                const diffused = map[y * width + x] * (1 - 0.9) + blurred * 0.9; // Hardcoded diffusion mix
                nextMap[y * width + x] = diffused * (1 - decayFactor);
            }
        }

        // Swap buffers
        this.trailMap.set(nextMap);
    }

    public async initGPU() {
        const gpuHelper = new GPU("SimulationGPU");
        const gpuDevice = await gpuHelper.getDevice() as GPUDevice;

        this.Renderer.initGPU(gpuDevice);
        this.ComputeEngine.initGPU(gpuDevice);
    }

    public destroy() {
        // Stop any running loops or listeners if any
        // Currently Simulation doesn't hold its own loop, but if it did, we'd stop it here.
        // We can also release references to help GC
        this.agents = [];
        this.trailMap = null;
        this.nextTrailMap = null;
        // If we had specific GPU resource destroy methods, we'd call them here.
        // Note: We don't destroy the shared GPU device as it's a singleton.
    }

    public async runFrame(method: Method, inputValues: InputValues, renderMode: RenderMode = "cpu") {

        if (this.frameInProgress) {
            this.PerformanceMonitor.logMissingFrame();
            return;
        }

        // Initialize trail map if needed (e.g. if canvas resized) or if not yet created
        // Only if the simulation actually requires it
        const needsTrailMap = this.compilationResult?.requiredInputs.includes('trailMap');

        if (needsTrailMap && !this.trailMap) {
            this.initTrailMap(this.Renderer.canvas.width, this.Renderer.canvas.height);
        } else if (!needsTrailMap && this.trailMap) {
            // If we switched to a sim strictly without trails, we could free memory, 
            // but keeping it allocated is safer/simpler for now unless explicitly destroyed.
            // Actually, let's clear it to ensure we don't render stale data if flags get confused.
            this.trailMap = null;
            this.nextTrailMap = null;
        }

        // Populate random values for this frame if needed
        const needsRandom = this.compilationResult?.requiredInputs.includes('randomValues');
        const numRandomCalls = this.compilationResult?.numRandomCalls || 0;

        if (needsRandom && numRandomCalls > 0) {
            const totalRandomValues = this.agents.length * numRandomCalls;
            if (!this.randomValues || this.randomValues.length !== totalRandomValues) {
                this.randomValues = new Float32Array(totalRandomValues);
            }

            for (let i = 0; i < totalRandomValues; i++) {
                this.randomValues[i] = Math.random();
            }
        }

        const inputs: InputValues = {
            width: this.Renderer.canvas.width,
            height: this.Renderer.canvas.height,
            agents: this.agents,
            ...inputValues
        };

        // Fallback for defined inputs with default values if they are missing
        this.compilationResult?.definedInputs.forEach(def => {
            if (!(def.name in inputs)) {
                inputs[def.name] = def.defaultValue;
            }
        });

        if (needsRandom && this.randomValues) {
            inputs.randomValues = this.randomValues;
        }

        if (this.trailMap) {
            inputs.trailMap = this.trailMap;
        }

        // Auto-manage obstacle data: derive obstacleCount from the obstacles array
        const needsObstacles = this.compilationResult?.requiredInputs.includes('obstacles');
        if (needsObstacles) {
            if (!inputs.obstacles) {
                inputs.obstacles = [];
            }
            inputs.obstacleCount = (inputs.obstacles as any[]).length;
        }

        if (
            this.compilationResult?.requiredInputs.some(input => !(input in inputs))
        ) {
            const missingInputs = this.compilationResult.requiredInputs.filter(input => !(input in inputs));

            const message = `Missing required input values: ${missingInputs.join(', ')}`;
            this.Logger.error(message);
            throw new Error(message);
        }

        this.frameInProgress = true;

        this.Logger.log(`Simulation running (${method}) with ${renderMode.toUpperCase()} render`);

        try {
            const agentPositions = await this.ComputeEngine.runFrame(method, this.agents, inputs, renderMode);

            // console.log(agentPositions);
            this.agents = agentPositions;

            // Run environment simulation (diffuse and decay) on CPU
            // Skip this when using WebGPU - it's handled entirely on GPU (even for CPU readback)
            if (method !== 'WebGPU' && this.trailMap) {
                // Determine decay factor from config or default
                let decayFactor = 0.1;
                const config = this.compilationResult?.trailEnvironmentConfig;

                if (config?.decayFactorInput && typeof inputValues[config.decayFactorInput] === 'number') {
                    decayFactor = inputValues[config.decayFactorInput] as number;
                } else if (typeof inputValues['decayFactor'] === 'number') {
                    // Fallback for legacy scripts without explicit config
                    decayFactor = inputValues['decayFactor'] as number;
                }

                this.diffuseAndDecay(this.Renderer.canvas.width, this.Renderer.canvas.height, decayFactor);
            }

            // Track render time separately
            const renderStart = performance.now();
            if (renderMode === "gpu") {
                await this.Renderer.renderAgentsGPU(
                    agentPositions,
                    this.ComputeEngine.gpuRenderState,
                    this.trailMap ?? undefined
                );
            } else {
                this.Renderer.renderBackground();

                // If we have a trail map, render it
                if (this.trailMap && this.Renderer.getAppearance().showTrails) {
                    this.Renderer.renderTrails(this.trailMap, this.Renderer.canvas.width, this.Renderer.canvas.height);
                }
                this.Renderer.renderAgents(agentPositions);
            }
            const renderEnd = performance.now();
            const renderTime = renderEnd - renderStart;

            // Update the last frame's performance data to include render time
            const frames = this.PerformanceMonitor.frames;
            if (frames.length > 0) {
                const lastFrame = frames[frames.length - 1];
                lastFrame.renderTime = renderTime;
                // Update total execution time to include render
                lastFrame.totalExecutionTime += renderTime;
            }
        } catch (error) {

            const message = error instanceof Error ? error.message : String(error);

            this.Logger.error(`Failed to run simulation frame: ${message}`);

        } finally {
            this.frameInProgress = false;
        }
    }

    public renderFrameGraph() {
        this.Grapher.render(this.PerformanceMonitor.frames);
    }

    public getPerformanceMonitor() {
        return this.PerformanceMonitor;
    }
}
