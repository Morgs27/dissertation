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

/**
 * Represents a parsed command with its name and argument
 */
export interface ParsedCommand {
    command: AVAILABLE_COMMANDS;
    argument: string;
}

export class Compiler {
    Logger: Logger;

    constructor() {
        this.Logger = new Logger('Compiler', 'orange');
    }

    /**
     * Preprocesses DSL code by removing comments and extracting input variables
     */
    private preprocessDSL(dsl: string): { lines: string[]; inputs: string[] } {
        const lines = dsl
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !COMMENT_CHARACTERS.some(c => l.startsWith(c)));

        const inputMatches = Array.from(dsl.matchAll(/inputs\.([a-zA-Z_]\w*)/g));
        const inputs = [...new Set(inputMatches.map(m => m[1]))];

        return { lines, inputs };
    }

    /**
     * Parses a single line of DSL code to extract command and argument
     * Returns null if the line is not a valid command
     */
    static parseCommandLine(line: string): ParsedCommand | null {
        // Check if line contains a function call pattern
        if (!line.includes('(') || !line.includes(')')) {
            return null;
        }

        // Find matching command
        const command = AVAILABLE_COMMANDS_LIST.find(cmd => line.startsWith(cmd + '('));
        if (!command) {
            return null;
        }

        // Extract argument between parentheses
        const argStart = line.indexOf('(') + 1;
        const argEnd = line.indexOf(')');
        const argument = line.substring(argStart, argEnd).trim();

        return { command, argument };
    }

    /**
     * Applies a command template by replacing {arg} placeholder
     */
    static applyCommandTemplate(template: string, argument: string): string {
        return template.replace('{arg}', argument);
    }

    /**
     * Parses multiple lines using a command map
     */
    static parseLines(lines: string[], commandMap: CommandMap): string[] {
        const statements: string[] = [];

        for (const line of lines) {
            const parsed = Compiler.parseCommandLine(line);
            if (parsed && commandMap[parsed.command]) {
                const statement = Compiler.applyCommandTemplate(
                    commandMap[parsed.command],
                    parsed.argument
                );
                statements.push(statement);
            }
        }

        return statements;
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
        this.Logger.code('Generated WASM Code', wasmCode, 'wasm');
        this.Logger.log('Expected Inputs', inputs);

        return {
            requiredInputs: inputs,
            wgslCode,
            jsCode,
            WASMCode: wasmCode,
        };
    }
}
