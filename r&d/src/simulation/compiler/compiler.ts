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
    | 'moveRight'
    | 'addVelocityX'
    | 'addVelocityY'
    | 'setVelocityX'
    | 'setVelocityY'
    | 'updatePosition'
    | 'borderWrapping'
    | 'borderBounce'
    | 'limitSpeed';

export const AVAILABLE_COMMANDS_LIST: AVAILABLE_COMMANDS[] = [
    'moveUp',
    'moveDown',
    'moveLeft',
    'moveRight',
    'addVelocityX',
    'addVelocityY',
    'setVelocityX',
    'setVelocityY',
    'updatePosition',
    'borderWrapping',
    'borderBounce',
    'limitSpeed',
];

export type CommandMap = Record<AVAILABLE_COMMANDS, string>;

/**
 * Represents a parsed command with its name and argument
 */
export interface ParsedCommand {
    command: AVAILABLE_COMMANDS;
    argument: string;
}

/**
 * Parsed DSL line types
 */
export type ParsedLineType = 
    | { type: 'empty' | 'brace' }
    | { type: 'var'; name: string; expression: string }
    | { type: 'if'; condition: string }
    | { type: 'foreach'; collection: string; varName: string }
    | { type: 'for'; init: string; condition: string; increment: string }
    | { type: 'assignment'; target: string; expression: string }
    | { type: 'command'; command: AVAILABLE_COMMANDS; argument: string }
    | { type: 'unknown' };

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
            // Don't trim - we need indentation for block structure!
            // Just filter out completely empty lines and comments
            .filter(l => {
                const trimmed = l.trim();
                return trimmed.length > 0 && !COMMENT_CHARACTERS.some(c => trimmed.startsWith(c));
            });

        const inputMatches = Array.from(dsl.matchAll(/inputs\.([a-zA-Z_]\w*)/g));
        const inputs = [...new Set(inputMatches.map(m => m[1]))];

        return { lines, inputs };
    }

    /**
     * Parses a single line of DSL code to identify its type and extract relevant information
     */
    static parseDSLLine(line: string): ParsedLineType {
        const trimmed = line.trim();
        
        // Handle empty lines or just braces
        if (trimmed === '' || trimmed === '{' || trimmed === '}') {
            return { type: trimmed === '' ? 'empty' : 'brace' };
        }
        
        // Handle variable declarations: var name = expression;
        if (trimmed.startsWith('var ')) {
            const rest = trimmed.substring(4).trim().replace(/;$/, '');
            const eqIndex = rest.indexOf('=');
            if (eqIndex > 0) {
                const name = rest.substring(0, eqIndex).trim();
                const expression = rest.substring(eqIndex + 1).trim();
                return { type: 'var', name, expression };
            }
        }
        
        // Handle conditionals: if (condition) {
        if (trimmed.startsWith('if ')) {
            const match = trimmed.match(/if\s*\(([^)]+)\)\s*\{?/);
            if (match) {
                return { type: 'if', condition: match[1] };
            }
        }
        
    // Handle for loops: for (var i = 0; i < n; i++) {
    if (trimmed.startsWith('for ')) {
        const match = trimmed.match(/for\s*\(([^;]+);([^;]+);([^)]+)\)\s*\{?/);
        if (match) {
            return { 
                type: 'for', 
                init: match[1].trim(), 
                condition: match[2].trim(), 
                increment: match[3].trim() 
            };
        }
    }
    
    // Handle foreach loops: foreach (collection as item) {
    if (trimmed.startsWith('foreach ')) {
        const match = trimmed.match(/foreach\s*\(([^)]+)\s+as\s+(\w+)\)\s*\{?/);
        if (match) {
            return { type: 'foreach', collection: match[1].trim(), varName: match[2] };
        }
    }
        
        // Handle assignments (but not comparisons)
        if (trimmed.includes('=') && !trimmed.includes('==') && !trimmed.includes('!=') && !trimmed.includes('<=') && !trimmed.includes('>=')) {
            const cleaned = trimmed.replace(/;$/, '');
            
            // Check for compound assignment operators (+=, -=, *=, /=)
            const compoundMatch = cleaned.match(/^(\w+)\s*([\+\-\*\/])=\s*(.+)$/);
            if (compoundMatch) {
                const varName = compoundMatch[1];
                const op = compoundMatch[2];
                const rhs = compoundMatch[3];
                // Convert compound assignment to regular assignment
                // e.g., vx += expr becomes vx = vx + expr
                return { type: 'assignment', target: varName, expression: `${varName} ${op} ${rhs}` };
            }
            
            // Regular assignment
            const eqIndex = cleaned.indexOf('=');
            if (eqIndex > 0) {
                const target = cleaned.substring(0, eqIndex).trim();
                const expression = cleaned.substring(eqIndex + 1).trim();
                // Make sure it's not a var declaration (already handled above)
                if (!trimmed.startsWith('var ')) {
                    return { type: 'assignment', target, expression };
                }
            }
        }
        
        // Try to match as a command
        const parsed = Compiler.parseCommandLine(trimmed);
        if (parsed) {
            return { type: 'command', command: parsed.command, argument: parsed.argument };
        }
        
        return { type: 'unknown' };
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
        return template.replaceAll('{arg}', argument);
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

        const watCode = compileDSLtoWAT(lines, inputs, this.Logger);

        this.Logger.code('Generated JS Code', jsCode, 'js');
        this.Logger.code('Generated WGSL Code', wgslCode, 'wgsl');
        this.Logger.code('Generated WAT Code', watCode, 'wasm');
        this.Logger.log('Expected Inputs', inputs);

        return {
            requiredInputs: inputs,
            wgslCode,
            jsCode,
            WASMCode: watCode,
        };
    }
}
