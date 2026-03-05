/**
 * @module expressionAST
 * Expression parser and Float32-wrapping code generator.
 *
 * Provides proper tokenisation, recursive-descent parsing, and AST-based
 * transformation of DSL expressions to ensure all arithmetic operations
 * are wrapped with `Math.fround()` for Float32 precision parity with
 * WebAssembly and WebGPU. Also validates semantic correctness for undeclared variables.
 */

import type { CompilationContext } from "./compilerTarget";

export type ExprNode =
  | { type: "number"; value: string }
  | { type: "identifier"; name: string }
  | { type: "property"; object: ExprNode; property: string }
  | { type: "index"; object: ExprNode; index: ExprNode; property?: string }
  | { type: "call"; name: string; args: ExprNode[] }
  | { type: "binary"; op: string; left: ExprNode; right: ExprNode }
  | { type: "unary"; op: string; operand: ExprNode }
  | { type: "group"; expr: ExprNode };

// Operator precedence (lower = binds tighter)
const PRECEDENCE: Record<string, number> = {
  "**": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  "+": 3,
  "-": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "==": 5,
  "!=": 5,
  "&&": 6,
  "||": 7,
};

/**
 * Tokenize an expression string
 */
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }

    // Multi-character operators
    if (expr.slice(i, i + 2) === "**") {
      tokens.push("**");
      i += 2;
      continue;
    }
    if (expr.slice(i, i + 2) === "<=") {
      tokens.push("<=");
      i += 2;
      continue;
    }
    if (expr.slice(i, i + 2) === ">=") {
      tokens.push(">=");
      i += 2;
      continue;
    }
    if (expr.slice(i, i + 2) === "==") {
      tokens.push("==");
      i += 2;
      continue;
    }
    if (expr.slice(i, i + 2) === "!=") {
      tokens.push("!=");
      i += 2;
      continue;
    }
    if (expr.slice(i, i + 2) === "&&") {
      tokens.push("&&");
      i += 2;
      continue;
    }
    if (expr.slice(i, i + 2) === "||") {
      tokens.push("||");
      i += 2;
      continue;
    }

    // Single-character operators and punctuation
    if (/[+\-*/<>()[\].,^]/.test(expr[i])) {
      // Handle ^ as **
      if (expr[i] === "^") {
        tokens.push("**");
      } else {
        tokens.push(expr[i]);
      }
      i++;
      continue;
    }

    // Numbers (including decimals)
    if (
      /[0-9]/.test(expr[i]) ||
      (expr[i] === "." && /[0-9]/.test(expr[i + 1]))
    ) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push(num);
      continue;
    }

    // Identifiers (including inputs.name)
    if (/[a-zA-Z_]/.test(expr[i])) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      tokens.push(ident);
      continue;
    }

    // Unknown character - skip
    i++;
  }

  return tokens;
}

/**
 * Parse tokens into an AST
 */
class Parser {
  private tokens: string[];
  private pos: number = 0;

  constructor(tokens: string[]) {
    this.tokens = tokens;
  }

  private peek(): string | undefined {
    return this.tokens[this.pos];
  }

  private consume(): string {
    return this.tokens[this.pos++];
  }

  private match(token: string): boolean {
    if (this.peek() === token) {
      this.consume();
      return true;
    }
    return false;
  }

  parse(): ExprNode {
    return this.parseExpression(10);
  }

  private parseExpression(maxPrec: number): ExprNode {
    let left = this.parsePrimary();

    while (
      this.peek() &&
      PRECEDENCE[this.peek()!] !== undefined &&
      PRECEDENCE[this.peek()!] <= maxPrec
    ) {
      const op = this.consume();
      const prec = PRECEDENCE[op];
      // Right associative for **
      const nextPrec = op === "**" ? prec : prec - 1;
      const right = this.parseExpression(nextPrec);
      left = { type: "binary", op, left, right };
    }

    return left;
  }

