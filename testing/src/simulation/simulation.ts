import { Compiler } from "./compiler/compiler";
import { ComputeEngine } from "./compute/compute";
import { Grapher } from "./helpers/grapher";
import Logger from "./helpers/logger";
import { PerformanceMonitor } from "./performance";
import { Renderer } from "./renderer";
import type { SimulationConstructor, Method, InputValues, Agent, CompilationResult, RenderMode } from "./types";

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

    constructor({ canvas, options, agentScript }: SimulationConstructor) {
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

        this.Renderer = new Renderer(canvas);
        this.Grapher = new Grapher(canvas);

        this.ComputeEngine = new ComputeEngine(compilationResult, this.PerformanceMonitor);

        this.agents = Array.from({ length: options.agents }, (_, i) => ({
            id: i,
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height
        }));
    }

    public async runFrame(method: Method, inputValues: InputValues, renderMode: RenderMode = "cpu") {

        if (this.frameInProgress) {
            this.PerformanceMonitor.logMissingFrame();
            return;
        }

        const inputs = {
            width: this.Renderer.canvas.width,
            height: this.Renderer.canvas.height,
            ...inputValues
        };

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

            this.agents = agentPositions;

            if (renderMode === "gpu") {
                await this.Renderer.renderAgentsGPU(agentPositions, this.ComputeEngine.gpuRenderState);

            } else {
                this.Renderer.renderAgents(agentPositions);
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
}
