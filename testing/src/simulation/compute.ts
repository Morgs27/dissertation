import Logger from "./logger";
import type { CompiledAgentCode, Input, Method, InputValue, Agent } from "./types";

// default inputs added whould be width and height of simulation area

export class ComputeEngine {
    compiledCode: CompiledAgentCode;
    inputs: Input[];
    Logger: Logger;

    constructor(compiledCode: CompiledAgentCode, inputs: Input[]) {
        this.compiledCode = compiledCode;
        this.inputs = inputs;
        this.Logger = new Logger('ComputeEngine');
    }

    runFrame(method: Method, inputValues: InputValue[]): Agent[] {
        
        // switch case for each method
        // webGPU setup webGPU compute shader to process agents
        // webGL setup webGL shader to process agents
        // webAssembly run WASM code to process agents
        // JavaScript run JS code to process agents
        // webWorkers distribute agent processing across workers

        switch (method) {
            case "WebGPU":
                return this.runGpuFrame(inputValues);
            default:
                this.Logger.log(`Method ${method} not implemented, defaulting to JavaScript`);
        }

        const agents: Agent[] = [];
        for (let i = 0; i < 10; i++) {
            agents.push({id: i, x: Math.random() * 500, y: Math.random() * 500});
        }

        return agents;
    }

    private runGpuFrame(inputValues: InputValue[]) {
        this.Logger.log('Running GPU frame with input values:', inputValues);
        
        // Placeholder for WebGPU computation logic

        return [];
    }
}