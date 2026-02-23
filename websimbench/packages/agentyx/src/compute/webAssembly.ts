/**
 * @module webAssembly
 * WebAssembly (WASM) compute backend.
 *
 * Compiles WAT source into a WASM module via `wabt`, manages linear memory
 * layout for agents, trail maps, random values, and obstacles, and executes
 * the compiled `step_all` export for each simulation frame.
 */

import type { Agent, InputValues } from "../types.js";
import Logger from "../helpers/logger.js";
import wabt from "wabt";

/** Cached `wabt` module promise (singleton). */
let wabtModulePromise: ReturnType<typeof wabt> | null = null;

const getWabtModule = async () => {
  if (!wabtModulePromise) {
    wabtModulePromise = wabt();
  }
  return wabtModulePromise;
};

/**
 * Compile a WAT text module into a WebAssembly binary module.
 *
 * @param watCode - WAT source string.
 * @param logger - Logger for error diagnostics.
 * @returns Compiled `WebAssembly.Module`.
 */
export const compileWATtoWASM = async (
  watCode: string,
  logger: Logger,
): Promise<WebAssembly.Module> => {
  try {
    const wabtModule = await getWabtModule();
    const parsed = wabtModule.parseWat("dsl_module.wat", watCode);

    try {
      const { buffer } = parsed.toBinary({ write_debug_names: true });
      return WebAssembly.compile(new Uint8Array(buffer));
    } finally {
      if (typeof parsed.destroy === "function") {
        parsed.destroy();
      }
    }
  } catch (err) {
    logger.error("Failed to compile WAT to WASM:", err);
    throw err;
  }
};

const bytesPerAgent = 24; // 6 floats × 4 bytes (id, x, y, vx, vy, species)
const f32PerAgent = bytesPerAgent / 4;
const basePtr = 0;
const baseF32 = basePtr >>> 2;
const wasmPageSize = 64 * 1024;

/** @internal WASM linear-memory layout for a single frame. */
type MemoryLayout = {
  agentsReadPtr: number;
  trailMapReadPtr: number;
  trailMapWritePtr: number;
  trailMapSize: number;
  randomValuesPtr: number;
  randomValuesSize: number;
  obstaclesPtr: number;
  obstaclesCount: number;
  totalBytesNeeded: number;
};

/** Result of a single WASM compute step with timing breakdown. */
export type WASMComputeResult = {
  agents: Agent[];
  performance: {
    writeTime: number;
    computeTime: number;
    readTime: number;
  };
};

/**
 * WebAssembly compute backend.
 *
 * Manages a WASM instance compiled from DSL-generated WAT code. Handles
 * memory layout, agent packing/unpacking, and the per-frame `step_all`
 * dispatch.
 */
export class WebAssemblyCompute {
  private readonly logger: Logger;
  private memory: WebAssembly.Memory | undefined = undefined;
  private f32: Float32Array | undefined = undefined;
  private exports: Record<string, unknown> | undefined = undefined;
  private stepAll: ((base: number, count: number) => void) | undefined =
    undefined;
  private readonly agentCount: number;
  private readonly watCode: string;

  constructor(watCode: string, agentCount: number) {
    this.logger = new Logger("WebAssemblyCompute");
    this.agentCount = agentCount;
    this.watCode = watCode;
  }

  /** Compile WAT, create WASM instance, and bind the `step_all` export. */
  async init() {
    const wasmModule = await compileWATtoWASM(this.watCode, this.logger);

    const bytesNeeded = this.agentCount * bytesPerAgent;
    const initialPages = Math.ceil(bytesNeeded / wasmPageSize) + 1;

    this.memory = new WebAssembly.Memory({ initial: initialPages });

    const instance = new WebAssembly.Instance(wasmModule, {
      env: {
        memory: this.memory,
        sin: Math.sin,
        cos: Math.cos,
        atan2: Math.atan2,
        random: Math.random,
        print: (id: number, val: number) =>
          this.logger.info(`AGENT[${id}] PRINT:`, val),
        log: (id: number, val: number) =>
          this.logger.info(`WASM Log[${id}]:`, val),
      },
    });

    this.exports = instance.exports as Record<string, unknown>;

    const stepAll = this.exports.step_all;
    if (typeof stepAll !== "function") {
      throw new Error("WASM export step_all is missing or not callable.");
    }
    this.stepAll = stepAll as (base: number, count: number) => void;

    this.f32 = new Float32Array(this.memory.buffer);
  }

