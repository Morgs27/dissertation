import type Logger from "../helpers/logger";
import { Compiler, type AVAILABLE_COMMANDS } from "./compiler";

const COMMANDS: Record<
  AVAILABLE_COMMANDS,
  {
    target: "x" | "y" | "vx" | "vy";
    op: "add" | "sub" | "set" | "update" | "complex";
  }
> = {
  moveUp: { target: "y", op: "sub" },
  moveDown: { target: "y", op: "add" },
  moveLeft: { target: "x", op: "sub" },
  moveRight: { target: "x", op: "add" },
  addVelocityX: { target: "vx", op: "add" },
  addVelocityY: { target: "vy", op: "add" },
  setVelocityX: { target: "vx", op: "set" },
  setVelocityY: { target: "vy", op: "set" },
  updatePosition: { target: "x", op: "update" },
  borderWrapping: { target: "x", op: "complex" },
  borderBounce: { target: "x", op: "complex" },
  limitSpeed: { target: "vx", op: "complex" },
};

/**
 * Simple tokenizer for expressions
 */
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
    } else if (/[\s]/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else if (/[+\-*/^]/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      // Check for ** or compound operators
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

/**
 * Converts infix expression to WASM S-expression
 */
function infixToSExpression(expr: string): string {
  expr = expr.trim();

  // Handle property access like neighbor.x or nearbyAgents.length
  if (expr.includes(".")) {
    expr = expr.replace(/(\w+)\.(\w+)/g, "$1_$2");
  }

  // Replace inputs.* references with GLOBAL markers
  expr = expr.replace(/inputs_(\w+)/g, "GLOBAL_$1");

  // Handle exponentiation operator
  expr = expr.replace(/\^/g, "**");

  // Handle simple cases
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return `(f32.const ${expr})`;
  }

  // Check for GLOBAL before checking for simple identifier
  // Only match if the ENTIRE expression is a GLOBAL_ variable, not just starts with it
  if (/^GLOBAL_\w+$/.test(expr)) {
    return `(global.get $inputs_${expr.substring(7)})`;
  }

  if (/^[a-zA-Z_]\w*$/.test(expr)) {
    return `(local.get $${expr})`;
  }

  // Tokenize the expression
  const tokens = tokenizeExpression(expr);

  if (tokens.length === 1) {
    const token = tokens[0];

    if (/^GLOBAL_\w+$/.test(token)) {
      return `(global.get $inputs_${token.substring(7)})`;
    }
    if (/^-?\d+(\.\d+)?$/.test(token)) {
      return `(f32.const ${token})`;
    }
    if (token.startsWith("(") && token.endsWith(")")) {
      return infixToSExpression(token.slice(1, -1));
    }
    return `(local.get $${token})`;
  }

  // Find operators with lowest precedence (addition/subtraction)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "+" || tokens[i] === "-") {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");
      const op = tokens[i] === "+" ? "f32.add" : "f32.sub";
      return `(${op} ${infixToSExpression(left)} ${infixToSExpression(right)})`;
    }
  }

  // Find multiplication/division (skip ** which is exponentiation)
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "*" && tokens[i - 1] !== "*") {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");
      return `(f32.mul ${infixToSExpression(left)} ${infixToSExpression(right)})`;
    } else if (tokens[i] === "/") {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");
      return `(f32.div ${infixToSExpression(left)} ${infixToSExpression(right)})`;
    }
  }

  // Find exponentiation - handle ^2 and **2 as multiplication
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "**" || tokens[i] === "^") {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");

      // Special case: squaring (^2 or **2)
      if (right.trim() === "2") {
        const base = infixToSExpression(left);
        return `(f32.mul ${base} ${base})`;
      }

      // For other exponents, we can't easily support in WASM
      return ";; UNSUPPORTED: exponentiation (only ^2 is supported)";
    }
  }

  // If we get here, just join tokens and try to convert each one
  const converted = tokens
    .map((token) => {
      if (/^GLOBAL_\w+$/.test(token)) {
        return `(global.get $inputs_${token.substring(7)})`;
      }
      if (/^-?\d+(\.\d+)?$/.test(token)) {
        return `(f32.const ${token})`;
      }
      if (/^[+\-*/]$/.test(token)) {
        return token;
      }
      return `(local.get $${token})`;
    })
    .join(" ");

  return converted;
}

