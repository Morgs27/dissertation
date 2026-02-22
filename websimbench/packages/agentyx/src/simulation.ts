import { Compiler } from './compiler/compiler';
import { ComputeEngine } from './compute/compute';
import Logger from './helpers/logger';
import { PerformanceMonitor } from './performance';
import { Renderer } from './renderer';
import { SimulationTracker, type SimulationTrackingFilter, type SimulationTrackingReport } from './tracking';
import type {
  Agent,
  CompilationResult,
  CustomCodeSource,
  InputValues,
  Method,
  Obstacle,
  RenderMode,
  SimulationAppearance,
  SimulationConstructor,
  SimulationFrameResult,
  SimulationSource,
} from './types';
import GPU from './helpers/gpu';

export const MAX_AGENTS = 10_000_000;

const DEFAULT_CANVAS_WIDTH = 600;
const DEFAULT_CANVAS_HEIGHT = 600;

const DEFAULT_APPEARANCE: SimulationAppearance = {
  agentColor: '#00FFFF',
  backgroundColor: '#000000',
  agentSize: 3,
  agentShape: 'circle',
  showTrails: true,
  trailOpacity: 1,
  trailColor: '#50FFFF',
  speciesColors: ['#00FFFF'],
  obstacleColor: '#FF0000',
  obstacleBorderColor: '#FF0000',
  obstacleOpacity: 0.2,
};

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const normalizeSource = (config: SimulationConstructor): SimulationSource => {
  if (config.source) {
    return config.source;
  }

  return {
    kind: 'dsl',
    code: config.agentScript ?? '',
  };
};

const compileFromCustomSource = (source: CustomCodeSource): CompilationResult => {
  const jsCode =
    typeof source.js === 'function'
      ? source.js.toString()
      : source.js ?? '';

  return {
    requiredInputs: source.requiredInputs ? [...source.requiredInputs] : [],
    definedInputs: source.definedInputs ? source.definedInputs.map((input) => ({ ...input })) : [],
    wgslCode: source.wgsl ?? '',
    jsCode,
    WASMCode: source.wasmWat ?? '',
    speciesCount: source.speciesCount,
    numRandomCalls: source.numRandomCalls ?? 0,
  };
};

const methodRequiresCode = (
  method: Method,
  compilationResult: CompilationResult
): { available: boolean; reason?: string } => {
  if ((method === 'JavaScript' || method === 'WebWorkers') && !compilationResult.jsCode.trim()) {
    return {
      available: false,
      reason: `Method ${method} requested but no JavaScript code is available for the simulation source.`,
    };
  }

  if (method === 'WebAssembly' && !compilationResult.WASMCode.trim()) {
    return {
      available: false,
      reason: 'Method WebAssembly requested but no WAT/WASM code is available for the simulation source.',
    };
  }

  if (method === 'WebGPU' && !compilationResult.wgslCode.trim()) {
    return {
      available: false,
      reason: 'Method WebGPU requested but no WGSL code is available for the simulation source.',
    };
  }

  return { available: true };
};

export class Simulation {
  private readonly logger = new Logger('Simulation', 'blue');
  private readonly performanceMonitor: PerformanceMonitor;
  private readonly compiler: Compiler;
  private readonly computeEngine: ComputeEngine;
  private readonly source: SimulationSource;
  private readonly tracker: SimulationTracker;

  private renderer: Renderer | null = null;
  private width: number;
  private height: number;
  private frameInProgress = false;
  private frameNumber = 0;

  private frameInputs: InputValues = {};
  private obstacles: Obstacle[] = [];
  private appearance: SimulationAppearance;

  public agents: Agent[] = [];
  public compilationResult: CompilationResult | null = null;
  public trailMap: Float32Array | null = null;
  public randomValues: Float32Array | null = null;

