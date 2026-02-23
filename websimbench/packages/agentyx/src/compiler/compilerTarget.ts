/**
 * @module compilerTarget
 * Shared interface and context for all DSL compiler backends.
 *
 * Defines the {@link CompilerTarget} contract each backend (JS, WGSL, WAT)
 * must implement, and the {@link CompilationContext} state threaded through
 * the transpilation pipeline.
 */

// No imports needed — types defined here are self-contained

// ─── Compilation Context ─────────────────────────────────────────────

/**
 * Variable metadata tracked during compilation
 */
export interface VariableInfo {
  type: "neighbors" | "mean_result" | "scalar" | "loop_index";
  radiusExpr?: string; // For neighbors: the compiled radius expression
  collection?: string; // For mean_result: which collection it summarizes
  property?: string; // For mean_result: which property (x, y, vx, vy)
}

/**
 * Shared compilation state passed through the transpilation pipeline.
 * Each target may extend this but must support these base fields.
 */
export interface CompilationContext {
  variables: Map<string, VariableInfo>;
  loopDepth: number;
  currentLoopVar?: string;
  randomInputs: Set<string>;
  /** Track which custom functions are actually used (for dead-code elimination) */
  usedFunctions: Set<string>;
  /** Track local variables (needed for WAT) */
  localVars: Set<string>;
  /** Track block types so emitCloseBrace knows whether it's closing a loop or control flow */
  blockStack: ("loop" | "control")[];
  /** Count of inline random() call sites (for indexed randomValues buffer) */
  randomCallCount: number;
  /** Total random values per agent (set after preprocessing: randomInputs.length + inlineRandomCount) */
  numRandomCalls: number;
  /** Any compilation errors encountered */
  errors: { message: string; lineIndex: number }[];
  /** Names of general inputs */
  inputs: Set<string>;
  /** Current line index being compiled for error reporting */
  currentLineIndex: number;
}

export function createContext(
  inputs: string[],
  randomInputs: string[],
  numRandomCalls: number = 0,
): CompilationContext {
  return {
    variables: new Map(),
    loopDepth: 0,
    randomInputs: new Set(randomInputs),
    usedFunctions: new Set(),
    localVars: new Set(),
    blockStack: [],
    randomCallCount: 0,
    numRandomCalls,
    errors: [],
    inputs: new Set(inputs),
    currentLineIndex: 0,
  };
}

// ─── Compiler Target Interface ───────────────────────────────────────

/**
 * The contract each backend must implement.
 * The shared transpiler calls these methods for each parsed DSL line.
 */
export interface CompilerTarget {
  readonly name: "js" | "wgsl" | "wat";

  /** Transpile a raw expression string into target-language code */
  emitExpression(expr: string, ctx: CompilationContext): string;

  /** Emit a variable declaration: `var name = expr;` */
  emitVar(name: string, expression: string, ctx: CompilationContext): string[];

  /** Emit an if statement opening */
  emitIf(condition: string, ctx: CompilationContext): string[];

  /** Emit an else-if clause */
  emitElseIf(condition: string, ctx: CompilationContext): string[];

  /** Emit an else clause */
  emitElse(ctx: CompilationContext): string[];

  /** Emit a for loop opening */
  emitFor(
    init: string,
    condition: string,
    increment: string,
    ctx: CompilationContext,
  ): string[];

  /** Emit a foreach loop opening */
  emitForeach(
    collection: string,
    varName: string | undefined,
    itemAlias: string | undefined,
    ctx: CompilationContext,
  ): string[];

  /** Emit an assignment statement */
  emitAssignment(
    target: string,
    expression: string,
    ctx: CompilationContext,
  ): string[];

  /** Emit a closing brace */
  emitCloseBrace(ctx: CompilationContext): string[];

  /** Wrap transpiled statements into the final program output */
  emitProgram(
    statements: string[],
    inputs: string[],
    randomInputs: string[],
    ctx: CompilationContext,
  ): string;
}
