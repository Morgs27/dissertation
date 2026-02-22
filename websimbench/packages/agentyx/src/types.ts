export type SimulationOptions = {
  agents: number;
  workers?: number;
  width?: number;
  height?: number;
  seed?: number;
};

export type SimulationAppearance = {
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

export type InputValues = {
  [key: string]: number | boolean | Agent[] | Float32Array | Uint32Array | Function | Obstacle[];
};

export type InputDefinition = {
  name: string;
  defaultValue: number;
  min?: number;
  max?: number;
};

export type TrailEnvironmentConfig = {
  depositAmountInput?: string;
  decayFactorInput?: string;
};

export type CompilationResult = {
  requiredInputs: string[];
  definedInputs: InputDefinition[];
  wgslCode: string;
  jsCode: string;
  WASMCode: string;
  trailEnvironmentConfig?: TrailEnvironmentConfig;
  speciesCount?: number;
  numRandomCalls: number;
};

export type Agent = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
};

export type Obstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Method = 'WebGL' | 'WebAssembly' | 'JavaScript' | 'WebWorkers' | 'WebGPU';

export type RenderMode = 'cpu' | 'gpu' | 'none';

export type CustomCodeSource = {
  js?: string | ((agent: Agent, inputs: InputValues) => Agent);
  wgsl?: string;
  wasmWat?: string;
  requiredInputs?: string[];
  definedInputs?: InputDefinition[];
  speciesCount?: number;
  numRandomCalls?: number;
};

export type SimulationSource =
  | {
      kind: 'dsl';
      code: string;
    }
  | {
      kind: 'custom';
      code: CustomCodeSource;
    };

export type TrackingOptions = {
  enabled: boolean;
  captureFrameInputs: boolean;
  captureAgentStates: boolean;
  captureLogs: boolean;
  captureDeviceMetrics: boolean;
};

export type SimulationConstructor = {
  canvas?: HTMLCanvasElement | null;
  gpuCanvas?: HTMLCanvasElement | null;
  options: SimulationOptions;
  appearance?: Partial<SimulationAppearance>;
  source?: SimulationSource;
  agentScript?: string;
  tracking?: Partial<TrackingOptions>;
  metadata?: Record<string, unknown>;
};

export type SimulationFrameResult = {
  frameNumber: number;
  agents: Agent[];
  skipped: boolean;
};
