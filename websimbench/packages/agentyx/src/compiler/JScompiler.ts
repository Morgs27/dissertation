/**
 * @module JScompiler
 * JavaScript backend for the DSL compiler.
 *
 * Implements the {@link CompilerTarget} interface for JavaScript output,
 * wrapping all arithmetic in `Math.fround()` for Float32 precision parity
 * with the WebAssembly and WebGPU backends.
 */

import type { LineInfo } from "./parser";
import { transformExpression } from "./expressionAST";
import type { CompilerTarget, CompilationContext } from "./compilerTarget";
import { createContext } from "./compilerTarget";
import { transpileDSL } from "./transpiler";

/**
 * Pre-process an expression to replace `random(...)` calls with `_random(INDEX, ...)`
 * so that each call site gets a compile-time fixed index, matching WGSL/WAT behaviour.
 *
 * @param expr - The raw DSL expression string.
 * @param ctx - Compilation context for tracking random call indices.
 * @returns Expression with indexed random calls.
 * @internal
 */
function indexRandomCalls(expr: string, ctx: CompilationContext): string {
  return expr.replace(/\brandom\(([^)]*)\)/g, (_match, args) => {
    const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
    ctx.randomCallCount++;
    const parts = args
      .split(",")
      .filter((s: string) => s.trim().length > 0)
      .map((s: string) => s.trim());
    if (parts.length === 0) {
      return `_random(${callIndex})`;
    }
    return `_random(${callIndex}, ${parts.join(", ")})`;
  });
}

