import Logger from "./logger";
import type { CompiledAgentCode } from "./types";

export class Compiler {
    Logger: Logger;

    constructor() {
        this.Logger = new Logger('Compiler');
    }
    
    compileAgentCode(agentCode?: string): CompiledAgentCode{
        this.Logger.log('Compiling agent code:', agentCode);

        return {
            glslCode: `// GLSL code for ${agentCode}`,
            jsCode: `// JavaScript code for ${agentCode}`,
            WASMCode: `// WASM code for ${agentCode}`,
        };
    }
}