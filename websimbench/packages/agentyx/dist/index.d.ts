type FramePerformance = {
    method: string;
    agentCount: number;
    agentPerformance: AgentPerformance[];
    totalExecutionTime: number;
    frameTimestamp: number;
    setupTime?: number;
    computeTime?: number;
    renderTime?: number;
    readbackTime?: number;
    compileTime?: number;
    specificStats?: Record<string, number>;
};
type AgentPerformance = {
    agentId: number;
    executionTime: number;
};
declare class PerformanceMonitor {
    private readonly Logger;
    private readonly _frames;
    constructor();
    logFrame(performance: FramePerformance): void;
    get frames(): FramePerformance[];
    logMissingFrame(): void;
    reset(): void;
    printSummary(): void;
}

type RuntimeDeviceMetrics = {
    userAgent?: string;
    platform?: string;
    hardwareConcurrency?: number;
    deviceMemoryGb?: number;
    language?: string;
    timezone?: string;
    nodeVersion?: string;
    runtime?: 'browser' | 'node' | 'unknown';
};
type RuntimeBrowserMetrics = {
    online?: boolean;
    cookieEnabled?: boolean;
    doNotTrack?: string | null;
    url?: string;
    referrer?: string;
    viewport?: {
        width: number;
        height: number;
        devicePixelRatio: number;
    };
    performanceMemory?: {
        jsHeapSizeLimit: number;
        totalJSHeapSize: number;
        usedJSHeapSize: number;
    };
};
type RuntimeGPUMetrics = {
    vendor: string;
    architecture: string;
    description: string;
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupsPerDimension: number;
    maxComputeInvocationsPerWorkgroup: number;
    maxComputeWorkgroupSizeX: number;
    maxComputeWorkgroupSizeY: number;
    maxComputeWorkgroupSizeZ: number;
};
type RuntimeMetrics = {
    device: RuntimeDeviceMetrics;
    browser: RuntimeBrowserMetrics;
    gpu?: RuntimeGPUMetrics;
};
declare const collectRuntimeMetrics: () => Promise<RuntimeMetrics>;

type SimulationOptions = {
    agents: number;
    workers?: number;
    width?: number;
    height?: number;
    seed?: number;
};
type SimulationAppearance = {
    agentColor: string;
    backgroundColor: string;
    agentSize: number;
    agentShape: 'circle' | 'square';
    showTrails: boolean;
    trailOpacity?: number;
    trailColor: string;
    speciesColors?: string[];
    obstacleColor: string;
    obstacleBorderColor: string;
    obstacleOpacity: number;
};
type InputValues = {
    [key: string]: number | boolean | Agent[] | Float32Array | Uint32Array | Function | Obstacle[];
};
type InputDefinition = {
    name: string;
    defaultValue: number;
    min?: number;
    max?: number;
};
type TrailEnvironmentConfig = {
    depositAmountInput?: string;
    decayFactorInput?: string;
};
type CompilationResult = {
    requiredInputs: string[];
    definedInputs: InputDefinition[];
    wgslCode: string;
    jsCode: string;
    WASMCode: string;
    trailEnvironmentConfig?: TrailEnvironmentConfig;
    speciesCount?: number;
    numRandomCalls: number;
};
type Agent = {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    species: number;
};
type Obstacle = {
    x: number;
    y: number;
    w: number;
    h: number;
};
type Method = 'WebGL' | 'WebAssembly' | 'JavaScript' | 'WebWorkers' | 'WebGPU';
type RenderMode = 'cpu' | 'gpu' | 'none';
type CustomCodeSource = {
    js?: string | ((agent: Agent, inputs: InputValues) => Agent);
    wgsl?: string;
    wasmWat?: string;
    requiredInputs?: string[];
    definedInputs?: InputDefinition[];
    speciesCount?: number;
    numRandomCalls?: number;
};
type SimulationSource = {
    kind: 'dsl';
    code: string;
} | {
    kind: 'custom';
    code: CustomCodeSource;
};
type TrackingOptions = {
    enabled: boolean;
    captureFrameInputs: boolean;
    captureAgentStates: boolean;
    captureLogs: boolean;
    captureDeviceMetrics: boolean;
};
type SimulationConstructor = {
    canvas?: HTMLCanvasElement | null;
    gpuCanvas?: HTMLCanvasElement | null;
    options: SimulationOptions;
    appearance?: Partial<SimulationAppearance>;
    source?: SimulationSource;
    agentScript?: string;
    tracking?: Partial<TrackingOptions>;
    metadata?: Record<string, unknown>;
};
type SimulationFrameResult = {
    frameNumber: number;
    agents: Agent[];
    skipped: boolean;
};