/**
 * Normalizes expressions for WASM (converts to S-expressions)
 */
function normalizeWASMExpression(expr: string): string {
  let r = expr.trim();

  // Handle sqrt function - WASM has native support!
  r = r.replace(/sqrt\(([^)]+)\)/g, (_match, arg) => {
    return `(f32.sqrt ${infixToSExpression(arg)})`;
  });

  // Handle exponentiation ^2 and **2 by expanding to multiplication
  // Match patterns like "inputs.x^2" or "variable**2" - DON'T add parentheses
  r = r.replace(/(\w+(?:\.\w+)?)\s*\^2/g, "$1 * $1");
  r = r.replace(/(\w+(?:\.\w+)?)\s*\*\*2/g, "$1 * $1");

  // Handle neighbors() - mark for special processing
  if (r.includes("neighbors(")) {
    const match = r.match(/neighbors\(([^)]+)\)/);
    if (match) {
      return `__NEIGHBORS__${match[1]}__`;
    }
  }

  // Handle mean() - mark for special processing
  if (r.includes("mean(")) {
    const match = r.match(/mean\(([^)]+)\)/);
    if (match) {
      const arg = match[1].trim();
      // Extract property name from patterns like "nearbyAgents.vx"
      const propMatch = arg.match(/\w+\.(\w+)/);
      if (propMatch) {
        return `__MEAN__${propMatch[1]}__`;
      }
    }
  }

  // Convert to S-expression
  return infixToSExpression(r);
}

function normalizeWASMCondition(cond: string): string {
  cond = cond.trim();

  // Handle "i < count"
  if (cond.includes("<=")) {
    const [left, right] = cond.split("<=").map((s) => s.trim());
    return `(i32.le_u (local.get $${left}) (local.get $${right}))`;
  } else if (cond.includes("<")) {
    const [left, right] = cond.split("<").map((s) => s.trim());
    return `(i32.lt_u (local.get $${left}) (local.get $${right}))`;
  } else if (cond.includes(">=")) {
    const [left, right] = cond.split(">=").map((s) => s.trim());
    return `(i32.ge_u (local.get $${left}) (local.get $${right}))`;
  } else if (cond.includes(">")) {
    const [left, right] = cond.split(">").map((s) => s.trim());
    return `(i32.gt_u (local.get $${left}) (local.get $${right}))`;
  } else {
    // fallback (never true)
    return `(i32.const 0)`;
  }
}

/**
 * Parses a single condition into WASM comparison
 */
