export type SimulationConstructor = {
    canvas: HTMLCanvasElement;
    gpuCanvas: HTMLCanvasElement | null;
    options: SimulationOptions;
    agentScript: string;
}

export type SimulationOptions = {
    agents: number;
    workers?: number;
}

export type InputValues = {
    [key: string]: number | Agent[];
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
    vx: number;
    vy: number;
}

export type Method = "WebGL" | "WebAssembly" | "JavaScript" | "WebWorkers" | "WebGPU"

export type RenderMode = "cpu" | "gpu";
