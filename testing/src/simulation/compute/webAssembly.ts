import Logger from "../helpers/logger.js";
import type { Agent, InputValues } from "../types.js";
import wabt from "wabt";

export class WebAssemblyCompute {
  private readonly Logger: Logger;
  private readonly wasmCode: string;

  constructor(wasmCode: string) {
    this.Logger = new Logger("WebAssemblyCompute");
    this.wasmCode = wasmCode;
  }

  async compute(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
    // 1) WAT -> WASM
    const wabtModule = await wabt();
    const parsed = wabtModule.parseWat("dsl_module.wat", this.wasmCode);
    const { buffer } = parsed.toBinary({ log: false, write_debug_names: true });

    // 2) Compile
    const module = await WebAssembly.compile(buffer as any);

    // 3) Memory sized for agents (12 bytes each), +1 page headroom
    const bytesPerAgent = 12;
    const requiredBytes = agents.length * bytesPerAgent;
    const requiredPages = Math.ceil(requiredBytes / 65536) + 1;
    const memory = new WebAssembly.Memory({ initial: requiredPages });

    // 4) Instantiate with shared memory
    const instance = await WebAssembly.instantiate(module, { env: { memory } });
    const exports = instance.exports as {
      step_all: (base: number, count: number) => void;
      step?: (ptr: number) => void;
      [k: string]: any;
    };

    const f32 = new Float32Array(memory.buffer);

    // 5) Write agents
    const basePtr = 0; // byte address
    const baseF32 = basePtr >>> 2;
    for (let i = 0; i < agents.length; i++) {
      const o = baseF32 + i * 3; // 3 floats per agent
      const a = agents[i];
      f32[o + 0] = a.id;
      f32[o + 1] = a.x;
      f32[o + 2] = a.y;
    }

    // 6) Set inputs (mutable globals exported by name)
    for (const [key, value] of Object.entries(inputs)) {
      const g = (exports as any)[`inputs_${key}`];
      if (g instanceof WebAssembly.Global) g.value = Number(value);
    }

    // 7) Batch compute in WASM (single call)
    exports.step_all(basePtr, agents.length);

    // 8) Read back
    const out: Agent[] = new Array(agents.length);
    for (let i = 0; i < agents.length; i++) {
      const o = baseF32 + i * 3;
      out[i] = { id: f32[o + 0], x: f32[o + 1], y: f32[o + 2] };
    }

    return out;
  }
}

export default WebAssemblyCompute;
