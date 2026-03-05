/**
 * @module functionRegistry
 * Centralised custom DSL function handling.
 *
 * Each DSL function (`neighbors`, `mean`, `sense`, `deposit`, `random`,
 * `avoidObstacles`) is registered here with detection logic and per-target
 * code generation. Only functions actually used in the DSL get their helpers
 * emitted.
 */

import type { CompilerTarget, CompilationContext } from "./compilerTarget";

// ─── DSL Function Definition ─────────────────────────────────────────

export interface DSLFunction {
  /** Function name in the DSL */
  name: string;
  /** Attempt to match this function in an expression. Returns match or null. */
  detect(expr: string): RegExpMatchArray | null;
  /**
   * Emit code for a `var name = <function>(...)` declaration.
   * Returns the transpiled statements for the target.
   */
  emitVar(
    match: RegExpMatchArray,
    varName: string,
    target: CompilerTarget,
    ctx: CompilationContext,
  ): string[];
  /**
   * Emit code for this function used as an inline expression (not in a var declaration).
   * Optional — not all functions can be used inline.
   */
  emitExpr?(
    match: RegExpMatchArray,
    target: CompilerTarget,
    ctx: CompilationContext,
  ): string;
}

// ─── Registry ────────────────────────────────────────────────────────

const FUNCTIONS: DSLFunction[] = [];

export function registerFunction(fn: DSLFunction): void {
  FUNCTIONS.push(fn);
}

/**
 * Try to handle a `var name = expr` as a custom function call.
 * Returns null if no function matches.
 */
export function tryEmitFunctionVar(
  varName: string,
  expression: string,
  target: CompilerTarget,
  ctx: CompilationContext,
): string[] | null {
  for (const fn of FUNCTIONS) {
    const match = fn.detect(expression);
    if (match) {
      ctx.usedFunctions.add(fn.name);
      return fn.emitVar(match, varName, target, ctx);
    }
  }
  return null;
}

/**
 * Try to handle an inline function call within an expression.
 * Returns the replacement string, or null if no function matches.
 */
export function tryEmitFunctionExpr(
  expression: string,
  target: CompilerTarget,
  ctx: CompilationContext,
): string | null {
  for (const fn of FUNCTIONS) {
    const match = fn.detect(expression);
    if (match && fn.emitExpr) {
      ctx.usedFunctions.add(fn.name);
      return fn.emitExpr(match, target, ctx);
    }
  }
  return null;
}

/**
 * Check if an expression is a custom function call (for detection purposes only)
 */
export function isCustomFunction(expression: string): boolean {
  return FUNCTIONS.some((fn) => fn.detect(expression) !== null);
}

/**
 * Get the set of all registered function names
 */
export function getRegisteredFunctionNames(): string[] {
  return FUNCTIONS.map((fn) => fn.name);
}

// ─── Register Built-in Functions ─────────────────────────────────────

