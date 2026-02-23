/**
 * @module WATcompiler
 * WebAssembly Text (WAT) backend for the DSL compiler.
 *
 * Generates WAT S-expression output from DSL. Unlike JS/WGSL, WAT requires
 * its own iteration/brace management because S-expression nesting uses
 * `(if ... (then ... ))` closers and `loop`/`block`/`br` patterns rather
 * than curly braces.
 */

import { DSLParser, type LineInfo } from "./parser";
import type { CompilerTarget, CompilationContext } from "./compilerTarget";
import { createContext } from "./compilerTarget";
import { emitCommand as registryEmitCommand } from "./commandRegistry";

// ─── Expression Helpers (WAT-specific) ───────────────────────────────

function tokenizeExpression(expr: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inParen = 0;

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];

    if (char === "(") {
      inParen++;
      current += char;
    } else if (char === ")") {
      inParen--;
      current += char;
    } else if (inParen > 0) {
      current += char;
    } else if (/[\s;]/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else if (/[+\-*/^%]/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      if (char === "*" && expr[i + 1] === "*") {
        tokens.push("**");
        i++;
      } else {
        tokens.push(char);
      }
    } else {
      current += char;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}
function infixToSExpression(expr: string): string {
  expr = expr.trim();

  if (expr.includes(".")) {
    expr = expr.replace(/([a-zA-Z_]\w*)\.(\w+)/g, (match, prefix, suffix) => {
      if (
        prefix === "f32" ||
        prefix === "i32" ||
        prefix === "local" ||
        prefix === "global" ||
        prefix === "call" ||
        prefix === "return"
      )
        return match;
      return `${prefix}_${suffix}`;
    });
  }

  expr = expr.replace(/inputs_(\w+)/g, "GLOBAL_$1");
  expr = expr.replace(/\^/g, "**");

  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return `(f32.const ${expr})`;
  }

  if (/^GLOBAL_\w+$/.test(expr)) {
    return `(global.get $inputs_${expr.substring(7)})`;
  }

  if (/^[a-zA-Z_]\w*$/.test(expr) && !/^__RANDOM_\d+__$/.test(expr)) {
    if (expr === "id") return `(local.get $_agent_id)`;
    return `(local.get $${expr})`;
  }

  const tokens = tokenizeExpression(expr);

  if (tokens.length === 1) {
    const token = tokens[0];

    const randMatch = token.match(/^__RANDOM_(\d+)__$/);
    if (randMatch) {
      return `(call $random (local.get $_agent_id) (i32.const ${randMatch[1]}))`;
    }
    if (/^GLOBAL_\w+$/.test(token)) {
      return `(global.get $inputs_${token.substring(7)})`;
    }
    if (/^-?\d+(\.\d+)?$/.test(token)) {
      return `(f32.const ${token})`;
    }
    if (token.startsWith("(") && token.endsWith(")")) {
      const inner = token.slice(1, -1).trim();
      if (inner.match(/^(f32|i32|local|global|call|return)\b/)) {
        return token;
      }
      return infixToSExpression(token.slice(1, -1));
    }
    if (token === "id") return `(local.get $_agent_id)`;
    return `(local.get $${token})`;
  }

  // Find operators with lowest precedence (addition/subtraction)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "+" || tokens[i] === "-") {
      const isUnary =
        i === 0 || /^[+\-*/^]$/.test(tokens[i - 1]) || tokens[i - 1] === "(";

      if (tokens[i] === "-") {
        if (isUnary) {
          continue;
        }
      }

      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");
      const op = tokens[i] === "+" ? "f32.add" : "f32.sub";
      return `(${op} ${infixToSExpression(left)} ${infixToSExpression(right)})`;
    }
  }

  // Handle unary minus
  if (tokens[0] === "-") {
    return `(f32.neg ${infixToSExpression(tokens.slice(1).join(" "))})`;
  }

  // Multiplication/division/modulo
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "*" && tokens[i - 1] !== "*") {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");
      return `(f32.mul ${infixToSExpression(left)} ${infixToSExpression(right)})`;
    } else if (tokens[i] === "/") {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");
      return `(f32.div ${infixToSExpression(left)} ${infixToSExpression(right)})`;
    } else if (tokens[i] === "%") {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");
      const lExpr = infixToSExpression(left);
      const rExpr = infixToSExpression(right);
      return `(f32.sub ${lExpr} (f32.mul (f32.trunc (f32.div ${lExpr} ${rExpr})) ${rExpr}))`;
    }
  }

  // Exponentiation
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "**" || tokens[i] === "^") {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");
      if (right.trim() === "2") {
        const base = infixToSExpression(left);
        return `(f32.mul ${base} ${base})`;
      }
      return ";; UNSUPPORTED: exponentiation (only ^2 is supported)";
    }
  }

  const converted = tokens
    .map((token) => {
      const _rm = token.match(/^__RANDOM_(\d+)__$/);
      if (_rm)
        return `(call $random (local.get $_agent_id) (i32.const ${_rm[1]}))`;
      if (/^GLOBAL_\w+$/.test(token))
        return `(global.get $inputs_${token.substring(7)})`;
      if (/^-?\d+(\.\d+)?$/.test(token)) return `(f32.const ${token})`;
      if (/^[+\-*/]$/.test(token)) return token;
      if (token === "id") return `(local.get $_agent_id)`;
      return `(local.get $${token})`;
    })
    .join(" ");

  return converted;
}