  private parsePrimary(): ExprNode {
    // Unary minus
    if (this.peek() === "-") {
      this.consume();
      const operand = this.parsePrimary();
      return { type: "unary", op: "-", operand };
    }

    // Parentheses
    if (this.match("(")) {
      const expr = this.parseExpression(10);
      this.match(")");
      return { type: "group", expr };
    }

    // Number
    if (this.peek() && /^[0-9.]/.test(this.peek()!)) {
      return { type: "number", value: this.consume() };
    }

    // Identifier, property access, function call, or array indexing
    if (this.peek() && /^[a-zA-Z_]/.test(this.peek()!)) {
      let node: ExprNode = { type: "identifier", name: this.consume() };

      // Handle property access (e.g., inputs.width, nearbyAgents.vx)
      while (
        this.peek() === "." ||
        this.peek() === "[" ||
        this.peek() === "("
      ) {
        if (this.match(".")) {
          const prop = this.consume();
          node = { type: "property", object: node, property: prop };
        } else if (this.match("[")) {
          const index = this.parseExpression(10);
          this.match("]");
          // Check for property access after index: arr[i].prop
          if (this.match(".")) {
            const prop = this.consume();
            node = { type: "index", object: node, index, property: prop };
          } else {
            node = { type: "index", object: node, index };
          }
        } else if (this.match("(")) {
          // Function call - node must be an identifier at this point
          const args: ExprNode[] = [];
          if (this.peek() !== ")") {
            args.push(this.parseExpression(10));
            while (this.match(",")) {
              args.push(this.parseExpression(10));
            }
          }
          this.match(")");
          // Extract function name from identifier node
          let funcName: string = "";
          if (node.type === "identifier") {
            funcName = node.name;
          }
          node = { type: "call", name: funcName, args };
        }
      }

      return node;
    }

    // Fallback - return empty identifier
    return { type: "identifier", name: "" };
  }
}

/**
 * Generate JavaScript code from AST with Float32 wrapping
 * @param randomInputs Set of random input names that should use local variables instead of inputs.X
 */