function parseCondition(condition: string): string {
  condition = condition.trim();

  // Handle .length property access for collections (like nearbyAgents.length)
  condition = condition.replace(/(\w+)\.length/g, "$1_count");

  // Check for comparison operators in order of precedence
  if (condition.includes(">=")) {
    const parts = condition.split(">=").map((p) => p.trim());
    const left = normalizeWASMExpression(parts[0]);
    const right = normalizeWASMExpression(parts[1]);
    if (left.includes("UNSUPPORTED") || right.includes("UNSUPPORTED")) {
      return `;; TODO: Unsupported expression in condition: ${condition}`;
    }
    return `(f32.ge ${left} ${right})`;
  } else if (condition.includes("<=")) {
    const parts = condition.split("<=").map((p) => p.trim());
    const left = normalizeWASMExpression(parts[0]);
    const right = normalizeWASMExpression(parts[1]);
    if (left.includes("UNSUPPORTED") || right.includes("UNSUPPORTED")) {
      return `;; TODO: Unsupported expression in condition: ${condition}`;
    }
    return `(f32.le ${left} ${right})`;
  } else if (condition.includes(">")) {
    const parts = condition.split(">").map((p) => p.trim());
    const left = normalizeWASMExpression(parts[0]);
    const right = normalizeWASMExpression(parts[1]);
    if (left.includes("UNSUPPORTED") || right.includes("UNSUPPORTED")) {
      return `;; TODO: Unsupported expression in condition: ${condition}`;
    }
    return `(f32.gt ${left} ${right})`;
  } else if (condition.includes("<")) {
    const parts = condition.split("<").map((p) => p.trim());
    const left = normalizeWASMExpression(parts[0]);
    const right = normalizeWASMExpression(parts[1]);
    if (left.includes("UNSUPPORTED") || right.includes("UNSUPPORTED")) {
      return `;; TODO: Unsupported expression in condition: ${condition}`;
    }
    return `(f32.lt ${left} ${right})`;
  } else if (condition.includes("==")) {
    const parts = condition.split("==").map((p) => p.trim());
    const left = normalizeWASMExpression(parts[0]);
    const right = normalizeWASMExpression(parts[1]);
    if (left.includes("UNSUPPORTED") || right.includes("UNSUPPORTED")) {
      return `;; TODO: Unsupported expression in condition: ${condition}`;
    }
    return `(f32.eq ${left} ${right})`;
  } else if (condition.includes("!=")) {
    const parts = condition.split("!=").map((p) => p.trim());
    const left = normalizeWASMExpression(parts[0]);
    const right = normalizeWASMExpression(parts[1]);
    if (left.includes("UNSUPPORTED") || right.includes("UNSUPPORTED")) {
      return `;; TODO: Unsupported expression in condition: ${condition}`;
    }
    return `(f32.ne ${left} ${right})`;
  } else {
    return `;; TODO: Unrecognized condition pattern in WASM: ${condition}`;
  }
}

/**
 * Transpiles a single line of DSL to WASM using shared parser
 */
