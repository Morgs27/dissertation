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
    [key: string]: number;
}

export type CompilationResult = {
    requiredInputs: string[];
    wgslCode: string;
    jsCode: string;
    WASMCode: string;
}

export type Agent = {
    id: number;
    x: number;
    y: number;
}

export type Method = "WebGL" | "WebAssembly" | "JavaScript" | "WebWorkers" | "WebGPU"

export type RenderMode = "cpu" | "gpu";