export const JSTarget: CompilerTarget = {
  name: "js",

  emitExpression(expr: string, ctx: CompilationContext): string {
    return transformExpression(indexRandomCalls(expr, ctx), ctx.randomInputs);
  },

  emitVar(name: string, expression: string, ctx: CompilationContext): string[] {
    const exprTranspiled = transformExpression(
      indexRandomCalls(expression, ctx),
      ctx.randomInputs,
    );
    ctx.variables.set(name, { type: "scalar" });
    return [`let ${name} = ${exprTranspiled}; `];
  },

  emitIf(condition: string, ctx: CompilationContext): string[] {
    ctx.blockStack.push("control");
    return [
      `if (${transformExpression(indexRandomCalls(condition, ctx), ctx.randomInputs)}) {`,
    ];
  },

  emitElseIf(condition: string, ctx: CompilationContext): string[] {
    ctx.blockStack.push("control");
    return [
      `else if (${transformExpression(indexRandomCalls(condition, ctx), ctx.randomInputs)}) {`,
    ];
  },

  emitElse(ctx: CompilationContext): string[] {
    ctx.blockStack.push("control");
    return [`else {`];
  },

  emitFor(
    init: string,
    condition: string,
    increment: string,
    ctx: CompilationContext,
  ): string[] {
    const jsInit = init.replace(/^var\s+/, "let ");
    const jsCond = transformExpression(
      indexRandomCalls(condition, ctx),
      ctx.randomInputs,
    );
    ctx.loopDepth++;
    ctx.blockStack.push("loop");
    return [`for (${jsInit}; ${jsCond}; ${increment}) {`];
  },

  emitForeach(
    collection: string,
    varName: string | undefined,
    _itemAlias: string | undefined,
    ctx: CompilationContext,
  ): string[] {
    const loopVar = varName || _itemAlias;
    if (!loopVar) return [];

    ctx.loopDepth++;
    ctx.currentLoopVar = loopVar;
    ctx.blockStack.push("loop");

    if (loopVar === collection) {
      return [
        `for (const _${loopVar} of ${collection}) {`,
        `const ${loopVar} = _${loopVar};`,
      ];
    }
    return [`for (const ${loopVar} of ${collection}) {`];
  },

  emitAssignment(
    target: string,
    expression: string,
    ctx: CompilationContext,
  ): string[] {
    const exprTranspiled = transformExpression(
      indexRandomCalls(expression, ctx),
      ctx.randomInputs,
    );
    return [`${target.trim()} = ${exprTranspiled}; `];
  },

  emitCloseBrace(ctx: CompilationContext): string[] {
    const closedBlock = ctx.blockStack.pop();
    if (closedBlock === "loop") {
      ctx.loopDepth--;
      if (ctx.loopDepth === 0) ctx.currentLoopVar = undefined;
    }
    return ["}"];
  },

  emitProgram(
    statements: string[],
    _inputs: string[],
    randomInputs: string[],
    ctx: CompilationContext,
  ): string {
    if (statements.length === 0) {
      return `(agent) => ({ ...agent })`;
    }

    // Determine which helpers to include based on used functions
    const used = ctx.usedFunctions;
    const helpers: string[] = [];

    // Random helper: uses compile-time call index for parity across all backends
    // Each random() call site gets a fixed index (assigned during compilation),
    // so all backends (JS/WASM/WebGPU) read randomValues[id * stride + callIndex].
    const numRandomCalls = ctx.numRandomCalls;
    helpers.push(`
                    // Helper function for random values (returns Float32)
                    // callIndex is a compile-time constant assigned to each random() call site
                    const _NRC = ${numRandomCalls};
                    const _random = (callIndex, min, max) => {
                        let val;
                        if (inputs.randomValues && inputs.randomValues.length >= (id + 1) * _NRC) {
                            val = f(inputs.randomValues[id * _NRC + callIndex]);
                        } else {
                            val = f(Math.random());
                        }
                        if (max === undefined) {
                            if (min === undefined) return val;
                            return f(val * f(min));
                        }
                        return f(f(min) + f(val * f(f(max) - f(min))));
                    };`);

    // Random input initialization (uses indices 0..randomInputs.length-1)
    if (randomInputs.length > 0) {
      helpers.push(`
        // Initialize random input variables (Float32) from indexed randomValues
        ${randomInputs.map((r, ri) => `let ${r} = f((inputs.randomValues && inputs.randomValues.length >= (id + 1) * ${numRandomCalls}) ? inputs.randomValues[id * ${numRandomCalls} + ${ri}] : Math.random());`).join("\n        ")}`);
    }

    if (used.has("mean")) {
      helpers.push(`
                    // Helper function: calculate mean of an array or array property (returns Float32)
                    const _mean = (arr, prop) => {
                        if (!Array.isArray(arr)) return f(0);
                        if (arr.length === 0) return f(0);
                        if (prop) {
                            const values = arr.map(item => f(item[prop] || 0));
                            return f(values.reduce((sum, val) => f(sum + val), f(0)) / f(values.length));
                        }
                        return f(arr.reduce((sum, val) => f(sum + f(val)), f(0)) / f(arr.length));
                    };`);
    }

    if (used.has("neighbors")) {
      helpers.push(`
                    // Helper function: find nearby neighbors (uses Float32 for distance calc)
                    const _neighbors = (radius) => {
                        const r = f(radius);
                        return agents.filter(a => {
                            if (a.id === id) return false;
                            const dx = f(x - f(a.x));
                            const dy = f(y - f(a.y));
                            const dist = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
                            return dist < r;
                        });
                    };`);
    }

    if (used.has("sense")) {
      helpers.push(`
                    const _sense = (angleOffset, distance) => {
                        const readMap = inputs.trailMapRead || inputs.trailMap;
                        const ao = f(angleOffset);
                        const dist = f(distance);
                        const currentAngle = f(Math.atan2(vy, vx));
                        const angle = f(currentAngle + ao);
                        const sx = f(x + f(f(Math.cos(angle)) * dist));
                        const sy = f(y + f(f(Math.sin(angle)) * dist));
                        let ix = Math.trunc(sx);
                        let iy = Math.trunc(sy);
                        const w = Math.trunc(f(inputs.width));
                        const h = Math.trunc(f(inputs.height));
                        if (ix < 0) ix += w;
                        if (ix >= w) ix -= w;
                        if (iy < 0) iy += h;
                        if (iy >= h) iy -= h;
                        if (readMap) {
                            return f(readMap[iy * w + ix]);
                        }
                        return f(0);
                    };`);
    }

    // deposit helper — include if deposit command is used
    const usesDeposit = statements.some((s) => s.includes("_deposit("));
    if (usesDeposit) {
      helpers.push(`
                    const _deposit = (amount) => {
                        const writeMap = inputs.trailMapWrite || inputs.trailMap;
                        if (!writeMap) return;
                        const amt = f(amount);
                        let ix = Math.trunc(x);
                        let iy = Math.trunc(y);
                        const w = Math.trunc(f(inputs.width));
                        const h = Math.trunc(f(inputs.height));
                        if (ix < 0) ix += w;
                        if (ix >= w) ix -= w;
                        if (iy < 0) iy += h;
                        if (iy >= h) iy -= h;
                        writeMap[iy * w + ix] = f(writeMap[iy * w + ix] + amt);
                    };`);
    }

    // avoidObstacles helper — include if avoidObstacles command is used
    const usesAvoidObstacles = statements.some((s) =>
      s.includes("_avoidObstacles("),
    );
    if (usesAvoidObstacles) {
      helpers.push(`
                    const _avoidObstacles = (strength) => {
                        const obstacles = inputs.obstacles || [];
                        const str = f(strength || 1);
                        for (let oi = 0; oi < obstacles.length; oi++) {
                            const ob = obstacles[oi];
                            const margin = f(5);
                            const ox1 = f(ob.x - margin);
                            const oy1 = f(ob.y - margin);
                            const ox2 = f(ob.x + ob.w + margin);
                            const oy2 = f(ob.y + ob.h + margin);
                            if (x > ox1 && x < ox2 && y > oy1 && y < oy2) {
                                const cx = f(ob.x + f(ob.w * f(0.5)));
                                const cy = f(ob.y + f(ob.h * f(0.5)));
                                let dx = f(x - cx);
                                let dy = f(y - cy);
                                const dist = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
                                if (dist > f(0.001)) {
                                    dx = f(dx / dist);
                                    dy = f(dy / dist);
                                }
                                vx = f(vx + f(dx * str));
                                vy = f(vy + f(dy * str));
                            }
                        }
                    };`);
    }

    return `(agent, inputs) => {
                    const f = Math.fround;
                    
                    let { id } = agent;
                    let x = f(agent.x);
                    let y = f(agent.y);
                    let vx = f(agent.vx);
                    let vy = f(agent.vy);
                    let species = agent.species || 0;

                    const agents = inputs.agents || [];
${helpers.join("\n")}

  // Execute DSL code
  ${statements.join("\n  ")}

  // Return updated agent (ensure Float32 values)
  return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
}`;
  },
};

// ─── Entry Point ─────────────────────────────────────────────────────

/**
 * Compile Agentyx DSL lines into a self-contained JavaScript agent function.
 *
 * @param lines - Parsed DSL line array from preprocessing.
 * @param inputs - Required input names.
 * @param logger - Logger instance for compilation diagnostics.
 * @param rawScript - Original raw DSL source (used for error reporting).
 * @param randomInputs - Names of random-valued input declarations.
 * @param numRandomCalls - Total random values needed per agent per frame.
 * @returns Complete JavaScript function source as a string.
 */
export const compileDSLtoJS = (
  lines: LineInfo[],
  inputs: string[],
  randomInputs: string[] = [],
  numRandomCalls: number = 0,
): { code: string; errors: { message: string; lineIndex: number }[] } => {
  const ctx = createContext(inputs, randomInputs, numRandomCalls);
  const statements = transpileDSL(lines, JSTarget, ctx);

  const result = JSTarget.emitProgram(statements, inputs, randomInputs, ctx);

  return { code: result, errors: ctx.errors };
};