type SimulationLogEntry = {
    timestamp: number;
    level: 'verbose' | 'info' | 'warning' | 'error';
    context: string;
    message: string;
};
type SimulationErrorEntry = {
    timestamp: number;
    message: string;
    stack?: string;
};
type SimulationFrameRecord = {
    frameNumber: number;
    timestamp: number;
    method: Method;
    renderMode: RenderMode;
    agentPositions?: Agent[];
    inputSnapshot?: Record<string, unknown>;
    performance?: FramePerformance;
};
type SimulationRunSummary = {
    frameCount: number;
    durationMs: number;
    totalExecutionMs: number;
    averageExecutionMs: number;
    errorCount: number;
};
type SimulationRunMetadata = {
    runId: string;
    startedAt: number;
    endedAt?: number;
    source: {
        kind: SimulationSource['kind'];
        code: string | {
            js?: string;
            wgsl?: string;
            wasmWat?: string;
        };
    };
    configuration: {
        options: SimulationOptions;
        appearance: SimulationAppearance;
        requiredInputs: string[];
        definedInputs: CompilationResult['definedInputs'];
    };
    environment?: RuntimeMetrics;
    metadata?: Record<string, unknown>;
};
type SimulationTrackingReport = {
    run: SimulationRunMetadata;
    frames: SimulationFrameRecord[];
    logs: SimulationLogEntry[];
    errors: SimulationErrorEntry[];
    summary: SimulationRunSummary;
};
type SimulationTrackingFilter = {
    fromFrame?: number;
    toFrame?: number;
    includeAgentPositions?: boolean;
    includeInputSnapshots?: boolean;
    includeLogs?: boolean;
};
declare class SimulationTracker {
    private readonly options;
    private readonly logger;
    private readonly run;
    private readonly frames;
    private readonly logs;
    private readonly errors;
    private readonly logListener?;
    constructor(params: {
        source: SimulationSource;
        options: SimulationOptions;
        appearance: SimulationAppearance;
        compilationResult: CompilationResult;
        tracking?: Partial<TrackingOptions>;
        metadata?: Record<string, unknown>;
    });
    collectEnvironmentMetrics(): Promise<void>;
    recordFrame(params: {
        frameNumber: number;
        method: Method;
        renderMode: RenderMode;
        agents: Agent[];
        performance?: FramePerformance;
        inputs?: InputValues;
    }): void;
    recordError(error: unknown): void;
    complete(): void;
    getReport(filter?: SimulationTrackingFilter): SimulationTrackingReport;
    dispose(): void;
    capturesAgentStates(): boolean;
}

declare const MAX_AGENTS = 10000000;
declare class Simulation {
    private readonly logger;
    private readonly performanceMonitor;
    private readonly compiler;
    private readonly computeEngine;
    private readonly source;
    private readonly tracker;
    private renderer;
    private width;
    private height;
    private frameInProgress;
    private frameNumber;
    private frameInputs;
    private obstacles;
    private appearance;
    agents: Agent[];
    compilationResult: CompilationResult | null;
    trailMap: Float32Array | null;
    randomValues: Float32Array | null;
    constructor(config: SimulationConstructor);
    private createInitialAgents;
    private ensureTrailMap;
    private populateRandomValues;
    private resolveDimensions;
    private buildInputs;
    initGPU(): Promise<void>;
    updateAppearance(nextAppearance: Partial<SimulationAppearance>): void;
    setInputs(nextInputs: InputValues): void;
    setObstacles(obstacles: Obstacle[]): void;
    setCanvasDimensions(width: number, height: number): void;
    runFrame(method: Method, inputValues?: InputValues, renderMode?: RenderMode): Promise<SimulationFrameResult>;
    getPerformanceMonitor(): PerformanceMonitor;
    getTrackingReport(filter?: SimulationTrackingFilter): SimulationTrackingReport;
    exportTrackingReport(filter?: SimulationTrackingFilter): string;
    destroy(): void;
}

