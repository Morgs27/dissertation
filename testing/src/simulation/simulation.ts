import { Compiler } from "./compiler";
import { ComputeEngine } from "./compute";
import Logger from "./logger";
import { PerformanceMonitor } from "./performance";
import { Renderer } from "./renderer";
import type { SimulationConstructor, Method, InputValue } from "./types";

export class Simulation {
    private readonly Renderer: Renderer;
    private readonly ComputeEngine: ComputeEngine;
    private readonly PerformanceMonitor: PerformanceMonitor;
    private readonly Compiler: Compiler;
    private readonly Logger: Logger;

    constructor({canvas, options, inputs, agentScript}: SimulationConstructor) {
        this.Logger = new Logger('Simulation');

        this.Compiler = new Compiler();
        const compiledCode = this.Compiler.compileAgentCode(agentScript);
        
        this.Renderer = new Renderer(canvas);
        this.ComputeEngine = new ComputeEngine(compiledCode, inputs);
        this.PerformanceMonitor = new PerformanceMonitor();

        this.Renderer.renderBackground();
    }

    public runFrame(method: Method, inputValues: InputValue[]) {
        this.Logger.log('Simulation running');

        // Add default inputs
        const inputs = {
            width: this.Renderer.canvas.width,
            height: this.Renderer.canvas.height,
            ... inputValues
        }

        const agentPositions = this.ComputeEngine.runFrame(method, inputs);

        this.Renderer.renderAgents(agentPositions);

        this.PerformanceMonitor.recordFrame(agentPositions);
    }
}