// neighbors(radius) — find nearby agents within radius
registerFunction({
  name: "neighbors",
  detect: (expr) => expr.match(/^neighbors\((.+)\)$/),
  emitVar(match, varName, target, ctx) {
    const radiusExpr = target.emitExpression(match[1], ctx);
    // Track as neighbors collection in context
    ctx.variables.set(varName, { type: "neighbors", radiusExpr });

    if (target.name === "js") {
      return [`let ${varName} = _neighbors(${radiusExpr}); `];
    }
    if (target.name === "wgsl") {
      return [
        `// Find neighbors for ${varName}`,
        `var ${varName}_count: u32 = 0u;`,
        `var ${varName}_sum_x: f32 = 0.0;`,
        `var ${varName}_sum_y: f32 = 0.0;`,
        `var ${varName}_sum_vx: f32 = 0.0;`,
        `var ${varName}_sum_vy: f32 = 0.0;`,
        `for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {`,
        `if (_ni == i) { continue; }`,
        `let other = agentsRead[_ni];`,
        `let dx = x - other.x;`,
        `let dy = y - other.y;`,
        `let dist = sqrt(dx*dx + dy*dy);`,
        `if (dist < ${radiusExpr}) {`,
        `${varName}_count += 1u;`,
        `${varName}_sum_x += other.x;`,
        `${varName}_sum_y += other.y;`,
        `${varName}_sum_vx += other.vx;`,
        `${varName}_sum_vy += other.vy;`,
        `}`,
        `}`,
      ];
    }
    if (target.name === "wat") {
      const radius = radiusExpr;
      // Register all needed local variables
      ctx.localVars.add(`${varName}_count`);
      ctx.localVars.add(`${varName}_sum_x`);
      ctx.localVars.add(`${varName}_sum_y`);
      ctx.localVars.add(`${varName}_sum_vx`);
      ctx.localVars.add(`${varName}_sum_vy`);
      ctx.localVars.add("_loop_idx");
      ctx.localVars.add("_loop_ptr");
      ctx.localVars.add("_other_x");
      ctx.localVars.add("_other_y");
      ctx.localVars.add("_dx");
      ctx.localVars.add("_dy");
      ctx.localVars.add("_dist");
      return [
        `
    ;; Find neighbors within radius (reading from agentsReadPtr for order-independent sensing)
    (local.set $${varName}_count (f32.const 0))
    (local.set $${varName}_sum_x (f32.const 0))
    (local.set $${varName}_sum_y (f32.const 0))
    (local.set $${varName}_sum_vx (f32.const 0))
    (local.set $${varName}_sum_vy (f32.const 0))
    (local.set $_loop_idx (i32.const 0))
    (local.set $_loop_ptr (global.get $agentsReadPtr))
    (block $_neighbor_exit
      (loop $_neighbor_loop
        (br_if $_neighbor_exit (i32.ge_u (local.get $_loop_idx) (global.get $agent_count)))
        (if (i32.ne (local.get $_loop_idx) (i32.trunc_f32_u (local.get $_agent_id))) (then
          (local.set $_other_x (f32.load (i32.add (local.get $_loop_ptr) (i32.const 4))))
          (local.set $_other_y (f32.load (i32.add (local.get $_loop_ptr) (i32.const 8))))
          (local.set $_dx (f32.sub (local.get $x) (local.get $_other_x)))
          (local.set $_dy (f32.sub (local.get $y) (local.get $_other_y)))
          (local.set $_dist (f32.sqrt (f32.add (f32.mul (local.get $_dx) (local.get $_dx)) (f32.mul (local.get $_dy) (local.get $_dy)))))
          (if (f32.lt (local.get $_dist) ${radius}) (then
            (local.set $${varName}_count (f32.add (local.get $${varName}_count) (f32.const 1)))
            (local.set $${varName}_sum_x (f32.add (local.get $${varName}_sum_x) (local.get $_other_x)))
            (local.set $${varName}_sum_y (f32.add (local.get $${varName}_sum_y) (local.get $_other_y)))
            (local.set $${varName}_sum_vx (f32.add (local.get $${varName}_sum_vx) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 12)))))
            (local.set $${varName}_sum_vy (f32.add (local.get $${varName}_sum_vy) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 16)))))
          ))
        ))
        (local.set $_loop_idx (i32.add (local.get $_loop_idx) (i32.const 1)))
        (local.set $_loop_ptr (i32.add (local.get $_loop_ptr) (i32.const 24)))
        (br $_neighbor_loop)
      )
    )`,
      ];
    }
    return [];
  },
});

// mean(collection.property) — calculate mean of a neighbor property
registerFunction({
  name: "mean",
  detect: (expr) => expr.match(/^mean\((\w+)\.(\w+)\)$/),
  emitVar(match, varName, target, ctx) {
    const collection = match[1];
    const property = match[2];
    const collectionInfo = ctx.variables.get(collection);

    // Track this as a mean_result
    ctx.variables.set(varName, { type: "mean_result", collection, property });

    if (target.name === "js") {
      return [`let ${varName} = _mean(${collection}, '${property}'); `];
    }
    if (target.name === "wgsl") {
      if (collectionInfo?.type === "neighbors") {
        return [
          `var ${varName}: f32 = 0.0;`,
          `if (${collection}_count > 0u) {`,
          `${varName} = ${collection}_sum_${property} / f32(${collection}_count);`,
          `}`,
        ];
      }
      return [`var ${varName}: f32 = 0.0;`];
    }
    if (target.name === "wat") {
      const collName = collection || "nearbyAgents";
      return [
        `(local.set $${varName} (f32.div (local.get $${collName}_sum_${property}) (local.get $${collName}_count)))`,
      ];
    }
    return [];
  },
});

