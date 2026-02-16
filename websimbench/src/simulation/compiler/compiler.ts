import Logger from "../helpers/logger";
import type { CompilationResult } from "../types";
import { compileDSLtoJS } from "./JScompiler";
import { compileDSLtoWAT } from "./WATcompiler";
import { compileDSLtoWGSL } from "./WGSLcompiler";
import { DSLParser, LineInfo } from "./parser";

interface DefinedInput {
    name: string;
    defaultValue: number;
    min: number;
    max: number;
}

interface TrailEnvironmentConfig {
    depositAmountInput?: string;
    decayFactorInput?: string;
}

interface PreprocessResult {
    lines: LineInfo[];
    inputs: string[];
    definedInputs: DefinedInput[];
    trailEnvironmentConfig?: TrailEnvironmentConfig;
    randomInputs: string[];
    speciesCount?: number;
}

const COMMAND_INPUT_DEPENDENCIES: Record<string, string[]> = {
    borderWrapping: ['width', 'height'],
    borderBounce: ['width', 'height'],
    sense: ['width', 'height'],
    deposit: ['width', 'height', 'trailMap'],
    avoidObstacles: [],
};

export class Compiler {
    private logger: Logger;

    constructor() {
        this.logger = new Logger('Compiler', 'orange');
    }

    compileAgentCode(agentCode?: string): CompilationResult {
        const script = agentCode?.trim() ?? '';
        this.logger.info('Compiling agent code');

        const preprocessed = this.preprocessDSL(script);
        const compiled = this.compileToAllTargets(preprocessed, script);

        this.logCompilationResults(compiled, preprocessed);

        return this.buildCompilationResult(preprocessed, compiled);
    }

    private preprocessDSL(dsl: string): PreprocessResult {
        const { lines, definedInputs, randomInputs } = this.parseLines(dsl);
        const inputs = this.extractInputs(dsl, lines, definedInputs, randomInputs);
        const trailEnvironmentConfig = this.extractTrailConfig(lines, inputs);
        const speciesCount = this.extractSpeciesCount(lines);

        this.ensureRandomValuesDependency(inputs, randomInputs);

        return { lines, inputs, definedInputs, trailEnvironmentConfig, randomInputs, speciesCount };
    }

    private parseLines(dsl: string): {
        lines: LineInfo[];
        definedInputs: DefinedInput[];
        randomInputs: string[];
    } {
        const lines: LineInfo[] = [];
        const definedInputs: DefinedInput[] = [];
        const randomInputs: string[] = [];

        dsl.split('\n').forEach((line, index) => {
            const trimmed = this.stripComments(line);
            const inputResult = this.parseInputDeclaration(trimmed);

            if (inputResult) {
                if (inputResult.isRandom) {
                    randomInputs.push(inputResult.name);
                } else if (inputResult.defined) {
                    definedInputs.push(inputResult.defined);
                }
                return;
            }

            this.splitStatements(trimmed).forEach(stmt => {
                lines.push({ content: stmt, lineIndex: index });
            });
        });

        return { lines, definedInputs, randomInputs };
    }

    private stripComments(line: string): string {
        return line.split('//')[0].split('#')[0].trim();
    }

    private parseInputDeclaration(line: string): {
        name: string;
        isRandom: boolean;
        defined?: DefinedInput;
    } | null {
        const match = line.match(/^\s*input\s+([a-zA-Z_]\w*)\s*=\s*(.+?)\s*;?\s*$/);
        if (!match) return null;

        const name = match[1];
        let valuePart = match[2].trim();

        if (valuePart === 'random()') {
            return { name, isRandom: true };
        }

        const { value, min, max } = this.parseValueWithRange(valuePart);
        const defaultValue = parseFloat(value);

        if (isNaN(defaultValue)) return null;

        return {
            name,
            isRandom: false,
            defined: { name, defaultValue, min, max }
        };
    }

    private parseValueWithRange(valuePart: string): { value: string; min: number; max: number } {
        const rangeMatch = valuePart.match(/^(.+?)\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\s*$/);
        if (rangeMatch) {
            return {
                value: rangeMatch[1].trim(),
                min: parseFloat(rangeMatch[2]),
                max: parseFloat(rangeMatch[3])
            };
        }
        return { value: valuePart, min: 0, max: 100 };
    }

