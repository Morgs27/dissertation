/**
 * @module webAssembly
 * WebAssembly (WASM) compute backend.
 *
 * Compiles WAT source into a WASM module via `wabt`, manages linear memory
 * layout for agents, trail maps, random values, and obstacles, and executes
 * the compiled `step_all` export for each simulation frame.
 */

import type { Agent, InputValues, WasmExecutionMode } from "../types.js";
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
  options: { simd?: boolean } = {},
): Promise<WebAssembly.Module> => {
  try {
    const wabtModule = await getWabtModule();
    const parseWat = wabtModule.parseWat as (
      filename: string,
      source: string,
      features?: Record<string, boolean>,
    ) => {
      toBinary: (opts: { write_debug_names: boolean }) => {
        buffer: Uint8Array;
      };
      destroy?: () => void;
    };
    const parsed = parseWat("dsl_module.wat", watCode, {
      simd: options.simd === true,
    });

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
const SIMD_MEMCPY_EXPORT = "simd_memcpy";

const SIMD_WASM_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00,
  0x00, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x17, 0x01, 0x15, 0x00, 0xfd, 0x0c, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x1a, 0x0b,
]);

const SIMD_MEMCPY_WAT_HELPER = `
(func (export "simd_memcpy") (param $dst i32) (param $src i32) (param $bytes i32)
  (local $i i32)
  (local.set $i (i32.const 0))

  (block $simd_done
    (loop $simd_loop
      (br_if $simd_done (i32.gt_u (i32.add (local.get $i) (i32.const 16)) (local.get $bytes)))
      (v128.store
        (i32.add (local.get $dst) (local.get $i))
        (v128.load (i32.add (local.get $src) (local.get $i)))
      )
      (local.set $i (i32.add (local.get $i) (i32.const 16)))
      (br $simd_loop)
    )
  )

  (block $tail_done
    (loop $tail_loop
      (br_if $tail_done (i32.ge_u (local.get $i) (local.get $bytes)))
      (i32.store8
        (i32.add (local.get $dst) (local.get $i))
        (i32.load8_u (i32.add (local.get $src) (local.get $i)))
      )
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $tail_loop)
    )
  )
)
`;

export const supportsWasmSIMD = (): boolean => {
  if (typeof WebAssembly === "undefined") {
    return false;
  }

  if (typeof WebAssembly.validate !== "function") {
    return false;
  }

  try {
    const probe = new Uint8Array(SIMD_WASM_PROBE.byteLength);
    probe.set(SIMD_WASM_PROBE);
    return WebAssembly.validate(probe);
  } catch {
    return false;
  }
};

const withSimdMemcpyHelper = (watCode: string): string => {
  if (watCode.includes(`(export "${SIMD_MEMCPY_EXPORT}")`)) {
    return watCode;
  }

  const moduleEnd = watCode.lastIndexOf(")");
  if (moduleEnd === -1) {
    throw new Error(
      "Invalid WAT module: missing closing ')' for SIMD helper injection.",
    );
  }

  return `${watCode.slice(0, moduleEnd)}\n${SIMD_MEMCPY_WAT_HELPER}\n${watCode.slice(moduleEnd)}`;
};

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
    simdMemcpyTime: number;
  };
};

