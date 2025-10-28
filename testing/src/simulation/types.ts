export type SimulationConstructor = {
    canvas: HTMLCanvasElement;
    options: SimulationOptions;
    agentScript: string;
}

export type SimulationOptions = {
    agents: number;
    workers?: number;
}

export type InputValues = {
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
