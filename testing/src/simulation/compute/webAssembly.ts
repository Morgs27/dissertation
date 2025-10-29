import Logger from "../logger.js";
import type { Agent, InputValues } from "../types.js";
import wabt from "wabt";

export class WebAssemblyCompute {
    private readonly Logger: Logger;
    private readonly wasmCode: string;

    constructor(wasmCode: string) {
        this.Logger = new Logger("WebAssemblyCompute");
        this.wasmCode = wasmCode;

        this.Logger.info("WebAssembly module initialized with code:", wasmCode);
    }

    async compute(agents: Agent[], inputs: InputValues): Promise<Agent[]> {
        this.Logger.info("Running computation using WebAssembly code.");

        // --- Step 1: Convert WAT → WASM binary ---
        const wabtModule = await wabt();
        let binary: Uint8Array;

        try {
            const parsed = wabtModule.parseWat("dsl_module.wat", this.wasmCode);
            const { buffer } = parsed.toBinary({
                log: false,
                write_debug_names: true,
            });
            binary = buffer;
        } catch (err) {
            this.Logger.error("Failed to convert WAT to WASM binary.", err);
            throw err;
        }

        // --- Step 2: Compile the binary ---
        let module: WebAssembly.Module;
        try {
            module = await WebAssembly.compile(binary as any);
        } catch (err) {
            this.Logger.error("Failed to compile WASM binary.", err);
            throw err;
        }

        // --- Step 3: Create memory and imports ---
        // Each page = 64 KB, compute required size dynamically
        const agentSizeFloats = 3; // id, x, y
        const bytesPerAgent = agentSizeFloats * 4; // 12 bytes
        const requiredBytes = agents.length * bytesPerAgent;
        const requiredPages = Math.ceil(requiredBytes / 65536) + 1; // +1 for safety

        this.Logger.info(
            `Allocating memory for ${agents.length} agents: ${requiredPages} pages (~${(
                (requiredPages * 65536) /
                1024 /
                1024
            ).toFixed(2)} MB)`
        );

        // ✅ dynamically allocate enough pages
        const memory = new WebAssembly.Memory({ initial: requiredPages });

        const importObject: WebAssembly.Imports = {
            env: { memory },
        };
        const instance = await WebAssembly.instantiate(module, importObject);
        const exports = instance.exports as {
            step: (ptr: number) => void;
            [key: string]: any;
        };

        // --- Step 4: Prepare typed view of shared memory ---
        const wasmBuffer = new Float32Array(memory.buffer);

        // --- Step 5: Write agents into memory ---
        // const agentSizeFloats = 3; // id, x, y
        // const bytesPerAgent = agentSizeFloats * 4; // 12 bytes
        const basePtr = 0;

        // Compute how many bytes we need
        // const requiredBytes = agents.length * bytesPerAgent;
        const availableBytes = memory.buffer.byteLength;

        if (requiredBytes > availableBytes) {
            throw new Error(
                `Not enough memory: need ${requiredBytes} bytes, have ${availableBytes}`
            );
        }

        // Write each agent (using float indexing)
        agents.forEach((agent, i) => {
            const offset = (basePtr / 4) + i * agentSizeFloats;
            wasmBuffer[offset + 0] = agent.id;
            wasmBuffer[offset + 1] = agent.x;
            wasmBuffer[offset + 2] = agent.y;
        });

        // --- Step 6: Set input globals ---
        for (const [key, value] of Object.entries(inputs)) {
            const globalName = `inputs_${key}`;
            if (globalName in exports) {
                const g = exports[globalName];
                if (g instanceof WebAssembly.Global) {
                    g.value = Number(value);
                }
            }
        }

        // --- Step 7: Run step() for each agent ---
        for (let i = 0; i < agents.length; i++) {
            const ptr = basePtr + i * bytesPerAgent; // byte pointer (i32)
            try {
                exports.step(ptr);
            } catch (err) {
                this.Logger.error(`Error at agent ${i} (ptr=${ptr}):`, err);
                throw err;
            }
        }

        // --- Step 8: Read results back ---
        const updatedAgents: Agent[] = agents.map((_, i) => {
            const offset = (basePtr / 4) + i * agentSizeFloats;
            return {
                id: wasmBuffer[offset + 0],
                x: wasmBuffer[offset + 1],
                y: wasmBuffer[offset + 2],
            };
        });

        this.Logger.info("Computation complete.", updatedAgents);
        return updatedAgents;
    }
}

export default WebAssemblyCompute;