function normalizeWASMExpression(
  expr: string,
  randomInputs: Set<string>,
  watCtx?: WATContext,
): string {
  let r = expr.trim();

  r = r.replace(/sqrt\(([^)]+)\)/g, (_match, arg) => {
    return `(f32.sqrt ${infixToSExpression(arg)})`;
  });

  r = r.replace(/(\w+(?:\.\w+)?)\s*\^2/g, "$1 * $1");
  r = r.replace(/(\w+(?:\.\w+)?)\s*\*\*2/g, "$1 * $1");

  r = r.replace(
    /([a-zA-Z_]\w*)\.(?!length|count)(\w+)/g,
    (match, obj, prop) => {
      if (obj === "inputs") return match;
      if (obj === "nearbyAgents") return match;
      if (
        obj === "f32" ||
        obj === "i32" ||
        obj === "local" ||
        obj === "global" ||
        obj === "call" ||
        obj === "return"
      )
        return match;
      return `${obj}_${prop}`;
    },
  );

  r = r.replace(/(\w+)\.length/g, "$1_count");
  r = r.replace(/(\w+)\.count/g, "$1_count");

  if (r.includes("neighbors(")) {
    const match = r.match(/neighbors\(([^)]+)\)/);
    if (match) return `__NEIGHBORS__${match[1]}__`;
  }

  if (r.includes("mean(")) {
    const match = r.match(/mean\(([^)]+)\)/);
    if (match) {
      const arg = match[1].trim();
      const propMatch = arg.match(/\w+\.(\w+)/);
      if (propMatch) return `__MEAN__${propMatch[1]}__`;
    }
  }

  if (r.includes("sense(")) {
    const match = r.match(/sense\(([^)]+)\)/);
    if (match) {
      const args = match[1].split(",").map((s) => infixToSExpression(s.trim()));
      if (args.length === 2) {
        return `(call $sense (local.get $x) (local.get $y) (local.get $vx) (local.get $vy) ${args[0]} ${args[1]})`;
      }
    }
  }

  r = r.replace(/random\(([^)]*)\)/g, (_match, args) => {
    const parts = args
      .split(",")
      .filter((s: string) => s.trim().length > 0)
      .map((s: string) => s.trim());
    const randCall = `__RANDOM_${watCtx ? watCtx.numRandomInputs + watCtx.randomCallCount : 0}__`;
    if (watCtx) watCtx.randomCallCount++;
    if (parts.length === 0) return randCall;
    if (parts.length === 1) return `(${randCall} * ${parts[0]})`;
    return `(${parts[0]} + ${randCall} * (${parts[1]} - ${parts[0]}))`;
  });

  if (r.includes("inputs.random")) {
    const randIdx = watCtx
      ? watCtx.numRandomInputs + watCtx.randomCallCount
      : 0;
    if (watCtx) watCtx.randomCallCount++;
    return normalizeWASMExpression(
      r.replace(/inputs\.random/g, `__RANDOM_${randIdx}__`),
      randomInputs,
      watCtx,
    );
  }

  if (randomInputs.size > 0) {
    r = r.replace(/inputs\.(\w+)/g, (match, name) => {
      if (randomInputs.has(name)) return name;
      return match;
    });
  }

  return infixToSExpression(r);
}

function normalizeWASMCondition(
  cond: string,
  randomInputs: Set<string>,
  watCtx?: WATContext,
): string {
  cond = cond.trim();

  const operators = [
    { op: ">=", asm: "f32.ge" },
    { op: "<=", asm: "f32.le" },
    { op: ">", asm: "f32.gt" },
    { op: "<", asm: "f32.lt" },
    { op: "==", asm: "f32.eq" },
    { op: "!=", asm: "f32.ne" },
  ];

  for (const { op, asm } of operators) {
    if (cond.includes(op)) {
      const parts = cond.split(op);
      const left = parts[0].trim();
      const right = parts.slice(1).join(op).trim();
      return `(${asm} ${normalizeWASMExpression(left, randomInputs, watCtx)} ${normalizeWASMExpression(right, randomInputs, watCtx)})`;
    }
  }

  return `(f32.ne ${normalizeWASMExpression(cond, randomInputs, watCtx)} (f32.const 0))`;
}

function parseCondition(
  condition: string,
  randomInputs: Set<string>,
  watCtx?: WATContext,
): string {
  condition = condition.trim();
  condition = condition.replace(/(\w+)\.length/g, "$1_count");
  return normalizeWASMCondition(condition, randomInputs, watCtx);
}

// ─── WAT Context ─────────────────────────────────────────────────────