  constructor(config: SimulationConstructor) {
    const { options } = config;

    if (!Number.isFinite(options.agents) || options.agents < 1) {
      throw new Error('Simulation option "agents" must be a positive integer.');
    }

    if (options.agents > MAX_AGENTS) {
      const message = `Number of agents exceeds maximum limit of ${MAX_AGENTS}.`;
      this.logger.error(message);
      throw new Error(message);
    }

    this.width = config.canvas?.width ?? options.width ?? DEFAULT_CANVAS_WIDTH;
    this.height = config.canvas?.height ?? options.height ?? DEFAULT_CANVAS_HEIGHT;

    this.appearance = {
      ...DEFAULT_APPEARANCE,
      ...(config.appearance ?? {}),
    };

    this.performanceMonitor = new PerformanceMonitor();
    this.compiler = new Compiler();

    this.source = normalizeSource(config);

    const compilationResult =
      this.source.kind === 'dsl'
        ? this.compiler.compileAgentCode(this.source.code)
        : compileFromCustomSource(this.source.code);

    this.compilationResult = compilationResult;

    this.computeEngine = new ComputeEngine(compilationResult, this.performanceMonitor, options.agents, options.workers);

    if (config.canvas) {
      this.renderer = new Renderer(config.canvas, config.gpuCanvas ?? null, this.appearance);
      this.width = config.canvas.width;
      this.height = config.canvas.height;
    }

    this.agents = this.createInitialAgents(options.agents, compilationResult.speciesCount ?? 1, options.seed);

    this.tracker = new SimulationTracker({
      source: this.source,
      options,
      appearance: this.appearance,
      compilationResult,
      tracking: config.tracking,
      metadata: config.metadata,
    });

    void this.tracker.collectEnvironmentMetrics();
  }

  private createInitialAgents(count: number, speciesCount: number, seed?: number): Agent[] {
    const random = typeof seed === 'number' ? createSeededRandom(seed) : Math.random;

    return Array.from({ length: count }, (_, index) => ({
      id: index,
      x: random() * this.width,
      y: random() * this.height,
      vx: (random() - 0.5) * 2,
      vy: (random() - 0.5) * 2,
      species: index % Math.max(speciesCount, 1),
    }));
  }

  private ensureTrailMap(width: number, height: number): void {
    const expectedLength = width * height;
    if (!this.trailMap || this.trailMap.length !== expectedLength) {
      this.trailMap = new Float32Array(expectedLength);
    }
  }

  private populateRandomValues(requiredCalls: number): void {
    if (requiredCalls <= 0) {
      return;
    }

    const totalRandomValues = this.agents.length * requiredCalls;

    if (!this.randomValues || this.randomValues.length !== totalRandomValues) {
      this.randomValues = new Float32Array(totalRandomValues);
    }

    for (let i = 0; i < totalRandomValues; i++) {
      this.randomValues[i] = Math.random();
    }
  }

  private resolveDimensions(): { width: number; height: number } {
    if (this.renderer) {
      this.width = this.renderer.canvas.width;
      this.height = this.renderer.canvas.height;
    }

    return { width: this.width, height: this.height };
  }

  private buildInputs(frameInputValues: InputValues): InputValues {
    if (!this.compilationResult) {
      throw new Error('Simulation compilation result is unavailable.');
    }

    const { width, height } = this.resolveDimensions();
    const needsTrailMap = this.compilationResult.requiredInputs.includes('trailMap');
    const needsRandomValues = this.compilationResult.requiredInputs.includes('randomValues');

    if (needsTrailMap) {
      this.ensureTrailMap(width, height);
    } else {
      this.trailMap = null;
    }

    if (needsRandomValues) {
      this.populateRandomValues(this.compilationResult.numRandomCalls ?? 0);
    } else {
      this.randomValues = null;
    }

    const mergedInputs: InputValues = {
      width,
      height,
      agents: this.agents,
      ...this.frameInputs,
      ...frameInputValues,
    };

    if (needsTrailMap && this.trailMap) {
      mergedInputs.trailMap = this.trailMap;
    }

    if (needsRandomValues && this.randomValues) {
      mergedInputs.randomValues = this.randomValues;
    }

    const needsObstacles = this.compilationResult.requiredInputs.includes('obstacles');
    if (needsObstacles) {
      mergedInputs.obstacles = (mergedInputs.obstacles as Obstacle[] | undefined) ?? this.obstacles;
      mergedInputs.obstacleCount = (mergedInputs.obstacles as Obstacle[]).length;
    }

    this.compilationResult.definedInputs.forEach((input) => {
      if (!(input.name in mergedInputs)) {
        mergedInputs[input.name] = input.defaultValue;
      }
    });

    const missingInputs = this.compilationResult.requiredInputs.filter((name) => !(name in mergedInputs));
    if (missingInputs.length > 0) {
      const message = `Missing required input values: ${missingInputs.join(', ')}`;
      this.logger.error(message);
      throw new Error(message);
    }

    return mergedInputs;
  }