  /**
   * Run a single compute step across all agents.
   *
   * @param agents - Current agent array.
   * @param inputs - Per-frame input values.
   * @returns Updated agents and timing metrics.
   */
  compute(agents: Agent[], inputs: InputValues): WASMComputeResult {
    if (!this.exports || !this.memory || !this.stepAll) {
      throw new Error("WebAssemblyCompute not initialized");
    }

    const writeStart = performance.now();

    const layout = this.computeLayout(inputs, agents.length);
    this.ensureMemoryCapacity(layout.totalBytesNeeded);

    const f32 = this.f32!;
    const packedAgents = this.packAgents(agents);

    f32.set(packedAgents, baseF32);
    f32.set(packedAgents, layout.agentsReadPtr >>> 2);

    this.setGlobal("agentsReadPtr", layout.agentsReadPtr);

    if (inputs.trailMapRead && layout.trailMapReadPtr > 0) {
      f32.set(
        inputs.trailMapRead as Float32Array,
        layout.trailMapReadPtr >>> 2,
      );
      this.setGlobal("trailMapReadPtr", layout.trailMapReadPtr);
    }

    if (inputs.trailMapWrite && layout.trailMapWritePtr > 0) {
      const writeStartIndex = layout.trailMapWritePtr >>> 2;
      const writeLength = (inputs.trailMapWrite as Float32Array).length;
      f32.fill(0, writeStartIndex, writeStartIndex + writeLength);
      this.setGlobal("trailMapWritePtr", layout.trailMapWritePtr);
    }

    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== "number") continue;
      this.setGlobal(`inputs_${key}`, value);
    }

    if (inputs.randomValues && layout.randomValuesPtr > 0) {
      f32.set(
        inputs.randomValues as Float32Array,
        layout.randomValuesPtr >>> 2,
      );
      this.setGlobal("randomValuesPtr", layout.randomValuesPtr);
    }

    if (layout.obstaclesCount > 0 && layout.obstaclesPtr > 0) {
      const obstacleArray = inputs.obstacles as Array<{
        x: number;
        y: number;
        w: number;
        h: number;
      }>;
      const obstacleData = new Float32Array(layout.obstaclesCount * 4);

      for (let i = 0; i < obstacleArray.length; i++) {
        const ob = obstacleArray[i];
        obstacleData[i * 4] = ob.x;
        obstacleData[i * 4 + 1] = ob.y;
        obstacleData[i * 4 + 2] = ob.w;
        obstacleData[i * 4 + 3] = ob.h;
      }

      f32.set(obstacleData, layout.obstaclesPtr >>> 2);
      this.setGlobal("obstaclesPtr", layout.obstaclesPtr);
      this.setGlobal("inputs_obstacleCount", layout.obstaclesCount);
    } else {
      this.setGlobal("inputs_obstacleCount", 0);
    }

    this.setGlobal("agent_count", agents.length);

    const writeEnd = performance.now();

    const computeStart = performance.now();
    this.stepAll(basePtr, agents.length);
    const computeEnd = performance.now();

    const readStart = performance.now();
    const resultAgents = this.unpackAgents(agents.length);

    if (inputs.trailMapWrite && layout.trailMapWritePtr > 0) {
      const destination = inputs.trailMapWrite as Float32Array;
      const readStartIndex = layout.trailMapWritePtr >>> 2;
      destination.set(
        this.f32!.subarray(readStartIndex, readStartIndex + destination.length),
      );
    }

    const readEnd = performance.now();

    return {
      agents: resultAgents,
      performance: {
        writeTime: writeEnd - writeStart,
        computeTime: computeEnd - computeStart,
        readTime: readEnd - readStart,
      },
    };
  }

  /** Release all WASM resources. */
  destroy() {
    this.stepAll = undefined;
    this.exports = undefined;
    this.f32 = undefined;
    this.memory = undefined;
  }

  private computeLayout(
    inputs: InputValues,
    activeAgentCount: number,
  ): MemoryLayout {
    const agentsWriteEnd = activeAgentCount * bytesPerAgent;
    const agentsReadPtr = agentsWriteEnd;
    const agentsReadEnd = agentsReadPtr + activeAgentCount * bytesPerAgent;

    let cursor = agentsReadEnd;

    let trailMapReadPtr = 0;
    let trailMapWritePtr = 0;
    let trailMapSize = 0;

    const width = typeof inputs.width === "number" ? inputs.width : 0;
    const height = typeof inputs.height === "number" ? inputs.height : 0;

    if (inputs.trailMapRead && width > 0 && height > 0) {
      trailMapSize = width * height * 4;
      trailMapReadPtr = cursor;
      trailMapWritePtr = cursor + trailMapSize;
      cursor += trailMapSize * 2;
    }

    const randomValuesSize =
      inputs.randomValues instanceof Float32Array
        ? inputs.randomValues.byteLength
        : 0;
    const randomValuesPtr = randomValuesSize > 0 ? cursor : 0;
    cursor += randomValuesSize;

    const obstacles = Array.isArray(inputs.obstacles)
      ? (inputs.obstacles as Array<{
          x: number;
          y: number;
          w: number;
          h: number;
        }>)
      : [];
    const obstaclesCount = obstacles.length;
    const obstaclesSize = obstaclesCount * 16;
    const obstaclesPtr = obstaclesSize > 0 ? cursor : 0;
    cursor += obstaclesSize;

    return {
      agentsReadPtr,
      trailMapReadPtr,
      trailMapWritePtr,
      trailMapSize,
      randomValuesPtr,
      randomValuesSize,
      obstaclesPtr,
      obstaclesCount,
      totalBytesNeeded: cursor,
    };
  }

  private ensureMemoryCapacity(totalBytesNeeded: number) {
    if (!this.memory) {
      throw new Error("WebAssembly memory is not initialized");
    }

    const currentBytes = this.memory.buffer.byteLength;

    if (totalBytesNeeded > currentBytes) {
      const pagesNeeded = Math.ceil(
        (totalBytesNeeded - currentBytes) / wasmPageSize,
      );
      if (pagesNeeded > 0) {
        this.memory.grow(pagesNeeded);
        this.f32 = new Float32Array(this.memory.buffer);
      }
      return;
    }

    if (!this.f32 || this.f32.buffer.byteLength === 0) {
      this.f32 = new Float32Array(this.memory.buffer);
    }
  }

  private packAgents(agents: Agent[]): Float32Array {
    const data = new Float32Array(agents.length * f32PerAgent);

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const o = i * f32PerAgent;

      data[o] = a.id;
      data[o + 1] = a.x;
      data[o + 2] = a.y;
      data[o + 3] = a.vx;
      data[o + 4] = a.vy;
      data[o + 5] = a.species || 0;
    }

    return data;
  }

  private unpackAgents(agentCount: number): Agent[] {
    const f32 = this.f32!;

    return Array.from({ length: agentCount }, (_, i) => {
      const o = baseF32 + i * f32PerAgent;
      return {
        id: f32[o],
        x: f32[o + 1],
        y: f32[o + 2],
        vx: f32[o + 3],
        vy: f32[o + 4],
        species: f32[o + 5],
      };
    });
  }

  private setGlobal(name: string, value: number) {
    const globalRef = this.exports?.[name];
    if (globalRef instanceof WebAssembly.Global) {
      globalRef.value = value;
    }
  }
}
