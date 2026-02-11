import Logger from "../helpers/logger";
import type { CompilationResult } from "../types";
import { compileDSLtoJS } from "./JScompiler";
import { compileDSLtoWAT } from "./WATcompiler";
import { compileDSLtoWGSL } from "./WGSLcompiler";
import { DSLParser, LineInfo, COMMENT_CHARACTERS } from "./parser";

// Removed types and constants moved to parser.ts

export class Compiler {
    Logger: Logger;

    constructor() {
        this.Logger = new Logger('Compiler', 'orange');
    }

    /**
     * Preprocesses DSL code by removing comments and extracting input variables
     */
    private preprocessDSL(dsl: string): { lines: LineInfo[]; inputs: string[]; definedInputs: any[]; trailEnvironmentConfig?: any; randomInputs: string[]; speciesCount?: number } {
        const lines: LineInfo[] = [];
        const definedInputs: any[] = [];
        const randomInputs: string[] = [];
        let speciesCount: number | undefined;
        const rawLines = dsl.split('\n');

        rawLines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.length === 0 || COMMENT_CHARACTERS.some(c => trimmed.startsWith(c))) {
                return;
            }

            // Parse input definition: input name = value; // [min, max]
            // Modified to also support: input name = random();
            const inputMatch = trimmed.match(/^\s*input\s+([a-zA-Z_]\w*)\s*=\s*(.+?)\s*;(.*)$/);
            if (inputMatch) {
                const name = inputMatch[1];
                const valuePart = inputMatch[2].trim();
                const comment = inputMatch[3];

                if (valuePart === 'random()') {
                    randomInputs.push(name);
                    return; // Don't include in definedInputs or lines
                }

                const defaultValue = parseFloat(valuePart);
                if (!isNaN(defaultValue)) {
                    let min = 0;
                    let max = 100;

                    // Try to parse range from comment
                    if (comment) {
                        const rangeMatch = comment.match(/\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]/);
                        if (rangeMatch) {
                            min = parseFloat(rangeMatch[1]);
                            max = parseFloat(rangeMatch[2]);
                        }
                    }

                    definedInputs.push({ name, defaultValue, min, max });
                    return; // Don't include input definition in executable lines (it's a declaration)
                }

                // If it wasn't a number or random(), treat as normal line? 
                // No, 'input' keyword implies declaration. If parsing fails, maybe log error?
                // For now fall through to lines.push if it doesn't match clean input pattern, 
                // but the regex forced input kw. 
            }

            lines.push({ content: line, lineIndex: index });
        });

        // Extract inputs from explicit inputs.* references
        const inputMatches = Array.from(dsl.matchAll(/inputs\.([a-zA-Z_]\w*)/g));
        // Only include inputs that are NOT in randomInputs
        const extractedInputs = new Set([
            ...inputMatches.map(m => m[1]),
            ...definedInputs.map(d => d.name)
        ].filter(name => !randomInputs.includes(name)));

        // Also extract inputs that are implicitly used by commands
        // For example, borderWrapping() uses inputs.width and inputs.height
        // sense and deposit require trailMap for reading/writing trail data
        const commandInputMap: Record<string, string[]> = {
            borderWrapping: ['width', 'height'],
            borderBounce: ['width', 'height'],
            sense: ['width', 'height'], // Removed trailMap implicit
            deposit: ['width', 'height'], // Removed trailMap implicit
            avoidObstacles: [],
        };

        for (const line of lines) {
            const parsed = DSLParser.parseCommandLine(line.content.trim());
            if (parsed && commandInputMap[parsed.command]) {
                commandInputMap[parsed.command].forEach(input => extractedInputs.add(input));
            }
        }

        const inputs = Array.from(extractedInputs);

        // Check for enableTrails command to extract config
        let trailEnvironmentConfig: { depositAmountInput?: string; decayFactorInput?: string } | undefined;

        for (const line of lines) {
            const parsed = DSLParser.parseCommandLine(line.content.trim());
            if (parsed && parsed.command === 'enableTrails') {
                // enableTrails(depositAmount, decayFactor)
                const args = parsed.argument.split(',').map(s => s.trim());
                trailEnvironmentConfig = {};

                // Check if args match inputs.Name pattern
                const depositMatch = args[0]?.match(/^inputs\.(\w+)$/);
                if (depositMatch) {
                    trailEnvironmentConfig.depositAmountInput = depositMatch[1];
                }

                const decayMatch = args[1]?.match(/^inputs\.(\w+)$/);
                if (decayMatch) {
                    trailEnvironmentConfig.decayFactorInput = decayMatch[1];
                }

                // Explicitly require trailMap input since trails are enabled
                if (!inputs.includes('trailMap')) {
                    inputs.push('trailMap');
                }
            }
        }

        // Check for species() command to extract species count
        for (const line of lines) {
            const parsed = DSLParser.parseCommandLine(line.content.trim());
            if (parsed && parsed.command === 'species') {
                const count = parseInt(parsed.argument, 10);
                if (!isNaN(count) && count > 0) {
                    speciesCount = count;
                }
            }
        }

        // Handle random syntax sugar dependency
        // If we have random inputs, we definitely need randomValues
        if ((inputs.includes('random') && !inputs.includes('randomValues')) || randomInputs.length > 0) {
            if (!inputs.includes('randomValues')) {
                inputs.push('randomValues');
            }
        }

        return { lines, inputs, definedInputs, trailEnvironmentConfig, randomInputs, speciesCount };
    }

    /**
     * Parses a single line of DSL code to identify its type and extract relevant information
     */
    // Removed static methods (parseDSLLine, parseCommandLine, applyCommandTemplate, parseLines)
    // They are now in DSLParser

    compileAgentCode(agentCode?: string): CompilationResult {
        const script = agentCode?.trim() ?? '';
        this.Logger.info('Compiling agent code');

        const { lines, inputs, definedInputs, trailEnvironmentConfig, randomInputs, speciesCount } = this.preprocessDSL(script);

        // Pass the original script to compilers for error context logging
        const jsCode = compileDSLtoJS(lines, inputs, this.Logger, script, randomInputs);
        const wgslCode = compileDSLtoWGSL(lines, inputs, this.Logger, script, randomInputs);
        const watCode = compileDSLtoWAT(lines, inputs, this.Logger, script, randomInputs);

        this.Logger.code('Generated JS Code', jsCode, 'js');
        this.Logger.code('Generated WGSL Code', wgslCode, 'wgsl');
        this.Logger.code('Generated WAT Code', watCode, 'wasm');
        this.Logger.log('Expected Inputs', inputs);
        this.Logger.log('Defined Inputs', definedInputs);

        return {
            requiredInputs: inputs,
            definedInputs,
            wgslCode,
            jsCode,
            WASMCode: watCode,
            trailEnvironmentConfig,
            speciesCount,
        };
    }
}
