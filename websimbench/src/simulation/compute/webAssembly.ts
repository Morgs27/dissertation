import type { Agent, InputValues } from "../types.js";
import Logger from "../helpers/logger.js";
import wabt from "wabt";

export const compileWATtoWASM = async (watCode: string, logger: Logger): Promise<WebAssembly.Module> => {
  try {

    const wabtModule = await wabt();
    const parsed = wabtModule.parseWat("dsl_module.wat", watCode);
    const { buffer } = parsed.toBinary({ write_debug_names: true });
    return WebAssembly.compile(new Uint8Array(buffer));

  } catch (err) {

    logger.error("Failed to compile WAT to WASM:", err);
    throw err;

  }
};

const bytesPerAgent = 20; // 5 floats × 4 bytes
const f32PerAgent = bytesPerAgent / 4;
const basePtr = 0;
const baseF32 = basePtr >>> 2;

export type WASMComputeResult = {
  agents: Agent[];
  performance: {
    writeTime: number;
    computeTime: number;
    readTime: number;
  }
}

export class WebAssemblyCompute {
  private readonly Logger: Logger;
  private memory: WebAssembly.Memory | undefined = undefined;
  private f32: Float32Array | undefined = undefined;
  private exports: Record<string, any> | undefined = undefined;
  private readonly agentCount: number;
  private readonly watCode: string;

  constructor(watCode: string, agentCount: number) {
    this.Logger = new Logger("WebAssemblyCompute");
    this.Logger.log("Initializing WebAssemblyCompute with code:", watCode);
    this.agentCount = agentCount;
    this.watCode = watCode;
  }

  async init() {
    const wasmModule = await compileWATtoWASM(this.watCode, this.Logger);
    this.Logger.log("Compiled WAT to WASM module");

    // --- Dynamically compute memory size ---
    const bytesNeeded = this.agentCount * bytesPerAgent;
    const bytesPerPage = 64 * 1024; // 64 KiB
    // +1 safety page for globals / alignment
    const initialPages = Math.ceil(bytesNeeded / bytesPerPage) + 1;
    this.Logger.log("Initializing WebAssembly memory with", initialPages, "pages");

    this.memory = new WebAssembly.Memory({ initial: initialPages });

    const instance = new WebAssembly.Instance(wasmModule, {
      env: {
        memory: this.memory,
        sin: Math.sin,
        cos: Math.cos,
        atan2: Math.atan2,
        random: Math.random, // Fallback if we don't use internal RNG
        log: (x: number) => console.log('WASM Log:', x) // Debug helper
      }
    });

    this.exports = instance.exports as Record<string, any>;

    this.f32 = new Float32Array(this.memory.buffer);
  }

  compute(agents: Agent[], inputs: InputValues): WASMComputeResult {
    if (!this.exports) throw new Error("WebAssemblyCompute not initialized");

    const writeStart = performance.now();

    // Ensure memory size and view
    // Agents: agentCount * 20 bytes
    // TrailMap: width * height * 4 bytes if present
    const agentsEnd = this.agentCount * bytesPerAgent;
    let trailMapPtr = 0;
    let trailMapSize = 0;

    if (inputs.trailMap && inputs.width && inputs.height) {
      trailMapPtr = agentsEnd;
      // Align to 4 bytes (it is already)
      trailMapSize = ((inputs.width as number) * (inputs.height as number)) * 4;
    }

    let randomValuesSize = 0;
    if (inputs.randomValues) {
      randomValuesSize = this.agentCount * 4;
    }

    const totalBytesNeeded = agentsEnd + trailMapSize + randomValuesSize;
    const currentBytes = this.memory!.buffer.byteLength;

    if (totalBytesNeeded > currentBytes) {
      const pagesNeeded = Math.ceil((totalBytesNeeded - currentBytes) / (64 * 1024));
      if (pagesNeeded > 0) {
        this.memory!.grow(pagesNeeded);
        // Re-create views
        this.f32 = new Float32Array(this.memory!.buffer);
      }
    } else if (!this.f32 || this.f32.buffer.byteLength === 0) {
      // View might be detached or not created
      this.f32 = new Float32Array(this.memory!.buffer);
    }

    const f32 = this.f32!;

    // Write agents into memory
    for (let i = 0; i < agents.length; i++) {
      const o = baseF32 + i * f32PerAgent;
      const a = agents[i];
      f32[o] = a.id;
      f32[o + 1] = a.x;
      f32[o + 2] = a.y;
      f32[o + 3] = a.vx;
      f32[o + 4] = a.vy;
    }

    // Write trailMap if present
    if (inputs.trailMap && trailMapPtr > 0) {
      const src = inputs.trailMap as Float32Array;
      // Copy to f32 view
      // trailMapPtr is byte offset, f32 index is / 4
      f32.set(src, trailMapPtr >>> 2);

      // Update trailMapPtr global
      if (this.exports.trailMapPtr) {
        this.exports.trailMapPtr.value = trailMapPtr;
      }
      if (this.exports.trailMapPtr) {
        this.exports.trailMapPtr.value = trailMapPtr;
      }
      // console.log('WASM TrailMap Ptr:', trailMapPtr, 'Size:', trailMapSize);
    }

    // console.log('WASM Inputs:', Object.keys(inputs));

    // Update input globals
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== "number") continue;
      const g = this.exports[`inputs_${key}`];
      if (g instanceof WebAssembly.Global) g.value = value;
    }

    // Write randomValues if present
    let randomValuesPtr = 0;
    if (inputs.randomValues) {
      // Calculate offset after trailMap
      randomValuesPtr = agentsEnd;
      if (trailMapSize > 0) {
        randomValuesPtr += trailMapSize;
      }

      const src = inputs.randomValues as Float32Array;
      // Copy to f32 view
      f32.set(src, randomValuesPtr >>> 2);

      // Update randomValuesPtr global
      if (this.exports.randomValuesPtr) {
        this.exports.randomValuesPtr.value = randomValuesPtr;
      }
    }

    // Update agent count
    const agentCount = this.exports.agent_count;
    if (agentCount instanceof WebAssembly.Global) agentCount.value = agents.length;

    const writeEnd = performance.now();

    // Run kernel
    const computeStart = performance.now();
    const step_all = this.exports.step_all as (base: number, count: number) => void;
    step_all(basePtr, agents.length);
    const computeEnd = performance.now();

    // Read back results
    const readStart = performance.now();
    const resultAgents = agents.map((_, i) => {
      const o = baseF32 + i * f32PerAgent;
      const id = this.f32![o];
      const x = this.f32![o + 1];
      return {
        id: id,
        x: x,
        y: this.f32![o + 2],
        vx: this.f32![o + 3],
        vy: this.f32![o + 4],
      };
    });

    // Read back trailMap if needed (assuming changes)
    if (inputs.trailMap && trailMapPtr > 0) {
      const dest = inputs.trailMap as Float32Array;
      const srcSub = f32.subarray((trailMapPtr >>> 2), (trailMapPtr >>> 2) + dest.length);
      dest.set(srcSub);
    }

    const readEnd = performance.now();

    return {
      agents: resultAgents,
      performance: {
        writeTime: writeEnd - writeStart,
        computeTime: computeEnd - computeStart,
        readTime: readEnd - readStart
      }
    };
  }
}