function transpileLine(line: string, localVars: Set<string>): string | null {
  const parsed = Compiler.parseDSLLine(line);

  switch (parsed.type) {
    case "empty":
      return "";

    case "brace": {
      const trimmed = line.trim();
      // Convert closing braces to proper WASM syntax
      if (trimmed === "}") {
        return "))"; // Close if or loop
      }
      return ""; // Opening braces are implicit in WASM
    }

    case "var": {
      // Track local variable declarations
      localVars.add(parsed.name);

      // Handle array indexing directly before normalization
      let expr = parsed.expression;
      const arrayMatch = expr.match(/nearbyAgents\[\w+\]\.(\w+)/);
      if (arrayMatch) {
        const offsets: Record<string, number> = { x: 4, y: 8, vx: 12, vy: 16 };
        const offset = offsets[arrayMatch[1]] || 0;
        return `(local.set $${parsed.name} (f32.load (i32.add (local.get $_for_ptr) (i32.const ${offset}))))`;
      }

      let wasmExpr = normalizeWASMExpression(expr);

      // Handle neighbors() - generate code to iterate through agents
      if (wasmExpr.startsWith("__NEIGHBORS__")) {
        const radiusExpr = wasmExpr
          .replace("__NEIGHBORS__", "")
          .replace("__", "");
        const radius = normalizeWASMExpression(radiusExpr);

        // Add local variables for neighbor search
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

        // Generate neighbor search loop
        return `
    ;; Find neighbors within radius
    (local.set $${parsed.name}_count (f32.const 0))
    (local.set $${parsed.name}_sum_x (f32.const 0))
    (local.set $${parsed.name}_sum_y (f32.const 0))
    (local.set $${parsed.name}_sum_vx (f32.const 0))
    (local.set $${parsed.name}_sum_vy (f32.const 0))
    (local.set $_loop_idx (i32.const 0))
    (local.set $_loop_ptr (i32.const 0))
    (block $_neighbor_exit
      (loop $_neighbor_loop
        (br_if $_neighbor_exit (i32.ge_u (local.get $_loop_idx) (global.get $agent_count)))
        
        ;; Skip self
        (if (i32.ne (local.get $_loop_idx) (i32.trunc_f32_u (local.get $_agent_id))) (then
          ;; Load other agent's position
          (local.set $_other_x (f32.load (i32.add (local.get $_loop_ptr) (i32.const 4))))
          (local.set $_other_y (f32.load (i32.add (local.get $_loop_ptr) (i32.const 8))))
          
          ;; Calculate distance
          (local.set $_dx (f32.sub (local.get $x) (local.get $_other_x)))
          (local.set $_dy (f32.sub (local.get $y) (local.get $_other_y)))
          (local.set $_dist (f32.sqrt (f32.add (f32.mul (local.get $_dx) (local.get $_dx)) (f32.mul (local.get $_dy) (local.get $_dy)))))
          
          ;; If within radius, accumulate
          (if (f32.lt (local.get $_dist) ${radius}) (then
            (local.set $${parsed.name}_count (f32.add (local.get $${parsed.name}_count) (f32.const 1)))
            (local.set $${parsed.name}_sum_x (f32.add (local.get $${parsed.name}_sum_x) (local.get $_other_x)))
            (local.set $${parsed.name}_sum_y (f32.add (local.get $${parsed.name}_sum_y) (local.get $_other_y)))
            (local.set $${parsed.name}_sum_vx (f32.add (local.get $${parsed.name}_sum_vx) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 12)))))
            (local.set $${parsed.name}_sum_vy (f32.add (local.get $${parsed.name}_sum_vy) (f32.load (i32.add (local.get $_loop_ptr) (i32.const 16)))))
          ))
        ))
        
        ;; Increment loop
        (local.set $_loop_idx (i32.add (local.get $_loop_idx) (i32.const 1)))
        (local.set $_loop_ptr (i32.add (local.get $_loop_ptr) (i32.const 20)))
        (br $_neighbor_loop)
      )
    )`;
      }

      // Handle mean() - use pre-calculated sums
      if (wasmExpr.startsWith("__MEAN__")) {
        const property = wasmExpr.replace("__MEAN__", "").replace("__", "");
        // Assume the variable before this was nearbyAgents
        const collectionName = "nearbyAgents"; // We'd need to track this properly
        return `(local.set $${parsed.name} (f32.div (local.get $${collectionName}_sum_${property}) (local.get $${collectionName}_count)))`;
      }

      if (wasmExpr.startsWith(";; UNSUPPORTED:")) {
        return `;; Variable ${parsed.name}: ${wasmExpr}`;
      }
      return `(local.set $${parsed.name} ${wasmExpr})`;
    }

    case "if": {
      // WASM if statement - now handles logical operators
      const condition = parsed.condition;

      // Handle logical AND (&&)
      if (condition.includes("&&")) {
        const parts = condition.split("&&").map((p) => p.trim());
        const conditions: string[] = [];

        for (const part of parts) {
          const cond = parseCondition(part);
          if (cond.includes("UNSUPPORTED") || cond.includes("TODO")) {
            return `;; TODO: Unsupported expression in AND condition: ${condition}`;
          }
          conditions.push(cond);
        }

        // WASM: (if (i32.and cond1 cond2) (then ...
        const combined = conditions.reduce((acc, c) =>
          acc ? `(i32.and ${acc} ${c})` : c
        );
        return `(if ${combined} (then`;
      }

      // Handle logical OR (||)
      if (condition.includes("||")) {
        const parts = condition.split("||").map((p) => p.trim());
        const conditions: string[] = [];

        for (const part of parts) {
          const cond = parseCondition(part);
          if (cond.includes("UNSUPPORTED") || cond.includes("TODO")) {
            return `;; TODO: Unsupported expression in OR condition: ${condition}`;
          }
          conditions.push(cond);
        }

        // WASM: (if (i32.or cond1 cond2) (then ...
        const combined = conditions.reduce((acc, c) =>
          acc ? `(i32.or ${acc} ${c})` : c
        );
        return `(if ${combined} (then`;
      }

      // Simple condition
      const cond = parseCondition(condition);
      if (cond.includes("UNSUPPORTED") || cond.includes("TODO")) {
        return cond;
      }
      return `(if ${cond} (then`;
    }

    case "for": {
      // Check if iterating over nearbyAgents collection
      // Pattern: for (var i = 0; i < nearbyAgents.length; i++)
      const initMatch = parsed.init.match(/var\s+(\w+)\s*=\s*(.+)/);
      const condMatch = parsed.condition.match(/(\w+)\s*<\s*(\w+)\.length/);

      if (initMatch && condMatch && condMatch[2] === "nearbyAgents") {
        const loopVar = initMatch[1]; // e.g., "i"

        // Add necessary local variables
        localVars.add(loopVar);
        localVars.add("_for_idx");
        localVars.add("_for_ptr");
        localVars.add("_for_dx");
        localVars.add("_for_dy");
        localVars.add("_for_dist");

        // Don't declare the user's loop variable if it conflicts with step_all's $i
        // Just use our internal $_for_idx instead
        if (loopVar !== "i") {
          localVars.add(loopVar);
        }

        return `
    ;; For loop over nearbyAgents
    (local.set $_for_idx (i32.const 0))
    (local.set $_for_ptr (i32.const 0))
    (block $_for_exit
      (loop $_for_loop
        (br_if $_for_exit (i32.ge_u (local.get $_for_idx) (global.get $agent_count)))
        
        ;; Skip self
        (if (i32.ne (local.get $_for_idx) (i32.trunc_f32_u (local.get $_agent_id))) (then
          ;; Calculate distance to check if nearby
          (local.set $_for_dx (f32.sub (local.get $x) (f32.load (i32.add (local.get $_for_ptr) (i32.const 4)))))
          (local.set $_for_dy (f32.sub (local.get $y) (f32.load (i32.add (local.get $_for_ptr) (i32.const 8)))))
          (local.set $_for_dist (f32.sqrt (f32.add (f32.mul (local.get $_for_dx) (local.get $_for_dx)) (f32.mul (local.get $_for_dy) (local.get $_for_dy)))))
          
          ;; Only process if within perception radius
          (if (f32.lt (local.get $_for_dist) (global.get $inputs_perceptionRadius)) (then
            ;; This is a nearby agent - execute loop body`;
      } else {
        // Standard numeric for loop
        const loopVar = initMatch ? initMatch[1] : "i";
        // Don't declare 'i' if it conflicts with step_all's outer loop
        if (loopVar !== "i") {
          localVars.add(loopVar);
        }

        const initExpr = initMatch
          ? normalizeWASMExpression(initMatch[2])
          : "(f32.const 0)";
          
        // Convert JS-like condition to integer-based WASM branch
        const condExpr = normalizeWASMCondition(parsed.condition);

        return `
    ;; Standard for loop
    (local.set $${loopVar} ${initExpr})
    (block $_for_exit
      (loop $_for_loop
        (br_if $_for_exit (i32.eqz ${condExpr}))
        ;; Loop body`;
      }
    }

    case "foreach": {
      // Keep foreach support for backward compatibility
      if (parsed.collection === "nearbyAgents") {
        localVars.add("_foreach_idx");
        localVars.add("_foreach_ptr");
        localVars.add(`${parsed.varName}_x`);
        localVars.add(`${parsed.varName}_y`);
        localVars.add(`${parsed.varName}_vx`);
        localVars.add(`${parsed.varName}_vy`);
        localVars.add("_foreach_dx");
        localVars.add("_foreach_dy");
        localVars.add("_foreach_dist");

        return `
    ;; Foreach loop over nearbyAgents
    (local.set $_foreach_idx (i32.const 0))
    (local.set $_foreach_ptr (i32.const 0))
    (block $_foreach_exit
      (loop $_foreach_loop
        (br_if $_foreach_exit (i32.ge_u (local.get $_foreach_idx) (global.get $agent_count)))
        
        ;; Skip self
        (if (i32.ne (local.get $_foreach_idx) (i32.trunc_f32_u (local.get $_agent_id))) (then
          ;; Load other agent's data
          (local.set $${parsed.varName}_x (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 4))))
          (local.set $${parsed.varName}_y (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 8))))
          (local.set $${parsed.varName}_vx (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 12))))
          (local.set $${parsed.varName}_vy (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 16))))
          
          ;; Calculate distance to check if nearby
          (local.set $_foreach_dx (f32.sub (local.get $x) (local.get $${parsed.varName}_x)))
          (local.set $_foreach_dy (f32.sub (local.get $y) (local.get $${parsed.varName}_y)))
          (local.set $_foreach_dist (f32.sqrt (f32.add (f32.mul (local.get $_foreach_dx) (local.get $_foreach_dx)) (f32.mul (local.get $_foreach_dy) (local.get $_foreach_dy)))))
          
          ;; Only process if within perception radius
          (if (f32.lt (local.get $_foreach_dist) (global.get $inputs_perceptionRadius)) (then
            ;; Loop body will be inserted here by subsequent lines`;
      } else {
        return `;; TODO: foreach loops only supported for nearbyAgents collection (got: ${parsed.collection})`;
      }
    }

    case "assignment": {
      // Check if expression contains array indexing before normalization
      const arrayMatch = parsed.expression.match(/nearbyAgents\[\w+\]\.(\w+)/);

      let wasmExpr: string;
      if (arrayMatch) {
        // Handle array indexing by replacing with memory load
        const offsets: Record<string, number> = { x: 4, y: 8, vx: 12, vy: 16 };
        const offset = offsets[arrayMatch[1]] || 0;
        const loadExpr = `(f32.load (i32.add (local.get $_for_ptr) (i32.const ${offset})))`;

        // Replace the array access with the load expression
        const exprWithLoad = parsed.expression.replace(
          /nearbyAgents\[\w+\]\.(\w+)/,
          loadExpr
        );
        wasmExpr = normalizeWASMExpression(exprWithLoad);
      } else {
        wasmExpr = normalizeWASMExpression(parsed.expression);
      }

      if (wasmExpr.startsWith(";; UNSUPPORTED:")) {
        return `;; Assignment to ${parsed.target}: ${wasmExpr}`;
      }
      return `(local.set $${parsed.target} ${wasmExpr})`;
    }

    case "command": {
      const { target, op } = COMMANDS[parsed.command];

      if (op === "update") {
        // Special case: updatePosition multiplies velocity by dt
        const argExpr = normalizeWASMExpression(parsed.argument);
        const xUpdate = `(local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) ${argExpr})))`;
        const yUpdate = `(local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) ${argExpr})))`;
        return `${xUpdate}\n    ${yUpdate}`;
      } else if (op === "complex") {
        // Handle specific complex operations
        if (parsed.command === "limitSpeed") {
          const maxSpeed = normalizeWASMExpression(parsed.argument);
          localVars.add("__speed2");
          localVars.add("__scale");
          // Calculate speed squared and limit if needed
          return `(local.set $__speed2 (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vy) (local.get $vy))))\n    (if (f32.gt (local.get $__speed2) (f32.mul ${maxSpeed} ${maxSpeed})) (then\n      (local.set $__scale (f32.sqrt (f32.div (f32.mul ${maxSpeed} ${maxSpeed}) (local.get $__speed2))))\n      (local.set $vx (f32.mul (local.get $vx) (local.get $__scale)))\n      (local.set $vy (f32.mul (local.get $vy) (local.get $__scale)))\n    ))`;
        } else if (parsed.command === "borderWrapping") {
          // Border wrapping with width/height from inputs
          return `(if (f32.lt (local.get $x) (f32.const 0)) (then\n      (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))\n    ))\n    (if (f32.gt (local.get $x) (global.get $inputs_width)) (then\n      (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))\n    ))\n    (if (f32.lt (local.get $y) (f32.const 0)) (then\n      (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))\n    ))\n    (if (f32.gt (local.get $y) (global.get $inputs_height)) (then\n      (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))\n    ))`;
        } else if (parsed.command === "borderBounce") {
          // Border bouncing
          return `(if (i32.or (f32.lt (local.get $x) (f32.const 0)) (f32.gt (local.get $x) (global.get $inputs_width))) (then\n      (local.set $vx (f32.neg (local.get $vx)))\n    ))\n    (if (i32.or (f32.lt (local.get $y) (f32.const 0)) (f32.gt (local.get $y) (global.get $inputs_height))) (then\n      (local.set $vy (f32.neg (local.get $vy)))\n    ))\n    (local.set $x (f32.max (f32.const 0) (f32.min (global.get $inputs_width) (local.get $x))))\n    (local.set $y (f32.max (f32.const 0) (f32.min (global.get $inputs_height) (local.get $y))))`;
        } else {
          return `;; TODO: ${parsed.command} not yet implemented in WASM`;
        }
      } else {
        const argExpr = normalizeWASMExpression(parsed.argument);

        if (op === "set") {
          return `(local.set $${target} ${argExpr})`;
        } else {
          const opInstr = op === "add" ? "f32.add" : "f32.sub";
          return `(local.set $${target} (${opInstr} (local.get $${target}) ${argExpr}))`;
        }
      }
    }

    case "unknown":
    default:
      return null;
  }
}

