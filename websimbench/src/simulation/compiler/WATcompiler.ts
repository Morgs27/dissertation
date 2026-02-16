
import Logger from "../helpers/logger";
import { DSLParser, type AVAILABLE_COMMANDS, type LineInfo } from "./parser";

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
  turn: { target: "vx", op: "complex" },
  moveForward: { target: "x", op: "complex" },
  deposit: { target: "x", op: "complex" },
  sense: { target: "x", op: "complex" },
  enableTrails: { target: "x", op: "complex" },
  print: { target: "x", op: "complex" },
  species: { target: "x", op: "complex" },
  avoidObstacles: { target: "x", op: "complex" },
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
    } else if (/[\s;]/.test(char)) {
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
    // Only replace identifier.property where identifier starts with letter/underscore
    expr = expr.replace(/([a-zA-Z_]\w*)\.(\w+)/g, "$1_$2");
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
  if (/^GLOBAL_\w+$/.test(expr)) {
    return `(global.get $inputs_${expr.substring(7)})`;
  }

  if (/^[a-zA-Z_]\w*$/.test(expr) && expr !== "__RANDOM__") {
    return `(local.get $${expr})`;
  }

  // Tokenize the expression
  const tokens = tokenizeExpression(expr);

  if (tokens.length === 1) {
    const token = tokens[0];

    if (token === "__RANDOM__") {
      return `(call $random (local.get $_agent_id) (local.get $x) (local.get $y))`;
    }
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
      // Handle unary minus
      // If previous token is an operator or start of expression, this '-' is unary
      const isUnary = i === 0 || /^[+\-*/^]$/.test(tokens[i - 1]) || tokens[i - 1] === "(";

      if (tokens[i] === "-") {
        if (isUnary) {
          continue; // Skip, don't split here
        }
      }

      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i + 1).join(" ");

      // Binary operation
      const op = tokens[i] === "+" ? "f32.add" : "f32.sub";
      return `(${op} ${infixToSExpression(left)} ${infixToSExpression(right)})`;
    }
  }

  // Handle unary minus (if no binary ops found)
  if (tokens[0] === "-") {
    return `(f32.neg ${infixToSExpression(tokens.slice(1).join(" "))})`;
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
      if (token === "__RANDOM__") {
        return `(call $random (local.get $_agent_id) (local.get $x) (local.get $y))`;
      }
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
function normalizeWASMExpression(expr: string, randomInputs: Set<string>): string {
  let r = expr.trim();

  // Handle sqrt function
  r = r.replace(/sqrt\(([^)]+)\)/g, (_match, arg) => {
    return `(f32.sqrt ${infixToSExpression(arg)})`;
  });

  // Handle exponentiation ^2 and **2
  r = r.replace(/(\w+(?:\.\w+)?)\s*\^2/g, "$1 * $1");
  r = r.replace(/(\w+(?:\.\w+)?)\s*\*\*2/g, "$1 * $1");

  // Handle object properties (e.g. neighbor.x -> neighbor_x)
  r = r.replace(/([a-zA-Z_]\w*)\.(?!length|count)(\w+)/g, (match, obj, prop) => {
    if (obj === 'inputs') return match; // Handled later
    if (obj === 'nearbyAgents') return match; // Handled by array match
    return `${obj}_${prop}`;
  });

  // Handle .length or .count property for neighbors (generic)
  r = r.replace(/(\w+)\.length/g, "$1_count");
  r = r.replace(/(\w+)\.count/g, "$1_count");

  // Handle neighbors()
  if (r.includes("neighbors(")) {
    const match = r.match(/neighbors\(([^)]+)\)/);
    if (match) {
      return `__NEIGHBORS__${match[1]}__`;
    }
  }

  // Handle mean()
  if (r.includes("mean(")) {
    const match = r.match(/mean\(([^)]+)\)/);
    if (match) {
      const arg = match[1].trim();
      const propMatch = arg.match(/\w+\.(\w+)/);
      if (propMatch) {
        return `__MEAN__${propMatch[1]}__`;
      }
    }
  }

  // Handle sense(a, b)
  if (r.includes("sense(")) {
    const match = r.match(/sense\(([^)]+)\)/);
    if (match) {
      const args = match[1].split(',').map(s => infixToSExpression(s.trim()));
      if (args.length === 2) {
        return `(call $sense (local.get $x) (local.get $y) (local.get $vx) (local.get $vy) ${args[0]} ${args[1]})`;
      }
    }
  }

  // Handle random()
  r = r.replace(/random\(([^)]*)\)/g, (_match, args) => {
    const parts = args.split(',').filter((s: string) => s.trim().length > 0).map((s: string) => s.trim());
    const randCall = "__RANDOM__";
    if (parts.length === 0) return randCall;
    if (parts.length === 1) return `(${randCall} * ${parts[0]})`;
    return `(${parts[0]} + ${randCall} * (${parts[1]} - ${parts[0]}))`;
  });

  // Handle inputs.random
  if (r.includes("inputs.random")) {
    return normalizeWASMExpression(r.replace(/inputs\.random/g, "__RANDOM__"), randomInputs);
  }

  // Handle inputs.NAME replacement for random inputs
  if (randomInputs.size > 0) {
    r = r.replace(/inputs\.(\w+)/g, (match, name) => {
      if (randomInputs.has(name)) {
        return name; // Will be picked up as local.get $name
      }
      return match;
    });
  }

  return infixToSExpression(r);
}

