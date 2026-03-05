/**
 * @module compiler
 * DSL-to-multi-target compiler orchestrator.
 *
 * The {@link Compiler} class takes Agentyx DSL source code and produces
 * compiled output for all three supported compute backends (JavaScript,
 * WGSL, and WAT) in a single pass. It handles preprocessing (input
 * extraction, trail configuration, species detection) before delegating
 * to the individual backend compilers.
 */

import Logger from "../helpers/logger";
import type { CompilationResult } from "../types";
import { compileDSLtoJS } from "./JScompiler";
import { compileDSLtoWAT } from "./WATcompiler";
import { compileDSLtoWGSL } from "./WGSLcompiler";
import { DSLParser, LineInfo } from "./parser";

/** @internal Metadata for a user-defined input declaration. */
interface DefinedInput {
  name: string;
  defaultValue: number;
  min: number;
  max: number;
}

/** @internal Trail environment configuration extracted from DSL. */
interface TrailEnvironmentConfig {
  depositAmountInput?: string;
  decayFactorInput?: string;
}

/** @internal Result of the DSL preprocessing phase. */
interface PreprocessResult {
  lines: LineInfo[];
  inputs: string[];
  definedInputs: DefinedInput[];
  trailEnvironmentConfig?: TrailEnvironmentConfig;
  randomInputs: string[];
  speciesCount?: number;
  /** Total random values needed per agent per frame. */
  numRandomCalls: number;
}

/** @internal Map of DSL commands to the runtime inputs they implicitly require. */
const COMMAND_INPUT_DEPENDENCIES: Record<string, string[]> = {
  borderWrapping: ["width", "height"],
  borderBounce: ["width", "height"],
  sense: ["width", "height"],
  deposit: ["width", "height", "trailMap"],
  avoidObstacles: ["obstacles", "obstacleCount"],
};

/**
 * Compiles Agentyx DSL source code into JavaScript, WGSL, and WAT output.
 *
 * @example
 * ```ts
 * import { Compiler } from '@websimbench/agentyx';
 *
 * const compiler = new Compiler();
 * const result = compiler.compileAgentCode('moveForward 1\nborderWrapping');
 * console.log(result.jsCode);
 * ```
 */
export class Compiler {
  private logger: Logger;

  constructor() {
    this.logger = new Logger("Compiler", "orange");
  }

  /**
   * Compile DSL source code into a multi-target {@link CompilationResult}.
   *
   * Preprocesses the DSL to extract inputs, trail config, and species
   * declarations, then delegates to each backend compiler.
   *
   * @param agentCode - Raw Agentyx DSL source code.
   * @returns Compilation output with JS, WGSL, and WAT code.
   */
  compileAgentCode(agentCode?: string): CompilationResult {
    const script = agentCode?.trim() ?? "";
    this.logger.info("Compiling agent code");

    const preprocessed = this.preprocessDSL(script);
    const compiled = this.compileToAllTargets(preprocessed);

    this.logCompilationResults(compiled, preprocessed);

    // Deduplicate and output all compilation errors via the logger instance
    const uniqueErrors = new Map<
      string,
      { message: string; lineIndex: number }
    >();
    for (const err of compiled.errors) {
      uniqueErrors.set(`${err.lineIndex}:${err.message}`, err);
    }
    for (const err of uniqueErrors.values()) {
      this.logger.codeError(err.message, script, err.lineIndex);
    }

    return this.buildCompilationResult(preprocessed, compiled);
  }

  /**
   * Preprocess DSL source: parse lines, extract inputs, trail config,
   * species count, and random value requirements.
   *
   * @param dsl - Raw DSL source code.
   * @returns Preprocessed data for the compilation pipeline.
   */
  private preprocessDSL(dsl: string): PreprocessResult {
    const { lines, definedInputs, randomInputs } = this.parseLines(dsl);
    const inputs = this.extractInputs(dsl, lines, definedInputs, randomInputs);
    const trailEnvironmentConfig = this.extractTrailConfig(lines, inputs);
    const speciesCount = this.extractSpeciesCount(lines);

    this.ensureRandomValuesDependency(inputs, randomInputs, lines);

    const inlineRandomCount = this.countInlineRandomCalls(lines);
    const numRandomCalls = randomInputs.length + inlineRandomCount;

    return {
      lines,
      inputs,
      definedInputs,
      trailEnvironmentConfig,
      randomInputs,
      speciesCount,
      numRandomCalls,
    };
  }