export type WebAssemblyComputeOptions = {
  executionMode?: WasmExecutionMode;
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
  private simdMemcpy:
    | ((dstPtr: number, srcPtr: number, byteLength: number) => void)
    | undefined = undefined;
  private readonly agentCount: number;
  private readonly watCode: string;
  private readonly requestedExecutionMode: WasmExecutionMode;
  private effectiveExecutionMode: "scalar" | "simd" = "scalar";
  private simdSupported = false;

  constructor(
    watCode: string,
    agentCount: number,
    options: WebAssemblyComputeOptions = {},
  ) {
    this.logger = new Logger("WebAssemblyCompute");
    this.agentCount = agentCount;
    this.watCode = watCode;
    this.requestedExecutionMode = options.executionMode ?? "auto";
  }

  /** Compile WAT, create WASM instance, and bind the `step_all` export. */
  async init() {
    this.simdSupported = supportsWasmSIMD();

    if (this.requestedExecutionMode === "simd" && !this.simdSupported) {
      throw new Error(
        "WASM SIMD execution mode requested, but this runtime does not support WebAssembly SIMD.",
      );
    }

    const prefersSimd =
      this.requestedExecutionMode === "simd" ||
      (this.requestedExecutionMode === "auto" && this.simdSupported);

    let effectiveMode: "scalar" | "simd" = prefersSimd ? "simd" : "scalar";
    let watToCompile =
      effectiveMode === "simd"
        ? withSimdMemcpyHelper(this.watCode)
        : this.watCode;
    let wasmModule: WebAssembly.Module;

    try {
      wasmModule = await compileWATtoWASM(watToCompile, this.logger, {
        simd: effectiveMode === "simd",
      });
    } catch (error) {
      if (effectiveMode === "simd" && this.requestedExecutionMode === "auto") {
        this.logger.warn(
          `SIMD WASM compile failed, falling back to scalar mode: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        effectiveMode = "scalar";
        watToCompile = this.watCode;
        wasmModule = await compileWATtoWASM(watToCompile, this.logger, {
          simd: false,
        });
      } else {
        throw error;
      }
    }

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

    const simdMemcpyExport = this.exports[SIMD_MEMCPY_EXPORT];
    if (effectiveMode === "simd") {
      if (typeof simdMemcpyExport !== "function") {
        if (this.requestedExecutionMode === "auto") {
          this.logger.warn(
            "SIMD memcpy export missing in WASM module; falling back to scalar mode.",
          );
          this.simdMemcpy = undefined;
          this.effectiveExecutionMode = "scalar";
        } else {
          throw new Error(
            "WASM SIMD mode requested, but SIMD memcpy export is unavailable.",
          );
        }
      } else {
        this.simdMemcpy = simdMemcpyExport as (
          dstPtr: number,
          srcPtr: number,
          byteLength: number,
        ) => void;
        this.effectiveExecutionMode = "simd";
      }
    } else {
      this.simdMemcpy = undefined;
      this.effectiveExecutionMode = "scalar";
    }

    this.f32 = new Float32Array(this.memory.buffer);
    this.logger.info(
      `Initialized in ${this.effectiveExecutionMode} mode (requested: ${this.requestedExecutionMode}, simdSupported: ${this.simdSupported}).`,
    );
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
    let simdMemcpyTime = 0;
    const packedByteLength = packedAgents.byteLength;

    if (
      this.effectiveExecutionMode === "simd" &&
      this.simdMemcpy &&
      layout.agentsReadPtr > 0 &&
      packedByteLength > 0
    ) {
      const simdCopyStart = performance.now();
      this.simdMemcpy(layout.agentsReadPtr, basePtr, packedByteLength);
      simdMemcpyTime = performance.now() - simdCopyStart;
    } else {
      f32.set(packedAgents, layout.agentsReadPtr >>> 2);
    }

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
        simdMemcpyTime,
      },
    };
  }

  /** Release all WASM resources. */
  destroy() {
    this.stepAll = undefined;
    this.simdMemcpy = undefined;
    this.exports = undefined;
    this.f32 = undefined;
    this.memory = undefined;
  }

  /**
   * Current linear-memory allocation size in bytes.
   *
   * Represents the active WebAssembly memory footprint for this backend.
   */
  getMemoryFootprintBytes(): number {
    return this.memory?.buffer.byteLength ?? 0;
  }

  /**
   * Execution mode metadata used for benchmark reporting.
   */
  getExecutionInfo(): {
    requestedMode: WasmExecutionMode;
    effectiveMode: "scalar" | "simd";
    simdSupported: boolean;
  } {
    return {
      requestedMode: this.requestedExecutionMode,
      effectiveMode: this.effectiveExecutionMode,
      simdSupported: this.simdSupported,
    };
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
