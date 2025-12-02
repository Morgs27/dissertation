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
    
    const instance = new WebAssembly.Instance(wasmModule, { env: { memory: this.memory } });

    this.exports = instance.exports as Record<string, any>;

    this.f32 = new Float32Array(this.memory.buffer);
  }

  compute(agents: Agent[], inputs: InputValues): WASMComputeResult {
    if (!this.exports || !this.f32) throw new Error("WebAssemblyCompute not initialized");

    const writeStart = performance.now();
    const f32 = this.f32;

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

    // Update input globals
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== "number") continue;
      const g = this.exports[`inputs_${key}`];
      if (g instanceof WebAssembly.Global) g.value = value;
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
      return {
        id: f32[o],
        x: f32[o + 1],
        y: f32[o + 2],
        vx: f32[o + 3],
        vy: f32[o + 4],
      };
    });
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
