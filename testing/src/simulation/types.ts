export type SimulationConstructor = {
    canvas: HTMLCanvasElement;
    options: SimulationOptions;
    inputs: Input[];
    agentScript: string;
}

export type SimulationOptions = {
    agents: number;
}

export type Input = {
    type: 'number' | 'text' | 'boolean';
    name: string;
    label: string;
    default: number | string | boolean;
}

export type InputValue = {
    [key: string]: number | string | boolean;
}

export type CompiledAgentCode = {
    glslCode: string;
    jsCode: string;
    WASMCode: string;
}

export type Agent = {
    id: number;
    x: number;
    y: number;
}

export type Method = "WebGL" | "WebAssembly" | "JavaScript" | "WebWorkers" | "WebGPU"