declare class Compiler {
    private logger;
    constructor();
    compileAgentCode(agentCode?: string): CompilationResult;
    private preprocessDSL;
    private countInlineRandomCalls;
    private parseLines;
    private stripComments;
    private parseInputDeclaration;
    private parseValueWithRange;
    private splitStatements;
    private extractInputs;
    private addCommandDependencies;
    private extractTrailConfig;
    private extractSpeciesCount;
    private ensureRandomValuesDependency;
    private compileToAllTargets;
    private logCompilationResults;
    private buildCompilationResult;
}

type WebGPURenderResources = {
    device: GPUDevice;
    agentVertexBuffer: GPUBuffer;
    agentCount: number;
    agentStride: number;
    trailMapBuffer?: GPUBuffer;
};

declare class ComputeEngine {
    private readonly compilationResult;
    private agentFunction;
    private agentCount;
    private workerCount?;
    private readonly Logger;
    private gpuDevice;
    private readonly PerformanceMonitor;
    gpuRenderState: WebGPURenderResources | undefined;
    private compileTimes;
    private trailMapRead;
    private trailMapWrite;
    private trailMapSeeded;
    constructor(compilationResult: CompilationResult, performanceMonitor: PerformanceMonitor, agentCount: number, workerCount?: number);
    /**
     * Ensure double-buffer trail maps are allocated for the given dimensions.
     */
    private ensureTrailMapBuffers;
    /**
     * Apply diffuse and decay to trail map (blur + decay).
     */
    private applyDiffuseDecay;
    private syncTrailMapToExternal;
    private prepareFrameInputs;
    private finalizeTrailMap;
    private _WebWorkers;
    private get WebWorkersInstance();
    private _WebGPU;
    private _WebGPUInitPromise;
    private getWebGPUInstance;
    private _WebAssembly;
    private _WebAssemblyInitPromise;
    private getWebAssemblyInstance;
    initGPU(device: GPUDevice): void;
    runFrame(method: Method, agents: Agent[], inputValues: InputValues, renderMode: RenderMode): Promise<Agent[]>;
    private runOnWASM;
    private runOnWebGPU;
    private runOnWebWorkers;
    private runOnMainThread;
    private logPerformance;
    destroy(): void;
    private buildAgentFunction;
}

declare enum LogLevel {
    None = 0,
    Error = 1,
    Warning = 2,
    Info = 3,
    Verbose = 4
}
type Language = 'js' | 'wgsl' | 'wasm' | 'dsl';
declare class Logger {
    private context;
    private color;
    private static listeners;
    constructor(context: string, color?: string);
    static setGlobalLogLevel(level: LogLevel): void;
    static addListener(listener: (level: LogLevel, context: string, message: string, args: any[]) => void): void;
    static removeListener(listener: (level: LogLevel, context: string, message: string, args: any[]) => void): void;
    private emit;
    log(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    codeError(message: string, code: string, lineIndex: number): void;
    code(label: string, code: string, language: Language): Promise<void>;
    private formatJS;
    private formatGeneralCode;
}

export { type Agent, Simulation as AgentyxSimulation, type CompilationResult, Compiler, ComputeEngine, type CustomCodeSource, type InputDefinition, type InputValues, LogLevel, Logger, MAX_AGENTS, type Method, type Obstacle, PerformanceMonitor, type RenderMode, type RuntimeBrowserMetrics, type RuntimeDeviceMetrics, type RuntimeGPUMetrics, type RuntimeMetrics, Simulation, type SimulationAppearance, type SimulationConstructor, type SimulationErrorEntry, type SimulationFrameRecord, type SimulationFrameResult, type SimulationLogEntry, type SimulationOptions, type SimulationRunMetadata, type SimulationRunSummary, type SimulationSource, SimulationTracker, type SimulationTrackingFilter, type SimulationTrackingReport, type TrackingOptions, collectRuntimeMetrics, Simulation as default };
