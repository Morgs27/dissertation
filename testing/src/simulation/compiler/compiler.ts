import Logger from "../logger";
import type { CompilationResult } from "../types";
import { compileDSLtoWGSL } from "./WGSLcompiler";
import { compileDSLTtoJS } from "./JScompiler";

export class Compiler {
    Logger: Logger;

    constructor() {
        this.Logger = new Logger('Compiler');
    }

    compileAgentCode(agentCode?: string): CompilationResult {
        const script = agentCode?.trim() ?? '';

        this.Logger.info('Compiling agent code: \n      ', script);

        const [jsCode, jsInputsExpected] = compileDSLTtoJS(script, this.Logger);
        const [wgslCode, wgslInputsExpected] = compileDSLtoWGSL(script, this.Logger);

        this.Logger.info('Generated WGSL Code: \n      ', wgslCode);
        this.Logger.info('Generated JS Code: \n      ', jsCode);
        this.Logger.info('Expected Inputs: \n      ', wgslInputsExpected);
        this.Logger.info('Expected Inputs: \n      ', jsInputsExpected);

        return {
            requiredInputs: wgslInputsExpected,
            wgslCode,
            jsCode,
            WASMCode: '// WASM code generation not implemented yet.',
        };
    }
}