export function generateJS(
  node: ExprNode,
  wrapArithmetic: boolean = true,
  randomInputs: Set<string> = new Set(),
): string {
  switch (node.type) {
    case "number":
      return wrapArithmetic ? `f(${node.value})` : node.value;

    case "identifier":
      // Agent variables (x, y, vx, vy) are already f32
      if (["x", "y", "vx", "vy", "id"].includes(node.name)) {
        return node.name;
      }
      // Local variables should be wrapped when read
      return node.name;

    case "property": {
      const objCode = generateJS(node.object, false, randomInputs);
      // inputs.* handling - check if it's a random input that should use local variable
      if (
        (node.object as { type: "identifier"; name: string }).name === "inputs"
      ) {
        // Check if this is a random input - use the local variable instead
        if (randomInputs.has(node.property)) {
          return node.property; // Return just the variable name (already f32 from initialization)
        }
        return wrapArithmetic
          ? `f(${objCode}.${node.property})`
          : `${objCode}.${node.property}`;
      }
      // Other property access (e.g., nearbyAgents.length)
      if (node.property === "length") {
        return `${objCode}.${node.property}`;
      }
      return wrapArithmetic
        ? `f(${objCode}.${node.property})`
        : `${objCode}.${node.property}`;
    }

    case "index": {
      const objCode = generateJS(node.object, false, randomInputs);
      const idxCode = generateJS(node.index, false, randomInputs);
      if (node.property) {
        // Array[i].property - wrap in f()
        return wrapArithmetic
          ? `f(${objCode}[${idxCode}].${node.property})`
          : `${objCode}[${idxCode}].${node.property}`;
      }
      return `${objCode}[${idxCode}]`;
    }

    case "call": {
      const argsCode = node.args
        .map((a) => generateJS(a, true, randomInputs))
        .join(", ");
      // Map DSL functions to JS
      switch (node.name) {
        case "sqrt":
          return `f(Math.sqrt(${argsCode}))`;
        case "neighbors":
          return `_neighbors(${argsCode})`;
        case "mean":
          // Handle mean(nearbyAgents.vx) -> _mean(nearbyAgents, 'vx')
          if (node.args.length === 1 && node.args[0].type === "property") {
            const prop = node.args[0] as {
              type: "property";
              object: ExprNode;
              property: string;
            };
            const objName = generateJS(prop.object, false, randomInputs);
            return `_mean(${objName}, '${prop.property}')`;
          }
          return `_mean(${argsCode})`;
        case "sense":
          return `_sense(${argsCode})`;
        case "random":
          // random() calls should already be pre-processed to _random(INDEX, ...)
          // by indexRandomCalls() before reaching the AST
          return `_random(${argsCode})`;
        case "_random":
          return `_random(${argsCode})`;
        default:
          return `${node.name}(${argsCode})`;
      }
    }

    case "unary": {
      const operandCode = generateJS(node.operand, true, randomInputs);
      if (node.op === "-") {
        return wrapArithmetic ? `f(-${operandCode})` : `-${operandCode}`;
      }
      return `${node.op}${operandCode}`;
    }

    case "binary": {
      const leftCode = generateJS(node.left, true, randomInputs);
      const rightCode = generateJS(node.right, true, randomInputs);

      // Comparison operators don't need f() wrapping on result
      if (["<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(node.op)) {
        return `(${leftCode} ${node.op} ${rightCode})`;
      }

      // Exponentiation: convert a**2 to f(a*a), general to Math.pow
      if (node.op === "**") {
        if (node.right.type === "number" && node.right.value === "2") {
          return `f(${leftCode} * ${leftCode})`;
        }
        return `f(Math.pow(${leftCode}, ${rightCode}))`;
      }

      // Arithmetic operators need f() wrapping
      return `f(${leftCode} ${node.op} ${rightCode})`;
    }

    case "group":
      return generateJS(node.expr, wrapArithmetic, randomInputs);

    default:
      return "";
  }
}

/**
 * Parse and transform an expression to Float32-wrapped JavaScript
 * @param expr The expression to transform
 * @param randomInputs Set of random input variable names that should use local variables instead of inputs.X
 */
export function transformExpression(
  expr: string,
  randomInputs: Set<string> = new Set(),
): string {
  const tokens = tokenize(expr.trim());
  if (tokens.length === 0) return expr;

  const parser = new Parser(tokens);
  const ast = parser.parse();
  let result = generateJS(ast, true, randomInputs);

  return result;
}

/**
 * Validates an AST node for semantic correctness, catching undeclared variables
 * and invalid input properties. Pushes errors directly to the context.
 */
export function validateExpressionAST(
  node: ExprNode,
  ctx: CompilationContext,
): void {
  const builtinVariables = new Set(["x", "y", "vx", "vy", "id", "species"]);

  switch (node.type) {
    case "identifier": {
      const name = node.name;
      // Ignore if it's an empty fallback
      if (name === "") return;

      // Check built-ins
      if (builtinVariables.has(name)) return;

      // Check if it's 'inputs' (handled loosely here if someone just accesses inputs without property)
      if (name === "inputs" || name === "Math") return;

      // Allow loop variable
      if (ctx.currentLoopVar && name === ctx.currentLoopVar) return;

      // Check if it's declared in specific context maps
      if (
        ctx.variables.has(name) ||
        ctx.localVars.has(name) ||
        ctx.randomInputs.has(name)
      )
        return;

      // At this point it's an undeclared variable
      ctx.errors.push({
        message: `Variable '${name}' is not defined.`,
        lineIndex: ctx.currentLineIndex,
      });
      break;
    }

    case "property": {
      validateExpressionAST(node.object, ctx);

      if (node.object.type === "identifier" && node.object.name === "inputs") {
        const prop = node.property;
        if (!ctx.inputs.has(prop) && !ctx.randomInputs.has(prop)) {
          ctx.errors.push({
            message: `Input '${prop}' is not declared. Ensure it is included in the simulation inputs definition.`,
            lineIndex: ctx.currentLineIndex,
          });
        }
      } else if (
        node.object.type === "identifier" &&
        node.object.name === "nearbyAgents" &&
        node.property === "length"
      ) {
        // allow nearbyAgents.length
      } else if (
        node.object.type === "identifier" &&
        ctx.variables.get(node.object.name)?.type === "neighbors" &&
        node.property === "length"
      ) {
        // Allow array.length on neighbors types
      }
      break;
    }

    case "index":
      validateExpressionAST(node.object, ctx);
      validateExpressionAST(node.index, ctx);
      break;

    case "call":
      node.args.forEach((arg) => validateExpressionAST(arg, ctx));
      // We could validate if the function is supported here too
      break;

    case "unary":
      validateExpressionAST(node.operand, ctx);
      break;

    case "binary":
      validateExpressionAST(node.left, ctx);
      validateExpressionAST(node.right, ctx);
      break;

    case "group":
      validateExpressionAST(node.expr, ctx);
      break;
  }
}

/**
 * Convenience function to parse and validate a raw string expression
 */
export function validateExpressionString(
  expr: string,
  ctx: CompilationContext,
): void {
  const tokens = tokenize(expr.trim());
  if (tokens.length === 0) return;
  const parser = new Parser(tokens);
  const ast = parser.parse();
  validateExpressionAST(ast, ctx);
}

/**
 * Check if an expression is an array (should not be wrapped in f())
 */
export function isArrayExpression(expr: string): boolean {
  return expr.includes("neighbors(") || expr.includes("_neighbors(");
}
