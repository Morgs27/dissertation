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
    showTrails: boolean;
    trailOpacity?: number;
    trailColor: string;
}

export type InputValues = {
    [key: string]: number | Agent[] | Float32Array | Uint32Array | Function | Obstacle[];
}

export type InputDefinition = {
    name: string;
    defaultValue: number;
    min?: number;
    max?: number;
}

export type TrailEnvironmentConfig = {
    depositAmountInput?: string;
    decayFactorInput?: string;
}

export type CompilationResult = {
    requiredInputs: string[];
    definedInputs: InputDefinition[];
    wgslCode: string;
    jsCode: string;
    WASMCode: string;
    trailEnvironmentConfig?: TrailEnvironmentConfig;
    speciesCount?: number;
    /** Number of random values needed per agent per frame (randomInputs + inline random() calls) */
    numRandomCalls: number;
}

export type Agent = {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    species: number;
}

export type Obstacle = {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type Method = "WebGL" | "WebAssembly" | "JavaScript" | "WebWorkers" | "WebGPU"

export type RenderMode = "cpu" | "gpu";