    private splitStatements(line: string): string[] {
        return line.split(';').map(s => s.trim()).filter(s => s.length > 0);
    }

    private extractInputs(
        dsl: string,
        lines: LineInfo[],
        definedInputs: DefinedInput[],
        randomInputs: string[]
    ): string[] {
        const explicitInputs = Array.from(dsl.matchAll(/inputs\.([a-zA-Z_]\w*)/g)).map(m => m[1]);
        const definedNames = definedInputs.map(d => d.name);

        const inputs = new Set(
            [...explicitInputs, ...definedNames].filter(name => !randomInputs.includes(name))
        );

        this.addCommandDependencies(lines, inputs);

        return Array.from(inputs);
    }

    private addCommandDependencies(lines: LineInfo[], inputs: Set<string>): void {
        for (const line of lines) {
            const parsed = DSLParser.parseCommandLine(line.content.trim());
            if (parsed && COMMAND_INPUT_DEPENDENCIES[parsed.command]) {
                COMMAND_INPUT_DEPENDENCIES[parsed.command].forEach(input => inputs.add(input));
            }
        }
    }

    private extractTrailConfig(lines: LineInfo[], inputs: string[]): TrailEnvironmentConfig | undefined {
        for (const line of lines) {
            const parsed = DSLParser.parseCommandLine(line.content.trim());
            if (parsed?.command !== 'enableTrails') continue;

            const args = parsed.argument.split(',').map(s => s.trim());
            const config: TrailEnvironmentConfig = {};

            const depositMatch = args[0]?.match(/^inputs\.(\w+)$/);
            if (depositMatch) config.depositAmountInput = depositMatch[1];

            const decayMatch = args[1]?.match(/^inputs\.(\w+)$/);
            if (decayMatch) config.decayFactorInput = decayMatch[1];

            if (!inputs.includes('trailMap')) {
                inputs.push('trailMap');
            }

            return config;
        }
        return undefined;
    }

    private extractSpeciesCount(lines: LineInfo[]): number | undefined {
        for (const line of lines) {
            const parsed = DSLParser.parseCommandLine(line.content.trim());
            if (parsed?.command === 'species') {
                const count = parseInt(parsed.argument, 10);
                if (!isNaN(count) && count > 0) return count;
            }
        }
        return undefined;
    }

    private ensureRandomValuesDependency(inputs: string[], randomInputs: string[]): void {
        const needsRandomValues = inputs.includes('random') || randomInputs.length > 0;
        if (needsRandomValues && !inputs.includes('randomValues')) {
            inputs.push('randomValues');
        }
    }

    private compileToAllTargets(
        preprocessed: PreprocessResult,
        script: string
    ): { jsCode: string; wgslCode: string; watCode: string } {
        const { lines, inputs, randomInputs } = preprocessed;

        return {
            jsCode: compileDSLtoJS(lines, inputs, this.logger, script, randomInputs),
            wgslCode: compileDSLtoWGSL(lines, inputs, this.logger, script, randomInputs),
            watCode: compileDSLtoWAT(lines, inputs, this.logger, script, randomInputs),
        };
    }

    private logCompilationResults(
        compiled: { jsCode: string; wgslCode: string; watCode: string },
        preprocessed: PreprocessResult
    ): void {
        this.logger.code('Generated JS Code', compiled.jsCode, 'js');
        this.logger.code('Generated WGSL Code', compiled.wgslCode, 'wgsl');
        this.logger.code('Generated WAT Code', compiled.watCode, 'wasm');
        this.logger.log('Expected Inputs', preprocessed.inputs);
        this.logger.log('Defined Inputs', preprocessed.definedInputs);
    }

    private buildCompilationResult(
        preprocessed: PreprocessResult,
        compiled: { jsCode: string; wgslCode: string; watCode: string }
    ): CompilationResult {
        return {
            requiredInputs: preprocessed.inputs,
            definedInputs: preprocessed.definedInputs,
            wgslCode: compiled.wgslCode,
            jsCode: compiled.jsCode,
            WASMCode: compiled.watCode,
            trailEnvironmentConfig: preprocessed.trailEnvironmentConfig,
            speciesCount: preprocessed.speciesCount,
        };
    }
}