function normalizeWASMCondition(cond: string, randomInputs: Set<string>): string {
  cond = cond.trim();

  // Try to find comparison operator
  // Order matters: checks >= and <= before > and <
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
      // Only handle simple binary comparison, rejoin if multiple splits (failure case?)
      // Assuming DSL condition is simple: expr op expr
      const left = parts[0].trim();
      const right = parts.slice(1).join(op).trim();
      return `(${asm} ${normalizeWASMExpression(left, randomInputs)} ${normalizeWASMExpression(right, randomInputs)})`;
    }
  }

  // If no operator, treat as boolean (f32 != 0)
  return `(f32.ne ${normalizeWASMExpression(cond, randomInputs)} (f32.const 0))`;
}

/**
 * Parses a single condition into WASM comparison
 * NOTE: normalizeWASMCondition does the heavy lifting now.
 */
function parseCondition(condition: string, randomInputs: Set<string>): string {
  condition = condition.trim();
  condition = condition.replace(/(\w+)\.length/g, "$1_count");

  // Delegate to normalizeWASMCondition which now returns f32 comparison result (0 or 1) as i32?
  // Wait, WASM comparison instructions (f32.lt etc) return i32 (0 or 1).
  // parser callers (if/elseif) expect i32 result for (if ...).

  return normalizeWASMCondition(condition, randomInputs);
}

interface WATContext {
  loopDepth: number;
  currentLoopVar?: string;
}

