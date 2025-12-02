export type SimulationConstructor = {
    canvas: HTMLCanvasElement;
    gpuCanvas: HTMLCanvasElement | null;
    options: SimulationOptions;
    agentScript: string;
    appearance: SimulationAppearance;
}

export type SimulationOptions = {
    agents: number;
    workers?: number;
}

export type SimulationAppearance = {
    agentColor: string;
    backgroundColor: string;
    agentSize: number;
    agentShape: 'circle' | 'square';
}

export type InputValues = {
    [key: string]: number | Agent[];
}

export type InputDefinition = {
    name: string;
    defaultValue: number;
    min?: number;
    max?: number;
}

export type CompilationResult = {
    requiredInputs: string[];
    definedInputs: InputDefinition[];
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