interface BlockEntry {
  type: "if" | "foreach" | "for";
  /** Extra closing parens needed when this block is closed (from elseif expansion) */
  pendingClose: number;
}

interface WATContext {
  loopDepth: number;
  currentLoopVar?: string;
  /** Track neighbors variable info for foreach distance filtering */
  neighborsInfo: Map<string, { radiusExpr: string }>;
  variables: Map<
    string,
    {
      type: "neighbors" | "mean_result" | "scalar" | "loop_index";
      radiusExpr?: string;
      collection?: string;
      property?: string;
    }
  >;
  randomInputs: Set<string>;
  usedFunctions: Set<string>;
  localVars: Set<string>;
  /** Track block types for proper close-brace handling */
  blockStack: BlockEntry[];
  /** Pending closures to transfer to the next pushed block entry */
  deferredPendingClose: number;
  /** Counter for inline random() call sites (for indexed randomValues buffer) */
  randomCallCount: number;
  /** Total random values per agent (randomInputs + inline random calls) */
  numRandomCalls: number;
  /** Number of random input declarations (offset for inline random calls) */
  numRandomInputs: number;
  errors: { message: string; lineIndex: number }[];
  inputs: Set<string>;
  currentLineIndex: number;
}

// ─── WAT transpileLine ───────────────────────────────────────────────
// WAT keeps its own transpileLine because S-expression output requires
// very different handling from curly-brace languages.