function transpileLine(line: string, localVars: Set<string>, randomInputs: Set<string>, context: WATContext): string | null {
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
        const offsets: Record<string, number> = { x: 4, y: 8, vx: 12, vy: 16, species: 20 };
        const offset = offsets[arrayMatchInVar[2]] || 0;
        return `(local.set $${parsed.name} (f32.load (i32.add (local.get $_for_ptr) (i32.const ${offset}))))`;
      }

      const propMatchInVar = expr.match(/(\w+)\.(\w+)/);
      if (propMatchInVar && propMatchInVar[1] === context.currentLoopVar) {
        const targetPropVar = `${propMatchInVar[1]}_${propMatchInVar[2]}`;
        return `(local.set $${parsed.name} (local.get $${targetPropVar}))`;
      }
      const wasmExpr = normalizeWASMExpression(expr, randomInputs);
      if (wasmExpr.startsWith("__NEIGHBORS__")) {
        const radiusExpr = wasmExpr.replace("__NEIGHBORS__", "").replace("__", "");
        const radius = normalizeWASMExpression(radiusExpr, randomInputs);
        localVars.add(`${parsed.name}_count`); localVars.add(`${parsed.name}_sum_x`); localVars.add(`${parsed.name}_sum_y`);
        localVars.add(`${parsed.name}_sum_vx`); localVars.add(`${parsed.name}_sum_vy`); localVars.add("_loop_idx");
        localVars.add("_loop_ptr"); localVars.add("_other_x"); localVars.add("_other_y"); localVars.add("_dx");
        localVars.add("_dy"); localVars.add("_dist");
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
      // Handle logical operators && and ||
      const combinedCondition = (parts: string[], op: "and" | "or") => {
        const conditions = parts.map(p => parseCondition(p, randomInputs));
        if (conditions.some(c => c.includes("TODO"))) return conditions.find(c => c.includes("TODO")) ?? null;
        return `(if ${conditions.reduce((acc, c) => acc ? `(i32.${op} ${acc} ${c})` : c)} (then`;
      };

      if (parsed.condition.includes("&&")) return combinedCondition(parsed.condition.split("&&").map(p => p.trim()), "and") ?? null;
      if (parsed.condition.includes("||")) return combinedCondition(parsed.condition.split("||").map(p => p.trim()), "or") ?? null;

      return `(if ${parseCondition(parsed.condition, randomInputs)} (then`;
    }

    case "else": return "(else";
    case "elseif": return `(elseif ${parseCondition(parsed.condition, randomInputs)}`;

    case "for": {
      const initMatch = parsed.init.match(/var\s+(\w+)\s*=\s*(.+)/);
      const condMatch = parsed.condition.match(/(\w+)\s*<\s*(\w+)\.length/);
      if (initMatch && condMatch && condMatch[2] === "nearbyAgents") {
        const loopVar = initMatch[1];
        context.currentLoopVar = loopVar;
        context.loopDepth++;
        localVars.add(loopVar); if (loopVar !== "i") localVars.add(loopVar);
        localVars.add("_for_idx"); localVars.add("_for_ptr"); localVars.add("_for_dx"); localVars.add("_for_dy"); localVars.add("_for_dist");
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
        /* if (loopVar !== "i") */ localVars.add(loopVar);
        const initExpr = initMatch ? normalizeWASMExpression(initMatch[2], randomInputs) : "(f32.const 0)";
        // Need to pass randomInputs to normalizeWASMCondition
        return `
    ;; Standard for loop
    (local.set $${loopVar} ${initExpr})
    (block $_for_exit
      (loop $_for_loop
        (br_if $_for_exit (i32.eqz ${normalizeWASMCondition(parsed.condition, randomInputs)}))
        ;; Loop body`;
      }
    }

    case "foreach": {
      // Relaxed check: accept any collection, assuming it's the agent list
      // if (parsed.collection === "nearbyAgents") {
      const loopVar = parsed.varName || parsed.itemAlias;

      if (loopVar) {
        context.currentLoopVar = loopVar;
        context.loopDepth++;
        localVars.add("_foreach_idx"); localVars.add("_foreach_ptr"); localVars.add(`${loopVar}_x`);
        localVars.add(`${loopVar}_y`); localVars.add(`${loopVar}_vx`); localVars.add(`${loopVar}_vy`);
        localVars.add(`${loopVar}_species`);
        localVars.add("_foreach_dx"); localVars.add("_foreach_dy"); localVars.add("_foreach_dist");
        return `
    ;; Foreach loop over agents (presumed neighbors/all)
    (local.set $_foreach_idx (i32.const 0))
    (local.set $_foreach_ptr (global.get $agentsReadPtr))
    (block $_foreach_exit
      (loop $_foreach_loop
        (br_if $_foreach_exit (i32.ge_u (local.get $_foreach_idx) (global.get $agent_count)))
        (if (i32.const 1) (then
          (local.set $${loopVar}_x (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 4))))
          (local.set $${loopVar}_y (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 8))))
          (local.set $${loopVar}_vx (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 12))))
          (local.set $${loopVar}_vy (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 16))))
          (local.set $${loopVar}_species (f32.load (i32.add (local.get $_foreach_ptr) (i32.const 20))))
          (if (i32.const 1) (then
            ;; Loop body will be inserted here by subsequent lines`;
      }
      return `;; TODO: foreach loops require a variable name`;
    }

    case "assignment": {
      // Handle array indexing like nearbyAgents[i].species
      const arrayMatch = parsed.expression.match(/(\w+)\[\w+\]\.(\w+)/);
      if (arrayMatch) {
        const offsets: Record<string, number> = { x: 4, y: 8, vx: 12, vy: 16, species: 20 };
        const offset = offsets[arrayMatch[2]] || 0;
        const loadExpr = `(f32.load (i32.add (local.get $_for_ptr) (i32.const ${offset})))`;
        const exprWithLoad = parsed.expression.replace(/(\w+)\[\w+\]\.(\w+)/, loadExpr);
        return `(local.set $${parsed.target} ${normalizeWASMExpression(exprWithLoad, randomInputs)})`;
      }

      // Handle property access like nearby.species when nearby is the loop variable
      const propMatch = parsed.expression.match(/(\w+)\.(\w+)/);
      if (propMatch && propMatch[1] === context.currentLoopVar) {
        // Map to the local variable we just loaded in the foreach loop
        const targetPropVar = `${propMatch[1]}_${propMatch[2]}`;
        const exprWithVar = parsed.expression.replace(/(\w+)\.(\w+)/, targetPropVar);
        return `(local.set $${parsed.target} ${normalizeWASMExpression(exprWithVar, randomInputs)})`;
      }
      return `(local.set $${parsed.target} ${normalizeWASMExpression(parsed.expression, randomInputs)})`;
    }

    case "command": {
      const { target, op } = COMMANDS[parsed.command];
      if (op === "update") {
        const argExpr = normalizeWASMExpression(parsed.argument, randomInputs);
        return `(local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) ${argExpr})))\n    (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) ${argExpr})))`;
      } else if (op === "complex") {
        if (parsed.command === "limitSpeed") {
          const maxSpeed = normalizeWASMExpression(parsed.argument, randomInputs);
          localVars.add("__speed2"); localVars.add("__scale");
          return `(local.set $__speed2 (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vy) (local.get $vy))))\n    (if (f32.gt (local.get $__speed2) (f32.mul ${maxSpeed} ${maxSpeed})) (then\n      (local.set $__scale (f32.sqrt (f32.div (f32.mul ${maxSpeed} ${maxSpeed}) (local.get $__speed2))))\n      (local.set $vx (f32.mul (local.get $vx) (local.get $__scale)))\n      (local.set $vy (f32.mul (local.get $vy) (local.get $__scale)))\n    ))`;
        } else if (parsed.command === "borderWrapping") {
          return `(if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))\n    (if (f32.gt (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))\n    (if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))\n    (if (f32.gt (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))`;
        } else if (parsed.command === "borderBounce") {
          return `(if (i32.or (f32.lt (local.get $x) (f32.const 0)) (f32.gt (local.get $x) (global.get $inputs_width))) (then (local.set $vx (f32.neg (local.get $vx)))))\n    (if (i32.or (f32.lt (local.get $y) (f32.const 0)) (f32.gt (local.get $y) (global.get $inputs_height))) (then (local.set $vy (f32.neg (local.get $vy)))))\n    (local.set $x (f32.max (f32.const 0) (f32.min (global.get $inputs_width) (local.get $x))))\n    (local.set $y (f32.max (f32.const 0) (f32.min (global.get $inputs_height) (local.get $y))))`;
        } else if (parsed.command === "turn") {
          const angle = normalizeWASMExpression(parsed.argument, randomInputs);
          localVars.add("__c"); localVars.add("__s"); localVars.add("__vx");
          return `(local.set $__c (call $cos ${angle}))\n            (local.set $__s (call $sin ${angle}))\n            (local.set $__vx (f32.sub (f32.mul (local.get $vx) (local.get $__c)) (f32.mul (local.get $vy) (local.get $__s))))\n            (local.set $vy (f32.add (f32.mul (local.get $vx) (local.get $__s)) (f32.mul (local.get $vy) (local.get $__c))))\n            (local.set $vx (local.get $__vx))`;
        } else if (parsed.command === "moveForward") {
          const speed = normalizeWASMExpression(parsed.argument, randomInputs);
          return `(local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) ${speed})))\n    (local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) ${speed})))`;
        } else if (parsed.command === "deposit") {
          return `(call $deposit (local.get $x) (local.get $y) ${normalizeWASMExpression(parsed.argument, randomInputs)})`;
        } else if (parsed.command === "sense") {
          const args = parsed.argument.split(',').map(s => s.trim());
          return `(call $sense ${normalizeWASMExpression(args[0], randomInputs)} ${normalizeWASMExpression(args[1], randomInputs)})`;
        } else if (parsed.command === "enableTrails") {
          return `nop`;
        } else if (parsed.command === "print") {
          const argExpr = normalizeWASMExpression(parsed.argument, randomInputs);
          return `(call $print (local.get $_agent_id) ${argExpr})`;
        } else if (parsed.command === "species" || parsed.command === "avoidObstacles") {
          return `nop`;
        }
        return `;; TODO: ${parsed.command} not yet implemented in WASM`;
      } else {
        const argExpr = normalizeWASMExpression(parsed.argument, randomInputs);
        const opInstr = op === "add" ? "f32.add" : "f32.sub";
        if (op === "set") return `(local.set $${target} ${argExpr})`;
        return `(local.set $${target} (${opInstr} (local.get $${target}) ${argExpr}))`;
      }
    }

    case "unknown":
    default: return null;
  }
}