  public async initGPU(): Promise<void> {
    const gpuHelper = new GPU('SimulationGPU');
    const gpuDevice = (await gpuHelper.getDevice()) as GPUDevice;

    this.computeEngine.initGPU(gpuDevice);

    if (this.renderer) {
      this.renderer.initGPU(gpuDevice);
    }
  }

  public updateAppearance(nextAppearance: Partial<SimulationAppearance>): void {
    this.appearance = {
      ...this.appearance,
      ...nextAppearance,
    };

    if (this.renderer) {
      this.renderer.setAppearance(this.appearance);
    }
  }

  public setInputs(nextInputs: InputValues): void {
    this.frameInputs = {
      ...this.frameInputs,
      ...nextInputs,
    };
  }

  public setObstacles(obstacles: Obstacle[]): void {
    this.obstacles = [...obstacles];
    this.frameInputs.obstacles = this.obstacles;
  }

  public setCanvasDimensions(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.trailMap && this.trailMap.length !== width * height) {
      this.trailMap = new Float32Array(width * height);
    }
  }

  public async runFrame(
    method: Method,
    inputValues: InputValues = {},
    renderMode: RenderMode = 'cpu'
  ): Promise<SimulationFrameResult> {
    if (!this.compilationResult) {
      throw new Error('Simulation cannot run without compilation results.');
    }

    if (this.frameInProgress) {
      this.performanceMonitor.logMissingFrame();
      return {
        frameNumber: this.frameNumber,
        agents: this.agents,
        skipped: true,
      };
    }

    const availability = methodRequiresCode(method, this.compilationResult);
    if (!availability.available) {
      throw new Error(availability.reason);
    }

    if ((renderMode === 'cpu' || renderMode === 'gpu') && !this.renderer) {
      throw new Error(
        `Render mode "${renderMode}" requires a canvas renderer. Use render mode "none" for headless execution.`
      );
    }

    const forceReadbackForTracking =
      method === 'WebGPU' && renderMode === 'gpu' && this.tracker.capturesAgentStates();
    const computeRenderMode = renderMode === 'gpu' && !forceReadbackForTracking ? 'gpu' : 'cpu';
    const mergedInputs = this.buildInputs(inputValues);

    this.frameInProgress = true;

    try {
      const nextAgents = await this.computeEngine.runFrame(
        method,
        this.agents,
        mergedInputs,
        computeRenderMode
      );

      this.agents = nextAgents;

      let renderTime = 0;

      if (renderMode !== 'none' && this.renderer) {
        const renderStart = performance.now();

        if (renderMode === 'gpu') {
          await this.renderer.renderAgentsGPU(nextAgents, this.computeEngine.gpuRenderState, this.trailMap ?? undefined);
        } else {
          this.renderer.renderBackground();
          if (this.trailMap && this.renderer.getAppearance().showTrails) {
            this.renderer.renderTrails(this.trailMap, this.renderer.canvas.width, this.renderer.canvas.height);
          }
          this.renderer.renderAgents(nextAgents);
        }

        renderTime = performance.now() - renderStart;
      }

      const frames = this.performanceMonitor.frames;
      const lastFrame = frames.length > 0 ? frames[frames.length - 1] : undefined;

      if (lastFrame) {
        lastFrame.renderTime = renderTime;
        lastFrame.totalExecutionTime += renderTime;
      }

      const currentFrameNumber = this.frameNumber;
      this.frameNumber += 1;

      this.tracker.recordFrame({
        frameNumber: currentFrameNumber,
        method,
        renderMode,
        agents: nextAgents,
        inputs: mergedInputs,
        performance: lastFrame,
      });

      return {
        frameNumber: currentFrameNumber,
        agents: nextAgents,
        skipped: false,
      };
    } catch (error) {
      this.tracker.recordError(error);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to run simulation frame: ${message}`);
      throw error;
    } finally {
      this.frameInProgress = false;
    }
  }

  public getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  public getTrackingReport(filter?: SimulationTrackingFilter): SimulationTrackingReport {
    return this.tracker.getReport(filter);
  }

  public exportTrackingReport(filter?: SimulationTrackingFilter): string {
    return JSON.stringify(this.getTrackingReport(filter), null, 2);
  }

  public destroy(): void {
    this.tracker.complete();
    this.tracker.dispose();
    this.computeEngine.destroy();
    this.agents = [];
    this.trailMap = null;
    this.randomValues = null;
  }
}

export default Simulation;