function transpileLine(
  line: string,
  localVars: Set<string>,
  randomInputs: Set<string>,
  context: WATContext,
): string | null {
  const parsed = DSLParser.parseDSLLine(line);

  switch (parsed.type) {
    case "empty":
      return "";

    case "brace": {
      const trimmed = line.trim();
      if (trimmed === "}") {
        return "))"; // Close if or loop
      }
      return "";
    }

    case "var": {
      localVars.add(parsed.name);
      let expr = parsed.expression;
      const arrayMatchInVar = expr.match(/(\w+)\[\w+\]\.(\w+)/);
      if (arrayMatchInVar) {
        const offsets: Record<string, number> = {
          x: 4,
          y: 8,
          vx: 12,
          vy: 16,
          species: 20,
        };
        const offset = offsets[arrayMatchInVar[2]] || 0;
        return `(local.set $${parsed.name} (f32.load (i32.add (local.get $_for_ptr) (i32.const ${offset}))))`;
      }

      // Replace loop variable property access (e.g., nearby.x → nearby_x) in the FULL expression
      if (context.currentLoopVar) {
        const loopVarRegex = new RegExp(
          `\\b${context.currentLoopVar}\\.(\\w+)`,
          "g",
        );
        expr = expr.replace(loopVarRegex, `${context.currentLoopVar}_$1`);
      }
      const wasmExpr = normalizeWASMExpression(expr, randomInputs, context);
      if (wasmExpr.startsWith("__NEIGHBORS__")) {
        const radiusExpr = wasmExpr
          .replace("__NEIGHBORS__", "")
          .replace("__", "");
        const radius = normalizeWASMExpression(
          radiusExpr,
          randomInputs,
          context,
        );
        // Store neighbors info for foreach distance filtering
        context.neighborsInfo.set(parsed.name, { radiusExpr: radius });
        localVars.add(`${parsed.name}_count`);
        localVars.add(`${parsed.name}_sum_x`);
        localVars.add(`${parsed.name}_sum_y`);
        localVars.add(`${parsed.name}_sum_vx`);
        localVars.add(`${parsed.name}_sum_vy`);
        localVars.add("_loop_idx");
        localVars.add("_loop_ptr");
        localVars.add("_other_x");
        localVars.add("_other_y");
        localVars.add("_dx");
        localVars.add("_dy");
        localVars.add("_dist");
        return `
    ;; Find neighbors within radius (reading from agentsReadPtr for order-independent sensing)
    (local.set $${parsed.name}_count (f32.const 0))
    (local.set $${parsed.name}_sum_x (f32.const 0))
    (local.set $${parsed.name}_sum_y (f32.const 0))
    (local.set $${parsed.name}_sum_vx (f32.const 0))
    (local.set $${parsed.name}_sum_vy (f32.const 0))
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
            (local.set $${parsed.name}_count (f32.add (local.get $${parsed.name}_count) (f32.const 1)))
            (local.set $${parsed.name}_sum_x (f32.add (local.get $${parsed.name}_sum_x) (local.get $_other_x)))
            (local.set $${parsed.name}_sum_y (f32.add (local.get $${parsed.name}_sum_y) (local.get $_other_y)))
            (local.set $${parsed.name}_sum_vx (f32.add (local.get $${parsed.name}_sum_vx) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 12)))))
            (local.set $${parsed.name}_sum_vy (f32.add (local.get $${parsed.name}_sum_vy) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 16)))))
          ))
        ))
        (local.set $_loop_idx (i32.add (local.get $_loop_idx) (i32.const 1)))
        (local.set $_loop_ptr (i32.add (local.get $_loop_ptr) (i32.const 24)))
        (br $_neighbor_loop)
      )
    )`;
      }
      if (wasmExpr.startsWith("__MEAN__")) {
        const property = wasmExpr.replace("__MEAN__", "").replace("__", "");
        const collectionName = "nearbyAgents";
        return `(local.set $${parsed.name} (f32.div (local.get $${collectionName}_sum_${property}) (local.get $${collectionName}_count)))`;
      }
      return `(local.set $${parsed.name} ${wasmExpr})`;
    }

    case "if": {
      context.blockStack.push({
        type: "if",
        pendingClose: context.deferredPendingClose,
      });
      context.deferredPendingClose = 0;

      // Replace loop variable property access in conditions
      let condition = parsed.condition;
      if (context.currentLoopVar) {
        const loopVarRegex = new RegExp(
          `\\b${context.currentLoopVar}\\.(\\w+)`,
          "g",
        );
        condition = condition.replace(
          loopVarRegex,
          `${context.currentLoopVar}_$1`,
        );
      }

      const combinedCondition = (parts: string[], op: "and" | "or") => {
        const conditions = parts.map((p) =>
          parseCondition(p, randomInputs, context),
        );
        if (conditions.some((c) => c.includes("TODO")))
          return conditions.find((c) => c.includes("TODO")) ?? null;
        return `(if ${conditions.reduce((acc, c) => (acc ? `(i32.${op} ${acc} ${c})` : c))} (then`;
      };

      if (condition.includes("&&"))
        return (
          combinedCondition(
            condition.split("&&").map((p) => p.trim()),
            "and",
          ) ?? null
        );
      if (condition.includes("||"))
        return (
          combinedCondition(
            condition.split("||").map((p) => p.trim()),
            "or",
          ) ?? null
        );

      return `(if ${parseCondition(condition, randomInputs, context)} (then`;
    }

    case "else":
      context.blockStack.push({
        type: "if",
        pendingClose: context.deferredPendingClose,
      });
      context.deferredPendingClose = 0;
      return "(else";
    case "elseif":
      context.blockStack.push({
        type: "if",
        pendingClose: context.deferredPendingClose,
      });
      context.deferredPendingClose = 0;
      return `(elseif ${parseCondition(parsed.condition, randomInputs, context)}`;

    case "for": {
      context.blockStack.push({ type: "for", pendingClose: 0 });
      context.loopDepth++;
      const initMatch = parsed.init.match(/var\s+(\w+)\s*=\s*(.+)/);
      const condMatch = parsed.condition.match(/(\w+)\s*<\s*(\w+)\.length/);
      if (initMatch && condMatch && condMatch[2] === "nearbyAgents") {
        const loopVar = initMatch[1];
        context.currentLoopVar = loopVar;
        localVars.add(loopVar);
        if (loopVar !== "i") localVars.add(loopVar);
        localVars.add("_for_idx");
        localVars.add("_for_ptr");
        localVars.add("_for_dx");
        localVars.add("_for_dy");
        localVars.add("_for_dist");
        return `
    ;; For loop over nearbyAgents
    (local.set $_for_idx (i32.const 0))
    (local.set $_for_ptr (i32.const 0))
    (block $_for_exit
      (loop $_for_loop
        (br_if $_for_exit (i32.ge_u (local.get $_for_idx) (global.get $agent_count)))
        (if (i32.ne (local.get $_for_idx) (i32.trunc_f32_u (local.get $_agent_id))) (then
          (local.set $_for_dx (f32.sub (local.get $x) (f32.load (i32.add (local.get $_for_ptr) (i32.const 4)))))
          (local.set $_for_dy (f32.sub (local.get $y) (f32.load (i32.add (local.get $_for_ptr) (i32.const 8)))))
          (local.set $_for_dist (f32.sqrt (f32.add (f32.mul (local.get $_for_dx) (local.get $_for_dx)) (f32.mul (local.get $_for_dy) (local.get $_for_dy)))))
          (if (f32.lt (local.get $_for_dist) (global.get $inputs_perceptionRadius)) (then
            ;; This is a nearby agent - execute loop body`;
      } else {
        const loopVar = initMatch ? initMatch[1] : "i";
        localVars.add(loopVar);
        const initExpr = initMatch
          ? normalizeWASMExpression(initMatch[2], randomInputs, context)
          : "(f32.const 0)";
        return `
    ;; Standard for loop
    (local.set $${loopVar} ${initExpr})
    (block $_for_exit
      (loop $_for_loop
        (br_if $_for_exit (i32.eqz ${normalizeWASMCondition(parsed.condition, randomInputs, context)}))
        ;; Loop body`;
      }
    }

    case "foreach": {
      const collection = parsed.collection;
      const loopVar = parsed.varName || parsed.itemAlias;

      if (loopVar) {
        context.currentLoopVar = loopVar;
        context.loopDepth++;
        context.blockStack.push({ type: "foreach", pendingClose: 0 });
        localVars.add("_foreach_idx");
        localVars.add("_foreach_ptr");
        localVars.add(`${loopVar}_x`);
        localVars.add(`${loopVar}_y`);
        localVars.add(`${loopVar}_vx`);
        localVars.add(`${loopVar}_vy`);
        localVars.add(`${loopVar}_species`);
        localVars.add("_foreach_dx");
        localVars.add("_foreach_dy");
        localVars.add("_foreach_dist");

        // Check if this collection has neighbor info for distance filtering
        const collectionName = collection || loopVar;
        const neighborsInfo = context.neighborsInfo.get(collectionName);
        const radiusExpr = neighborsInfo ? neighborsInfo.radiusExpr : null;

        return `
    ;; Foreach loop over nearby agents
    (local.set $_foreach_idx (i32.const 0))
    (local.set $_foreach_ptr (global.get $agentsReadPtr))
    (block $_foreach_exit
      (loop $_foreach_loop
        (br_if $_foreach_exit (i32.ge_u (local.get $_foreach_idx) (global.get $agent_count)))
        ;; Skip self
        (if (i32.ne (local.get $_foreach_idx) (i32.trunc_f32_u (local.get $_agent_id))) (then
          (local.set $${loopVar}_x (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 4))))
          (local.set $${loopVar}_y (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 8))))
          (local.set $${loopVar}_vx (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 12))))
          (local.set $${loopVar}_vy (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 16))))
          (local.set $${loopVar}_species (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 20))))
          (local.set $_foreach_dx (f32.sub (local.get $x) (local.get $${loopVar}_x)))
          (local.set $_foreach_dy (f32.sub (local.get $y) (local.get $${loopVar}_y)))
          (local.set $_foreach_dist (f32.sqrt (f32.add (f32.mul (local.get $_foreach_dx) (local.get $_foreach_dx)) (f32.mul (local.get $_foreach_dy) (local.get $_foreach_dy)))))
          ${radiusExpr ? `(if (f32.lt (local.get $_foreach_dist) ${radiusExpr}) (then` : "(if (i32.const 1) (then"}
            ;; Nearby agent - execute loop body`;
      }
      return `;; TODO: foreach loops require a variable name`;
    }

    case "assignment": {
      let assignExpr = parsed.expression;
      const arrayMatch = assignExpr.match(/(\w+)\[\w+\]\.(\w+)/);
      if (arrayMatch) {
        const offsets: Record<string, number> = {
          x: 4,
          y: 8,
          vx: 12,
          vy: 16,
          species: 20,
        };
        const offset = offsets[arrayMatch[2]] || 0;
        const loadExpr = `(f32.load (i32.add (local.get $_for_ptr) (i32.const ${offset})))`;
        assignExpr = assignExpr.replace(/(\w+)\[\w+\]\.(\w+)/, loadExpr);
        return `(local.set $${parsed.target} ${normalizeWASMExpression(assignExpr, randomInputs, context)})`;
      }

      // Replace loop variable property access (e.g., nearby.x → nearby_x) in the FULL expression
      if (context.currentLoopVar) {
        const loopVarRegex = new RegExp(
          `\\b${context.currentLoopVar}\\.(\\w+)`,
          "g",
        );
        assignExpr = assignExpr.replace(
          loopVarRegex,
          `${context.currentLoopVar}_$1`,
        );
      }
      return `(local.set $${parsed.target} ${normalizeWASMExpression(assignExpr, randomInputs, context)})`;
    }

    case "command": {
      // Delegate to centralized command registry
      const ctx: CompilationContext = createContext(
        Array.from(context.inputs),
        Array.from(randomInputs),
        context.numRandomCalls,
      );
      ctx.localVars = localVars;
      if (context.currentLoopVar) ctx.currentLoopVar = context.currentLoopVar;
      ctx.loopDepth = context.loopDepth;
      const result = registryEmitCommand(
        parsed.command,
        parsed.argument,
        WATTarget,
        ctx,
      );
      if (result && result.length > 0) {
        return result.join("\n    ");
      }
      return `;; TODO: ${parsed.command} not yet implemented in WASM`;
    }

    case "unknown":
    default:
      return null;
  }
}

// ─── WAT Target (interface conformance) ──────────────────────────────
// The WAT target implements CompilerTarget for type compatibility, but
// compileDSLtoWAT uses its own iteration logic due to S-expression nesting.

export const WATTarget: CompilerTarget = {
  name: "wat",

  emitExpression(expr: string, ctx: CompilationContext): string {
    return normalizeWASMExpression(expr, ctx.randomInputs);
  },

  emitVar(name: string, expression: string, ctx: CompilationContext): string[] {
    ctx.localVars.add(name);
    return [
      `(local.set $${name} ${normalizeWASMExpression(expression, ctx.randomInputs)})`,
    ];
  },

  emitIf(condition: string, ctx: CompilationContext): string[] {
    return [`(if ${parseCondition(condition, ctx.randomInputs)} (then`];
  },

  emitElseIf(condition: string, ctx: CompilationContext): string[] {
    return [`(elseif ${parseCondition(condition, ctx.randomInputs)}`];
  },

  emitElse(): string[] {
    return ["(else"];
  },

  emitFor(
    _init: string,
    _condition: string,
    _increment: string,
    _ctx: CompilationContext,
  ): string[] {
    return [";; for loop (not used through shared transpiler)"];
  },

  emitForeach(
    _collection: string,
    _varName: string | undefined,
    _itemAlias: string | undefined,
    _ctx: CompilationContext,
  ): string[] {
    return [";; foreach loop (not used through shared transpiler)"];
  },

  emitAssignment(
    target: string,
    expression: string,
    ctx: CompilationContext,
  ): string[] {
    return [
      `(local.set $${target} ${normalizeWASMExpression(expression, ctx.randomInputs)})`,
    ];
  },

  emitCloseBrace(_ctx: CompilationContext): string[] {
    return ["))"];
  },

  emitProgram(
    _statements: string[],
    _inputs: string[],
    _randomInputs: string[],
    _ctx: CompilationContext,
  ): string {
    return ";; WAT program generation uses compileDSLtoWAT directly";
  },
};

// ─── Entry Point ─────────────────────────────────────────────────────
// WAT uses its own iteration logic due to S-expression nesting requirements.
// The CompilerTarget interface is implemented above for type compatibility
// and future shared-transpiler migration if WAT nesting is unified.

/**
 * Compile Agentyx DSL lines into a complete WAT (WebAssembly Text) module.
 *
 * Uses its own iteration logic (rather than the shared transpiler) due to
 * S-expression nesting requirements unique to the WAT format.
 *
 * @param lines - Parsed DSL line array from preprocessing.
 * @param inputs - Required input names.
 * @param randomInputs - Names of random-valued input declarations.
 * @param numRandomCalls - Total random values needed per agent per frame.
 * @returns Complete WAT module source as a string.
 */
export const compileDSLtoWAT = (
  lines: LineInfo[],
  inputs: string[],
  randomInputs: string[] = [],
  numRandomCalls: number = 0,
): { code: string; errors: { message: string; lineIndex: number }[] } => {
  const statements: string[] = [];
  const localVars = new Set<string>();
  const randomInputsSet = new Set(randomInputs);
  const errors: { message: string; lineIndex: number }[] = [];

  const context: WATContext = {
    loopDepth: 0,
    neighborsInfo: new Map(),
    variables: new Map(),
    randomInputs: randomInputsSet,
    usedFunctions: new Set(),
    localVars,
    blockStack: [],
    deferredPendingClose: 0,
    randomCallCount: 0,
    numRandomCalls,
    errors,
    inputs: new Set(inputs),
    currentLineIndex: 0,
    numRandomInputs: randomInputs.length,
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.content.trim();
    if (!trimmed) continue;

    // Handle "} else {" or "} else if (...)" on one line: emit ) for the closing brace
    if (trimmed.startsWith("}") && trimmed !== "}") {
      // Pop the block for the implicit }
      const closedBlock = context.blockStack.pop();
      if (
        closedBlock &&
        (closedBlock.type === "foreach" || closedBlock.type === "for")
      ) {
        context.loopDepth--;
        if (context.loopDepth <= 0) context.currentLoopVar = undefined;
      }
      // Transfer pending closures to deferred (will be picked up by next block push)
      if (closedBlock) context.deferredPendingClose += closedBlock.pendingClose;
      statements.push(")");
    }

    let transpiled = transpileLine(
      trimmed,
      localVars,
      randomInputsSet,
      context,
    );

    if (transpiled === null && trimmed !== "}") {
      if (context.blockStack.length > 0) {
        errors.push({
          message: "Missing closing brace",
          lineIndex: lines[lines.length - 1].lineIndex,
        });
      }
    }

    // Handle closing brace
    if (trimmed === "}") {
      const closedBlock = context.blockStack.pop();

      // Look ahead to see if next line is else/elseif
      let nextLineIndex = i + 1;
      let nextLineContent = "";
      while (nextLineIndex < lines.length) {
        const c = lines[nextLineIndex].content.trim();
        if (c) {
          nextLineContent = c;
          break;
        }
        nextLineIndex++;
      }
      const followedByElse =
        nextLineContent.startsWith("else") ||
        nextLineContent.startsWith("} else");

      if (closedBlock && closedBlock.type === "foreach") {
        // Close the foreach loop: close the distance/body if, skip-self if, then loop/block
        context.loopDepth--;
        if (context.loopDepth <= 0) context.currentLoopVar = undefined;

        transpiled = `))\n    ))\n    (local.set $_foreach_idx (i32.add (local.get $_foreach_idx) (i32.const 1)))\n    (local.set $_foreach_ptr (i32.add (local.get $_foreach_ptr) (i32.const 24)))\n    (br $_foreach_loop)\n    )\n    )`;
      } else if (closedBlock && closedBlock.type === "for") {
        context.loopDepth--;
        if (context.loopDepth <= 0) context.currentLoopVar = undefined;
        // Close for loop structure
        transpiled = `))\n    ))\n    (local.set $_for_idx (i32.add (local.get $_for_idx) (i32.const 1)))\n    (local.set $_for_ptr (i32.add (local.get $_for_ptr) (i32.const 24)))\n    (br $_for_loop)\n    )\n    )`;
      } else {
        // Regular if/else close brace
        const entryPendingClose = closedBlock ? closedBlock.pendingClose : 0;
        if (followedByElse) {
          transpiled = ")";
          // Transfer this block's pending closures to deferred for the next pushed block
          context.deferredPendingClose += entryPendingClose;
        } else {
          transpiled = "))";
          if (entryPendingClose > 0) {
            transpiled += ")".repeat(entryPendingClose);
          }
        }
      }
    }

    if (transpiled !== null && transpiled !== "") {
      // Convert elseif to nested else+if (WAT doesn't have elseif)
      if (transpiled.startsWith("(elseif")) {
        const cond = transpiled.substring(8);
        transpiled = `(else (if ${cond} (then`;
        // Add 2 pending closures to the block entry just pushed by the elseif handler
        // These close the (else and (if that were opened by the expansion
        const lastEntry = context.blockStack[context.blockStack.length - 1];
        if (lastEntry) lastEntry.pendingClose += 2;
      }

      statements.push(transpiled);
    }
  }

  if (statements.length === 0) {
    statements.push(";; no-op");
  }

  localVars.add("_agent_id");
  randomInputs.forEach((r) => localVars.add(r));

  const inputGlobals =
    inputs.length > 0
      ? inputs
          .filter(
            (n) =>
              n !== "randomValues" &&
              n !== "trailMap" &&
              n !== "obstacles" &&
              n !== "obstacleCount",
          )
          .map(
            (n) =>
              `(global $inputs_${n} (export "inputs_${n}") (mut f32) (f32.const 0))`,
          )
          .join("\n  ")
      : "";
  const agentCountGlobal = `(global $agent_count (export "agent_count") (mut i32) (i32.const 0))`;

  const i32Vars = new Set([
    "_loop_idx",
    "_loop_ptr",
    "_for_idx",
    "_for_ptr",
    "_foreach_idx",
    "_foreach_ptr",
    "_obs_idx",
    "_obs_ptr",
  ]);
  const reservedLocals = new Set(["x", "y", "vx", "vy", "species"]);
  const localVarDecls = Array.from(localVars)
    .filter((v) => !reservedLocals.has(v))
    .map((v) => `(local $${v} ${i32Vars.has(v) ? "i32" : "f32"})`)
    .join("\n      ");

  const agentKernel = `
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))
    (local.set $species (f32.load (i32.add (local.get $ptr) (i32.const 20))))

    ;; load random values (indexed: agent_id * numRandomCalls + ri)
    ${randomInputs.map((r, ri) => `(local.set $${r} (f32.load (i32.add (global.get $randomValuesPtr) (i32.shl (i32.add (i32.mul (i32.trunc_f32_u (local.get $_agent_id)) (i32.const ${numRandomCalls})) (i32.const ${ri})) (i32.const 2)))))`).join("\n    ")}

    ;; execute DSL
    ${statements.join("\n    ")}

    ;; store back (species at offset 20 is preserved, not modified)
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))
    (f32.store (i32.add (local.get $ptr) (i32.const 12)) (local.get $vx))
    (f32.store (i32.add (local.get $ptr) (i32.const 16)) (local.get $vy))
    (f32.store (i32.add (local.get $ptr) (i32.const 20)) (local.get $species))
  `;

  const stepFuncLocals = localVars.size > 0 ? `\n      ${localVarDecls}` : "";

  return {
    code: `
  (module
    (import "env" "memory" (memory 1))
    (import "env" "sin" (func $sin (param f32) (result f32)))
    (import "env" "cos" (func $cos (param f32) (result f32)))
    (import "env" "atan2" (func $atan2 (param f32 f32) (result f32)))
    (import "env" "random" (func $random_js (result f32)))
    (import "env" "print" (func $print (param f32 f32)))

    ${inputGlobals}
    ${
      inputs.includes("trailMap")
        ? `(global $trailMapReadPtr (export "trailMapReadPtr") (mut i32) (i32.const 0))
    (global $trailMapWritePtr (export "trailMapWritePtr") (mut i32) (i32.const 0))`
        : ""
    }
    ${inputs.includes("randomValues") ? '(global $randomValuesPtr (export "randomValuesPtr") (mut i32) (i32.const 0))' : ""}
    ${
      inputs.includes("obstacles")
        ? `(global $obstaclesPtr (export "obstaclesPtr") (mut i32) (i32.const 0))
    (global $inputs_obstacleCount (export "inputs_obstacleCount") (mut i32) (i32.const 0))`
        : ""
    }
    (global $agentsReadPtr (export "agentsReadPtr") (mut i32) (i32.const 0))

    ${
      inputs.includes("randomValues")
        ? `(func $random (param $id f32) (param $callIndex i32) (result f32)
      ;; Load randomValues[id * numRandomCalls + callIndex]
      (f32.load
        (i32.add
          (global.get $randomValuesPtr)
          (i32.shl
            (i32.add
              (i32.mul (i32.trunc_f32_u (local.get $id)) (i32.const ${numRandomCalls}))
              (local.get $callIndex))
            (i32.const 2)))))`
        : ";; No random function needed (no randomValues input)"
    }

    ${
      inputs.includes("trailMap")
        ? `
    (func $sense (param $x f32) (param $y f32) (param $vx f32) (param $vy f32) (param $angleOffset f32) (param $dist f32) (result f32)
      (local $angle f32) (local $sx f32) (local $sy f32) (local $ix i32) (local $iy i32) (local $w i32) (local $h i32) (local $idx i32)
      (local.set $w (i32.trunc_f32_s (global.get $inputs_width)))
      (local.set $h (i32.trunc_f32_s (global.get $inputs_height)))
      (local.set $angle (f32.add (call $atan2 (local.get $vy) (local.get $vx)) (local.get $angleOffset)))
      (local.set $sx (f32.add (local.get $x) (f32.mul (call $cos (local.get $angle)) (local.get $dist))))
      (local.set $sy (f32.add (local.get $y) (f32.mul (call $sin (local.get $angle)) (local.get $dist))))
      (local.set $ix (i32.trunc_f32_s (local.get $sx)))
      (local.set $iy (i32.trunc_f32_s (local.get $sy)))
      (if (i32.lt_s (local.get $ix) (i32.const 0)) (then (local.set $ix (i32.add (local.get $ix) (local.get $w)))))
      (if (i32.ge_s (local.get $ix) (local.get $w)) (then (local.set $ix (i32.sub (local.get $ix) (local.get $w)))))
      (if (i32.lt_s (local.get $iy) (i32.const 0)) (then (local.set $iy (i32.add (local.get $iy) (local.get $h)))))
      (if (i32.ge_s (local.get $iy) (local.get $h)) (then (local.set $iy (i32.sub (local.get $iy) (local.get $h)))))
      (if (i32.eqz (global.get $trailMapReadPtr)) (then (return (f32.const 0))))
      (local.set $idx (i32.add (i32.mul (local.get $iy) (local.get $w)) (local.get $ix)))
      ;; Read from trailMapReadPtr (previous frame state)
      (f32.load (i32.add (global.get $trailMapReadPtr) (i32.shl (local.get $idx) (i32.const 2))))
    )
    (func $deposit (param $x f32) (param $y f32) (param $amount f32)
      (local $ix i32) (local $iy i32) (local $w i32) (local $h i32) (local $idx i32) (local $ptr i32) (local $val f32)
      (local.set $w (i32.trunc_f32_s (global.get $inputs_width)))
      (local.set $h (i32.trunc_f32_s (global.get $inputs_height)))
      (local.set $ix (i32.trunc_f32_s (local.get $x)))
      (local.set $iy (i32.trunc_f32_s (local.get $y)))
      (if (i32.lt_s (local.get $ix) (i32.const 0)) (then (local.set $ix (i32.add (local.get $ix) (local.get $w)))))
      (if (i32.ge_s (local.get $ix) (local.get $w)) (then (local.set $ix (i32.sub (local.get $ix) (local.get $w)))))
      (if (i32.lt_s (local.get $iy) (i32.const 0)) (then (local.set $iy (i32.add (local.get $iy) (local.get $h)))))
      (if (i32.ge_s (local.get $iy) (local.get $h)) (then (local.set $iy (i32.sub (local.get $iy) (local.get $h)))))
      ;; Write to trailMapWritePtr (deposits for this frame)
      (if (global.get $trailMapWritePtr) (then
         (local.set $idx (i32.add (i32.mul (local.get $iy) (local.get $w)) (local.get $ix)))
         (local.set $ptr (i32.add (global.get $trailMapWritePtr) (i32.shl (local.get $idx) (i32.const 2))))
         (local.set $val (f32.load (local.get $ptr)))
         (f32.store (local.get $ptr) (f32.add (local.get $val) (local.get $amount)))
      ))
    )`
        : ""
    }

    ${agentCountGlobal}

    (func (export "step") (param $ptr i32)
      (local $x f32) (local $y f32) (local $vx f32) (local $vy f32) (local $species f32)${stepFuncLocals}
      ${agentKernel}
    )

    (func (export "step_all") (param $base i32) (param $_total_count i32)
      (local $_outer_i i32) (local $ptr i32) (local $x f32) (local $y f32) (local $vx f32) (local $vy f32) (local $species f32)${stepFuncLocals}
      (local.set $_outer_i (i32.const 0))
      (local.set $ptr (local.get $base))
      (block $exit
        (loop $loop
          (br_if $exit (i32.ge_u (local.get $_outer_i) (local.get $_total_count)))
          ${agentKernel}
          (local.set $_outer_i (i32.add (local.get $_outer_i) (i32.const 1)))
          (local.set $ptr (i32.add (local.get $ptr) (i32.const 24)))
          (br $loop)
        )
      )
    )
  )`,
    errors,
  };
};