export const compileDSLtoWAT = (
  lines: LineInfo[],
  inputs: string[],
  logger: Logger,
  rawScript: string,
  randomInputs: string[] = []
): string => {
  const statements: string[] = [];
  const localVars = new Set<string>();
  const randomInputsSet = new Set(randomInputs);
  let openStructures = 0;
  let foreachDepth = 0;
  let forDepth = 0;
  let pendingClosures = 0;

  // Track loop types to generate correct closer: 
  // { type: 'nearby', internalIfs: 2 } or { type: 'standard', var: string }
  // internalIfs tracks how many ifs the loop opens internally (skip-self, nearby-check)
  // openStructuresAtEntry tracks the openStructures count when loop was entered
  const loopStack: { type: 'nearby' | 'standard' | 'foreach', var?: string, internalIfs: number, openStructuresAtEntry: number }[] = [];

  const context: WATContext = {
    loopDepth: 0
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.content.trim();
    if (!trimmed) continue;

    // Handle single-line closure like "} else {"
    if (trimmed.startsWith("}") && trimmed !== "}") {
      statements.push(")");
    }

    if (trimmed === "}") {
      context.loopDepth--;
      if (context.loopDepth <= 0) context.currentLoopVar = undefined;
    }

    let transpiled = transpileLine(trimmed, localVars, randomInputsSet, context);

    if (transpiled === null && trimmed !== "}") {
      const parsed = DSLParser.parseDSLLine(trimmed);
      if (parsed.type === 'unknown') {
        logger.codeError("Unknown syntax or command", rawScript, line.lineIndex);
      }
    }

    if (trimmed === "}") {
      let nextLineIndex = i + 1;
      let nextLineContent = "";
      while (nextLineIndex < lines.length) {
        const c = lines[nextLineIndex].content.trim();
        if (c) { nextLineContent = c; break; }
        nextLineIndex++;
      }

      if (nextLineContent.startsWith("else") || nextLineContent.startsWith("} else")) {
        transpiled = ")";
      } else {
        transpiled = "))";
        if (pendingClosures > 0) {
          transpiled += ")".repeat(pendingClosures);
          openStructures--;
          pendingClosures = 0;
        }
      }
    }

    if (transpiled !== null && transpiled !== "") {
      if (transpiled.startsWith("(elseif")) {
        const cond = transpiled.substring(8);
        transpiled = `(else (if ${cond} (then`;
        pendingClosures += 2;
      }

      if (transpiled.includes(";; For loop over nearbyAgents")) {
        forDepth++;
        loopStack.push({ type: 'nearby', internalIfs: 2, openStructuresAtEntry: openStructures });
      } else if (transpiled.includes(";; Standard for loop")) {
        forDepth++;
        // Extract loop variable from "(local.set $varName ..."
        const match = transpiled.match(/\(local\.set \$(\w+)/);
        const varName = match ? match[1] : "i";
        loopStack.push({ type: 'standard', var: varName, internalIfs: 0, openStructuresAtEntry: openStructures });
      }

      if (transpiled.includes(";; Foreach loop over")) {
        foreachDepth++;
        loopStack.push({ type: 'foreach', internalIfs: 2, openStructuresAtEntry: openStructures });
        openStructures += 2;
      }

      // Count net open ifs: (if ... (then) opens, )) closes
      // Only increment openStructures by the NET count of unclosed ifs
      if (transpiled.includes("(if ") && transpiled.includes("(then") &&
        !transpiled.includes(";; For loop over") && !transpiled.includes(";; Foreach loop over") &&
        !transpiled.includes(";; Skip self") && !transpiled.includes(";; Only process") &&
        !transpiled.includes("(else (if")) {
        // Count how many (if ... (then pairs vs )) closers
        const openCount = (transpiled.match(/\(if [^)]*\(then/g) || []).length;
        const closeCount = (transpiled.match(/\)\)/g) || []).length;
        const netOpen = openCount - closeCount;
        if (netOpen > 0) {
          openStructures += netOpen;
        }
      }

      if (transpiled === "))" || (transpiled.startsWith("))") && pendingClosures > 0)) {
        let loopClosed = false;
        if (loopStack.length > 0) {
          const loopInfo = loopStack[loopStack.length - 1];
          // Check if we are at the right nesting/structure level to close this loop
          if (openStructures === loopInfo.openStructuresAtEntry + loopInfo.internalIfs) {
            loopStack.pop();
            loopClosed = true;

            if (loopInfo.type === 'nearby') {
              // Close 2 ifs, then loop update, then loop/block
              statements.push(`          ))\n        ))\n        (local.set $_for_idx (i32.add (local.get $_for_idx) (i32.const 1)))\n        (local.set $_for_ptr (i32.add (local.get $_for_ptr) (i32.const 24)))\n        (br $_for_loop)\n      )\n    )`);
            } else if (loopInfo.type === 'foreach') {
              // Close 2 ifs, then loop update, then loop/block (using foreach vars)
              statements.push(`          ))\n        ))\n        (local.set $_foreach_idx (i32.add (local.get $_foreach_idx) (i32.const 1)))\n        (local.set $_foreach_ptr (i32.add (local.get $_foreach_ptr) (i32.const 24)))\n        (br $_foreach_loop)\n      )\n    )`);
            } else if (loopInfo.type === 'standard') {
              const varName = loopInfo.var;
              // Standard loop update
              statements.push(`        (local.set $${varName} (f32.add (local.get $${varName}) (f32.const 1)))\n        (br $_for_loop)\n      )\n    )`);
            }
          }
        }

        if (loopClosed) {
          // handled
        } else if (openStructures > 0) {
          openStructures--;
          statements.push(transpiled);
        } else {
          if (transpiled.includes(")")) statements.push(transpiled);
          else statements.push(";; (unmatched closing brace)");
        }
      } else {
        statements.push(transpiled);
      }
    }
  }

  if (statements.length === 0) {
    statements.push(";; no-op");
  }

  localVars.add("_agent_id");
  randomInputs.forEach(r => localVars.add(r));

  const inputGlobals = inputs.length > 0 ? inputs.filter(n => n !== "randomValues" && n !== "trailMap").map(n => `(global $inputs_${n} (export "inputs_${n}") (mut f32) (f32.const 0))`).join("\n  ") : "";
  const agentCountGlobal = `(global $agent_count (export "agent_count") (mut i32) (i32.const 0))`;

  const i32Vars = new Set(["_loop_idx", "_loop_ptr", "_for_idx", "_for_ptr", "_foreach_idx", "_foreach_ptr"]);
  const reservedLocals = new Set(["x", "y", "vx", "vy", "species"]);
  const localVarDecls = Array.from(localVars)
    .filter(v => !reservedLocals.has(v))
    .map(v => `(local $${v} ${i32Vars.has(v) ? "i32" : "f32"})`).join("\n      ");

  const agentKernel = `
    ;; load agent fields
    (local.set $_agent_id (f32.load (i32.add (local.get $ptr) (i32.const 0))))
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))
    (local.set $vx (f32.load (i32.add (local.get $ptr) (i32.const 12))))
    (local.set $vy (f32.load (i32.add (local.get $ptr) (i32.const 16))))
    (local.set $species (f32.load (i32.add (local.get $ptr) (i32.const 20))))

    ;; load random values
    ${randomInputs.map(r => `(local.set $${r} (f32.load (i32.add (global.get $randomValuesPtr) (i32.shl (i32.trunc_f32_u (local.get $_agent_id)) (i32.const 2)))))`).join('\n    ')}

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

  return `
  (module
    (import "env" "memory" (memory 1))
    (import "env" "sin" (func $sin (param f32) (result f32)))
    (import "env" "cos" (func $cos (param f32) (result f32)))
    (import "env" "atan2" (func $atan2 (param f32 f32) (result f32)))
    (import "env" "random" (func $random_js (result f32)))
    (import "env" "print" (func $print (param f32 f32)))

    ${inputGlobals}
    ${inputs.includes('trailMap') ? `(global $trailMapReadPtr (export "trailMapReadPtr") (mut i32) (i32.const 0))
    (global $trailMapWritePtr (export "trailMapWritePtr") (mut i32) (i32.const 0))` : ''}
    ${inputs.includes('randomValues') ? '(global $randomValuesPtr (export "randomValuesPtr") (mut i32) (i32.const 0))' : ''}
    (global $agentsReadPtr (export "agentsReadPtr") (mut i32) (i32.const 0))

    (func $random (param $id f32) (param $x f32) (param $y f32) (result f32) (call $random_js))

    ${inputs.includes('trailMap') ? `
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
    )` : ''}

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
  )`;
};