export const compileDSLtoWAT = (
  lines: string[],
  inputs: string[],
  logger: Logger
): string => {
  const statements: string[] = [];
  const localVars = new Set<string>();
  let openStructures = 0; // Track user-level opened if statements
  let foreachDepth = 0; // Track foreach loop nesting
  let forDepth = 0; // Track for loop nesting
  let forInternalStructures = 0; // Track if statements created by for loop itself

  for (const line of lines) {
    const transpiled = transpileLine(line, localVars);
    if (transpiled !== null && transpiled !== "") {
      // Track for loops - they create 2 nested if statements
      if (transpiled.includes(";; For loop over")) {
        forDepth++;
        forInternalStructures = 2; // for loop creates 2 if statements
      }

      // Track foreach loops - they also create nested if statements
      if (transpiled.includes(";; Foreach loop over")) {
        foreachDepth++;
        forInternalStructures = 0; // foreach handles its own structure
      }

      // Track open structures (user-level if statements)
      // Don't count the initial if statements from for/foreach loops
      if (
        transpiled.includes("(if ") &&
        transpiled.includes("(then") &&
        !transpiled.includes(";; For loop over") &&
        !transpiled.includes(";; Foreach loop over") &&
        !transpiled.includes(";; Skip self") &&
        !transpiled.includes(";; Only process if within perception radius")
      ) {
        openStructures++;
      }

      // Handle closing braces
      if (transpiled === "))") {
        if (forDepth > 0 && openStructures === 0) {
          // Close for loop structure (including internal ifs)
          forDepth--;
          forInternalStructures = 0;
          statements.push(`          ))
        ))
        
        ;; Increment for loop
        (local.set $_for_idx (i32.add (local.get $_for_idx) (i32.const 1)))
        (local.set $_for_ptr (i32.add (local.get $_for_ptr) (i32.const 20)))
        (br $_for_loop)
      )
    )`);
        } else if (foreachDepth > 0 && openStructures === 0) {
          // Close foreach loop structure
          foreachDepth--;
          statements.push(`          ))
        ))
        
        ;; Increment foreach loop
        (local.set $_foreach_idx (i32.add (local.get $_foreach_idx) (i32.const 1)))
        (local.set $_foreach_ptr (i32.add (local.get $_foreach_ptr) (i32.const 20)))
        (br $_foreach_loop)
      )
    )`);
        } else if (openStructures > 0) {
          openStructures--;
          statements.push(transpiled);
        } else {
          // Unmatched closing brace - comment it out
          statements.push(";; (unmatched closing brace)");
        }
      } else {
        statements.push(transpiled);
      }
    }
  }

  if (statements.length === 0) {
    logger.warn(
      "No WASM statements produced from DSL. Emitting identity function."
    );
    statements.push(";; no-op");
  }

  // Always add _agent_id as a local variable for neighbor/for loops
  localVars.add("_agent_id");

  const inputGlobals =
    inputs.length > 0
      ? inputs
          .map(
            (n) =>
              `(global $inputs_${n} (export "inputs_${n}") (mut f32) (f32.const 0))`
          )
          .join("\n  ")
      : "";

  // Add agent_count global for neighbor searching
  const agentCountGlobal = `(global $agent_count (export "agent_count") (mut i32) (i32.const 0))`;

  // Generate local variable declarations for user-defined vars
  // Filter out 'i' since it's already declared in step_all (conflicts with outer loop)
  // Internal loop/pointer variables should be i32, everything else f32
  const i32Vars = new Set([
    "_loop_idx",
    "_loop_ptr",
    "_for_idx",
    "_for_ptr",
    "_foreach_idx",
    "_foreach_ptr",
  ]);

  const localVarDecls = Array.from(localVars)
    .filter((v) => v !== "i") // 'i' is already declared in step_all's outer loop
    .map((v) => {
      const type = i32Vars.has(v) ? "i32" : "f32";
      return `(local $${v} ${type})`;
    })
    .join("\n      ");

  const agentKernel = `
    ;; load agent fields: id(0), x(+4), y(+8), vx(+12), vy(+16)
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))

    ;; execute DSL
    ${statements.join("\n    ")}

    ;; store back
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))
    (f32.store (i32.add (local.get $ptr) (i32.const 12)) (local.get $vx))
    (f32.store (i32.add (local.get $ptr) (i32.const 16)) (local.get $vy))

  `.trim();

  const stepFuncLocals = localVars.size > 0 ? `\n      ${localVarDecls}` : "";

  const wasm = `
  (module
    ;; Shared memory is provided by JS
    (import "env" "memory" (memory 1))
    ${inputGlobals}
  ${agentCountGlobal}

    ;; Optional single-agent step (for debugging)
    (func (export "step") (param $ptr i32)
      (local $x f32)
      (local $y f32)
      (local $vx f32)
      (local $vy f32)${stepFuncLocals}
      ${agentKernel}
    )

    ;; Batch version
    (func (export "step_all") (param $base i32) (param $count i32)
      (local $i i32)
      (local $ptr i32)
      (local $x f32)
      (local $y f32)
      (local $vx f32)
      (local $vy f32)${stepFuncLocals}

      (local.set $i (i32.const 0))
      (local.set $ptr (local.get $base))

      (block $exit
        (loop $loop
          (br_if $exit (i32.ge_u (local.get $i) (local.get $count)))

          ;; ---- per-agent kernel ----
          ${agentKernel}

          ;; increment i and ptr (20 bytes per agent: 5 floats * 4 bytes)
          (local.set $i   (i32.add (local.get $i) (i32.const 1)))
          (local.set $ptr (i32.add (local.get $ptr) (i32.const 20)))

          (br $loop)
        )
      )
    )
  )
  `.trim();

  return wasm;
};
