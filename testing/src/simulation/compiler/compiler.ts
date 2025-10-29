import Logger from "../helpers/logger";
import type { CompilationResult } from "../types";
import { compileDSLtoJS } from "./JScompiler";
import { compileDSLtoWAT } from "./WATcompiler";
import { compileDSLtoWGSL } from "./WGSLcompiler";

export const COMMENT_CHARACTERS = ['//', '#'];

export type AVAILABLE_COMMANDS =
    | 'moveUp'
    | 'moveDown'
    | 'moveLeft'
    | 'moveRight';

export const AVAILABLE_COMMANDS_LIST: AVAILABLE_COMMANDS[] = [
    'moveUp',
    'moveDown',
    'moveLeft',
    'moveRight',
];

export type CommandMap = Record<AVAILABLE_COMMANDS, string>;


export class Compiler {
    Logger: Logger;

    constructor() {
        this.Logger = new Logger('Compiler');
    }

    private preprocessDSL(dsl: string): { lines: string[]; inputs: string[] } {
        const lines = dsl
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !COMMENT_CHARACTERS.some(c => l.startsWith(c)));

        const inputMatches = Array.from(dsl.matchAll(/inputs\.([a-zA-Z_]\w*)/g));
        const inputs = [...new Set(inputMatches.map(m => m[1]))];

        return { lines, inputs };
    }

    compileAgentCode(agentCode?: string): CompilationResult {
        const script = agentCode?.trim() ?? '';
        this.Logger.info('Compiling agent code: \n      ', script);

        const { lines, inputs } = this.preprocessDSL(script);

        const jsCode = compileDSLtoJS(lines, inputs, this.Logger);
        const wgslCode = compileDSLtoWGSL(lines, inputs, this.Logger);
        const wasmCode = compileDSLtoWAT(lines, inputs, this.Logger);

        this.Logger.code('Generated JS Code', jsCode, 'js');
        this.Logger.code('Generated WGSL Code', wgslCode, 'wgsl');
        this.Logger.code('Generated WASM Code', wasmCode, 'wgsl');
        this.Logger.log('Expected Inputs', inputs);

        return {
            requiredInputs: inputs,
            wgslCode,
            jsCode,
            WASMCode: wasmCode,
        };
    }
}
