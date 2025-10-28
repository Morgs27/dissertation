import Logger from "../logger";
import type { CompiledAgentCode } from "../types";
import { compileDSLTtoJS } from "./JScompiler";

export class Compiler {
    Logger: Logger;

    constructor() {
        this.Logger = new Logger('Compiler');
    }

    compileAgentCode(agentCode?: string): CompiledAgentCode {
        const script = agentCode?.trim() ?? '';

        this.Logger.log('Compiling agent code: \n      ', script);

        const jsCode = compileDSLTtoJS(script, this.Logger) ?? '';

        console.warn(jsCode)

        return {
            glslCode: '// GLSL code generation not implemented yet.',
            jsCode,
            WASMCode: '// WASM code generation not implemented yet.',
        };
    }
}