// sense(angle, distance) — read trail map at sensor position
registerFunction({
  name: "sense",
  detect: (expr) => expr.match(/^sense\((.+)\)$/),
  emitVar(match, varName, target, ctx) {
    const args = match[1].split(",").map((s) => s.trim());
    const angle = target.emitExpression(args[0], ctx);
    const dist = target.emitExpression(args[1], ctx);

    if (target.name === "js") {
      return [`let ${varName} = _sense(${angle}, ${dist}); `];
    }
    if (target.name === "wgsl") {
      return [`var ${varName}: f32 = _sense(x, y, vx, vy, ${angle}, ${dist});`];
    }
    if (target.name === "wat") {
      // sense needs WAT-specific helper call
      ctx.localVars.add(varName);
      return [
        `(local.set $${varName} (call $_sense (local.get $x) (local.get $y) (local.get $vx) (local.get $vy) ${angle} ${dist}))`,
      ];
    }
    return [];
  },
  emitExpr(match, target, ctx) {
    const args = match[1].split(",").map((s) => s.trim());
    const angle = target.emitExpression(args[0], ctx);
    const dist = target.emitExpression(args[1], ctx);

    if (target.name === "js") return `_sense(${angle}, ${dist})`;
    if (target.name === "wgsl")
      return `_sense(x, y, vx, vy, ${angle}, ${dist})`;
    if (target.name === "wat")
      return `(call $_sense (local.get $x) (local.get $y) (local.get $vx) (local.get $vy) ${angle} ${dist})`;
    return "";
  },
});

// random() — random number generation
registerFunction({
  name: "random",
  detect: (expr) => expr.match(/^random\(([^)]*)\)$/),
  emitVar(match, varName, target, ctx) {
    const args = match[1]
      .split(",")
      .filter((s) => s.trim().length > 0)
      .map((s) => s.trim());

    if (target.name === "js") {
      // Use compile-time call index for parity with WGSL/WAT
      const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
      ctx.randomCallCount++;
      if (args.length === 0)
        return [`let ${varName} = _random(${callIndex}); `];
      if (args.length === 1)
        return [
          `let ${varName} = _random(${callIndex}, ${target.emitExpression(args[0], ctx)}); `,
        ];
      return [
        `let ${varName} = _random(${callIndex}, ${target.emitExpression(args[0], ctx)}, ${target.emitExpression(args[1], ctx)}); `,
      ];
    }
    if (target.name === "wgsl") {
      const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
      ctx.randomCallCount++;
      const randVal = `randomValues[u32(agent.id) * ${ctx.numRandomCalls}u + ${callIndex}u]`;
      if (args.length === 0) return [`var ${varName}: f32 = ${randVal};`];
      if (args.length === 1) {
        const max = target.emitExpression(args[0], ctx);
        return [`var ${varName}: f32 = (${randVal} * ${max});`];
      }
      const min = target.emitExpression(args[0], ctx);
      const max = target.emitExpression(args[1], ctx);
      return [
        `var ${varName}: f32 = (${min} + ${randVal} * (${max} - ${min}));`,
      ];
    }
    if (target.name === "wat") {
      ctx.localVars.add(varName);
      return [`(local.set $${varName} (call $_random (local.get $_agent_id)))`];
    }
    return [];
  },
  emitExpr(match, target, ctx) {
    const args = match[1]
      .split(",")
      .filter((s) => s.trim().length > 0)
      .map((s) => s.trim());

    if (target.name === "js") {
      // Use compile-time call index for parity with WGSL/WAT
      const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
      ctx.randomCallCount++;
      if (args.length === 0) return `_random(${callIndex})`;
      if (args.length === 1)
        return `_random(${callIndex}, ${target.emitExpression(args[0], ctx)})`;
      return `_random(${callIndex}, ${target.emitExpression(args[0], ctx)}, ${target.emitExpression(args[1], ctx)})`;
    }
    if (target.name === "wgsl") {
      const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
      ctx.randomCallCount++;
      const randVal = `randomValues[u32(agent.id) * ${ctx.numRandomCalls}u + ${callIndex}u]`;
      if (args.length === 0) return randVal;
      if (args.length === 1) {
        const max = target.emitExpression(args[0], ctx);
        return `(${randVal} * ${max})`;
      }
      const min = target.emitExpression(args[0], ctx);
      const max = target.emitExpression(args[1], ctx);
      return `(${min} + ${randVal} * (${max} - ${min}))`;
    }
    if (target.name === "wat") {
      return `(call $_random (local.get $_agent_id))`;
    }
    return "";
  },
});