  /** Count `random()` call sites across all DSL lines. */
  private countInlineRandomCalls(lines: LineInfo[]): number {
    let count = 0;
    for (const line of lines) {
      const matches = line.content.match(/\brandom\s*\(/g);
      if (matches) count += matches.length;
    }
    return count;
  }

  /** Parse raw DSL source into structured lines, extracting input and random declarations. */
  private parseLines(dsl: string): {
    lines: LineInfo[];
    definedInputs: DefinedInput[];
    randomInputs: string[];
  } {
    const lines: LineInfo[] = [];
    const definedInputs: DefinedInput[] = [];
    const randomInputs: string[] = [];

    dsl.split("\n").forEach((line, index) => {
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

      this.splitStatements(trimmed).forEach((stmt) => {
        lines.push({ content: stmt, lineIndex: index });
      });
    });

    return { lines, definedInputs, randomInputs };
  }

  /** Remove `//` and `#` comments from a source line. */
  private stripComments(line: string): string {
    return line.split("//")[0].split("#")[0].trim();
  }

  /** Parse an `input name = value` declaration, returning metadata or `null`. */
  private parseInputDeclaration(line: string): {
    name: string;
    isRandom: boolean;
    defined?: DefinedInput;
  } | null {
    const match = line.match(/^\s*input\s+([a-zA-Z_]\w*)\s*=\s*(.+?)\s*;?\s*$/);
    if (!match) return null;

    const name = match[1];
    let valuePart = match[2].trim();

    if (valuePart === "random()") {
      return { name, isRandom: true };
    }

    const { value, min, max } = this.parseValueWithRange(valuePart);
    const defaultValue = parseFloat(value);

    if (isNaN(defaultValue)) return null;

    return {
      name,
      isRandom: false,
      defined: { name, defaultValue, min, max },
    };
  }

  /** Extract the numeric value and optional `[min, max]` range from a value part. */
  private parseValueWithRange(valuePart: string): {
    value: string;
    min: number;
    max: number;
  } {
    const rangeMatch = valuePart.match(
      /^(.+?)\s*\[\s*([0-9.]+)\s*,\s*([0-9.]+)\s*\]\s*$/,
    );
    if (rangeMatch) {
      return {
        value: rangeMatch[1].trim(),
        min: parseFloat(rangeMatch[2]),
        max: parseFloat(rangeMatch[3]),
      };
    }
    return { value: valuePart, min: 0, max: 100 };
  }

  /** Split a line at `;` boundaries, expanding braceless `if` into block form. */
  private splitStatements(line: string): string[] {
    const parts = line
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const result: string[] = [];
    for (const part of parts) {
      // Detect braceless if: `if (condition) statement` (no opening brace)
      if (part.startsWith("if ") || part.startsWith("if(")) {
        const openParen = part.indexOf("(");
        if (openParen > -1) {
          const condition = DSLParser.extractBalanced(part, openParen);
          if (condition !== null) {
            const afterCondition = part
              .substring(openParen + condition.length + 2)
              .trim();
            if (
              afterCondition &&
              afterCondition !== "{" &&
              !afterCondition.startsWith("{")
            ) {
              result.push(`if (${condition}) {`);
              result.push(afterCondition);
              result.push("}");
              continue;
            }
          }
        }
      }
      result.push(part);
    }
    return result;
  }

  /** Collect all required input names from explicit references and command dependencies. */
  private extractInputs(
    dsl: string,
    lines: LineInfo[],
    definedInputs: DefinedInput[],
    randomInputs: string[],
  ): string[] {
    const explicitInputs = Array.from(
      dsl.matchAll(/inputs\.([a-zA-Z_]\w*)/g),
    ).map((m) => m[1]);
    const definedNames = definedInputs.map((d) => d.name);

    const inputs = new Set(
      [...explicitInputs, ...definedNames].filter(
        (name) => !randomInputs.includes(name),
      ),
    );

    this.addCommandDependencies(lines, inputs);

    return Array.from(inputs);
  }

  /** Add implicit input dependencies required by DSL commands. */
  private addCommandDependencies(lines: LineInfo[], inputs: Set<string>): void {
    for (const line of lines) {
      const parsed = DSLParser.parseCommandLine(line.content.trim());
      if (parsed && COMMAND_INPUT_DEPENDENCIES[parsed.command]) {
        COMMAND_INPUT_DEPENDENCIES[parsed.command].forEach((input) =>
          inputs.add(input),
        );
      }
    }
  }

  /** Extract trail environment configuration from `enableTrails` commands. */
  private extractTrailConfig(
    lines: LineInfo[],
    inputs: string[],
  ): TrailEnvironmentConfig | undefined {
    for (const line of lines) {
      const parsed = DSLParser.parseCommandLine(line.content.trim());
      if (parsed?.command !== "enableTrails") continue;

      const args = parsed.argument.split(",").map((s) => s.trim());
      const config: TrailEnvironmentConfig = {};

      const depositMatch = args[0]?.match(/^inputs\.(\w+)$/);
      if (depositMatch) config.depositAmountInput = depositMatch[1];

      const decayMatch = args[1]?.match(/^inputs\.(\w+)$/);
      if (decayMatch) config.decayFactorInput = decayMatch[1];

      if (!inputs.includes("trailMap")) {
        inputs.push("trailMap");
      }

      return config;
    }
    return undefined;
  }

  /** Extract the species count from a `species` command declaration. */
  private extractSpeciesCount(lines: LineInfo[]): number | undefined {
    for (const line of lines) {
      const parsed = DSLParser.parseCommandLine(line.content.trim());
      if (parsed?.command === "species") {
        const count = parseInt(parsed.argument, 10);
        if (!isNaN(count) && count > 0) return count;
      }
    }
    return undefined;
  }

  /** Ensure `randomValues` is listed as a required input when random is used. */
  private ensureRandomValuesDependency(
    inputs: string[],
    randomInputs: string[],
    lines: LineInfo[],
  ): void {
    // Check for input-declared random values or explicit inputs.random references
    let needsRandomValues =
      inputs.includes("random") || randomInputs.length > 0;

    // Also check for inline random() calls in DSL code (e.g., "if (random() < 0.1)")
    if (!needsRandomValues) {
      for (const line of lines) {
        if (/\brandom\s*\(/.test(line.content)) {
          needsRandomValues = true;
          break;
        }
      }
    }

    if (needsRandomValues && !inputs.includes("randomValues")) {
      inputs.push("randomValues");
    }
  }

  /** Compile preprocessed DSL to all three backends (JS, WGSL, WAT). */
  private compileToAllTargets(preprocessed: PreprocessResult): {
    jsCode: string;
    wgslCode: string;
    watCode: string;
    errors: { message: string; lineIndex: number }[];
  } {
    const { lines, inputs, randomInputs, numRandomCalls } = preprocessed;

    const jsResult = compileDSLtoJS(
      lines,
      inputs,
      randomInputs,
      numRandomCalls,
    );
    const wgslResult = compileDSLtoWGSL(
      lines,
      inputs,
      randomInputs,
      numRandomCalls,
    );
    const watResult = compileDSLtoWAT(
      lines,
      inputs,
      randomInputs,
      numRandomCalls,
    );

    return {
      jsCode: jsResult.code,
      wgslCode: wgslResult.code,
      watCode: watResult.code,
      errors: jsResult.errors,
    };
  }

  /** Log all compiled output and extracted inputs to the console. */
  private logCompilationResults(
    compiled: {
      jsCode: string;
      wgslCode: string;
      watCode: string;
      errors: { message: string; lineIndex: number }[];
    },
    preprocessed: PreprocessResult,
  ): void {
    this.logger.code("Generated JS Code", compiled.jsCode, "js");
    this.logger.code("Generated WGSL Code", compiled.wgslCode, "wgsl");
    this.logger.code("Generated WAT Code", compiled.watCode, "wasm");
    this.logger.log("Expected Inputs", preprocessed.inputs);
    this.logger.log("Defined Inputs", preprocessed.definedInputs);
  }

  /** Assemble the final {@link CompilationResult} from preprocessed and compiled data. */
  private buildCompilationResult(
    preprocessed: PreprocessResult,
    compiled: {
      jsCode: string;
      wgslCode: string;
      watCode: string;
      errors: { message: string; lineIndex: number }[];
    },
  ): CompilationResult {
    return {
      requiredInputs: preprocessed.inputs,
      definedInputs: preprocessed.definedInputs,
      wgslCode: compiled.wgslCode,
      jsCode: compiled.jsCode,
      WASMCode: compiled.watCode,
      trailEnvironmentConfig: preprocessed.trailEnvironmentConfig,
      speciesCount: preprocessed.speciesCount,
      numRandomCalls: preprocessed.numRandomCalls,
      errors: compiled.errors,
    };
  }
}
