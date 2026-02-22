// src/helpers/logger.ts
import prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["None"] = 0] = "None";
  LogLevel2[LogLevel2["Error"] = 1] = "Error";
  LogLevel2[LogLevel2["Warning"] = 2] = "Warning";
  LogLevel2[LogLevel2["Info"] = 3] = "Info";
  LogLevel2[LogLevel2["Verbose"] = 4] = "Verbose";
  return LogLevel2;
})(LogLevel || {});
var GlobalLogLevel = 4 /* Verbose */;
var _Logger = class _Logger {
  /**
   * Create a new logger instance.
   *
   * @param context - Human-readable context name shown in log prefixes.
   * @param color - CSS colour string for styled console output.
   */
  constructor(context, color = "black") {
    this.context = context;
    this.color = color;
  }
  /**
   * Set the global minimum log level for all Logger instances.
   *
   * Messages below this level are silently discarded.
   *
   * @param level - The new minimum log level.
   */
  static setGlobalLogLevel(level) {
    GlobalLogLevel = level;
  }
  /**
   * Register a global listener that receives all log messages.
   *
   * @param listener - Callback invoked for each log message.
   */
  static addListener(listener) {
    this.listeners.push(listener);
  }
  /**
   * Remove a previously registered global listener.
   *
   * @param listener - The listener callback to remove.
   */
  static removeListener(listener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  /**
   * Emit a log message to all registered listeners.
   *
   * @param level - Log level of the message.
   * @param message - Primary message string.
   * @param args - Additional arguments (serialised into the message for listeners).
   * @internal
   */
  emit(level, message, ...args) {
    const fullMessage = args.length > 0 ? `${message} ${args.map((arg2) => typeof arg2 === "object" ? JSON.stringify(arg2) : String(arg2)).join(" ")}` : message;
    _Logger.listeners.forEach((listener) => listener(level, this.context, fullMessage, args));
  }
  /**
   * Log a verbose/debug message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  log(message, ...args) {
    if (GlobalLogLevel >= 4 /* Verbose */) {
      this.emit(4 /* Verbose */, message, ...args);
      console.log(`%c[${this.context}] : ${message}`, `color: ${this.color}`, ...args);
    }
  }
  /**
   * Log an informational message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  info(message, ...args) {
    if (GlobalLogLevel >= 3 /* Info */) {
      this.emit(3 /* Info */, message, ...args);
      console.info(`[${this.context}] INFO: ${message}`, ...args);
    }
  }
  /**
   * Log a warning message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  warn(message, ...args) {
    if (GlobalLogLevel >= 2 /* Warning */) {
      this.emit(2 /* Warning */, message, ...args);
      console.warn(`[${this.context}] WARNING: ${message}`, ...args);
    }
  }
  /**
   * Log an error message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  error(message, ...args) {
    if (GlobalLogLevel >= 1 /* Error */) {
      this.emit(1 /* Error */, message, ...args);
      console.error(`[${this.context}] ERROR: ${message}`, ...args);
    }
  }
  /**
   * Log an error with surrounding source-code context.
   *
   * Shows 2 lines above and below the error line with a `>` marker
   * pointing to the offending line.
   *
   * @param message - Error description.
   * @param code - Full source code string.
   * @param lineIndex - Zero-based line index where the error occurred.
   */
  codeError(message, code, lineIndex) {
    if (GlobalLogLevel >= 1 /* Error */) {
      const lines = code.split("\n");
      const contextStart = Math.max(0, lineIndex - 2);
      const contextEnd = Math.min(lines.length - 1, lineIndex + 2);
      const contextLines = lines.slice(contextStart, contextEnd + 1).map((l, i) => {
        const currentLineIndex = contextStart + i;
        const marker = currentLineIndex === lineIndex ? " > " : "   ";
        return `${marker}${currentLineIndex + 1}| ${l}`;
      }).join("\n");
      const formattedMessage = `${message}
At line ${lineIndex + 1}:
${contextLines}`;
      this.emit(1 /* Error */, formattedMessage);
      console.error(`[${this.context}] CODE ERROR: ${message}`, "\n", contextLines);
    }
  }
  /**
   * Pretty-print a code snippet to the console with syntax-appropriate formatting.
   *
   * JavaScript code is formatted with Prettier; WGSL and WAT use a simple
   * indentation-based formatter.
   *
   * @param label - Descriptive label for the code block.
   * @param code - The source code to format and display.
   * @param language - Language identifier for formatting.
   */
  async code(label, code, language) {
    if (GlobalLogLevel >= 4 /* Verbose */) {
      let formattedCode;
      try {
        switch (language) {
          case "js":
            formattedCode = await this.formatJS(code);
            break;
          case "wgsl":
          case "wasm":
            formattedCode = this.formatGeneralCode(code);
            break;
          default:
            formattedCode = code;
        }
      } catch {
        formattedCode = code;
      }
      console.log(`%c[${this.context}] ${label}:
%c${formattedCode}`, `color: ${this.color}; font-weight: bold;`, "color: gray; font-family: monospace;");
    }
  }
  /**
   * Format JavaScript code using Prettier.
   *
   * @param code - Raw JavaScript source.
   * @returns Formatted JavaScript source.
   * @internal
   */
  async formatJS(code) {
    return prettier.format(code, {
      parser: "babel",
      plugins: [babelPlugin, estreePlugin],
      semi: true,
      singleQuote: true,
      tabWidth: 2
    });
  }
  /**
   * Apply simple indentation-based formatting to WGSL/WAT code.
   *
   * Adjusts indentation based on brace/bracket nesting.
   *
   * @param code - Raw WGSL or WAT source.
   * @returns Re-indented source.
   * @internal
   */
  formatGeneralCode(code) {
    const lines = code.split(/\r?\n/).map((line) => {
      let s = line.replace(/\t/g, "  ");
      s = s.replace(/\s+$/, "");
      return s;
    });
    let indentLevel = 0;
    const indentSize = 2;
    const out = [];
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (trimmed.startsWith("}") || trimmed.startsWith("]);") || trimmed.startsWith("}")) {
        indentLevel = Math.max(indentLevel - 1, 0);
      }
      const indent = " ".repeat(indentLevel * indentSize);
      out.push(indent + trimmed);
      if (trimmed.endsWith("{") || trimmed.endsWith("([") || trimmed.endsWith("(")) {
        indentLevel++;
      }
    }
    return out.join("\n") + "\n";
  }
};
/** @internal Global listener registry for log interception. */
_Logger.listeners = [];
var Logger = _Logger;

// src/compiler/expressionAST.ts
var PRECEDENCE = {
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
  "||": 7
};
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (/\s/.test(expr[i])) {
      i++;
      continue;
    }
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
    if (/[+\-*/<>()[\].,^]/.test(expr[i])) {
      if (expr[i] === "^") {
        tokens.push("**");
      } else {
        tokens.push(expr[i]);
      }
      i++;
      continue;
    }
    if (/[0-9]/.test(expr[i]) || expr[i] === "." && /[0-9]/.test(expr[i + 1])) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push(num);
      continue;
    }
    if (/[a-zA-Z_]/.test(expr[i])) {
      let ident = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i];
        i++;
      }
      tokens.push(ident);
      continue;
    }
    i++;
  }
  return tokens;
}
var Parser = class {
  constructor(tokens) {
    this.pos = 0;
    this.tokens = tokens;
  }
  peek() {
    return this.tokens[this.pos];
  }
  consume() {
    return this.tokens[this.pos++];
  }
  match(token) {
    if (this.peek() === token) {
      this.consume();
      return true;
    }
    return false;
  }
  parse() {
    return this.parseExpression(10);
  }
  parseExpression(maxPrec) {
    let left = this.parsePrimary();
    while (this.peek() && PRECEDENCE[this.peek()] !== void 0 && PRECEDENCE[this.peek()] <= maxPrec) {
      const op = this.consume();
      const prec = PRECEDENCE[op];
      const nextPrec = op === "**" ? prec : prec - 1;
      const right = this.parseExpression(nextPrec);
      left = { type: "binary", op, left, right };
    }
    return left;
  }
  parsePrimary() {
    if (this.peek() === "-") {
      this.consume();
      const operand = this.parsePrimary();
      return { type: "unary", op: "-", operand };
    }
    if (this.match("(")) {
      const expr = this.parseExpression(10);
      this.match(")");
      return { type: "group", expr };
    }
    if (this.peek() && /^[0-9.]/.test(this.peek())) {
      return { type: "number", value: this.consume() };
    }
    if (this.peek() && /^[a-zA-Z_]/.test(this.peek())) {
      let node = { type: "identifier", name: this.consume() };
      while (this.peek() === "." || this.peek() === "[" || this.peek() === "(") {
        if (this.match(".")) {
          const prop = this.consume();
          node = { type: "property", object: node, property: prop };
        } else if (this.match("[")) {
          const index = this.parseExpression(10);
          this.match("]");
          if (this.match(".")) {
            const prop = this.consume();
            node = { type: "index", object: node, index, property: prop };
          } else {
            node = { type: "index", object: node, index };
          }
        } else if (this.match("(")) {
          const args = [];
          if (this.peek() !== ")") {
            args.push(this.parseExpression(10));
            while (this.match(",")) {
              args.push(this.parseExpression(10));
            }
          }
          this.match(")");
          let funcName = "";
          if (node.type === "identifier") {
            funcName = node.name;
          }
          node = { type: "call", name: funcName, args };
        }
      }
      return node;
    }
    return { type: "identifier", name: "" };
  }
};
function generateJS(node, wrapArithmetic = true, randomInputs = /* @__PURE__ */ new Set()) {
  switch (node.type) {
    case "number":
      return wrapArithmetic ? `f(${node.value})` : node.value;
    case "identifier":
      if (["x", "y", "vx", "vy", "id"].includes(node.name)) {
        return node.name;
      }
      return node.name;
    case "property": {
      const objCode = generateJS(node.object, false, randomInputs);
      if (node.object.name === "inputs") {
        if (randomInputs.has(node.property)) {
          return node.property;
        }
        return wrapArithmetic ? `f(${objCode}.${node.property})` : `${objCode}.${node.property}`;
      }
      if (node.property === "length") {
        return `${objCode}.${node.property}`;
      }
      return wrapArithmetic ? `f(${objCode}.${node.property})` : `${objCode}.${node.property}`;
    }
    case "index": {
      const objCode = generateJS(node.object, false, randomInputs);
      const idxCode = generateJS(node.index, false, randomInputs);
      if (node.property) {
        return wrapArithmetic ? `f(${objCode}[${idxCode}].${node.property})` : `${objCode}[${idxCode}].${node.property}`;
      }
      return `${objCode}[${idxCode}]`;
    }
    case "call": {
      const argsCode = node.args.map((a) => generateJS(a, true, randomInputs)).join(", ");
      switch (node.name) {
        case "sqrt":
          return `f(Math.sqrt(${argsCode}))`;
        case "neighbors":
          return `_neighbors(${argsCode})`;
        case "mean":
          if (node.args.length === 1 && node.args[0].type === "property") {
            const prop = node.args[0];
            const objName = generateJS(prop.object, false, randomInputs);
            return `_mean(${objName}, '${prop.property}')`;
          }
          return `_mean(${argsCode})`;
        case "sense":
          return `_sense(${argsCode})`;
        case "random":
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
      if (["<", ">", "<=", ">=", "==", "!=", "&&", "||"].includes(node.op)) {
        return `(${leftCode} ${node.op} ${rightCode})`;
      }
      if (node.op === "**") {
        if (node.right.type === "number" && node.right.value === "2") {
          return `f(${leftCode} * ${leftCode})`;
        }
        return `f(Math.pow(${leftCode}, ${rightCode}))`;
      }
      return `f(${leftCode} ${node.op} ${rightCode})`;
    }
    case "group":
      return generateJS(node.expr, wrapArithmetic, randomInputs);
    default:
      return "";
  }
}
function transformExpression(expr, randomInputs = /* @__PURE__ */ new Set()) {
  const tokens = tokenize(expr.trim());
  if (tokens.length === 0) return expr;
  const parser = new Parser(tokens);
  const ast = parser.parse();
  let result = generateJS(ast, true, randomInputs);
  return result;
}
function validateExpressionAST(node, ctx) {
  const builtinVariables = /* @__PURE__ */ new Set(["x", "y", "vx", "vy", "id", "species"]);
  switch (node.type) {
    case "identifier": {
      const name = node.name;
      if (name === "") return;
      if (builtinVariables.has(name)) return;
      if (name === "inputs" || name === "Math") return;
      if (ctx.currentLoopVar && name === ctx.currentLoopVar) return;
      if (ctx.variables.has(name) || ctx.localVars.has(name) || ctx.randomInputs.has(name)) return;
      ctx.errors.push({
        message: `Variable '${name}' is not defined.`,
        lineIndex: ctx.currentLineIndex
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
            lineIndex: ctx.currentLineIndex
          });
        }
      } else if (node.object.type === "identifier" && node.object.name === "nearbyAgents" && node.property === "length") {
      } else if (node.object.type === "identifier" && ctx.variables.get(node.object.name)?.type === "neighbors" && node.property === "length") {
      }
      break;
    }
    case "index":
      validateExpressionAST(node.object, ctx);
      validateExpressionAST(node.index, ctx);
      break;
    case "call":
      node.args.forEach((arg2) => validateExpressionAST(arg2, ctx));
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
function validateExpressionString(expr, ctx) {
  const tokens = tokenize(expr.trim());
  if (tokens.length === 0) return;
  const parser = new Parser(tokens);
  const ast = parser.parse();
  validateExpressionAST(ast, ctx);
}

// src/compiler/compilerTarget.ts
function createContext(inputs, randomInputs, numRandomCalls = 0) {
  return {
    variables: /* @__PURE__ */ new Map(),
    loopDepth: 0,
    randomInputs: new Set(randomInputs),
    usedFunctions: /* @__PURE__ */ new Set(),
    localVars: /* @__PURE__ */ new Set(),
    blockStack: [],
    randomCallCount: 0,
    numRandomCalls,
    errors: [],
    inputs: new Set(inputs),
    currentLineIndex: 0
  };
}

// src/compiler/parser.ts
var AVAILABLE_COMMANDS_LIST = [
  "moveUp",
  "moveDown",
  "moveLeft",
  "moveRight",
  "addVelocityX",
  "addVelocityY",
  "setVelocityX",
  "setVelocityY",
  "updatePosition",
  "borderWrapping",
  "borderBounce",
  "limitSpeed",
  "turn",
  "moveForward",
  "sense",
  "deposit",
  "enableTrails",
  "print",
  "species",
  "avoidObstacles"
];
var DSLParser = class _DSLParser {
  /**
   * Helper to extract content between balanced parentheses
   */
  static extractBalanced(str, startIdx) {
    let balance = 0;
    for (let i = startIdx; i < str.length; i++) {
      if (str[i] === "(") balance++;
      else if (str[i] === ")") {
        balance--;
        if (balance === 0) return str.substring(startIdx + 1, i);
      }
    }
    return null;
  }
  /**
   * Parses a single line of DSL code to identify its type and extract relevant information
   */
  static parseDSLLine(line) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === "{" || trimmed === "}") {
      return { type: trimmed === "" ? "empty" : "brace" };
    }
    if (trimmed.startsWith("var ")) {
      const rest = trimmed.substring(4).trim().replace(/;$/, "");
      const eqIndex = rest.indexOf("=");
      if (eqIndex > 0) {
        const name = rest.substring(0, eqIndex).trim();
        const expression = rest.substring(eqIndex + 1).trim();
        return { type: "var", name, expression };
      }
    }
    if (trimmed.startsWith("if")) {
      const openParen = trimmed.indexOf("(");
      if (openParen > -1) {
        const condition = _DSLParser.extractBalanced(trimmed, openParen);
        if (condition !== null) {
          return { type: "if", condition: condition.trim() };
        }
      }
    }
    if (trimmed.startsWith("} else if") || trimmed.startsWith("else if") || trimmed.startsWith("elseif")) {
      const openParen = trimmed.indexOf("(");
      if (openParen > -1) {
        const condition = _DSLParser.extractBalanced(trimmed, openParen);
        if (condition !== null) {
          return { type: "elseif", condition: condition.trim() };
        }
      }
    }
    if (trimmed === "} else {" || trimmed === "else {" || trimmed === "else") {
      return { type: "else" };
    }
    if (trimmed.startsWith("for ")) {
      const openParen = trimmed.indexOf("(");
      if (openParen > -1) {
        const content = _DSLParser.extractBalanced(trimmed, openParen);
        if (content !== null) {
          const parts = content.split(";");
          if (parts.length === 3) {
            return {
              type: "for",
              init: parts[0].trim(),
              condition: parts[1].trim(),
              increment: parts[2].trim()
            };
          }
        }
      }
    }
    if (trimmed.startsWith("foreach")) {
      const openParen = trimmed.indexOf("(");
      if (openParen > -1) {
        const content = _DSLParser.extractBalanced(trimmed, openParen);
        if (content !== null) {
          const asIndex = content.indexOf(" as ");
          if (asIndex > -1) {
            return {
              type: "foreach",
              collection: content.substring(0, asIndex).trim(),
              varName: content.substring(asIndex + 4).trim()
            };
          } else {
            const trimmedColl = content.trim();
            return {
              type: "foreach",
              collection: trimmedColl,
              itemAlias: trimmedColl
            };
          }
        }
      }
    }
    if (trimmed.includes("=") && !trimmed.includes("==") && !trimmed.includes("!=") && !trimmed.includes("<=") && !trimmed.includes(">=")) {
      const cleaned = trimmed.replace(/;$/, "");
      const compoundMatch = cleaned.match(/^(\w+)\s*([\+\-\*\/])=\s*(.+)$/);
      if (compoundMatch) {
        const varName = compoundMatch[1];
        const op = compoundMatch[2];
        const rhs = compoundMatch[3];
        return { type: "assignment", target: varName, expression: `${varName} ${op} ${rhs}` };
      }
      const eqIndex = cleaned.indexOf("=");
      if (eqIndex > 0) {
        const target = cleaned.substring(0, eqIndex).trim();
        const expression = cleaned.substring(eqIndex + 1).trim();
        if (!trimmed.startsWith("var ")) {
          return { type: "assignment", target, expression };
        }
      }
    }
    const parsed = _DSLParser.parseCommandLine(trimmed);
    if (parsed) {
      return { type: "command", command: parsed.command, argument: parsed.argument };
    }
    return { type: "unknown" };
  }
  /**
   * Parses a single line of DSL code to extract command and argument
   * Returns null if the line is not a valid command
   */
  static parseCommandLine(line) {
    const openParen = line.indexOf("(");
    if (openParen === -1) return null;
    const commandStr = line.substring(0, openParen).trim();
    if (!AVAILABLE_COMMANDS_LIST.includes(commandStr)) {
      return null;
    }
    const argument = _DSLParser.extractBalanced(line, openParen);
    if (argument === null) return null;
    return { command: commandStr, argument: argument.trim() };
  }
  /**
   * Replaces all occurrences of {arg} in a template string with the given argument
   */
  static applyCommandTemplate(template, arg2) {
    return template.replace(/\{arg\}/g, arg2);
  }
  /**
   * Parses an array of LineInfo objects, expanding any recognised commands
   * via the supplied command-template map. Non-command lines are skipped.
   */
  static parseLines(lines, commandMap) {
    const result = [];
    for (const line of lines) {
      const parsed = _DSLParser.parseCommandLine(line.content.trim());
      if (parsed) {
        const template = commandMap[parsed.command];
        if (template) {
          result.push(_DSLParser.applyCommandTemplate(template, parsed.argument));
        }
      }
    }
    return result;
  }
};

// src/compiler/functionRegistry.ts
var FUNCTIONS = [];
function registerFunction(fn) {
  FUNCTIONS.push(fn);
}
function tryEmitFunctionVar(varName, expression, target, ctx) {
  for (const fn of FUNCTIONS) {
    const match = fn.detect(expression);
    if (match) {
      ctx.usedFunctions.add(fn.name);
      return fn.emitVar(match, varName, target, ctx);
    }
  }
  return null;
}
registerFunction({
  name: "neighbors",
  detect: (expr) => expr.match(/^neighbors\((.+)\)$/),
  emitVar(match, varName, target, ctx) {
    const radiusExpr = target.emitExpression(match[1], ctx);
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
        `}`
      ];
    }
    if (target.name === "wat") {
      const radius = radiusExpr;
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
      return [`
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
    )`];
    }
    return [];
  }
});
registerFunction({
  name: "mean",
  detect: (expr) => expr.match(/^mean\((\w+)\.(\w+)\)$/),
  emitVar(match, varName, target, ctx) {
    const collection = match[1];
    const property = match[2];
    const collectionInfo = ctx.variables.get(collection);
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
          `}`
        ];
      }
      return [`var ${varName}: f32 = 0.0;`];
    }
    if (target.name === "wat") {
      const collName = collection || "nearbyAgents";
      return [`(local.set $${varName} (f32.div (local.get $${collName}_sum_${property}) (local.get $${collName}_count)))`];
    }
    return [];
  }
});
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
      ctx.localVars.add(varName);
      return [`(local.set $${varName} (call $_sense (local.get $x) (local.get $y) (local.get $vx) (local.get $vy) ${angle} ${dist}))`];
    }
    return [];
  },
  emitExpr(match, target, ctx) {
    const args = match[1].split(",").map((s) => s.trim());
    const angle = target.emitExpression(args[0], ctx);
    const dist = target.emitExpression(args[1], ctx);
    if (target.name === "js") return `_sense(${angle}, ${dist})`;
    if (target.name === "wgsl") return `_sense(x, y, vx, vy, ${angle}, ${dist})`;
    if (target.name === "wat") return `(call $_sense (local.get $x) (local.get $y) (local.get $vx) (local.get $vy) ${angle} ${dist})`;
    return "";
  }
});
registerFunction({
  name: "random",
  detect: (expr) => expr.match(/^random\(([^)]*)\)$/),
  emitVar(match, varName, target, ctx) {
    const args = match[1].split(",").filter((s) => s.trim().length > 0).map((s) => s.trim());
    if (target.name === "js") {
      const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
      ctx.randomCallCount++;
      if (args.length === 0) return [`let ${varName} = _random(${callIndex}); `];
      if (args.length === 1) return [`let ${varName} = _random(${callIndex}, ${target.emitExpression(args[0], ctx)}); `];
      return [`let ${varName} = _random(${callIndex}, ${target.emitExpression(args[0], ctx)}, ${target.emitExpression(args[1], ctx)}); `];
    }
    if (target.name === "wgsl") {
      const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
      ctx.randomCallCount++;
      const randVal = `randomValues[u32(agent.id) * ${ctx.numRandomCalls}u + ${callIndex}u]`;
      if (args.length === 0) return [`var ${varName}: f32 = ${randVal};`];
      if (args.length === 1) {
        const max2 = target.emitExpression(args[0], ctx);
        return [`var ${varName}: f32 = (${randVal} * ${max2});`];
      }
      const min = target.emitExpression(args[0], ctx);
      const max = target.emitExpression(args[1], ctx);
      return [`var ${varName}: f32 = (${min} + ${randVal} * (${max} - ${min}));`];
    }
    if (target.name === "wat") {
      ctx.localVars.add(varName);
      return [`(local.set $${varName} (call $_random (local.get $_agent_id)))`];
    }
    return [];
  },
  emitExpr(match, target, ctx) {
    const args = match[1].split(",").filter((s) => s.trim().length > 0).map((s) => s.trim());
    if (target.name === "js") {
      const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
      ctx.randomCallCount++;
      if (args.length === 0) return `_random(${callIndex})`;
      if (args.length === 1) return `_random(${callIndex}, ${target.emitExpression(args[0], ctx)})`;
      return `_random(${callIndex}, ${target.emitExpression(args[0], ctx)}, ${target.emitExpression(args[1], ctx)})`;
    }
    if (target.name === "wgsl") {
      const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
      ctx.randomCallCount++;
      const randVal = `randomValues[u32(agent.id) * ${ctx.numRandomCalls}u + ${callIndex}u]`;
      if (args.length === 0) return randVal;
      if (args.length === 1) {
        const max2 = target.emitExpression(args[0], ctx);
        return `(${randVal} * ${max2})`;
      }
      const min = target.emitExpression(args[0], ctx);
      const max = target.emitExpression(args[1], ctx);
      return `(${min} + ${randVal} * (${max} - ${min}))`;
    }
    if (target.name === "wat") {
      return `(call $_random (local.get $_agent_id))`;
    }
    return "";
  }
});

// src/compiler/commandRegistry.ts
var COMMANDS = /* @__PURE__ */ new Map();
function registerCommand(cmd) {
  COMMANDS.set(cmd.name, cmd);
}
function emitCommand(command, argument, target, ctx) {
  const cmd = COMMANDS.get(command);
  if (!cmd) return null;
  return cmd.emit(argument, target, ctx);
}
function arg(argument, target, ctx) {
  return target.emitExpression(argument, ctx);
}
registerCommand({
  name: "moveUp",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`y = f(y - ${a});`];
    if (target.name === "wgsl") return [`y = y - ${a};`];
    return [`(local.set $y (f32.sub (local.get $y) ${a}))`];
  }
});
registerCommand({
  name: "moveDown",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`y = f(y + ${a});`];
    if (target.name === "wgsl") return [`y = y + ${a};`];
    return [`(local.set $y (f32.add (local.get $y) ${a}))`];
  }
});
registerCommand({
  name: "moveLeft",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`x = f(x - ${a});`];
    if (target.name === "wgsl") return [`x = x - ${a};`];
    return [`(local.set $x (f32.sub (local.get $x) ${a}))`];
  }
});
registerCommand({
  name: "moveRight",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`x = f(x + ${a});`];
    if (target.name === "wgsl") return [`x = x + ${a};`];
    return [`(local.set $x (f32.add (local.get $x) ${a}))`];
  }
});
registerCommand({
  name: "moveForward",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`x = f(x + f(vx * ${a})); y = f(y + f(vy * ${a}));`];
    if (target.name === "wgsl") return [`let _dist_mf = ${a}; let _dx_mf_t2 = vx * _dist_mf; let _dy_mf_t2 = vy * _dist_mf;  x = x + _dx_mf_t2; y = y + _dy_mf_t2;`];
    return [
      `(local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) ${a})))`,
      `(local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) ${a})))`
    ];
  }
});
registerCommand({
  name: "updatePosition",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`x = f(x + f(vx * ${a})); y = f(y + f(vy * ${a}));`];
    if (target.name === "wgsl") return [`let _dt_up = ${a}; let _dx_mf_t1 = vx * _dt_up; let _dy_mf_t1 = vy * _dt_up; x = x + _dx_mf_t1; y = y + _dy_mf_t1;`];
    return [
      `(local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) ${a})))`,
      `(local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) ${a})))`
    ];
  }
});
registerCommand({
  name: "addVelocityX",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`vx = f(vx + ${a});`];
    if (target.name === "wgsl") return [`vx = vx + ${a};`];
    return [`(local.set $vx (f32.add (local.get $vx) ${a}))`];
  }
});
registerCommand({
  name: "addVelocityY",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`vy = f(vy + ${a});`];
    if (target.name === "wgsl") return [`vy = vy + ${a};`];
    return [`(local.set $vy (f32.add (local.get $vy) ${a}))`];
  }
});
registerCommand({
  name: "setVelocityX",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`vx = f(${a});`];
    if (target.name === "wgsl") return [`vx = ${a};`];
    return [`(local.set $vx ${a})`];
  }
});
registerCommand({
  name: "setVelocityY",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`vy = f(${a});`];
    if (target.name === "wgsl") return [`vy = ${a};`];
    return [`(local.set $vy ${a})`];
  }
});
registerCommand({
  name: "limitSpeed",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") {
      return [`const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f(${a}*${a})) { const __scale = f(Math.sqrt(f(f(${a}*${a}) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); }`];
    }
    if (target.name === "wgsl") {
      return [`let _spd_ls = ${a}; let _spd_ls2 = _spd_ls * _spd_ls; let _vx2_ls = vx * vx; let _vy2_ls = vy * vy; let _cur_ls2 = _vx2_ls + _vy2_ls; if (_cur_ls2 > _spd_ls2) { let _scale_ls = sqrt(_spd_ls2 / _cur_ls2); vx = vx * _scale_ls; vy = vy * _scale_ls; }`];
    }
    ctx.localVars.add("__speed2");
    ctx.localVars.add("__scale");
    return [
      `(local.set $__speed2 (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vy) (local.get $vy))))`,
      `(if (f32.gt (local.get $__speed2) (f32.mul ${a} ${a})) (then`,
      `  (local.set $__scale (f32.sqrt (f32.div (f32.mul ${a} ${a}) (local.get $__speed2))))`,
      `  (local.set $vx (f32.mul (local.get $vx) (local.get $__scale)))`,
      `  (local.set $vy (f32.mul (local.get $vy) (local.get $__scale)))`,
      `))`
    ];
  }
});
registerCommand({
  name: "turn",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") {
      return [`const __c = f(Math.cos(${a})); const __s = f(Math.sin(${a})); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;`];
    }
    if (target.name === "wgsl") {
      return [`let _ang_t = ${a}; let _c_t = cos(_ang_t); let _s_t = sin(_ang_t); let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;`];
    }
    ctx.localVars.add("__c");
    ctx.localVars.add("__s");
    ctx.localVars.add("__vx");
    return [
      `(local.set $__c (call $cos ${a}))`,
      `(local.set $__s (call $sin ${a}))`,
      `(local.set $__vx (f32.sub (f32.mul (local.get $vx) (local.get $__c)) (f32.mul (local.get $vy) (local.get $__s))))`,
      `(local.set $vy (f32.add (f32.mul (local.get $vx) (local.get $__s)) (f32.mul (local.get $vy) (local.get $__c))))`,
      `(local.set $vx (local.get $__vx))`
    ];
  }
});
registerCommand({
  name: "borderWrapping",
  emit(_argument, target, _ctx) {
    if (target.name === "js") {
      return [`if (x < 0) x = f(x + f(inputs.width)); if (x >= f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y >= f(inputs.height)) y = f(y - f(inputs.height));`];
    }
    if (target.name === "wgsl") {
      return [`if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }`];
    }
    return [
      `(if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))`,
      `(if (f32.ge (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))`,
      `(if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))`,
      `(if (f32.ge (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))`
    ];
  }
});
registerCommand({
  name: "borderBounce",
  emit(_argument, target, _ctx) {
    if (target.name === "js") {
      return [`if (x < 0 || x > f(inputs.width)) vx = f(-vx); if (y < 0 || y > f(inputs.height)) vy = f(-vy); x = f(Math.max(0, Math.min(f(inputs.width), x))); y = f(Math.max(0, Math.min(f(inputs.height), y)));`];
    }
    if (target.name === "wgsl") {
      return [`if (x < 0.0 || x >= inputs.width) { vx = -vx; } if (y < 0.0 || y >= inputs.height) { vy = -vy; } x = clamp(x, 0.0, inputs.width); y = clamp(y, 0.0, inputs.height);`];
    }
    return [
      `(if (i32.or (f32.lt (local.get $x) (f32.const 0)) (f32.gt (local.get $x) (global.get $inputs_width))) (then (local.set $vx (f32.neg (local.get $vx)))))`,
      `(if (i32.or (f32.lt (local.get $y) (f32.const 0)) (f32.gt (local.get $y) (global.get $inputs_height))) (then (local.set $vy (f32.neg (local.get $vy)))))`,
      `(local.set $x (f32.max (f32.const 0) (f32.min (global.get $inputs_width) (local.get $x))))`,
      `(local.set $y (f32.max (f32.const 0) (f32.min (global.get $inputs_height) (local.get $y))))`
    ];
  }
});
registerCommand({
  name: "deposit",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`_deposit(${a});`];
    if (target.name === "wgsl") return [`_deposit(x, y, ${a});`];
    return [`(call $deposit (local.get $x) (local.get $y) ${a})`];
  }
});
registerCommand({
  name: "sense",
  emit(argument, target, ctx) {
    const args = argument.split(",").map((s) => s.trim());
    const angle = target.emitExpression(args[0], ctx);
    const dist = target.emitExpression(args[1], ctx);
    if (target.name === "js") return [`_sense(${angle}, ${dist})`];
    if (target.name === "wgsl") return [`_sense(x, y, vx, vy, ${angle}, ${dist})`];
    return [`(call $sense ${angle} ${dist})`];
  }
});
registerCommand({
  name: "enableTrails",
  emit(_argument, target, _ctx) {
    if (target.name === "wat") return ["nop"];
    return [];
  }
});
registerCommand({
  name: "species",
  emit(_argument, target, _ctx) {
    if (target.name === "wat") return ["nop"];
    return [];
  }
});
registerCommand({
  name: "avoidObstacles",
  emit(argument, target, ctx) {
    const a = argument.trim() ? arg(argument, target, ctx) : arg("1.0", target, ctx);
    if (target.name === "js") return [`_avoidObstacles(${a});`];
    if (target.name === "wgsl") return [`_avoidObstacles(${a}, &x, &y, &vx, &vy);`];
    if (target.name === "wat") {
      ctx.localVars.add("_obs_idx");
      ctx.localVars.add("_obs_ptr");
      ctx.localVars.add("_obs_x");
      ctx.localVars.add("_obs_y");
      ctx.localVars.add("_obs_w");
      ctx.localVars.add("_obs_h");
      ctx.localVars.add("_obs_cx");
      ctx.localVars.add("_obs_cy");
      ctx.localVars.add("_obs_dx");
      ctx.localVars.add("_obs_dy");
      ctx.localVars.add("_obs_dist");
      return [
        `;; avoidObstacles (strength=${a})`,
        `(local.set $_obs_idx (i32.const 0))`,
        `(local.set $_obs_ptr (global.get $obstaclesPtr))`,
        `(block $_obs_exit`,
        `  (loop $_obs_loop`,
        `    (br_if $_obs_exit (i32.ge_u (local.get $_obs_idx) (global.get $inputs_obstacleCount)))`,
        `    (local.set $_obs_x (f32.load (local.get $_obs_ptr)))`,
        `    (local.set $_obs_y (f32.load (i32.add (local.get $_obs_ptr) (i32.const 4))))`,
        `    (local.set $_obs_w (f32.load (i32.add (local.get $_obs_ptr) (i32.const 8))))`,
        `    (local.set $_obs_h (f32.load (i32.add (local.get $_obs_ptr) (i32.const 12))))`,
        `    ;; Check if agent is inside obstacle + 5px margin`,
        `    (if (i32.and`,
        `      (i32.and`,
        `        (f32.gt (local.get $x) (f32.sub (local.get $_obs_x) (f32.const 5)))`,
        `        (f32.lt (local.get $x) (f32.add (f32.add (local.get $_obs_x) (local.get $_obs_w)) (f32.const 5)))`,
        `      )`,
        `      (i32.and`,
        `        (f32.gt (local.get $y) (f32.sub (local.get $_obs_y) (f32.const 5)))`,
        `        (f32.lt (local.get $y) (f32.add (f32.add (local.get $_obs_y) (local.get $_obs_h)) (f32.const 5)))`,
        `      )`,
        `    ) (then`,
        `      ;; Compute direction away from obstacle center`,
        `      (local.set $_obs_cx (f32.add (local.get $_obs_x) (f32.mul (local.get $_obs_w) (f32.const 0.5))))`,
        `      (local.set $_obs_cy (f32.add (local.get $_obs_y) (f32.mul (local.get $_obs_h) (f32.const 0.5))))`,
        `      (local.set $_obs_dx (f32.sub (local.get $x) (local.get $_obs_cx)))`,
        `      (local.set $_obs_dy (f32.sub (local.get $y) (local.get $_obs_cy)))`,
        `      (local.set $_obs_dist (f32.sqrt (f32.add (f32.mul (local.get $_obs_dx) (local.get $_obs_dx)) (f32.mul (local.get $_obs_dy) (local.get $_obs_dy)))))`,
        `      (if (f32.gt (local.get $_obs_dist) (f32.const 0.001)) (then`,
        `        (local.set $_obs_dx (f32.div (local.get $_obs_dx) (local.get $_obs_dist)))`,
        `        (local.set $_obs_dy (f32.div (local.get $_obs_dy) (local.get $_obs_dist)))`,
        `      ))`,
        `      (local.set $vx (f32.add (local.get $vx) (f32.mul (local.get $_obs_dx) ${a})))`,
        `      (local.set $vy (f32.add (local.get $vy) (f32.mul (local.get $_obs_dy) ${a})))`,
        `    ))`,
        `    (local.set $_obs_idx (i32.add (local.get $_obs_idx) (i32.const 1)))`,
        `    (local.set $_obs_ptr (i32.add (local.get $_obs_ptr) (i32.const 16)))`,
        `    (br $_obs_loop)`,
        `  )`,
        `)`
      ];
    }
    return [];
  }
});
registerCommand({
  name: "print",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`if (inputs.print) inputs.print(id, ${a});`];
    if (target.name === "wgsl") return [`agentLogs[i] = vec2<f32>(1.0, ${a});`];
    return [`(call $print (local.get $_agent_id) ${a})`];
  }
});

// src/compiler/transpiler.ts
function transpileDSL(lines, target, ctx) {
  const statements = [];
  for (const line of lines) {
    const trimmed = line.content.trim();
    if (!trimmed) continue;
    ctx.currentLineIndex = line.lineIndex;
    const parsed = DSLParser.parseDSLLine(trimmed);
    let emitted = [];
    const startsWithBrace = trimmed.startsWith("}") && parsed.type !== "brace";
    if (startsWithBrace) {
      const closedBlock = ctx.blockStack.pop();
      if (closedBlock === "loop") {
        ctx.loopDepth--;
        if (ctx.loopDepth === 0) ctx.currentLoopVar = void 0;
      }
    }
    switch (parsed.type) {
      case "empty":
        continue;
      case "brace":
        emitted = target.emitCloseBrace(ctx);
        break;
      case "var": {
        validateExpressionString(parsed.expression, ctx);
        const functionResult = tryEmitFunctionVar(parsed.name, parsed.expression, target, ctx);
        if (functionResult) {
          emitted = functionResult;
        } else {
          emitted = target.emitVar(parsed.name, parsed.expression, ctx);
        }
        if (!ctx.variables.has(parsed.name)) {
          ctx.variables.set(parsed.name, { type: "scalar" });
        }
        ctx.localVars.add(parsed.name);
        break;
      }
      case "if":
        validateExpressionString(parsed.condition, ctx);
        emitted = target.emitIf(parsed.condition, ctx);
        break;
      case "elseif":
        validateExpressionString(parsed.condition, ctx);
        emitted = target.emitElseIf(parsed.condition, ctx);
        break;
      case "else":
        emitted = target.emitElse(ctx);
        break;
      case "for": {
        const initMatch = parsed.init.match(/^var\s+([a-zA-Z_]\w*)/);
        if (initMatch) {
          const loopVar = initMatch[1];
          ctx.localVars.add(loopVar);
          ctx.variables.set(loopVar, { type: "loop_index" });
        }
        validateExpressionString(parsed.condition, ctx);
        emitted = target.emitFor(parsed.init, parsed.condition, parsed.increment, ctx);
        break;
      }
      case "foreach":
        emitted = target.emitForeach(parsed.collection, parsed.varName, parsed.itemAlias, ctx);
        break;
      case "assignment":
        if (!parsed.target.includes("[") && !parsed.target.includes(".")) {
          validateExpressionString(parsed.target, ctx);
        }
        validateExpressionString(parsed.expression, ctx);
        emitted = target.emitAssignment(parsed.target, parsed.expression, ctx);
        break;
      case "command":
        if (parsed.argument) {
          validateExpressionString(parsed.argument, ctx);
        }
        emitted = emitCommand(parsed.command, parsed.argument, target, ctx) ?? [];
        break;
      case "unknown":
      default:
        ctx.errors.push({ message: "Unknown syntax or command", lineIndex: line.lineIndex });
        continue;
    }
    if (startsWithBrace && emitted.length > 0) {
      emitted[0] = "} " + emitted[0];
    }
    for (const stmt of emitted) {
      if (stmt !== "") {
        statements.push(stmt);
      }
    }
  }
  return statements;
}

// src/compiler/JScompiler.ts
function indexRandomCalls(expr, ctx) {
  return expr.replace(/\brandom\(([^)]*)\)/g, (_match, args) => {
    const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
    ctx.randomCallCount++;
    const parts = args.split(",").filter((s) => s.trim().length > 0).map((s) => s.trim());
    if (parts.length === 0) {
      return `_random(${callIndex})`;
    }
    return `_random(${callIndex}, ${parts.join(", ")})`;
  });
}
var JSTarget = {
  name: "js",
  emitExpression(expr, ctx) {
    return transformExpression(indexRandomCalls(expr, ctx), ctx.randomInputs);
  },
  emitVar(name, expression, ctx) {
    const exprTranspiled = transformExpression(indexRandomCalls(expression, ctx), ctx.randomInputs);
    ctx.variables.set(name, { type: "scalar" });
    return [`let ${name} = ${exprTranspiled}; `];
  },
  emitIf(condition, ctx) {
    ctx.blockStack.push("control");
    return [`if (${transformExpression(indexRandomCalls(condition, ctx), ctx.randomInputs)}) {`];
  },
  emitElseIf(condition, ctx) {
    ctx.blockStack.push("control");
    return [`else if (${transformExpression(indexRandomCalls(condition, ctx), ctx.randomInputs)}) {`];
  },
  emitElse(ctx) {
    ctx.blockStack.push("control");
    return [`else {`];
  },
  emitFor(init, condition, increment, ctx) {
    const jsInit = init.replace(/^var\s+/, "let ");
    const jsCond = transformExpression(indexRandomCalls(condition, ctx), ctx.randomInputs);
    ctx.loopDepth++;
    ctx.blockStack.push("loop");
    return [`for (${jsInit}; ${jsCond}; ${increment}) {`];
  },
  emitForeach(collection, varName, _itemAlias, ctx) {
    const loopVar = varName || _itemAlias;
    if (!loopVar) return [];
    ctx.loopDepth++;
    ctx.currentLoopVar = loopVar;
    ctx.blockStack.push("loop");
    if (loopVar === collection) {
      return [
        `for (const _${loopVar} of ${collection}) {`,
        `const ${loopVar} = _${loopVar};`
      ];
    }
    return [`for (const ${loopVar} of ${collection}) {`];
  },
  emitAssignment(target, expression, ctx) {
    const exprTranspiled = transformExpression(indexRandomCalls(expression, ctx), ctx.randomInputs);
    return [`${target.trim()} = ${exprTranspiled}; `];
  },
  emitCloseBrace(ctx) {
    const closedBlock = ctx.blockStack.pop();
    if (closedBlock === "loop") {
      ctx.loopDepth--;
      if (ctx.loopDepth === 0) ctx.currentLoopVar = void 0;
    }
    return ["}"];
  },
  emitProgram(statements, _inputs, randomInputs, ctx) {
    if (statements.length === 0) {
      return `(agent) => ({ ...agent })`;
    }
    const used = ctx.usedFunctions;
    const helpers = [];
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
    const usesAvoidObstacles = statements.some((s) => s.includes("_avoidObstacles("));
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
  }
};
var compileDSLtoJS = (lines, inputs, randomInputs = [], numRandomCalls = 0) => {
  const ctx = createContext(inputs, randomInputs, numRandomCalls);
  const statements = transpileDSL(lines, JSTarget, ctx);
  const result = JSTarget.emitProgram(statements, inputs, randomInputs, ctx);
  return { code: result, errors: ctx.errors };
};

// src/compiler/WATcompiler.ts
function tokenizeExpression(expr) {
  const tokens = [];
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
function infixToSExpression(expr) {
  expr = expr.trim();
  if (expr.includes(".")) {
    expr = expr.replace(/([a-zA-Z_]\w*)\.(\w+)/g, (match, prefix, suffix) => {
      if (prefix === "f32" || prefix === "i32" || prefix === "local" || prefix === "global" || prefix === "call" || prefix === "return") return match;
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
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i] === "+" || tokens[i] === "-") {
      const isUnary = i === 0 || /^[+\-*/^]$/.test(tokens[i - 1]) || tokens[i - 1] === "(";
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
  if (tokens[0] === "-") {
    return `(f32.neg ${infixToSExpression(tokens.slice(1).join(" "))})`;
  }
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
  const converted = tokens.map((token) => {
    const _rm = token.match(/^__RANDOM_(\d+)__$/);
    if (_rm) return `(call $random (local.get $_agent_id) (i32.const ${_rm[1]}))`;
    if (/^GLOBAL_\w+$/.test(token)) return `(global.get $inputs_${token.substring(7)})`;
    if (/^-?\d+(\.\d+)?$/.test(token)) return `(f32.const ${token})`;
    if (/^[+\-*/]$/.test(token)) return token;
    if (token === "id") return `(local.get $_agent_id)`;
    return `(local.get $${token})`;
  }).join(" ");
  return converted;
}
function normalizeWASMExpression(expr, randomInputs, watCtx) {
  let r = expr.trim();
  r = r.replace(/sqrt\(([^)]+)\)/g, (_match, arg2) => {
    return `(f32.sqrt ${infixToSExpression(arg2)})`;
  });
  r = r.replace(/(\w+(?:\.\w+)?)\s*\^2/g, "$1 * $1");
  r = r.replace(/(\w+(?:\.\w+)?)\s*\*\*2/g, "$1 * $1");
  r = r.replace(/([a-zA-Z_]\w*)\.(?!length|count)(\w+)/g, (match, obj, prop) => {
    if (obj === "inputs") return match;
    if (obj === "nearbyAgents") return match;
    if (obj === "f32" || obj === "i32" || obj === "local" || obj === "global" || obj === "call" || obj === "return") return match;
    return `${obj}_${prop}`;
  });
  r = r.replace(/(\w+)\.length/g, "$1_count");
  r = r.replace(/(\w+)\.count/g, "$1_count");
  if (r.includes("neighbors(")) {
    const match = r.match(/neighbors\(([^)]+)\)/);
    if (match) return `__NEIGHBORS__${match[1]}__`;
  }
  if (r.includes("mean(")) {
    const match = r.match(/mean\(([^)]+)\)/);
    if (match) {
      const arg2 = match[1].trim();
      const propMatch = arg2.match(/\w+\.(\w+)/);
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
    const parts = args.split(",").filter((s) => s.trim().length > 0).map((s) => s.trim());
    const randCall = `__RANDOM_${watCtx ? watCtx.numRandomInputs + watCtx.randomCallCount : 0}__`;
    if (watCtx) watCtx.randomCallCount++;
    if (parts.length === 0) return randCall;
    if (parts.length === 1) return `(${randCall} * ${parts[0]})`;
    return `(${parts[0]} + ${randCall} * (${parts[1]} - ${parts[0]}))`;
  });
  if (r.includes("inputs.random")) {
    const randIdx = watCtx ? watCtx.numRandomInputs + watCtx.randomCallCount : 0;
    if (watCtx) watCtx.randomCallCount++;
    return normalizeWASMExpression(r.replace(/inputs\.random/g, `__RANDOM_${randIdx}__`), randomInputs, watCtx);
  }
  if (randomInputs.size > 0) {
    r = r.replace(/inputs\.(\w+)/g, (match, name) => {
      if (randomInputs.has(name)) return name;
      return match;
    });
  }
  return infixToSExpression(r);
}
function normalizeWASMCondition(cond, randomInputs, watCtx) {
  cond = cond.trim();
  const operators = [
    { op: ">=", asm: "f32.ge" },
    { op: "<=", asm: "f32.le" },
    { op: ">", asm: "f32.gt" },
    { op: "<", asm: "f32.lt" },
    { op: "==", asm: "f32.eq" },
    { op: "!=", asm: "f32.ne" }
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
function parseCondition(condition, randomInputs, watCtx) {
  condition = condition.trim();
  condition = condition.replace(/(\w+)\.length/g, "$1_count");
  return normalizeWASMCondition(condition, randomInputs, watCtx);
}
function transpileLine(line, localVars, randomInputs, context) {
  const parsed = DSLParser.parseDSLLine(line);
  switch (parsed.type) {
    case "empty":
      return "";
    case "brace": {
      const trimmed = line.trim();
      if (trimmed === "}") {
        return "))";
      }
      return "";
    }
    case "var": {
      localVars.add(parsed.name);
      let expr = parsed.expression;
      const arrayMatchInVar = expr.match(/(\w+)\[\w+\]\.(\w+)/);
      if (arrayMatchInVar) {
        const offsets = { x: 4, y: 8, vx: 12, vy: 16, species: 20 };
        const offset = offsets[arrayMatchInVar[2]] || 0;
        return `(local.set $${parsed.name} (f32.load (i32.add (local.get $_for_ptr) (i32.const ${offset}))))`;
      }
      if (context.currentLoopVar) {
        const loopVarRegex = new RegExp(`\\b${context.currentLoopVar}\\.(\\w+)`, "g");
        expr = expr.replace(loopVarRegex, `${context.currentLoopVar}_$1`);
      }
      const wasmExpr = normalizeWASMExpression(expr, randomInputs, context);
      if (wasmExpr.startsWith("__NEIGHBORS__")) {
        const radiusExpr = wasmExpr.replace("__NEIGHBORS__", "").replace("__", "");
        const radius = normalizeWASMExpression(radiusExpr, randomInputs, context);
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
      context.blockStack.push({ type: "if", pendingClose: context.deferredPendingClose });
      context.deferredPendingClose = 0;
      let condition = parsed.condition;
      if (context.currentLoopVar) {
        const loopVarRegex = new RegExp(`\\b${context.currentLoopVar}\\.(\\w+)`, "g");
        condition = condition.replace(loopVarRegex, `${context.currentLoopVar}_$1`);
      }
      const combinedCondition = (parts, op) => {
        const conditions = parts.map((p) => parseCondition(p, randomInputs, context));
        if (conditions.some((c) => c.includes("TODO"))) return conditions.find((c) => c.includes("TODO")) ?? null;
        return `(if ${conditions.reduce((acc, c) => acc ? `(i32.${op} ${acc} ${c})` : c)} (then`;
      };
      if (condition.includes("&&")) return combinedCondition(condition.split("&&").map((p) => p.trim()), "and") ?? null;
      if (condition.includes("||")) return combinedCondition(condition.split("||").map((p) => p.trim()), "or") ?? null;
      return `(if ${parseCondition(condition, randomInputs, context)} (then`;
    }
    case "else":
      context.blockStack.push({ type: "if", pendingClose: context.deferredPendingClose });
      context.deferredPendingClose = 0;
      return "(else";
    case "elseif":
      context.blockStack.push({ type: "if", pendingClose: context.deferredPendingClose });
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
        const initExpr = initMatch ? normalizeWASMExpression(initMatch[2], randomInputs, context) : "(f32.const 0)";
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
        const offsets = { x: 4, y: 8, vx: 12, vy: 16, species: 20 };
        const offset = offsets[arrayMatch[2]] || 0;
        const loadExpr = `(f32.load (i32.add (local.get $_for_ptr) (i32.const ${offset})))`;
        assignExpr = assignExpr.replace(/(\w+)\[\w+\]\.(\w+)/, loadExpr);
        return `(local.set $${parsed.target} ${normalizeWASMExpression(assignExpr, randomInputs, context)})`;
      }
      if (context.currentLoopVar) {
        const loopVarRegex = new RegExp(`\\b${context.currentLoopVar}\\.(\\w+)`, "g");
        assignExpr = assignExpr.replace(loopVarRegex, `${context.currentLoopVar}_$1`);
      }
      return `(local.set $${parsed.target} ${normalizeWASMExpression(assignExpr, randomInputs, context)})`;
    }
    case "command": {
      const ctx = createContext(Array.from(context.inputs), Array.from(randomInputs), context.numRandomCalls);
      ctx.localVars = localVars;
      if (context.currentLoopVar) ctx.currentLoopVar = context.currentLoopVar;
      ctx.loopDepth = context.loopDepth;
      const result = emitCommand(parsed.command, parsed.argument, WATTarget, ctx);
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
var WATTarget = {
  name: "wat",
  emitExpression(expr, ctx) {
    return normalizeWASMExpression(expr, ctx.randomInputs);
  },
  emitVar(name, expression, ctx) {
    ctx.localVars.add(name);
    return [`(local.set $${name} ${normalizeWASMExpression(expression, ctx.randomInputs)})`];
  },
  emitIf(condition, ctx) {
    return [`(if ${parseCondition(condition, ctx.randomInputs)} (then`];
  },
  emitElseIf(condition, ctx) {
    return [`(elseif ${parseCondition(condition, ctx.randomInputs)}`];
  },
  emitElse() {
    return ["(else"];
  },
  emitFor(_init, _condition, _increment, _ctx) {
    return [";; for loop (not used through shared transpiler)"];
  },
  emitForeach(_collection, _varName, _itemAlias, _ctx) {
    return [";; foreach loop (not used through shared transpiler)"];
  },
  emitAssignment(target, expression, ctx) {
    return [`(local.set $${target} ${normalizeWASMExpression(expression, ctx.randomInputs)})`];
  },
  emitCloseBrace(_ctx) {
    return ["))"];
  },
  emitProgram(_statements, _inputs, _randomInputs, _ctx) {
    return ";; WAT program generation uses compileDSLtoWAT directly";
  }
};
var compileDSLtoWAT = (lines, inputs, randomInputs = [], numRandomCalls = 0) => {
  const statements = [];
  const localVars = /* @__PURE__ */ new Set();
  const randomInputsSet = new Set(randomInputs);
  const errors = [];
  const context = {
    loopDepth: 0,
    neighborsInfo: /* @__PURE__ */ new Map(),
    variables: /* @__PURE__ */ new Map(),
    randomInputs: randomInputsSet,
    usedFunctions: /* @__PURE__ */ new Set(),
    localVars,
    blockStack: [],
    deferredPendingClose: 0,
    randomCallCount: 0,
    numRandomCalls,
    errors,
    inputs: new Set(inputs),
    currentLineIndex: 0,
    numRandomInputs: randomInputs.length
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.content.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("}") && trimmed !== "}") {
      const closedBlock = context.blockStack.pop();
      if (closedBlock && (closedBlock.type === "foreach" || closedBlock.type === "for")) {
        context.loopDepth--;
        if (context.loopDepth <= 0) context.currentLoopVar = void 0;
      }
      if (closedBlock) context.deferredPendingClose += closedBlock.pendingClose;
      statements.push(")");
    }
    let transpiled = transpileLine(trimmed, localVars, randomInputsSet, context);
    if (transpiled === null && trimmed !== "}") {
      if (context.blockStack.length > 0) {
        errors.push({ message: "Missing closing brace", lineIndex: lines[lines.length - 1].lineIndex });
      }
    }
    if (trimmed === "}") {
      const closedBlock = context.blockStack.pop();
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
      const followedByElse = nextLineContent.startsWith("else") || nextLineContent.startsWith("} else");
      if (closedBlock && closedBlock.type === "foreach") {
        context.loopDepth--;
        if (context.loopDepth <= 0) context.currentLoopVar = void 0;
        transpiled = `))
    ))
    (local.set $_foreach_idx (i32.add (local.get $_foreach_idx) (i32.const 1)))
    (local.set $_foreach_ptr (i32.add (local.get $_foreach_ptr) (i32.const 24)))
    (br $_foreach_loop)
    )
    )`;
      } else if (closedBlock && closedBlock.type === "for") {
        context.loopDepth--;
        if (context.loopDepth <= 0) context.currentLoopVar = void 0;
        transpiled = `))
    ))
    (local.set $_for_idx (i32.add (local.get $_for_idx) (i32.const 1)))
    (local.set $_for_ptr (i32.add (local.get $_for_ptr) (i32.const 24)))
    (br $_for_loop)
    )
    )`;
      } else {
        const entryPendingClose = closedBlock ? closedBlock.pendingClose : 0;
        if (followedByElse) {
          transpiled = ")";
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
      if (transpiled.startsWith("(elseif")) {
        const cond = transpiled.substring(8);
        transpiled = `(else (if ${cond} (then`;
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
  const inputGlobals = inputs.length > 0 ? inputs.filter((n) => n !== "randomValues" && n !== "trailMap" && n !== "obstacles" && n !== "obstacleCount").map((n) => `(global $inputs_${n} (export "inputs_${n}") (mut f32) (f32.const 0))`).join("\n  ") : "";
  const agentCountGlobal = `(global $agent_count (export "agent_count") (mut i32) (i32.const 0))`;
  const i32Vars = /* @__PURE__ */ new Set(["_loop_idx", "_loop_ptr", "_for_idx", "_for_ptr", "_foreach_idx", "_foreach_ptr", "_obs_idx", "_obs_ptr"]);
  const reservedLocals = /* @__PURE__ */ new Set(["x", "y", "vx", "vy", "species"]);
  const localVarDecls = Array.from(localVars).filter((v) => !reservedLocals.has(v)).map((v) => `(local $${v} ${i32Vars.has(v) ? "i32" : "f32"})`).join("\n      ");
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
  const stepFuncLocals = localVars.size > 0 ? `
      ${localVarDecls}` : "";
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
    ${inputs.includes("trailMap") ? `(global $trailMapReadPtr (export "trailMapReadPtr") (mut i32) (i32.const 0))
    (global $trailMapWritePtr (export "trailMapWritePtr") (mut i32) (i32.const 0))` : ""}
    ${inputs.includes("randomValues") ? '(global $randomValuesPtr (export "randomValuesPtr") (mut i32) (i32.const 0))' : ""}
    ${inputs.includes("obstacles") ? `(global $obstaclesPtr (export "obstaclesPtr") (mut i32) (i32.const 0))
    (global $inputs_obstacleCount (export "inputs_obstacleCount") (mut i32) (i32.const 0))` : ""}
    (global $agentsReadPtr (export "agentsReadPtr") (mut i32) (i32.const 0))

    ${inputs.includes("randomValues") ? `(func $random (param $id f32) (param $callIndex i32) (result f32)
      ;; Load randomValues[id * numRandomCalls + callIndex]
      (f32.load
        (i32.add
          (global.get $randomValuesPtr)
          (i32.shl
            (i32.add
              (i32.mul (i32.trunc_f32_u (local.get $id)) (i32.const ${numRandomCalls}))
              (local.get $callIndex))
            (i32.const 2)))))` : ";; No random function needed (no randomValues input)"}

    ${inputs.includes("trailMap") ? `
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
    )` : ""}

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
    errors
  };
};

// src/compiler/WGSLcompiler.ts
var WORKGROUP_SIZE = 64;
var WGSL_OBSTACLE_HELPERS = `

struct Obstacle {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

fn _avoidObstacles(strength: f32, px: ptr<function, f32>, py: ptr<function, f32>, pvx: ptr<function, f32>, pvy: ptr<function, f32>) {
    let x_val = *px;
    let y_val = *py;
    var vx_val = *pvx;
    var vy_val = *pvy;
    let obs_count = u32(inputs.obstacleCount);
    let str = strength;
    let margin: f32 = 5.0;
    
    for (var oi: u32 = 0u; oi < obs_count; oi++) {
        let ob = obstacles[oi];
        let ox1 = ob.x - margin;
        let oy1 = ob.y - margin;
        let ox2 = ob.x + ob.w + margin;
        let oy2 = ob.y + ob.h + margin;
        
        if (x_val > ox1 && x_val < ox2 && y_val > oy1 && y_val < oy2) {
            let cx = ob.x + ob.w * 0.5;
            let cy = ob.y + ob.h * 0.5;
            var dx = x_val - cx;
            var dy = y_val - cy;
            let dist = sqrt(dx * dx + dy * dy);
            if (dist > 0.001) {
                dx = dx / dist;
                dy = dy / dist;
            }
            vx_val = vx_val + dx * str;
            vy_val = vy_val + dy * str;
        }
    }
    
    *pvx = vx_val;
    *pvy = vy_val;
}
`;
var WGSL_HELPERS = `


fn _sense(x: f32, y: f32, vx: f32, vy: f32, angle_offset: f32, dist: f32) -> f32 {
    let angle_cur = atan2(vy, vx);
    let angle_new = angle_cur + angle_offset;
    let sx = x + cos(angle_new) * dist;
    let sy = y + sin(angle_new) * dist;

    let w = inputs.width;
    let h = inputs.height;
    
    // Wrap coordinates
    var ix = i32(trunc(sx));
    var iy = i32(trunc(sy));
    
    if (ix < 0) { ix += i32(w); }
    if (ix >= i32(w)) { ix -= i32(w); }
    if (iy < 0) { iy += i32(h); }
    if (iy >= i32(h)) { iy -= i32(h); }
    
    let idx = u32(iy * i32(w) + ix);
    // Read from trailMapRead (previous frame state)
    return trailMapRead[idx];
}

fn _deposit(x: f32, y: f32, amount: f32) {
    let w = inputs.width;
    let h = inputs.height;
    
    var ix = i32(trunc(x));
    var iy = i32(trunc(y));
    
    if (ix < 0) { ix += i32(w); }
    if (ix >= i32(w)) { ix -= i32(w); }
    if (iy < 0) { iy += i32(h); }
    if (iy >= i32(h)) { iy -= i32(h); }
    
    let idx = u32(iy * i32(w) + ix);
    // Write to trailMapWrite (deposits for this frame)
    // Use atomic add with fixed-point conversion (x10000) because f32 atomics aren't supported
    // and standard += is racy/divergent on GPU.
    let fixed_amount = i32(amount * 10000.0);
    atomicAdd(&trailMapWrite[idx], fixed_amount);
}
`;
function transpileExpression(expr, ctx) {
  let result = expr.trim();
  if (/^-?\d+(\.\d+)?$/.test(result)) {
    return result.includes(".") ? result : `${result}.0`;
  }
  if (result === "species") return "species";
  if (result.includes("_species")) return result;
  result = result.replace(/([\w.]+)\^2/g, "($1)*($1)");
  result = result.replace(/\^/g, "**");
  if (ctx.currentLoopVar) {
    const regex = new RegExp(`\\b${ctx.currentLoopVar}\\.(\\w+)`, "g");
    result = result.replace(regex, "_loop_other.$1");
  }
  const propAccessMatch = result.match(/^(\w+)\.(\w+)$/);
  if (propAccessMatch) {
    const varName = propAccessMatch[1];
    const prop = propAccessMatch[2];
    const varInfo = ctx.variables.get(varName);
    if (varInfo?.type === "neighbors") {
      return `/* ERROR: Cannot access ${varName}.${prop} directly in WGSL */`;
    }
  }
  result = result.replace(/(\w+)\.length/g, (_, varName) => {
    return `${varName}_count`;
  });
  result = result.replace(/sqrt\(([^)]+)\)/g, (_match, arg2) => {
    const transpiledArg = transpileExpression(arg2, ctx);
    return `sqrt(${transpiledArg})`;
  });
  result = result.replace(/sense\(([^)]+)\)/g, (_match, args) => {
    const parts = args.split(",").map((s) => s.trim());
    const angle = transpileExpression(parts[0], ctx);
    const dist = transpileExpression(parts[1], ctx);
    return `_sense(agent.x, agent.y, agent.vx, agent.vy, ${angle}, ${dist})`;
  });
  result = result.replace(/inputs\.randomValues\[([^\]]+)\]/g, "randomValues[u32($1)]");
  result = result.replace(/inputs\.random\b/g, "randomValues[u32(agent.id)]");
  result = result.replace(/inputs\.randomValues/g, "randomValues");
  result = result.replace(/random\(([^)]*)\)/g, (_match, args) => {
    const parts = args.split(",").filter((s) => s.trim().length > 0).map((s) => s.trim());
    const callIndex = ctx.randomInputs.size + ctx.randomCallCount;
    ctx.randomCallCount++;
    const randVal = `randomValues[u32(agent.id) * ${ctx.numRandomCalls}u + ${callIndex}u]`;
    if (parts.length === 0) {
      return randVal;
    } else if (parts.length === 1) {
      const max = transpileExpression(parts[0], ctx);
      return `(${randVal} * ${max})`;
    } else {
      const min = transpileExpression(parts[0], ctx);
      const max = transpileExpression(parts[1], ctx);
      return `(${min} + ${randVal} * (${max} - ${min}))`;
    }
  });
  if (/^\d+$/.test(result)) {
    return result + ".0";
  }
  if (ctx.randomInputs.size > 0) {
    result = result.replace(/inputs\.(\w+)/g, (match, name) => {
      if (ctx.randomInputs.has(name)) {
        return name;
      }
      return match;
    });
  }
  return result;
}
var WGSLTarget = {
  name: "wgsl",
  emitExpression(expr, ctx) {
    return transpileExpression(expr, ctx);
  },
  emitVar(name, expression, ctx) {
    const arrayAccessMatch = expression.match(/(\w+)\[(\w+)\]\.(\w+)/);
    if (arrayAccessMatch) {
      let expr = expression;
      if (ctx.loopDepth > 0) {
        expr = expr.replace(
          /(\w+)\[(\w+)\]\.(\w+)/g,
          "_loop_other.$3"
        );
      }
      const transpiled2 = transpileExpression(expr, ctx);
      ctx.variables.set(name, { type: "scalar" });
      return [`var ${name}: f32 = ${transpiled2};`];
    }
    const transpiled = transpileExpression(expression, ctx);
    ctx.variables.set(name, { type: "scalar" });
    return [`var ${name}: f32 = ${transpiled};`];
  },
  emitIf(condition, ctx) {
    let cond = transpileExpression(condition, ctx);
    cond = cond.replace(/(\w+_count)\s*>\s*0\b/g, "$1 > 0u");
    if (/^[a-zA-Z_]\w*$/.test(cond) && !cond.includes("_count")) {
      cond = `${cond} != 0.0`;
    }
    ctx.blockStack.push("control");
    return [`if (${cond}) {`];
  },
  emitElseIf(condition, ctx) {
    let cond = transpileExpression(condition, ctx);
    cond = cond.replace(/(\w+_count)\s*>\s*0\b/g, "$1 > 0u");
    if (/^[a-zA-Z_]\w*$/.test(cond) && !cond.includes("_count")) {
      cond = `${cond} != 0.0`;
    }
    ctx.blockStack.push("control");
    return [`else if (${cond}) {`];
  },
  emitElse(ctx) {
    ctx.blockStack.push("control");
    return ["else {"];
  },
  emitFor(init, condition, increment, ctx) {
    const lengthMatch = condition.match(/(\w+)\s*<\s*(\w+)\.length/);
    if (lengthMatch) {
      const loopVar = lengthMatch[1];
      const collection = lengthMatch[2];
      const collectionInfo = ctx.variables.get(collection);
      if (collectionInfo?.type === "neighbors") {
        const radiusExpr = collectionInfo.radiusExpr;
        const uniqueLoopVar = `_${loopVar}_loop`;
        ctx.currentLoopVar = uniqueLoopVar;
        ctx.loopDepth++;
        ctx.blockStack.push("loop");
        return [
          `// Loop over ${collection}`,
          `for (var ${uniqueLoopVar}: u32 = 0u; ${uniqueLoopVar} < arrayLength(&agents); ${uniqueLoopVar}++) {`,
          `if (${uniqueLoopVar} == i) { continue; }`,
          `let _loop_other = agents[${uniqueLoopVar}];`,
          `let _loop_dx = x - _loop_other.x;`,
          `let _loop_dy = y - _loop_other.y;`,
          `let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);`,
          `if (_loop_dist >= ${radiusExpr}) { continue; }`,
          `// Nearby agent found - execute loop body`
        ];
      }
    }
    const jsInit = init.replace(/^var\s+/, "");
    const cond = transpileExpression(condition, ctx);
    ctx.loopDepth++;
    ctx.blockStack.push("loop");
    return [`for (var ${jsInit}; ${cond}; ${increment}) {`];
  },
  emitForeach(collection, varName, _itemAlias, ctx) {
    const loopVar = varName || _itemAlias;
    const collectionInfo = ctx.variables.get(collection);
    if (collectionInfo?.type === "neighbors" && loopVar) {
      const radiusExpr = collectionInfo.radiusExpr;
      ctx.currentLoopVar = loopVar;
      ctx.loopDepth++;
      ctx.blockStack.push("loop");
      return [
        `// Foreach over ${collection}`,
        `for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {`,
        `if (_ni == i) { continue; }`,
        `let _loop_other = agentsRead[_ni];`,
        `let _loop_dx = x - _loop_other.x;`,
        `let _loop_dy = y - _loop_other.y;`,
        `let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);`,
        `if (_loop_dist >= ${radiusExpr}) { continue; }`
      ];
    }
    return [];
  },
  emitAssignment(target, expression, ctx) {
    let expr = expression;
    if (ctx.loopDepth > 0) {
      expr = expr.replace(
        /(\w+)\[(\w+)\]\.(\w+)/g,
        "_loop_other.$3"
      );
    }
    const transpiled = transpileExpression(expr, ctx);
    return [`${target} = ${transpiled};`];
  },
  emitCloseBrace(ctx) {
    const closedBlock = ctx.blockStack.pop();
    if (closedBlock === "loop") {
      ctx.loopDepth--;
      if (ctx.loopDepth === 0) ctx.currentLoopVar = void 0;
    }
    return ["}"];
  },
  emitProgram(statements, inputs, randomInputs, _ctx) {
    const bufferInputs = ["trailMap", "randomValues", "obstacles"];
    const scalarInputs = inputs.filter((i) => !bufferInputs.includes(i));
    const hasTrailMap = inputs.includes("trailMap");
    const hasRandomValues = inputs.includes("randomValues");
    const hasObstacles = inputs.includes("obstacles");
    const inputFields = scalarInputs.length > 0 ? scalarInputs.map((k) => `    ${k}: f32,`).join("\n") : "    _dummy: f32,";
    const inputStruct = `
struct Inputs {
${inputFields}
};

@group(0) @binding(1) var<uniform> inputs: Inputs;`.trim();
    const agentStruct = `
struct Agent {
    id : f32,
    x  : f32,
    y  : f32,
    vx : f32,
    vy : f32,
    species : f32,
};

@group(0) @binding(0) var<storage, read_write> agents : array<Agent>;
@group(0) @binding(5) var<storage, read> agentsRead : array<Agent>;
@group(0) @binding(6) var<storage, read_write> agentLogs : array<vec2<f32>>;`.trim();
    const trailMapReadBinding = hasTrailMap ? `@group(0) @binding(2) var<storage, read> trailMapRead : array<f32>;` : "";
    const trailMapWriteBinding = hasTrailMap ? `@group(0) @binding(4) var<storage, read_write> trailMapWrite : array<atomic<i32>>;` : "";
    const randomValuesBinding = hasRandomValues ? `@group(0) @binding(3) var<storage, read> randomValues : array<f32>;` : "";
    const obstaclesBinding = hasObstacles ? `@group(0) @binding(7) var<storage, read> obstacles : array<Obstacle>;` : "";
    let mainBody = statements.join("\n        ");
    if (statements.length === 0) {
      mainBody = "// no-op or failed to parse";
    }
    const computeFn = `
@compute @workgroup_size(${WORKGROUP_SIZE}, 1, 1)
fn main(
    @builtin(global_invocation_id) global_id : vec3<u32>,
    @builtin(workgroup_id) workgroup_id : vec3<u32>,
    @builtin(local_invocation_id) local_id : vec3<u32>,
    @builtin(num_workgroups) num_workgroups : vec3<u32>
) {
    let group_index = workgroup_id.x
        + workgroup_id.y * num_workgroups.x
        + workgroup_id.z * num_workgroups.x * num_workgroups.y;
    let i = group_index * ${WORKGROUP_SIZE}u + local_id.x;
    if (i < arrayLength(&agents)) {
        var agent = agents[i];
        var id = agent.id;
        var x = agent.x;
        var y = agent.y;
        var vx = agent.vx;
        var vy = agent.vy;
        var species = agent.species;
        
        // Load random values based on agent.id for parity with JS (indexed by stride)
        ${randomInputs.map((r, ri) => `var ${r} = randomValues[u32(agent.id) * ${_ctx.numRandomCalls}u + ${ri}u];`).join("\n        ")}
        
        ${mainBody}
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agent.species = species;
        agents[i] = agent;
    }
}`.trim();
    const helpers = hasTrailMap ? WGSL_HELPERS : "";
    const obstacleHelpers = hasObstacles ? WGSL_OBSTACLE_HELPERS : "";
    return [agentStruct, inputStruct, trailMapReadBinding, randomValuesBinding, trailMapWriteBinding, obstaclesBinding, obstacleHelpers, helpers, computeFn].join("\n\n");
  }
};
function compileDSLtoWGSL(lines, inputs, randomInputs = [], numRandomCalls = 0) {
  const ctx = createContext(inputs, randomInputs, numRandomCalls);
  const statements = transpileDSL(lines, WGSLTarget, ctx);
  return { code: WGSLTarget.emitProgram(statements, inputs, randomInputs, ctx), errors: ctx.errors };
}

// src/compiler/compiler.ts
var COMMAND_INPUT_DEPENDENCIES = {
  borderWrapping: ["width", "height"],
  borderBounce: ["width", "height"],
  sense: ["width", "height"],
  deposit: ["width", "height", "trailMap"],
  avoidObstacles: ["obstacles", "obstacleCount"]
};
var Compiler = class {
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
  compileAgentCode(agentCode) {
    const script = agentCode?.trim() ?? "";
    this.logger.info("Compiling agent code");
    const preprocessed = this.preprocessDSL(script);
    const compiled = this.compileToAllTargets(preprocessed);
    this.logCompilationResults(compiled, preprocessed);
    const uniqueErrors = /* @__PURE__ */ new Map();
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
  preprocessDSL(dsl) {
    const { lines, definedInputs, randomInputs } = this.parseLines(dsl);
    const inputs = this.extractInputs(dsl, lines, definedInputs, randomInputs);
    const trailEnvironmentConfig = this.extractTrailConfig(lines, inputs);
    const speciesCount = this.extractSpeciesCount(lines);
    this.ensureRandomValuesDependency(inputs, randomInputs, lines);
    const inlineRandomCount = this.countInlineRandomCalls(lines);
    const numRandomCalls = randomInputs.length + inlineRandomCount;
    return { lines, inputs, definedInputs, trailEnvironmentConfig, randomInputs, speciesCount, numRandomCalls };
  }
  /** Count `random()` call sites across all DSL lines. */
  countInlineRandomCalls(lines) {
    let count = 0;
    for (const line of lines) {
      const matches = line.content.match(/\brandom\s*\(/g);
      if (matches) count += matches.length;
    }
    return count;
  }
  /** Parse raw DSL source into structured lines, extracting input and random declarations. */
  parseLines(dsl) {
    const lines = [];
    const definedInputs = [];
    const randomInputs = [];
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
  stripComments(line) {
    return line.split("//")[0].split("#")[0].trim();
  }
  /** Parse an `input name = value` declaration, returning metadata or `null`. */
  parseInputDeclaration(line) {
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
      defined: { name, defaultValue, min, max }
    };
  }
  /** Extract the numeric value and optional `[min, max]` range from a value part. */
  parseValueWithRange(valuePart) {
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
  /** Split a line at `;` boundaries, expanding braceless `if` into block form. */
  splitStatements(line) {
    const parts = line.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
    const result = [];
    for (const part of parts) {
      if (part.startsWith("if ") || part.startsWith("if(")) {
        const openParen = part.indexOf("(");
        if (openParen > -1) {
          const condition = DSLParser.extractBalanced(part, openParen);
          if (condition !== null) {
            const afterCondition = part.substring(openParen + condition.length + 2).trim();
            if (afterCondition && afterCondition !== "{" && !afterCondition.startsWith("{")) {
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
  extractInputs(dsl, lines, definedInputs, randomInputs) {
    const explicitInputs = Array.from(dsl.matchAll(/inputs\.([a-zA-Z_]\w*)/g)).map((m) => m[1]);
    const definedNames = definedInputs.map((d) => d.name);
    const inputs = new Set(
      [...explicitInputs, ...definedNames].filter((name) => !randomInputs.includes(name))
    );
    this.addCommandDependencies(lines, inputs);
    return Array.from(inputs);
  }
  /** Add implicit input dependencies required by DSL commands. */
  addCommandDependencies(lines, inputs) {
    for (const line of lines) {
      const parsed = DSLParser.parseCommandLine(line.content.trim());
      if (parsed && COMMAND_INPUT_DEPENDENCIES[parsed.command]) {
        COMMAND_INPUT_DEPENDENCIES[parsed.command].forEach((input) => inputs.add(input));
      }
    }
  }
  /** Extract trail environment configuration from `enableTrails` commands. */
  extractTrailConfig(lines, inputs) {
    for (const line of lines) {
      const parsed = DSLParser.parseCommandLine(line.content.trim());
      if (parsed?.command !== "enableTrails") continue;
      const args = parsed.argument.split(",").map((s) => s.trim());
      const config = {};
      const depositMatch = args[0]?.match(/^inputs\.(\w+)$/);
      if (depositMatch) config.depositAmountInput = depositMatch[1];
      const decayMatch = args[1]?.match(/^inputs\.(\w+)$/);
      if (decayMatch) config.decayFactorInput = decayMatch[1];
      if (!inputs.includes("trailMap")) {
        inputs.push("trailMap");
      }
      return config;
    }
    return void 0;
  }
  /** Extract the species count from a `species` command declaration. */
  extractSpeciesCount(lines) {
    for (const line of lines) {
      const parsed = DSLParser.parseCommandLine(line.content.trim());
      if (parsed?.command === "species") {
        const count = parseInt(parsed.argument, 10);
        if (!isNaN(count) && count > 0) return count;
      }
    }
    return void 0;
  }
  /** Ensure `randomValues` is listed as a required input when random is used. */
  ensureRandomValuesDependency(inputs, randomInputs, lines) {
    let needsRandomValues = inputs.includes("random") || randomInputs.length > 0;
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
  compileToAllTargets(preprocessed) {
    const { lines, inputs, randomInputs, numRandomCalls } = preprocessed;
    const jsResult = compileDSLtoJS(lines, inputs, randomInputs, numRandomCalls);
    const wgslResult = compileDSLtoWGSL(lines, inputs, randomInputs, numRandomCalls);
    const watResult = compileDSLtoWAT(lines, inputs, randomInputs, numRandomCalls);
    return {
      jsCode: jsResult.code,
      wgslCode: wgslResult.code,
      watCode: watResult.code,
      errors: jsResult.errors
    };
  }
  /** Log all compiled output and extracted inputs to the console. */
  logCompilationResults(compiled, preprocessed) {
    this.logger.code("Generated JS Code", compiled.jsCode, "js");
    this.logger.code("Generated WGSL Code", compiled.wgslCode, "wgsl");
    this.logger.code("Generated WAT Code", compiled.watCode, "wasm");
    this.logger.log("Expected Inputs", preprocessed.inputs);
    this.logger.log("Defined Inputs", preprocessed.definedInputs);
  }
  /** Assemble the final {@link CompilationResult} from preprocessed and compiled data. */
  buildCompilationResult(preprocessed, compiled) {
    return {
      requiredInputs: preprocessed.inputs,
      definedInputs: preprocessed.definedInputs,
      wgslCode: compiled.wgslCode,
      jsCode: compiled.jsCode,
      WASMCode: compiled.watCode,
      trailEnvironmentConfig: preprocessed.trailEnvironmentConfig,
      speciesCount: preprocessed.speciesCount,
      numRandomCalls: preprocessed.numRandomCalls,
      errors: compiled.errors
    };
  }
};

// src/compute/webWorkers.ts
var WorkerScript = `
    let compiledAgentFunction = null;

    self.onmessage = function(event) {
        const data = event.data;

        if (data.type === 'init') {
            try {
                compiledAgentFunction = new Function('return (' + data.agentFunction + ')')();
                self.postMessage({ type: 'init_ack', requestId: data.requestId });
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    requestId: data.requestId,
                    message: error && error.message ? error.message : String(error)
                });
            }
            return;
        }

        if (data.type !== 'compute') {
            return;
        }

        if (!compiledAgentFunction) {
            self.postMessage({
                type: 'error',
                requestId: data.requestId,
                message: 'Worker is not initialized'
            });
            return;
        }

        const { requestId, agents, inputValues, trailMapRead } = data;
        const localInputs = { ...inputValues };

        if (trailMapRead) {
            localInputs.trailMapRead = trailMapRead;
        }

        const width = typeof localInputs.width === 'number' ? localInputs.width : 0;
        const height = typeof localInputs.height === 'number' ? localInputs.height : 0;
        const mapSize = width * height;
        const depositDelta = mapSize > 0 ? new Float32Array(mapSize) : undefined;

        if (depositDelta) {
            localInputs.trailMapWrite = depositDelta;
        }

        localInputs.print = (id, val) => {
            self.postMessage({
                type: 'log',
                requestId,
                level: 'info',
                message: 'AGENT[' + id + '] PRINT: ' + val
            });
        };

        const start = performance.now();
        const updatedAgents = agents.map(agent => compiledAgentFunction(agent, localInputs));
        const end = performance.now();

        self.postMessage({
            type: 'result',
            requestId,
            agents: updatedAgents,
            depositDelta,
            executionTime: end - start
        });
    };
`;
var WebWorkers = class {
  constructor(agentFunction, workerCount) {
    this.nextRequestId = 1;
    this.logger = new Logger("WebWorkersComputeEngine");
    this.workerCount = workerCount ?? navigator.hardwareConcurrency ?? 4;
    this.agentFunctionSource = agentFunction.toString();
    const workerSetup = this.createWorkers(this.workerCount);
    this.workers = workerSetup.workers;
    this.workerScriptUrl = workerSetup.scriptUrl;
    this.initPromise = this.initializeWorkers();
  }
  /**
   * Distribute agents across workers and collect results.
   *
   * @param agents - Current agent array.
   * @param inputValues - Per-frame input values.
   * @returns Merged agent array, optional trail-map deltas, and timing.
   */
  async compute(agents, inputValues) {
    await this.initPromise;
    if (agents.length === 0) {
      return {
        agents,
        performance: {
          serializationTime: 0,
          workerTime: 0,
          deserializationTime: 0
        }
      };
    }
    return new Promise((resolve, reject) => {
      const activeWorkers = Math.min(this.workers.length, Math.max(1, agents.length));
      const agentsPerWorker = Math.ceil(agents.length / activeWorkers);
      const requestId = this.nextRequestId++;
      const sanitizedInputValues = this.sanitizeWorkerInputs(inputValues);
      const trailMapRead = inputValues.trailMapRead;
      const startTime = performance.now();
      let completedWorkers = 0;
      let maxWorkerTime = 0;
      let settled = false;
      const results = [];
      const assignedWorkers = [];
      const cleanup = () => {
        for (const worker of assignedWorkers) {
          worker.onmessage = null;
          worker.onerror = null;
        }
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      for (let index = 0; index < activeWorkers; index++) {
        const start = index * agentsPerWorker;
        const end = Math.min(start + agentsPerWorker, agents.length);
        if (start >= end) {
          continue;
        }
        const worker = this.workers[index];
        assignedWorkers.push(worker);
        const agentsSlice = agents.slice(start, end);
        worker.onmessage = (event) => {
          const data = event.data;
          if (!data || data.requestId !== requestId) {
            return;
          }
          if (data.type === "log") {
            if (data.level === "info") this.logger.info(data.message);
            else if (data.level === "warn") this.logger.warn(data.message);
            else this.logger.error(data.message);
            return;
          }
          if (data.type === "error") {
            fail(new Error(data.message));
            return;
          }
          if (data.type !== "result") {
            return;
          }
          results.push({ index, agents: data.agents, depositDelta: data.depositDelta, time: data.executionTime });
          maxWorkerTime = Math.max(maxWorkerTime, data.executionTime);
          completedWorkers++;
          if (completedWorkers !== assignedWorkers.length || settled) {
            return;
          }
          settled = true;
          cleanup();
          const endTime = performance.now();
          results.sort((a, b) => a.index - b.index);
          const finalAgents = results.flatMap((r) => r.agents);
          let finalTrailMap;
          const deltasWithData = results.filter((r) => r.depositDelta);
          if (deltasWithData.length > 0) {
            const mapLength = deltasWithData[0].depositDelta.length;
            finalTrailMap = new Float32Array(mapLength);
            for (const result of deltasWithData) {
              const delta = result.depositDelta;
              for (let i = 0; i < mapLength; i++) {
                finalTrailMap[i] += delta[i];
              }
            }
          }
          const totalTime = endTime - startTime;
          const overhead = Math.max(0, totalTime - maxWorkerTime);
          resolve({
            agents: finalAgents,
            trailMap: finalTrailMap,
            performance: {
              serializationTime: overhead / 2,
              workerTime: maxWorkerTime,
              deserializationTime: overhead / 2
            }
          });
        };
        worker.onerror = (error) => {
          fail(new Error(error.message));
        };
        worker.postMessage({
          type: "compute",
          requestId,
          agents: agentsSlice,
          inputValues: sanitizedInputValues,
          trailMapRead
        });
      }
      if (assignedWorkers.length === 0) {
        resolve({
          agents,
          performance: {
            serializationTime: 0,
            workerTime: 0,
            deserializationTime: 0
          }
        });
      }
    });
  }
  /** Terminate all worker threads and free resources. */
  destroy() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    URL.revokeObjectURL(this.workerScriptUrl);
  }
  sanitizeWorkerInputs(inputValues) {
    const sanitized = {};
    for (const [key, value] of Object.entries(inputValues)) {
      if (key === "print" || key === "trailMap" || key === "trailMapRead" || key === "trailMapWrite") {
        continue;
      }
      sanitized[key] = value;
    }
    return sanitized;
  }
  async initializeWorkers() {
    const initJobs = this.workers.map((worker, index) => {
      return new Promise((resolve, reject) => {
        const requestId = this.nextRequestId++;
        const onMessage = (event) => {
          const data = event.data;
          if (!data || data.requestId !== requestId) {
            return;
          }
          cleanup();
          if (data.type === "init_ack") {
            resolve();
            return;
          }
          if (data.type === "error") {
            reject(new Error(`Worker ${index} failed to initialize: ${data.message}`));
            return;
          }
          reject(new Error(`Worker ${index} sent unexpected init response.`));
        };
        const onError = (error) => {
          cleanup();
          reject(new Error(`Worker ${index} initialization error: ${error.message}`));
        };
        const cleanup = () => {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
        };
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError);
        worker.postMessage({
          type: "init",
          requestId,
          agentFunction: this.agentFunctionSource
        });
      });
    });
    await Promise.all(initJobs);
    this.logger.info(`Initialized ${this.workers.length} web workers.`);
  }
  /** Create worker threads from an inline Blob script. */
  createWorkers(numWorkers) {
    this.logger.info(`Creating ${numWorkers} web workers.`);
    const scriptUrl = URL.createObjectURL(new Blob([WorkerScript], { type: "application/javascript" }));
    const workers = [];
    for (let i = 0; i < numWorkers; i++) {
      workers.push(new Worker(scriptUrl));
    }
    return { workers, scriptUrl };
  }
};
var webWorkers_default = WebWorkers;

// src/helpers/gpu.ts
var _GPU = class _GPU {
  /**
   * Create a new GPU helper instance.
   *
   * @param scope - Logger context name for this instance.
   */
  constructor(scope = "GPU") {
    this.adapter = null;
    this.device = null;
    this.context = null;
    this.format = null;
    this.logger = new Logger(scope);
  }
  /**
   * Obtain a WebGPU device, reusing the shared singleton if available.
   *
   * On first call, requests an adapter and device from the browser's
   * WebGPU API. Subsequent calls return the cached device.
   *
   * @returns The shared GPU device.
   * @throws {Error} If WebGPU is not supported or the adapter cannot be obtained.
   */
  async getDevice() {
    if (this.device) return this.device;
    if (_GPU.sharedDevice) {
      this.device = _GPU.sharedDevice;
      return this.device;
    }
    if (!navigator.gpu) {
      const message = "WebGPU not supported by this browser.";
      this.logger.error(message);
      throw new Error(message);
    }
    if (!_GPU.sharedAdapter) {
      _GPU.sharedAdapter = await navigator.gpu.requestAdapter();
    }
    this.adapter = _GPU.sharedAdapter;
    if (!this.adapter) {
      const message = "Failed to request WebGPU adapter.";
      this.logger.error(message);
      throw new Error(message);
    }
    _GPU.sharedDevice = await this.adapter.requestDevice();
    this.device = _GPU.sharedDevice;
    this.device.lost.then((info) => {
      console.error(`WebGPU device was lost: ${info.message}`);
      _GPU.sharedDevice = null;
      this.device = null;
    });
    return this.device;
  }
  /**
   * Acquire and cache the WebGPU canvas context for the given canvas element.
   *
   * @param canvas - The HTML canvas element to bind to.
   * @returns The WebGPU canvas context.
   * @throws {Error} If the canvas context cannot be obtained (e.g. already bound to `'2d'`).
   */
  configureCanvas(canvas) {
    if (this.context) return this.context;
    const ctx = canvas.getContext("webgpu");
    if (!ctx) {
      this.logger.error(
        "Failed to acquire WebGPU canvas context. The canvas may have been used with a different context type (e.g., '2d')."
      );
      throw new Error("Failed to acquire WebGPU canvas context.");
    }
    this.context = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.logger.log("WebGPU canvas context acquired successfully");
    return ctx;
  }
  /**
   * Configure the cached canvas context with a device and alpha mode.
   *
   * Must be called after {@link configureCanvas}.
   *
   * @param device - The GPU device to bind to the context.
   * @param alphaMode - Canvas alpha compositing mode.
   * @throws {Error} If {@link configureCanvas} has not been called.
   */
  setupCanvasConfig(device, alphaMode = "opaque") {
    if (!this.context || !this.format) {
      const message = "GPU canvas not configured before setup.";
      this.logger.error(message);
      throw new Error(message);
    }
    this.context.configure({
      device,
      format: this.format,
      alphaMode
    });
  }
  /**
   * Create a GPU buffer, optionally initialised with data.
   *
   * Automatically aligns to 4 bytes, and to 256 bytes for uniform buffers.
   *
   * @param device - The GPU device.
   * @param data - Initial data to write, or `null` for an uninitialised buffer.
   * @param usage - GPU buffer usage flags.
   * @param sizeOverride - Optional minimum byte size (overrides data length).
   * @param label - Optional debug label.
   * @returns The created GPU buffer.
   */
  createBuffer(device, data, usage, sizeOverride, label) {
    const byteLength = data?.byteLength ?? 0;
    let size = Math.max(sizeOverride ?? byteLength, byteLength, 4);
    if (usage & GPUBufferUsage.UNIFORM) {
      size = Math.ceil(size / 256) * 256;
    }
    const buffer = device.createBuffer({
      label,
      size,
      usage,
      mappedAtCreation: !!data
    });
    if (data) {
      const range = buffer.getMappedRange();
      new Float32Array(range).set(data);
      buffer.unmap();
    }
    return buffer;
  }
  /**
   * Create an empty (unmapped) GPU buffer of a given size.
   *
   * @param device - The GPU device.
   * @param size - Desired byte size (will be aligned to 4 bytes).
   * @param usage - GPU buffer usage flags.
   * @param label - Optional debug label.
   * @returns The created GPU buffer.
   */
  createEmptyBuffer(device, size, usage, label) {
    const aligned = Math.ceil(size / 4) * 4;
    return device.createBuffer({
      label,
      size: aligned,
      usage
    });
  }
  /**
   * Write data to an existing GPU buffer via the device queue.
   *
   * @param device - The GPU device.
   * @param buffer - Target GPU buffer.
   * @param data - Float32Array data to write.
   */
  writeBuffer(device, buffer, data) {
    if (!data.byteLength) return;
    device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
  }
  /**
   * Get the preferred texture format for the configured canvas.
   *
   * @returns The GPU texture format, or `null` if not yet configured.
   */
  getFormat() {
    return this.format;
  }
  /**
   * Get the cached WebGPU canvas context.
   *
   * @returns The canvas context, or `null` if not yet configured.
   */
  getContext() {
    return this.context;
  }
};
/** @internal Shared GPU device singleton. */
_GPU.sharedDevice = null;
/** @internal Shared GPU adapter singleton. */
_GPU.sharedAdapter = null;
var GPU = _GPU;

// src/compute/webGPU.ts
var FLOAT_SIZE = 4;
var COMPONENTS_PER_AGENT = 6;
var WebGPU = class {
  constructor(wgslCode, inputsExpected, agentCount) {
    this.logger = new Logger("WebGPUCompute");
    this.gpuHelper = new GPU("WebGPUComputeHelper");
    this.device = null;
    this.computePipeline = null;
    this.bindGroupLayout = null;
    // Preallocated buffers
    this.agentStorageBuffer = null;
    // STORAGE | COPY_SRC | COPY_DST
    this.agentsReadBuffer = null;
    // STORAGE (read-only snapshot for neighbor queries)
    this.stagingReadbackBuffer = null;
    // COPY_DST | MAP_READ
    this.agentVertexBuffer = null;
    // VERTEX | COPY_DST (lazy, only if needed)
    this.agentLogBuffer = null;
    // STORAGE | COPY_SRC | COPY_DST
    this.stagingLogBuffer = null;
    // COPY_DST | MAP_READ
    this.stagingTrailReadbackBuffer = null;
    this.stagingTrailReadbackCapacity = 0;
    this.agentVertexCapacity = 0;
    // Reused uniform buffer (grow-only)
    this.inputUniformBuffer = null;
    this.inputUniformCapacity = 0;
    // Optional trail map buffers (triple-buffered for double-buffering + diffuse/decay)
    // trailMapBuffer: read buffer for sensing (previous frame state)
    // trailMapBuffer2: output buffer for diffuse/decay pass
    // trailMapDeposits: write buffer for agent deposits (cleared each frame)
    this.trailMapBuffer = null;
    this.trailMapBuffer2 = null;
    this.trailMapDeposits = null;
    this.trailMapCapacity = 0;
    this.randomValuesBuffer = null;
    this.randomValuesCapacity = 0;
    this.obstaclesBuffer = null;
    this.obstaclesCapacity = 0;
    this.hasTrailMap = false;
    this.hasObstacles = false;
    this.trailMapGPUSeeded = false;
    // Track if trail map is initialized on GPU
    // Diffuse/decay compute pipeline
    this.diffuseDecayPipeline = null;
    this.diffuseDecayBindGroupLayout = null;
    this.diffuseUniformBuffer = null;
    this.diffuseUniformData = new ArrayBuffer(16);
    this.diffuseUniformView = new DataView(this.diffuseUniformData);
    this.agentCount = 0;
    this.gpuStateSeeded = false;
    this.lastSyncedAgentsRef = null;
    this.maxWorkgroupsPerDimension = 65535;
    this.wgslCode = wgslCode;
    this.inputsExpected = inputsExpected;
    this.agentCount = agentCount;
  }
  /**
   * Initialise the compute pipeline, bind-group layout, and preallocate
   * worst-case GPU buffers for the given agent count.
   *
   * @param device - An initialised `GPUDevice`.
   * @param agentCount - Maximum number of agents to allocate for.
   */
  async init(device, agentCount) {
    const AGENT_BUFFER_SIZE = agentCount * COMPONENTS_PER_AGENT * FLOAT_SIZE;
    this.agentCount = agentCount;
    this.logger.log("Initializing WebGPU with device:", device);
    device.pushErrorScope("validation");
    const module = device.createShaderModule({ code: this.wgslCode });
    this.logger.log("Generated WGSL shader for WebGPU");
    module.getCompilationInfo().then((info) => {
      for (const message of info.messages) {
        const type = message.type === "error" ? "error" : "warning";
        this.logger[type === "error" ? "error" : "warn"](
          `WGSL ${message.type}: ${message.message} at line ${message.lineNum}, col ${message.linePos}`
        );
      }
    });
    this.hasTrailMap = this.inputsExpected.includes("trailMap");
    this.hasObstacles = this.inputsExpected.includes("obstacles");
    const bindGroupEntries = [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }
    ];
    if (this.hasTrailMap) {
      bindGroupEntries.push({
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" }
      });
      bindGroupEntries.push({
        binding: 4,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" }
      });
    }
    if (this.inputsExpected.includes("randomValues")) {
      bindGroupEntries.push({
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" }
      });
    }
    bindGroupEntries.push({
      binding: 5,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" }
    });
    bindGroupEntries.push({
      binding: 6,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" }
    });
    if (this.hasObstacles) {
      bindGroupEntries.push({
        binding: 7,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" }
      });
    }
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: bindGroupEntries
    });
    this.computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      compute: { module, entryPoint: "main" }
    });
    device.popErrorScope().then((error) => {
      if (error) {
        this.logger.error("WebGPU Validation Error during initialization:", error.message);
      }
    });
    this.maxWorkgroupsPerDimension = device.limits?.maxComputeWorkgroupsPerDimension ?? this.maxWorkgroupsPerDimension;
    if (this.hasTrailMap) {
      this.initDiffuseDecayPipeline(device);
      this.diffuseUniformBuffer = this.gpuHelper.createEmptyBuffer(
        device,
        16,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        "DiffuseDecayUniforms"
      );
    }
    this.agentStorageBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      AGENT_BUFFER_SIZE,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      "AgentStorage"
    );
    this.agentsReadBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      AGENT_BUFFER_SIZE,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      "AgentsRead"
    );
    this.stagingReadbackBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      AGENT_BUFFER_SIZE,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      "StagingReadback"
    );
    const LOG_BUFFER_SIZE = agentCount * 2 * FLOAT_SIZE;
    this.agentLogBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      LOG_BUFFER_SIZE,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      "AgentLogBuffer"
    );
    this.stagingLogBuffer = this.gpuHelper.createEmptyBuffer(
      device,
      LOG_BUFFER_SIZE,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      "StagingLogReadback"
    );
    this.device = device;
    this.logger.info(
      `Initialized. Preallocated for ${agentCount.toLocaleString()} agents (~${Math.round(
        AGENT_BUFFER_SIZE / (1024 * 1024)
      )} MB per buffer).`
    );
  }
  /**
   * Initialize the GPU compute pipeline for diffuse and decay effects on the trail map.
   * This shader applies a 3x3 blur kernel with wrapping and decay, matching the CPU implementation.
   */
  initDiffuseDecayPipeline(device) {
    const DIFFUSE_DECAY_WGSL = `
            struct DiffuseUniforms {
                width: u32,
                height: u32,
                decayFactor: f32,
                _pad: f32,
            }

            @group(0) @binding(0) var<storage, read> inputMap: array<f32>;
            @group(0) @binding(1) var<storage, read_write> outputMap: array<f32>;
            @group(0) @binding(2) var<uniform> uniforms: DiffuseUniforms;
            @group(0) @binding(3) var<storage, read> depositMap: array<i32>;

            @compute @workgroup_size(${WORKGROUP_SIZE}, 1, 1)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let idx = global_id.x;
                let w = uniforms.width;
                let h = uniforms.height;
                let total = w * h;

                if (idx >= total) { return; }

                let x = idx % w;
                let y = idx / w;

                // First, merge deposits into the current value (convert fixed-point back to float)
                let depositVal = f32(depositMap[idx]) / 10000.0;
                let currentWithDeposits = inputMap[idx] + depositVal;

                // 3x3 blur kernel with wrapping
                var sum: f32 = 0.0;
                var count: f32 = 0.0;

                for (var dy: i32 = -1; dy <= 1; dy++) {
                    for (var dx: i32 = -1; dx <= 1; dx++) {
                        var nx = i32(x) + dx;
                        var ny = i32(y) + dy;

                        // Wrap around
                        if (nx < 0) { nx += i32(w); }
                        if (nx >= i32(w)) { nx -= i32(w); }
                        if (ny < 0) { ny += i32(h); }
                        if (ny >= i32(h)) { ny -= i32(h); }

                        // Sample from merged value (inputMap + depositMap at that location)
                        let neighborIdx = u32(ny) * w + u32(nx);
                        let neighborDeposit = f32(depositMap[neighborIdx]) / 10000.0;
                        sum += inputMap[neighborIdx] + neighborDeposit;
                        count += 1.0;
                    }
                }

                let blurred = sum / count;
                
                // Explicit steps to match JS fround() behavior and prevent FMA
                let term1 = currentWithDeposits * 0.1;
                let term2 = blurred * 0.9;
                let diffused = term1 + term2;
                
                let decayMult = 1.0 - uniforms.decayFactor;
                outputMap[idx] = diffused * decayMult;
            }
        `;
    const diffuseModule = device.createShaderModule({ code: DIFFUSE_DECAY_WGSL });
    this.diffuseDecayBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } }
        // deposit map
      ]
    });
    this.diffuseDecayPipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.diffuseDecayBindGroupLayout] }),
      compute: { module: diffuseModule, entryPoint: "main" }
    });
    this.logger.info("Diffuse/decay GPU compute pipeline initialized.");
  }
  /**
   * Encode the diffuse+decay pass in the current command encoder and ping-pong the trail buffers.
   */
  encodeDiffuseDecayGPU(device, encoder, width, height, decayFactor) {
    if (!this.diffuseDecayPipeline || !this.diffuseDecayBindGroupLayout || !this.diffuseUniformBuffer) return;
    if (!this.trailMapBuffer || !this.trailMapBuffer2 || !this.trailMapDeposits) return;
    if (width <= 0 || height <= 0) return;
    this.diffuseUniformView.setUint32(0, width, true);
    this.diffuseUniformView.setUint32(4, height, true);
    this.diffuseUniformView.setFloat32(8, decayFactor, true);
    this.diffuseUniformView.setFloat32(12, 0, true);
    device.queue.writeBuffer(this.diffuseUniformBuffer, 0, this.diffuseUniformData);
    const bindGroup = device.createBindGroup({
      layout: this.diffuseDecayBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.trailMapBuffer } },
        { binding: 1, resource: { buffer: this.trailMapBuffer2 } },
        { binding: 2, resource: { buffer: this.diffuseUniformBuffer } },
        { binding: 3, resource: { buffer: this.trailMapDeposits } }
      ]
    });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.diffuseDecayPipeline);
    pass.setBindGroup(0, bindGroup);
    const totalPixels = width * height;
    const workgroups = Math.ceil(totalPixels / WORKGROUP_SIZE);
    if (workgroups > 0) {
      pass.dispatchWorkgroups(workgroups);
    }
    pass.end();
    const trailMapSize = width * height * FLOAT_SIZE;
    encoder.clearBuffer(this.trailMapDeposits, 0, trailMapSize);
    [this.trailMapBuffer, this.trailMapBuffer2] = [this.trailMapBuffer2, this.trailMapBuffer];
  }
  /**
   * Run the compute shader with results kept on GPU (for GPU rendering).
   *
   * @param agents - Current agent array (used for initial GPU upload).
   * @param inputs - Per-frame input values.
   * @returns Render resources referencing GPU-side vertex buffer.
   */
  async runGPU(agents, inputs) {
    return this._compute(agents, inputs, false);
  }
  /**
   * Run the compute shader and read agent data back to CPU.
   *
   * @param agents - Current agent array.
   * @param inputs - Per-frame input values.
   * @returns Updated agent array copied from GPU staging buffer.
   */
  async runGPUReadback(agents, inputs) {
    return this._compute(agents, inputs, true);
  }
  /**
   * When `readback === true`, we assume CPU rendering:
   *  - Skip creating/copying to the GPU vertex buffer.
   *  - Copy storage -> staging -> CPU only for the active agent range.
   */
  async _compute(agents, inputs, readback) {
    this.logger.log(`Starting WebGPU compute for ${agents.length} agents (readback: ${readback})`);
    if (!this.device || !this.computePipeline) throw new Error("WebGPU not initialized");
    const setupStart = performance.now();
    const device = this.device;
    const incomingAgentCount = agents.length;
    const needsAgentSync = !this.gpuStateSeeded || incomingAgentCount !== this.agentCount || agents !== this.lastSyncedAgentsRef;
    if (needsAgentSync) {
      this.syncAgentsToGPU(device, agents);
      this.gpuStateSeeded = true;
      this.lastSyncedAgentsRef = agents;
    } else {
      this.agentCount = incomingAgentCount;
    }
    this.ensureAndWriteInputs(device, inputs);
    const setupEnd = performance.now();
    const setupTime = setupEnd - setupStart;
    const dispatchStart = performance.now();
    const encoder = device.createCommandEncoder();
    const copySize = this.agentCount > 0 ? this.byteSizeForAgents(this.agentCount) : 0;
    if (copySize > 0) {
      encoder.copyBufferToBuffer(this.agentStorageBuffer, 0, this.agentsReadBuffer, 0, copySize);
    }
    let doAgentReadback = false;
    let logCopySize = 0;
    if (this.agentCount > 0) {
      const bindGroupEntries = [
        { binding: 0, resource: { buffer: this.agentStorageBuffer } },
        { binding: 1, resource: { buffer: this.inputUniformBuffer } },
        { binding: 6, resource: { buffer: this.agentLogBuffer } }
      ];
      if (this.hasTrailMap && this.trailMapBuffer && this.trailMapDeposits) {
        bindGroupEntries.push({ binding: 2, resource: { buffer: this.trailMapBuffer } });
        bindGroupEntries.push({ binding: 4, resource: { buffer: this.trailMapDeposits } });
      }
      if (this.randomValuesBuffer && this.inputsExpected.includes("randomValues")) {
        bindGroupEntries.push({ binding: 3, resource: { buffer: this.randomValuesBuffer } });
      }
      bindGroupEntries.push({ binding: 5, resource: { buffer: this.agentsReadBuffer } });
      if (this.hasObstacles && this.obstaclesBuffer) {
        bindGroupEntries.push({ binding: 7, resource: { buffer: this.obstaclesBuffer } });
      }
      const bindGroup = device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: bindGroupEntries
      });
      if (readback) {
        logCopySize = this.agentCount * 2 * FLOAT_SIZE;
        if (logCopySize > 0) {
          encoder.clearBuffer(this.agentLogBuffer, 0, logCopySize);
        }
      }
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.computePipeline);
      pass.setBindGroup(0, bindGroup);
      const totalWorkgroups = Math.ceil(this.agentCount / WORKGROUP_SIZE);
      const [dx, dy, dz] = this.computeDispatchDimensions(totalWorkgroups);
      if (dx > 0) {
        pass.dispatchWorkgroups(dx, dy, dz);
      }
      pass.end();
      if (!readback && copySize > 0) {
        this.ensureVertexBuffer(device, copySize);
        encoder.copyBufferToBuffer(this.agentStorageBuffer, 0, this.agentVertexBuffer, 0, copySize);
      }
      if (readback && copySize > 0) {
        encoder.copyBufferToBuffer(this.agentStorageBuffer, 0, this.stagingReadbackBuffer, 0, copySize);
        if (logCopySize > 0) {
          encoder.copyBufferToBuffer(this.agentLogBuffer, 0, this.stagingLogBuffer, 0, logCopySize);
        }
        doAgentReadback = true;
      }
    }
    if (this.hasTrailMap) {
      const width = typeof inputs.width === "number" ? inputs.width : 0;
      const height = typeof inputs.height === "number" ? inputs.height : 0;
      const decayFactor = typeof inputs.decayFactor === "number" ? inputs.decayFactor : 0.1;
      this.encodeDiffuseDecayGPU(device, encoder, width, height, decayFactor);
    }
    const outputTrailMap = inputs.trailMap instanceof Float32Array ? inputs.trailMap : void 0;
    let doTrailReadback = false;
    let trailReadbackSize = 0;
    if (readback && outputTrailMap && this.hasTrailMap && this.trailMapBuffer) {
      trailReadbackSize = outputTrailMap.byteLength;
      if (trailReadbackSize > 0) {
        this.ensureTrailReadbackBuffer(device, trailReadbackSize);
        encoder.copyBufferToBuffer(this.trailMapBuffer, 0, this.stagingTrailReadbackBuffer, 0, trailReadbackSize);
        doTrailReadback = true;
      }
    }
    device.queue.submit([encoder.finish()]);
    const dispatchEnd = performance.now();
    const dispatchTime = dispatchEnd - dispatchStart;
    const readbackStart = performance.now();
    let updatedAgents;
    if (doAgentReadback) {
      await this.stagingReadbackBuffer.mapAsync(GPUMapMode.READ, 0, copySize);
      try {
        const data = new Float32Array(this.stagingReadbackBuffer.getMappedRange(0, copySize));
        updatedAgents = agents;
        for (let i = 0; i < this.agentCount; i++) {
          const base = i * COMPONENTS_PER_AGENT;
          updatedAgents[i].id = data[base];
          updatedAgents[i].x = data[base + 1];
          updatedAgents[i].y = data[base + 2];
          updatedAgents[i].vx = data[base + 3];
          updatedAgents[i].vy = data[base + 4];
          updatedAgents[i].species = data[base + 5];
        }
      } finally {
        this.stagingReadbackBuffer.unmap();
      }
    }
    if (doTrailReadback && outputTrailMap) {
      await this.stagingTrailReadbackBuffer.mapAsync(GPUMapMode.READ, 0, trailReadbackSize);
      try {
        const src = new Float32Array(this.stagingTrailReadbackBuffer.getMappedRange(0, trailReadbackSize));
        outputTrailMap.set(src);
      } finally {
        this.stagingTrailReadbackBuffer.unmap();
      }
    }
    if (doAgentReadback && logCopySize > 0) {
      await this.stagingLogBuffer.mapAsync(GPUMapMode.READ, 0, logCopySize);
      try {
        const logData = new Float32Array(this.stagingLogBuffer.getMappedRange(0, logCopySize));
        for (let i = 0; i < this.agentCount; i++) {
          const isEnabled = logData[i * 2];
          const value = logData[i * 2 + 1];
          if (isEnabled > 0.5) {
            this.logger.info(`AGENT[${agents[i].id}] PRINT:`, value);
          }
        }
      } finally {
        this.stagingLogBuffer.unmap();
      }
    }
    const readbackEnd = performance.now();
    const readbackTime = readbackEnd - readbackStart;
    return {
      updatedAgents,
      renderResources: !readback && this.agentVertexBuffer ? {
        device,
        agentVertexBuffer: this.agentVertexBuffer,
        agentCount: this.agentCount,
        agentStride: COMPONENTS_PER_AGENT * FLOAT_SIZE,
        trailMapBuffer: this.hasTrailMap ? this.trailMapBuffer : void 0
      } : void 0,
      performance: {
        setupTime,
        dispatchTime,
        readbackTime: readback ? readbackTime : 0
      }
    };
  }
  // --- Internals ---
  syncAgentsToGPU(device, agents) {
    this.agentCount = agents.length;
    if (this.agentCount === 0) return;
    const data = new Float32Array(this.agentCount * COMPONENTS_PER_AGENT);
    for (let i = 0; i < this.agentCount; i++) {
      const a = agents[i];
      const base = i * COMPONENTS_PER_AGENT;
      data[base] = a.id;
      data[base + 1] = a.x;
      data[base + 2] = a.y;
      data[base + 3] = a.vx;
      data[base + 4] = a.vy;
      data[base + 5] = a.species || 0;
    }
    this.gpuHelper.writeBuffer(device, this.agentStorageBuffer, data);
  }
  ensureAndWriteInputs(device, inputs) {
    const bufferInputs = ["trailMap", "randomValues", "obstacles"];
    const obstacleCount = this.hasObstacles ? Array.isArray(inputs.obstacles) ? inputs.obstacles.length : 0 : 0;
    const values = this.inputsExpected.filter((n) => !bufferInputs.includes(n)).map((n) => {
      if (n === "obstacleCount") {
        return obstacleCount;
      }
      const value = inputs[n];
      return typeof value === "number" ? value : 0;
    });
    const byteLen = values.length * FLOAT_SIZE;
    if (!this.inputUniformBuffer || this.inputUniformCapacity < byteLen) {
      const aligned = Math.ceil(Math.max(byteLen, 256) / 256) * 256;
      if (this.inputUniformBuffer) this.inputUniformBuffer.destroy();
      this.inputUniformBuffer = this.gpuHelper.createEmptyBuffer(
        device,
        aligned,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        "InputUniform"
      );
      this.inputUniformCapacity = aligned;
    }
    const f32 = new Float32Array(values);
    device.queue.writeBuffer(this.inputUniformBuffer, 0, f32.buffer, f32.byteOffset, byteLen);
    if (this.hasTrailMap && inputs.trailMap) {
      const trailMap = inputs.trailMap;
      const size = trailMap.byteLength;
      const needsRecreate = !this.trailMapBuffer || this.trailMapCapacity < size;
      if (needsRecreate) {
        if (this.trailMapBuffer) this.trailMapBuffer.destroy();
        if (this.trailMapBuffer2) this.trailMapBuffer2.destroy();
        if (this.trailMapDeposits) this.trailMapDeposits.destroy();
        this.trailMapBuffer = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
          "TrailMapRead"
        );
        this.trailMapBuffer2 = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
          "TrailMapTemp"
        );
        this.trailMapDeposits = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
          "TrailMapDeposits"
        );
        this.trailMapCapacity = size;
        this.trailMapGPUSeeded = false;
      }
      if (!this.trailMapGPUSeeded) {
        device.queue.writeBuffer(this.trailMapBuffer, 0, trailMap.buffer, trailMap.byteOffset, trailMap.byteLength);
        const zeros = new Float32Array(trailMap.length);
        device.queue.writeBuffer(this.trailMapBuffer2, 0, zeros);
        device.queue.writeBuffer(this.trailMapDeposits, 0, zeros);
        this.trailMapGPUSeeded = true;
        this.logger.info("Trail map seeded to GPU (first frame only)");
      }
    }
    if (inputs.randomValues) {
      const randomValues = inputs.randomValues;
      const size = randomValues.byteLength;
      if (!this.randomValuesBuffer || this.randomValuesCapacity < size) {
        if (this.randomValuesBuffer) this.randomValuesBuffer.destroy();
        this.randomValuesBuffer = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
          "RandomValues"
        );
        this.randomValuesCapacity = size;
      }
      device.queue.writeBuffer(this.randomValuesBuffer, 0, randomValues.buffer, randomValues.byteOffset, randomValues.byteLength);
    }
    if (this.hasObstacles) {
      const obstacleArray = Array.isArray(inputs.obstacles) ? inputs.obstacles : [];
      const numObstacles = Math.max(obstacleArray.length, 1);
      const size = numObstacles * 4 * FLOAT_SIZE;
      if (!this.obstaclesBuffer || this.obstaclesCapacity < size) {
        if (this.obstaclesBuffer) this.obstaclesBuffer.destroy();
        this.obstaclesBuffer = this.gpuHelper.createEmptyBuffer(
          device,
          size,
          GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
          "Obstacles"
        );
        this.obstaclesCapacity = size;
      }
      const obstacleData = new Float32Array(numObstacles * 4);
      for (let i = 0; i < obstacleArray.length; i++) {
        const ob = obstacleArray[i];
        obstacleData[i * 4] = ob.x;
        obstacleData[i * 4 + 1] = ob.y;
        obstacleData[i * 4 + 2] = ob.w;
        obstacleData[i * 4 + 3] = ob.h;
      }
      device.queue.writeBuffer(this.obstaclesBuffer, 0, obstacleData.buffer, obstacleData.byteOffset, obstacleData.byteLength);
    }
  }
  ensureTrailReadbackBuffer(device, size) {
    if (!this.stagingTrailReadbackBuffer || this.stagingTrailReadbackCapacity < size) {
      this.stagingTrailReadbackBuffer?.destroy();
      this.stagingTrailReadbackBuffer = this.gpuHelper.createEmptyBuffer(
        device,
        size,
        GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        "StagingTrailReadback"
      );
      this.stagingTrailReadbackCapacity = size;
    }
  }
  ensureVertexBuffer(device, requiredSize) {
    if (!this.agentVertexBuffer || this.agentVertexCapacity < requiredSize) {
      this.agentVertexBuffer?.destroy();
      this.agentVertexBuffer = this.gpuHelper.createEmptyBuffer(
        device,
        requiredSize,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        "AgentVertex"
      );
      this.agentVertexCapacity = requiredSize;
      this.logger.info(
        `Allocated GPU vertex buffer for up to ${this.agentCount.toLocaleString()} agents.`
      );
    }
  }
  byteSizeForAgents(n) {
    return Math.max(n * COMPONENTS_PER_AGENT * FLOAT_SIZE, COMPONENTS_PER_AGENT * FLOAT_SIZE);
  }
  computeDispatchDimensions(totalWorkgroups) {
    if (!totalWorkgroups) return [0, 1, 1];
    const max = this.maxWorkgroupsPerDimension;
    const dispatchX = Math.min(totalWorkgroups, max);
    let remaining = Math.ceil(totalWorkgroups / dispatchX);
    const dispatchY = Math.min(remaining, max);
    remaining = Math.ceil(remaining / dispatchY);
    const dispatchZ = Math.min(remaining, max);
    const capacity = dispatchX * dispatchY * dispatchZ;
    if (capacity < totalWorkgroups) {
      throw new Error(
        `Agent count ${this.agentCount} exceeds supported dispatch capacity for this device.`
      );
    }
    return [dispatchX, dispatchY, dispatchZ];
  }
  destroy() {
    this.agentStorageBuffer?.destroy();
    this.agentsReadBuffer?.destroy();
    this.stagingReadbackBuffer?.destroy();
    this.agentVertexBuffer?.destroy();
    this.agentLogBuffer?.destroy();
    this.stagingLogBuffer?.destroy();
    this.stagingTrailReadbackBuffer?.destroy();
    this.inputUniformBuffer?.destroy();
    this.diffuseUniformBuffer?.destroy();
    this.trailMapBuffer?.destroy();
    this.trailMapBuffer2?.destroy();
    this.trailMapDeposits?.destroy();
    this.randomValuesBuffer?.destroy();
    this.obstaclesBuffer?.destroy();
    this.agentStorageBuffer = null;
    this.agentsReadBuffer = null;
    this.stagingReadbackBuffer = null;
    this.agentVertexBuffer = null;
    this.agentLogBuffer = null;
    this.stagingLogBuffer = null;
    this.stagingTrailReadbackBuffer = null;
    this.inputUniformBuffer = null;
    this.diffuseUniformBuffer = null;
    this.trailMapBuffer = null;
    this.trailMapBuffer2 = null;
    this.trailMapDeposits = null;
    this.randomValuesBuffer = null;
    this.obstaclesBuffer = null;
    this.device = null;
    this.computePipeline = null;
    this.bindGroupLayout = null;
    this.diffuseDecayPipeline = null;
    this.diffuseDecayBindGroupLayout = null;
    this.gpuStateSeeded = false;
    this.lastSyncedAgentsRef = null;
    this.trailMapGPUSeeded = false;
    this.inputUniformCapacity = 0;
    this.trailMapCapacity = 0;
    this.randomValuesCapacity = 0;
    this.obstaclesCapacity = 0;
    this.stagingTrailReadbackCapacity = 0;
    this.agentVertexCapacity = 0;
  }
};

// src/compute/webAssembly.ts
import wabt from "wabt";
var wabtModulePromise = null;
var getWabtModule = async () => {
  if (!wabtModulePromise) {
    wabtModulePromise = wabt();
  }
  return wabtModulePromise;
};
var compileWATtoWASM = async (watCode, logger) => {
  try {
    const wabtModule = await getWabtModule();
    const parsed = wabtModule.parseWat("dsl_module.wat", watCode);
    try {
      const { buffer } = parsed.toBinary({ write_debug_names: true });
      return WebAssembly.compile(new Uint8Array(buffer));
    } finally {
      if (typeof parsed.destroy === "function") {
        parsed.destroy();
      }
    }
  } catch (err) {
    logger.error("Failed to compile WAT to WASM:", err);
    throw err;
  }
};
var bytesPerAgent = 24;
var f32PerAgent = bytesPerAgent / 4;
var basePtr = 0;
var baseF32 = basePtr >>> 2;
var wasmPageSize = 64 * 1024;
var WebAssemblyCompute = class {
  constructor(watCode, agentCount) {
    this.memory = void 0;
    this.f32 = void 0;
    this.exports = void 0;
    this.stepAll = void 0;
    this.logger = new Logger("WebAssemblyCompute");
    this.agentCount = agentCount;
    this.watCode = watCode;
  }
  /** Compile WAT, create WASM instance, and bind the `step_all` export. */
  async init() {
    const wasmModule = await compileWATtoWASM(this.watCode, this.logger);
    const bytesNeeded = this.agentCount * bytesPerAgent;
    const initialPages = Math.ceil(bytesNeeded / wasmPageSize) + 1;
    this.memory = new WebAssembly.Memory({ initial: initialPages });
    const instance = new WebAssembly.Instance(wasmModule, {
      env: {
        memory: this.memory,
        sin: Math.sin,
        cos: Math.cos,
        atan2: Math.atan2,
        random: Math.random,
        print: (id, val) => this.logger.info(`AGENT[${id}] PRINT:`, val),
        log: (id, val) => this.logger.info(`WASM Log[${id}]:`, val)
      }
    });
    this.exports = instance.exports;
    const stepAll = this.exports.step_all;
    if (typeof stepAll !== "function") {
      throw new Error("WASM export step_all is missing or not callable.");
    }
    this.stepAll = stepAll;
    this.f32 = new Float32Array(this.memory.buffer);
  }
  /**
   * Run a single compute step across all agents.
   *
   * @param agents - Current agent array.
   * @param inputs - Per-frame input values.
   * @returns Updated agents and timing metrics.
   */
  compute(agents, inputs) {
    if (!this.exports || !this.memory || !this.stepAll) {
      throw new Error("WebAssemblyCompute not initialized");
    }
    const writeStart = performance.now();
    const layout = this.computeLayout(inputs, agents.length);
    this.ensureMemoryCapacity(layout.totalBytesNeeded);
    const f32 = this.f32;
    const packedAgents = this.packAgents(agents);
    f32.set(packedAgents, baseF32);
    f32.set(packedAgents, layout.agentsReadPtr >>> 2);
    this.setGlobal("agentsReadPtr", layout.agentsReadPtr);
    if (inputs.trailMapRead && layout.trailMapReadPtr > 0) {
      f32.set(inputs.trailMapRead, layout.trailMapReadPtr >>> 2);
      this.setGlobal("trailMapReadPtr", layout.trailMapReadPtr);
    }
    if (inputs.trailMapWrite && layout.trailMapWritePtr > 0) {
      const writeStartIndex = layout.trailMapWritePtr >>> 2;
      const writeLength = inputs.trailMapWrite.length;
      f32.fill(0, writeStartIndex, writeStartIndex + writeLength);
      this.setGlobal("trailMapWritePtr", layout.trailMapWritePtr);
    }
    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value !== "number") continue;
      this.setGlobal(`inputs_${key}`, value);
    }
    if (inputs.randomValues && layout.randomValuesPtr > 0) {
      f32.set(inputs.randomValues, layout.randomValuesPtr >>> 2);
      this.setGlobal("randomValuesPtr", layout.randomValuesPtr);
    }
    if (layout.obstaclesCount > 0 && layout.obstaclesPtr > 0) {
      const obstacleArray = inputs.obstacles;
      const obstacleData = new Float32Array(layout.obstaclesCount * 4);
      for (let i = 0; i < obstacleArray.length; i++) {
        const ob = obstacleArray[i];
        obstacleData[i * 4] = ob.x;
        obstacleData[i * 4 + 1] = ob.y;
        obstacleData[i * 4 + 2] = ob.w;
        obstacleData[i * 4 + 3] = ob.h;
      }
      f32.set(obstacleData, layout.obstaclesPtr >>> 2);
      this.setGlobal("obstaclesPtr", layout.obstaclesPtr);
      this.setGlobal("inputs_obstacleCount", layout.obstaclesCount);
    } else {
      this.setGlobal("inputs_obstacleCount", 0);
    }
    this.setGlobal("agent_count", agents.length);
    const writeEnd = performance.now();
    const computeStart = performance.now();
    this.stepAll(basePtr, agents.length);
    const computeEnd = performance.now();
    const readStart = performance.now();
    const resultAgents = this.unpackAgents(agents.length);
    if (inputs.trailMapWrite && layout.trailMapWritePtr > 0) {
      const destination = inputs.trailMapWrite;
      const readStartIndex = layout.trailMapWritePtr >>> 2;
      destination.set(this.f32.subarray(readStartIndex, readStartIndex + destination.length));
    }
    const readEnd = performance.now();
    return {
      agents: resultAgents,
      performance: {
        writeTime: writeEnd - writeStart,
        computeTime: computeEnd - computeStart,
        readTime: readEnd - readStart
      }
    };
  }
  /** Release all WASM resources. */
  destroy() {
    this.stepAll = void 0;
    this.exports = void 0;
    this.f32 = void 0;
    this.memory = void 0;
  }
  computeLayout(inputs, activeAgentCount) {
    const agentsWriteEnd = activeAgentCount * bytesPerAgent;
    const agentsReadPtr = agentsWriteEnd;
    const agentsReadEnd = agentsReadPtr + activeAgentCount * bytesPerAgent;
    let cursor = agentsReadEnd;
    let trailMapReadPtr = 0;
    let trailMapWritePtr = 0;
    let trailMapSize = 0;
    const width = typeof inputs.width === "number" ? inputs.width : 0;
    const height = typeof inputs.height === "number" ? inputs.height : 0;
    if (inputs.trailMapRead && width > 0 && height > 0) {
      trailMapSize = width * height * 4;
      trailMapReadPtr = cursor;
      trailMapWritePtr = cursor + trailMapSize;
      cursor += trailMapSize * 2;
    }
    const randomValuesSize = inputs.randomValues instanceof Float32Array ? inputs.randomValues.byteLength : 0;
    const randomValuesPtr = randomValuesSize > 0 ? cursor : 0;
    cursor += randomValuesSize;
    const obstacles = Array.isArray(inputs.obstacles) ? inputs.obstacles : [];
    const obstaclesCount = obstacles.length;
    const obstaclesSize = obstaclesCount * 16;
    const obstaclesPtr = obstaclesSize > 0 ? cursor : 0;
    cursor += obstaclesSize;
    return {
      agentsReadPtr,
      trailMapReadPtr,
      trailMapWritePtr,
      trailMapSize,
      randomValuesPtr,
      randomValuesSize,
      obstaclesPtr,
      obstaclesCount,
      totalBytesNeeded: cursor
    };
  }
  ensureMemoryCapacity(totalBytesNeeded) {
    if (!this.memory) {
      throw new Error("WebAssembly memory is not initialized");
    }
    const currentBytes = this.memory.buffer.byteLength;
    if (totalBytesNeeded > currentBytes) {
      const pagesNeeded = Math.ceil((totalBytesNeeded - currentBytes) / wasmPageSize);
      if (pagesNeeded > 0) {
        this.memory.grow(pagesNeeded);
        this.f32 = new Float32Array(this.memory.buffer);
      }
      return;
    }
    if (!this.f32 || this.f32.buffer.byteLength === 0) {
      this.f32 = new Float32Array(this.memory.buffer);
    }
  }
  packAgents(agents) {
    const data = new Float32Array(agents.length * f32PerAgent);
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const o = i * f32PerAgent;
      data[o] = a.id;
      data[o + 1] = a.x;
      data[o + 2] = a.y;
      data[o + 3] = a.vx;
      data[o + 4] = a.vy;
      data[o + 5] = a.species || 0;
    }
    return data;
  }
  unpackAgents(agentCount) {
    const f32 = this.f32;
    return Array.from({ length: agentCount }, (_, i) => {
      const o = baseF32 + i * f32PerAgent;
      return {
        id: f32[o],
        x: f32[o + 1],
        y: f32[o + 2],
        vx: f32[o + 3],
        vy: f32[o + 4],
        species: f32[o + 5]
      };
    });
  }
  setGlobal(name, value) {
    const globalRef = this.exports?.[name];
    if (globalRef instanceof WebAssembly.Global) {
      globalRef.value = value;
    }
  }
};

// src/compute/compute.ts
var ComputeEngine = class {
  constructor(compilationResult, performanceMonitor, agentCount, workerCount) {
    this.agentCount = 0;
    this.gpuDevice = null;
    this.gpuRenderState = void 0;
    this.compileTimes = {};
    // Double-buffer for trail map parity across all compute methods
    this.trailMapRead = null;
    this.trailMapWrite = null;
    this.trailMapSeeded = false;
    this.compilationResult = compilationResult;
    this.PerformanceMonitor = performanceMonitor;
    this.workerCount = workerCount;
    this.agentFunction = this.buildAgentFunction();
    this.agentCount = agentCount;
    this.logger = new Logger("ComputeEngine", "purple");
    this.logger.log("ComputeEngine initialized");
  }
  /**
   * Ensure double-buffer trail maps are allocated for the given dimensions.
   */
  ensureTrailMapBuffers(width, height) {
    const size = width * height;
    if (!this.trailMapRead || this.trailMapRead.length !== size) {
      this.trailMapRead = new Float32Array(size);
      this.trailMapWrite = new Float32Array(size);
      this.trailMapSeeded = false;
    }
  }
  /**
   * Apply diffuse and decay to trail map (blur + decay).
   */
  applyDiffuseDecay(width, height, decayFactor) {
    if (!this.trailMapRead || !this.trailMapWrite) return;
    for (let i = 0; i < this.trailMapRead.length; i++) {
      this.trailMapRead[i] += this.trailMapWrite[i];
    }
    this.trailMapWrite.fill(0);
    const temp = new Float32Array(this.trailMapRead.length);
    const f = Math.fround;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = f(0);
        let count = f(0);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            let nx = x + dx;
            let ny = y + dy;
            if (nx < 0) nx += width;
            if (nx >= width) nx -= width;
            if (ny < 0) ny += height;
            if (ny >= height) ny -= height;
            sum = f(sum + this.trailMapRead[ny * width + nx]);
            count = f(count + 1);
          }
        }
        const idx = y * width + x;
        const blurred = f(sum / count);
        const current = this.trailMapRead[idx];
        const term1 = f(current * f(0.1));
        const term2 = f(blurred * f(0.9));
        const diffused = f(term1 + term2);
        const decayMult = f(f(1) - f(decayFactor));
        temp[idx] = f(diffused * decayMult);
      }
    }
    this.trailMapRead.set(temp);
  }
  syncTrailMapToExternal(externalTrailMap) {
    if (this.trailMapRead) {
      externalTrailMap.set(this.trailMapRead);
    }
  }
  prepareFrameInputs(method, inputValues) {
    const inputs = { ...inputValues };
    const width = typeof inputs.width === "number" ? inputs.width : 0;
    const height = typeof inputs.height === "number" ? inputs.height : 0;
    const decayFactor = typeof inputs.decayFactor === "number" ? inputs.decayFactor : 0.05;
    const externalTrailMap = inputs.trailMap instanceof Float32Array ? inputs.trailMap : void 0;
    const hasTrailMap = Boolean(externalTrailMap) && width > 0 && height > 0;
    if (hasTrailMap && externalTrailMap) {
      this.ensureTrailMapBuffers(width, height);
      if (!this.trailMapSeeded) {
        this.trailMapRead.set(externalTrailMap);
        this.trailMapWrite.fill(0);
        this.trailMapSeeded = true;
      }
      inputs.trailMapRead = this.trailMapRead;
      inputs.trailMapWrite = this.trailMapWrite;
    }
    if (method !== "WebWorkers") {
      inputs.print = (id, val) => {
        this.logger.info(`AGENT[${id}] PRINT:`, val);
      };
    }
    return {
      inputs,
      trail: {
        hasTrailMap,
        width,
        height,
        decayFactor,
        externalTrailMap
      }
    };
  }
  finalizeTrailMap(method, trail) {
    if (!trail.hasTrailMap || method === "WebGPU" || !trail.externalTrailMap) {
      return;
    }
    this.applyDiffuseDecay(trail.width, trail.height, trail.decayFactor);
    this.syncTrailMapToExternal(trail.externalTrailMap);
  }
  get WebWorkersInstance() {
    if (!this._WebWorkers) {
      const start = performance.now();
      this._WebWorkers = new webWorkers_default(this.agentFunction, this.workerCount);
      this.compileTimes["WebWorkers"] = performance.now() - start;
    }
    return this._WebWorkers;
  }
  async getWebGPUInstance() {
    if (!this._WebGPU) {
      this._WebGPU = new WebGPU(this.compilationResult.wgslCode, this.compilationResult.requiredInputs, this.agentCount);
      if (this.gpuDevice) {
        const start = performance.now();
        this._WebGPUInitPromise = this._WebGPU.init(this.gpuDevice, this.agentCount);
        await this._WebGPUInitPromise;
        this.compileTimes["WebGPU"] = performance.now() - start;
      }
    } else if (this._WebGPUInitPromise) {
      await this._WebGPUInitPromise;
    }
    return this._WebGPU;
  }
  async getWebAssemblyInstance() {
    if (!this._WebAssembly) {
      const start = performance.now();
      this._WebAssembly = new WebAssemblyCompute(this.compilationResult.WASMCode, this.agentCount);
      this._WebAssemblyInitPromise = this._WebAssembly.init();
      await this._WebAssemblyInitPromise;
      this.compileTimes["WebAssembly"] = performance.now() - start;
    } else if (this._WebAssemblyInitPromise) {
      await this._WebAssemblyInitPromise;
    }
    return this._WebAssembly;
  }
  /**
   * Provide a GPU device for the WebGPU backend.
   *
   * If the WebGPU instance already exists, initialises it immediately;
   * otherwise the device is stored for deferred initialisation.
   *
   * @param device - The WebGPU device obtained from the Renderer.
   */
  initGPU(device) {
    this.logger.log("Initializing ComputeEngine with GPU device:", device, "and agent count:", this.agentCount);
    this.gpuDevice = device;
    if (this._WebGPU && !this._WebGPUInitPromise) {
      const start = performance.now();
      this._WebGPUInitPromise = this._WebGPU.init(device, this.agentCount).then(() => {
        this.compileTimes["WebGPU"] = performance.now() - start;
      });
    }
  }
  /**
   * Execute a single simulation frame on the specified compute backend.
   *
   * @param method - Compute backend to use.
   * @param agents - Current agent state array.
   * @param inputValues - Per-frame input values (width, height, trailMap, etc.).
   * @param renderMode - Determines whether GPU results are read back to CPU.
   * @returns Updated agent array after one step.
   */
  async runFrame(method, agents, inputValues, renderMode) {
    this.logger.log("Running Compute:", method);
    this.agentCount = agents.length;
    const prepared = this.prepareFrameInputs(method, inputValues);
    const inputs = prepared.inputs;
    let result;
    switch (method) {
      case "WebWorkers":
        result = await this.runOnWebWorkers(agents, inputs);
        break;
      case "WebGPU":
        result = await this.runOnWebGPU(agents, inputs, renderMode);
        break;
      case "WebAssembly":
        result = await this.runOnWASM(agents, inputs);
        break;
      default:
        result = await this.runOnMainThread(agents, inputs);
        break;
    }
    this.finalizeTrailMap(method, prepared.trail);
    return result;
  }
  async runOnWASM(agents, inputs) {
    const instance = await this.getWebAssemblyInstance();
    const { agents: updatedAgents, performance: wasmPerf } = instance.compute(agents, inputs);
    this.logPerformance("WebAssembly", updatedAgents.length, {
      setupTime: wasmPerf.writeTime,
      computeTime: wasmPerf.computeTime,
      readbackTime: wasmPerf.readTime,
      specificStats: {
        "Memory Write": wasmPerf.writeTime,
        "WASM Execution": wasmPerf.computeTime,
        "Memory Read": wasmPerf.readTime
      }
    });
    return updatedAgents;
  }
  async runOnWebGPU(agents, inputs, renderMode) {
    const instance = await this.getWebGPUInstance();
    const shouldReadback = renderMode !== "gpu";
    const result = shouldReadback ? await instance.runGPUReadback(agents, inputs) : await instance.runGPU(agents, inputs);
    const { updatedAgents, renderResources, performance: gpuPerf } = result;
    const nextAgents = updatedAgents ?? agents;
    this.logPerformance("WebGPU", nextAgents.length, {
      setupTime: gpuPerf.setupTime,
      computeTime: gpuPerf.dispatchTime,
      readbackTime: gpuPerf.readbackTime,
      specificStats: {
        "Buffer Setup": gpuPerf.setupTime,
        "GPU Dispatch": gpuPerf.dispatchTime,
        "Readback": gpuPerf.readbackTime
      }
    });
    if (renderResources) {
      this.gpuRenderState = renderResources;
    }
    return nextAgents;
  }
  async runOnWebWorkers(agents, inputs) {
    const instance = this.WebWorkersInstance;
    const { agents: updatedAgents, trailMap: depositDeltas, performance: workerPerf } = await instance.compute(agents, inputs);
    if (depositDeltas && inputs.trailMapWrite) {
      const writeBuffer = inputs.trailMapWrite;
      for (let i = 0; i < depositDeltas.length; i++) {
        writeBuffer[i] += depositDeltas[i];
      }
    }
    this.logPerformance("WebWorkers", updatedAgents.length, {
      setupTime: workerPerf.serializationTime,
      computeTime: workerPerf.workerTime,
      readbackTime: workerPerf.deserializationTime,
      specificStats: {
        "Serialization": workerPerf.serializationTime,
        "Worker Compute": workerPerf.workerTime,
        "Deserialization": workerPerf.deserializationTime
      }
    });
    return updatedAgents;
  }
  async runOnMainThread(agents, inputs) {
    const computeStart = performance.now();
    const updatedAgents = agents.map((agent) => this.agentFunction({ ...agent }, inputs));
    const computeEnd = performance.now();
    const computeTime = computeEnd - computeStart;
    this.logPerformance("JavaScript", updatedAgents.length, {
      setupTime: 0,
      computeTime,
      readbackTime: 0,
      specificStats: {
        "JS Execution": computeTime
      }
    });
    return updatedAgents;
  }
  logPerformance(method, agentCount, details) {
    const compileTime = this.compileTimes[method];
    if (compileTime !== void 0) {
      this.compileTimes[method] = void 0;
    }
    const totalExecutionTime = details.setupTime + details.computeTime + details.readbackTime;
    this.PerformanceMonitor.logFrame({
      method,
      agentCount,
      agentPerformance: [],
      totalExecutionTime,
      frameTimestamp: Date.now(),
      setupTime: details.setupTime,
      computeTime: details.computeTime,
      readbackTime: details.readbackTime,
      compileTime,
      specificStats: details.specificStats
    });
  }
  /** Release all backend instances and buffers. */
  destroy() {
    this._WebWorkers?.destroy();
    this._WebWorkers = void 0;
    this._WebGPU?.destroy();
    this._WebGPU = void 0;
    this._WebGPUInitPromise = void 0;
    this._WebAssembly?.destroy();
    this._WebAssembly = void 0;
    this._WebAssemblyInitPromise = void 0;
    this.trailMapRead = null;
    this.trailMapWrite = null;
    this.trailMapSeeded = false;
    this.gpuRenderState = void 0;
    this.gpuDevice = null;
    this.compileTimes = {};
  }
  /** Build the agent update function from compiled JavaScript source. */
  buildAgentFunction() {
    try {
      return new Function(`return ${this.compilationResult.jsCode}`)();
    } catch (err) {
      this.logger?.error("Failed to build agent function from compiled JS:", err);
      throw new Error(`Failed to compile agent function: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};

// src/performance.ts
var PerformanceMonitor = class {
  constructor() {
    this._frames = [];
    this.logger = new Logger("PerformanceMonitor", "green");
  }
  /**
   * Record a completed frame's performance data.
   *
   * @param performance - The frame's timing and metric data.
   */
  logFrame(performance2) {
    this._frames.push(performance2);
  }
  /**
   * All recorded frame performance entries.
   */
  get frames() {
    return this._frames;
  }
  /**
   * Log a warning when a frame is skipped because the previous frame
   * was still in progress.
   */
  logMissingFrame() {
    this.logger.warn("Frame skipped - performance data not recorded.");
  }
  /**
   * Clear all recorded frame data.
   */
  reset() {
    this._frames.length = 0;
  }
  /**
   * Print a human-readable performance summary to the console.
   *
   * Outputs average total, setup, compute, render, and readback times
   * as well as any backend-specific statistics.
   */
  printSummary() {
    if (this._frames.length === 0) {
      this.logger.info("No performance data to report.");
      return;
    }
    const method = this._frames[0].method;
    const count = this._frames.length;
    const totalTime = this._frames.reduce((sum, f) => sum + f.totalExecutionTime, 0);
    const avgTime = totalTime / count;
    const avgSetup = this._frames.reduce((sum, f) => sum + (f.setupTime || 0), 0) / count;
    const avgCompute = this._frames.reduce((sum, f) => sum + (f.computeTime || 0), 0) / count;
    const avgRender = this._frames.reduce((sum, f) => sum + (f.renderTime || 0), 0) / count;
    const avgReadback = this._frames.reduce((sum, f) => sum + (f.readbackTime || 0), 0) / count;
    this.logger.info(`Performance Summary for ${method}:`);
    this.logger.info(`  Frames: ${count}`);
    this.logger.info(`  Avg Total Time: ${avgTime.toFixed(2)} ms`);
    if (avgSetup > 0) this.logger.info(`  Avg Setup Time: ${avgSetup.toFixed(2)} ms`);
    if (avgCompute > 0) this.logger.info(`  Avg Compute Time: ${avgCompute.toFixed(2)} ms`);
    if (avgRender > 0) this.logger.info(`  Avg Render Time: ${avgRender.toFixed(2)} ms`);
    if (avgReadback > 0) this.logger.info(`  Avg Readback Time: ${avgReadback.toFixed(2)} ms`);
    const firstFrameStats = this._frames[0].specificStats;
    if (firstFrameStats) {
      this.logger.info(`  Specific Stats (Avg):`);
      for (const key of Object.keys(firstFrameStats)) {
        const avgStat = this._frames.reduce((sum, f) => sum + (f.specificStats?.[key] || 0), 0) / count;
        this.logger.info(`    ${key}: ${avgStat.toFixed(2)} ms`);
      }
    }
  }
};

// src/renderer.ts
var GPU_FLOAT_SIZE = 4;
var GPU_AGENT_COMPONENTS = 6;
var GPU_AGENT_STRIDE = GPU_AGENT_COMPONENTS * GPU_FLOAT_SIZE;
var GPU_QUAD_VERTICES = new Float32Array([
  -1,
  -1,
  1,
  -1,
  1,
  1,
  -1,
  -1,
  1,
  1,
  -1,
  1
]);
var SPECIES_PALETTE = [
  "#00FFFF",
  // Cyan (species 0 — default)
  "#FF4466",
  // Red-pink
  "#44FF66",
  // Green
  "#FFAA22",
  // Orange
  "#AA66FF",
  // Purple
  "#FFFF44",
  // Yellow
  "#FF66AA",
  // Pink
  "#66AAFF"
  // Light blue
];
function hexToRgb(color) {
  if (Array.isArray(color)) {
    return {
      r: Math.max(0, Math.min(1, (color[0] ?? 0) / 255)),
      g: Math.max(0, Math.min(1, (color[1] ?? 0) / 255)),
      b: Math.max(0, Math.min(1, (color[2] ?? 0) / 255)),
      a: Math.max(0, Math.min(1, color[3] ?? 1))
    };
  }
  if (typeof color !== "string") {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  let hex = color.trim();
  if (hex.startsWith("#")) {
    hex = hex.slice(1);
  }
  if (hex.length === 3 || hex.length === 4) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return { r, g, b, a };
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}
function toCssColor(color) {
  const { r, g, b, a } = hexToRgb(color);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}
var Renderer = class {
  /**
   * Create a new renderer.
   *
   * @param canvas - The primary canvas element for 2D/CPU rendering.
   * @param gpuCanvas - Optional separate canvas element for WebGPU rendering.
   * If omitted, the primary canvas is reused for GPU output.
   * @param appearance - Initial visual appearance configuration.
   */
  constructor(canvas, gpuCanvas, appearance) {
    this.ctx = null;
    this.gpuCanvas = null;
    this.gpuDevice = null;
    this.gpuPipeline = null;
    this.gpuBindGroupLayout = null;
    this.gpuQuadBuffer = null;
    this.gpuUniformBuffer = null;
    this.gpuUniformBufferSize = 0;
    this.gpuAgentBuffer = null;
    this.gpuAgentBufferSize = 0;
    this.gpuPipelineDevice = null;
    this.gpuManualTrailBuffer = null;
    this.gpuManualTrailBufferSize = 0;
    this.gpuTrailPipeline = null;
    this.gpuTrailBindGroupLayout = null;
    this.canvas = canvas;
    this.gpuCanvas = gpuCanvas ?? canvas;
    this.usesSharedGpuCanvas = !gpuCanvas;
    this.appearance = appearance;
    this.gpuHelper = new GPU("RendererGPU");
  }
  /**
   * Provide a GPU device for WebGPU rendering operations.
   *
   * @param device - The WebGPU device obtained via {@link GPU.getDevice}.
   */
  initGPU(device) {
    this.gpuDevice = device;
  }
  /**
   * Get the current appearance configuration.
   *
   * @returns The active {@link SimulationAppearance}.
   */
  getAppearance() {
    return this.appearance;
  }
  /**
   * Replace the appearance configuration.
   *
   * @param appearance - New appearance settings.
   */
  setAppearance(appearance) {
    this.appearance = appearance;
  }
  /**
   * Clear the canvas and fill with the configured background colour.
   */
  renderBackground() {
    const ctx = this.ensureContext();
    ctx.fillStyle = toCssColor(this.appearance.backgroundColor);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  /**
   * Render the trail map to the 2D canvas using pixel-level blending.
   *
   * Each pixel is linearly interpolated between the background colour and
   * the trail colour based on the trail intensity at that position.
   *
   * @param trailMap - Trail intensity buffer (width × height).
   * @param width - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   */
  renderTrails(trailMap, width, height) {
    const ctx = this.ensureContext();
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const { r, g, b } = hexToRgb(this.appearance.trailColor);
    const R = r * 255;
    const G = g * 255;
    const B = b * 255;
    const bgRgb = hexToRgb(this.appearance.backgroundColor);
    const bgR = bgRgb.r * 255;
    const bgG = bgRgb.g * 255;
    const bgB = bgRgb.b * 255;
    for (let i = 0; i < trailMap.length; i++) {
      const intensity = trailMap[i] * (this.appearance.trailOpacity ?? 1);
      const inv = 1 - Math.min(1, Math.max(0, intensity));
      const safeInt = 1 - inv;
      data[i * 4] = R * safeInt + bgR * inv;
      data[i * 4 + 1] = G * safeInt + bgG * inv;
      data[i * 4 + 2] = B * safeInt + bgB * inv;
      data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }
  /**
   * Render agents to the 2D canvas using the configured shape and species colours.
   *
   * @param agents - Array of agent positions to render.
   */
  renderAgents(agents) {
    const ctx = this.ensureContext();
    const radius = this.appearance.agentSize;
    const isCircle = this.appearance.agentShape === "circle";
    const palette = this.appearance.speciesColors && this.appearance.speciesColors.length > 0 ? this.appearance.speciesColors : SPECIES_PALETTE;
    agents.forEach((agent) => {
      const speciesIdx = agent.species || 0;
      ctx.fillStyle = toCssColor(palette[speciesIdx % palette.length]);
      ctx.beginPath();
      if (isCircle) {
        ctx.arc(agent.x, agent.y, radius, 0, Math.PI * 2);
      } else {
        ctx.rect(agent.x - radius, agent.y - radius, radius * 2, radius * 2);
      }
      ctx.fill();
    });
  }
  /**
   * Render agents using WebGPU instanced draw calls.
   *
   * Falls back to uploading agent data from CPU buffers if GPU-resident
   * render resources are not provided.
   *
   * @param agents - Agent array (used for CPU fallback buffer upload).
   * @param resources - Optional GPU-resident render resources from the compute engine.
   * @param trailMap - Optional CPU-side trail map for manual GPU upload.
   */
  async renderAgentsGPU(agents, resources, trailMap) {
    if (!this.gpuCanvas || !this.gpuDevice) return;
    try {
      this.gpuHelper.configureCanvas(this.gpuCanvas);
    } catch (error) {
      if (this.usesSharedGpuCanvas) {
        throw new Error(
          "Failed to acquire WebGPU context on the primary canvas. Provide a dedicated gpuCanvas when switching between CPU and GPU rendering at runtime."
        );
      }
      throw error;
    }
    this.gpuHelper.setupCanvasConfig(this.gpuDevice);
    this.configurePipeline(this.gpuDevice);
    this.configureTrailPipeline(this.gpuDevice);
    const renderResources = resources ?? this.prepareAgentBuffer(this.gpuDevice, agents);
    let trailBuffer = renderResources.trailMapBuffer;
    if (!trailBuffer && trailMap) {
      trailBuffer = this.prepareManualTrailBuffer(this.gpuDevice, trailMap);
    }
    this.executeRender(this.gpuDevice, renderResources, trailBuffer);
  }
  /**
   * Create or reuse the agent-rendering GPU pipeline (WGSL shaders + layout).
   *
   * @param device - The WebGPU device.
   * @internal
   */
  configurePipeline(device) {
    if (this.gpuPipeline && this.gpuPipelineDevice === device) return;
    if (this.gpuPipeline && this.gpuPipelineDevice !== device) {
      this.resetGPUState();
    }
    this.gpuBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
      ]
    });
    const shaderCode = `
      struct RenderUniforms {
        width: f32,
        height: f32,
        radius: f32,
        shape: f32,
        colorR: f32,
        colorG: f32,
        colorB: f32,
        speciesCount: f32,
      };
      struct SpeciesColors {
        colors: array<vec4<f32>, 8>,
      };
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
        @location(1) @interpolate(flat) speciesIdx: u32
      };
      @group(0) @binding(0) var<uniform> uniforms: RenderUniforms;
      @group(0) @binding(1) var<uniform> speciesColors: SpeciesColors;

      @vertex fn vs_main(@location(0) quadPos: vec2<f32>, @location(1) agentPos: vec2<f32>, @location(2) agentSpecies: f32) -> VertexOutput {
        var out: VertexOutput;
        let scaled = quadPos * uniforms.radius;
        let world = agentPos + scaled;
        let clipX = (world.x / uniforms.width) * 2.0 - 1.0;
        let clipY = 1.0 - (world.y / uniforms.height) * 2.0;
        out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
        out.uv = quadPos;
        out.speciesIdx = u32(agentSpecies);
        return out;
      }

      @fragment fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
        if (uniforms.shape > 0.5) {
          if (length(input.uv) > 1.0) {
            discard;
          }
        }
        let idx = input.speciesIdx % 8u;
        let col = speciesColors.colors[idx];
        return vec4<f32>(col.r, col.g, col.b, 1.0);
      }
    `;
    const shaderModule = device.createShaderModule({ code: shaderCode });
    this.gpuPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.gpuBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          { arrayStride: 2 * GPU_FLOAT_SIZE, attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }] },
          {
            arrayStride: GPU_AGENT_STRIDE,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 1, format: "float32x2", offset: GPU_FLOAT_SIZE },
              { shaderLocation: 2, format: "float32", offset: 5 * GPU_FLOAT_SIZE }
            ]
          }
        ]
      },
      fragment: { module: shaderModule, entryPoint: "fs_main", targets: [{ format: this.gpuHelper.getFormat() }] },
      primitive: { topology: "triangle-list" }
    });
    this.gpuQuadBuffer = this.gpuHelper.createBuffer(device, GPU_QUAD_VERTICES, GPUBufferUsage.VERTEX);
    this.gpuPipelineDevice = device;
  }
  /**
   * Create or reuse the trail-map rendering GPU pipeline.
   *
   * @param device - The WebGPU device.
   * @internal
   */
  configureTrailPipeline(device) {
    if (this.gpuTrailPipeline && this.gpuPipelineDevice === device) return;
    this.gpuTrailBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }
      ]
    });
    const shaderCode = `
      struct TrailUniforms {
        width: f32,
        height: f32,
        colorR: f32,
        colorG: f32,
        colorB: f32,
        opacity: f32,
      }
      @group(0) @binding(0) var<storage, read> trailMap: array<f32>;
      @group(0) @binding(1) var<uniform> uniforms: TrailUniforms;

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }

      @vertex fn vs_main(@location(0) pos: vec2<f32>) -> VertexOutput {
        var out: VertexOutput;
        out.position = vec4<f32>(pos, 0.0, 1.0);
        out.uv = pos * 0.5 + 0.5;
        return out;
      }

      @fragment fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
        let x = u32(in.uv.x * uniforms.width);
        let y = u32((1.0 - in.uv.y) * uniforms.height);
        let idx = y * u32(uniforms.width) + x;

        let total = u32(uniforms.width * uniforms.height);
        if (idx >= total) { discard; }

        let val = trailMap[idx];
        if (val < 0.01) { discard; }

        return vec4<f32>(uniforms.colorR, uniforms.colorG, uniforms.colorB, val * uniforms.opacity);
      }
    `;
    const shaderModule = device.createShaderModule({ code: shaderCode });
    this.gpuTrailPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.gpuTrailBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          { arrayStride: 2 * GPU_FLOAT_SIZE, attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }] }
        ]
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{
          format: this.gpuHelper.getFormat(),
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
          }
        }]
      },
      primitive: { topology: "triangle-list" }
    });
  }
  /**
   * Upload agent data from CPU to a GPU vertex buffer.
   *
   * @param device - The WebGPU device.
   * @param agents - Agent array to upload.
   * @returns Render resources referencing the GPU-side agent buffer.
   * @internal
   */
  prepareAgentBuffer(device, agents) {
    const data = new Float32Array(agents.length * GPU_AGENT_COMPONENTS);
    for (let i = 0; i < agents.length; i++) {
      data.set([agents[i].id, agents[i].x, agents[i].y, agents[i].vx, agents[i].vy, agents[i].species || 0], i * GPU_AGENT_COMPONENTS);
    }
    if (!this.gpuAgentBuffer || this.gpuAgentBufferSize < data.byteLength) {
      this.gpuAgentBuffer = this.gpuHelper.createBuffer(device, data, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
      this.gpuAgentBufferSize = data.byteLength;
    } else {
      this.gpuHelper.writeBuffer(device, this.gpuAgentBuffer, data);
    }
    return { device, agentVertexBuffer: this.gpuAgentBuffer, agentCount: agents.length, agentStride: GPU_AGENT_STRIDE };
  }
  /**
   * Upload a CPU-side trail map to a GPU storage buffer for rendering.
   *
   * Used when the compute engine runs on CPU but rendering is GPU-based.
   *
   * @param device - The WebGPU device.
   * @param trailMap - CPU-side trail intensity buffer.
   * @returns The GPU storage buffer containing the trail data.
   * @internal
   */
  prepareManualTrailBuffer(device, trailMap) {
    const byteSize = trailMap.byteLength;
    if (!this.gpuManualTrailBuffer || this.gpuManualTrailBufferSize < byteSize) {
      this.gpuManualTrailBuffer = this.gpuHelper.createBuffer(
        device,
        trailMap,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
      );
      this.gpuManualTrailBufferSize = byteSize;
    } else {
      this.gpuHelper.writeBuffer(device, this.gpuManualTrailBuffer, trailMap);
    }
    return this.gpuManualTrailBuffer;
  }
  /**
   * Execute the actual GPU render pass: trail overlay followed by instanced agents.
   *
   * @param device - The WebGPU device.
   * @param resources - Agent vertex buffer and count.
   * @param trailBuffer - Optional trail-map storage buffer.
   * @internal
   */
  executeRender(device, resources, trailBuffer) {
    const ctx = this.gpuHelper.getContext();
    if (!ctx || !this.gpuPipeline || !this.gpuBindGroupLayout) return;
    const { r, g, b } = hexToRgb(this.appearance.agentColor);
    const shape = this.appearance.agentShape === "circle" ? 1 : 0;
    const uniformData = new Float32Array([
      this.canvas.width,
      this.canvas.height,
      this.appearance.agentSize,
      shape,
      r,
      g,
      b,
      0
    ]);
    if (!this.gpuUniformBuffer || this.gpuUniformBufferSize < uniformData.byteLength) {
      this.gpuUniformBuffer = this.gpuHelper.createBuffer(
        device,
        null,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        uniformData.byteLength
      );
      this.gpuUniformBufferSize = uniformData.byteLength;
    }
    this.gpuHelper.writeBuffer(device, this.gpuUniformBuffer, uniformData);
    const paletteSource = this.appearance.speciesColors && this.appearance.speciesColors.length > 0 ? this.appearance.speciesColors : SPECIES_PALETTE;
    const paletteData = new Float32Array(8 * 4);
    for (let i = 0; i < 8; i++) {
      const colorHex = paletteSource[i % paletteSource.length];
      const { r: r2, g: g2, b: b2 } = hexToRgb(colorHex);
      paletteData[i * 4] = r2;
      paletteData[i * 4 + 1] = g2;
      paletteData[i * 4 + 2] = b2;
      paletteData[i * 4 + 3] = 1;
    }
    const paletteBuffer = this.gpuHelper.createBuffer(
      device,
      paletteData,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    );
    const bindGroup = device.createBindGroup({
      layout: this.gpuBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.gpuUniformBuffer } },
        { binding: 1, resource: { buffer: paletteBuffer } }
      ]
    });
    const bgRgb = hexToRgb(this.appearance.backgroundColor);
    const clearColor = { r: bgRgb.r, g: bgRgb.g, b: bgRgb.b, a: 1 };
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: ctx.getCurrentTexture().createView(), clearValue: clearColor, loadOp: "clear", storeOp: "store" }]
    });
    const activeTrailBuffer = trailBuffer || this.gpuManualTrailBuffer || resources.trailMapBuffer;
    if (this.appearance.showTrails && activeTrailBuffer && this.gpuTrailPipeline && this.gpuTrailBindGroupLayout) {
      const { r: r2, g: g2, b: b2 } = hexToRgb(this.appearance.trailColor);
      const trailUniformData = new Float32Array([
        this.canvas.width,
        this.canvas.height,
        r2,
        g2,
        b2,
        this.appearance.trailOpacity ?? 1
      ]);
      const trailUniformBuffer = this.gpuHelper.createBuffer(
        device,
        trailUniformData,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      );
      const trailBindGroup = device.createBindGroup({
        layout: this.gpuTrailBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: activeTrailBuffer } },
          { binding: 1, resource: { buffer: trailUniformBuffer } }
        ]
      });
      pass.setPipeline(this.gpuTrailPipeline);
      pass.setBindGroup(0, trailBindGroup);
      pass.setVertexBuffer(0, this.gpuQuadBuffer);
      pass.draw(6);
    }
    pass.setPipeline(this.gpuPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, this.gpuQuadBuffer);
    pass.setVertexBuffer(1, resources.agentVertexBuffer);
    if (resources.agentCount > 0) {
      pass.draw(GPU_QUAD_VERTICES.length / 2, resources.agentCount);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  /**
   * Lazily obtain the 2D rendering context for the primary canvas.
   *
   * @returns The 2D canvas rendering context.
   * @internal
   */
  ensureContext() {
    if (!this.ctx) {
      const context = this.canvas.getContext("2d");
      if (!context) {
        throw new Error(
          "Failed to acquire a 2D context for CPU rendering. Use a dedicated gpuCanvas if this canvas has already been configured for WebGPU rendering."
        );
      }
      this.ctx = context;
    }
    return this.ctx;
  }
  /**
   * Reset all cached GPU state. Called when the GPU device changes.
   * @internal
   */
  resetGPUState() {
    this.gpuPipeline = null;
    this.gpuPipelineDevice = null;
    this.gpuBindGroupLayout = null;
    this.gpuTrailPipeline = null;
    this.gpuTrailBindGroupLayout = null;
    this.gpuQuadBuffer = null;
    this.gpuUniformBuffer = null;
    this.gpuUniformBufferSize = 0;
    this.gpuAgentBuffer = null;
    this.gpuAgentBufferSize = 0;
    this.gpuManualTrailBuffer = null;
    this.gpuManualTrailBufferSize = 0;
  }
};

// src/helpers/deviceInfo.ts
var isBrowserRuntime = () => {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
};
var collectBrowserMetrics = () => {
  const nav = navigator;
  const device = {
    runtime: "browser",
    userAgent: nav.userAgent,
    platform: nav.platform,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
    language: nav.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
  const browser = {
    online: nav.onLine,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    url: typeof location !== "undefined" ? location.href : void 0,
    referrer: typeof document !== "undefined" ? document.referrer : void 0,
    viewport: typeof window !== "undefined" ? {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    } : void 0
  };
  const perf = performance;
  if (perf.memory) {
    browser.performanceMemory = {
      jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      totalJSHeapSize: perf.memory.totalJSHeapSize,
      usedJSHeapSize: perf.memory.usedJSHeapSize
    };
  }
  return { device, browser };
};
var collectNodeMetrics = () => {
  const processRef = typeof process !== "undefined" ? process : void 0;
  return {
    device: {
      runtime: processRef?.versions?.node ? "node" : "unknown",
      platform: processRef?.platform,
      nodeVersion: processRef?.versions?.node,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    browser: {}
  };
};
var collectGpuMetrics = async () => {
  if (!isBrowserRuntime() || !navigator.gpu) {
    return void 0;
  }
  try {
    const gpuHelper = new GPU("RuntimeMetrics");
    const device = await gpuHelper.getDevice();
    const adapter = await navigator.gpu.requestAdapter();
    let adapterInfo = null;
    if (adapter && "requestAdapterInfo" in adapter && typeof adapter.requestAdapterInfo === "function") {
      adapterInfo = await adapter.requestAdapterInfo() ?? null;
    }
    if (!device) {
      return void 0;
    }
    return {
      vendor: adapterInfo?.vendor ?? "Unknown",
      architecture: adapterInfo?.architecture ?? "Unknown",
      description: adapterInfo?.description ?? "Unknown",
      maxBufferSize: device.limits.maxBufferSize,
      maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupsPerDimension: device.limits.maxComputeWorkgroupsPerDimension,
      maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
      maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: device.limits.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: device.limits.maxComputeWorkgroupSizeZ
    };
  } catch {
    return void 0;
  }
};
var collectRuntimeMetrics = async () => {
  const base = isBrowserRuntime() ? collectBrowserMetrics() : collectNodeMetrics();
  const gpu = await collectGpuMetrics();
  return {
    ...base,
    gpu
  };
};

// src/tracking.ts
var DEFAULT_TRACKING_OPTIONS = {
  enabled: true,
  captureFrameInputs: false,
  captureAgentStates: true,
  captureLogs: true,
  captureDeviceMetrics: true
};
var mapLogLevel = (level) => {
  if (level === 1 /* Error */) return "error";
  if (level === 2 /* Warning */) return "warning";
  if (level === 3 /* Info */) return "info";
  return "verbose";
};
var generateRunId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
var cloneAgents = (agents) => {
  return agents.map((agent) => ({ ...agent }));
};
var sanitizeInputValue = (value) => {
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    if (typeof value[0] === "object") {
      return value.map((item) => {
        if (!item || typeof item !== "object") {
          return item;
        }
        const result = {};
        for (const [key, nested] of Object.entries(item)) {
          if (typeof nested === "number" || typeof nested === "string" || typeof nested === "boolean" || nested == null) {
            result[key] = nested;
          }
        }
        return result;
      });
    }
    return value;
  }
  if (value instanceof Float32Array || value instanceof Uint32Array) {
    return {
      type: value.constructor.name,
      length: value.length
    };
  }
  if (typeof value === "function") {
    return "[Function]";
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = sanitizeInputValue(nested);
    }
    return result;
  }
  return String(value);
};
var SimulationTracker = class {
  /**
   * Create a new tracker for a simulation run.
   *
   * @param params - Initial run configuration used to populate metadata.
   */
  constructor(params) {
    this.logger = new Logger("SimulationTracker", "teal");
    this.frames = [];
    this.logs = [];
    this.errors = [];
    this.options = { ...DEFAULT_TRACKING_OPTIONS, ...params.tracking ?? {} };
    this.run = {
      runId: generateRunId(),
      startedAt: Date.now(),
      source: {
        kind: params.source.kind,
        code: params.source.kind === "dsl" ? params.source.code : {
          js: typeof params.source.code.js === "function" ? params.source.code.js.toString() : params.source.code.js,
          wgsl: params.source.code.wgsl,
          wasmWat: params.source.code.wasmWat
        }
      },
      configuration: {
        options: { ...params.options },
        appearance: { ...params.appearance },
        requiredInputs: [...params.compilationResult.requiredInputs],
        definedInputs: params.compilationResult.definedInputs.map((def) => ({ ...def }))
      },
      metadata: params.metadata
    };
    if (this.options.captureLogs) {
      this.logListener = (level, context, message) => {
        if (!this.options.enabled) return;
        this.logs.push({
          timestamp: Date.now(),
          level: mapLogLevel(level),
          context,
          message
        });
      };
      Logger.addListener(this.logListener);
    }
  }
  /**
   * Asynchronously collect runtime device, browser, and GPU metrics.
   *
   * The results are stored in `run.environment` for inclusion in
   * tracking reports.
   */
  async collectEnvironmentMetrics() {
    if (!this.options.enabled || !this.options.captureDeviceMetrics) {
      return;
    }
    try {
      this.run.environment = await collectRuntimeMetrics();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to collect runtime metrics: ${message}`);
    }
  }
  /**
   * Record data for a completed simulation frame.
   *
   * @param params - Frame data including agents, inputs, and performance.
   */
  recordFrame(params) {
    if (!this.options.enabled) {
      return;
    }
    this.frames.push({
      frameNumber: params.frameNumber,
      timestamp: Date.now(),
      method: params.method,
      renderMode: params.renderMode,
      agentPositions: this.options.captureAgentStates ? cloneAgents(params.agents) : void 0,
      inputSnapshot: this.options.captureFrameInputs ? Object.fromEntries(
        Object.entries(params.inputs ?? {}).map(([key, value]) => [key, sanitizeInputValue(value)])
      ) : void 0,
      performance: params.performance ? { ...params.performance } : void 0
    });
  }
  /**
   * Record an error that occurred during frame execution.
   *
   * @param error - The caught error or unknown thrown value.
   */
  recordError(error) {
    if (!this.options.enabled) {
      return;
    }
    if (error instanceof Error) {
      this.errors.push({
        timestamp: Date.now(),
        message: error.message,
        stack: error.stack
      });
      return;
    }
    this.errors.push({
      timestamp: Date.now(),
      message: String(error)
    });
  }
  /**
   * Mark the simulation run as complete by recording the end timestamp.
   */
  complete() {
    if (!this.options.enabled) {
      return;
    }
    this.run.endedAt = Date.now();
  }
  /**
   * Generate a deep-cloned tracking report, optionally filtered by
   * frame range and content inclusions.
   *
   * @param filter - Optional filter constraints.
   * @returns A self-contained tracking report.
   */
  getReport(filter) {
    const fromFrame = filter?.fromFrame;
    const toFrame = filter?.toFrame;
    const filteredFrames = this.frames.filter((frame) => {
      if (typeof fromFrame === "number" && frame.frameNumber < fromFrame) {
        return false;
      }
      if (typeof toFrame === "number" && frame.frameNumber > toFrame) {
        return false;
      }
      return true;
    });
    const frameView = filteredFrames.map((frame) => ({
      ...frame,
      agentPositions: filter?.includeAgentPositions === false ? void 0 : frame.agentPositions?.map((agent) => ({ ...agent })),
      inputSnapshot: filter?.includeInputSnapshots === false ? void 0 : frame.inputSnapshot ? { ...frame.inputSnapshot } : void 0,
      performance: frame.performance ? { ...frame.performance } : void 0
    }));
    const endedAt = this.run.endedAt ?? Date.now();
    const totalExecutionMs = filteredFrames.reduce(
      (total, frame) => total + (frame.performance?.totalExecutionTime ?? 0),
      0
    );
    return {
      run: {
        ...this.run,
        configuration: {
          options: { ...this.run.configuration.options },
          appearance: { ...this.run.configuration.appearance },
          requiredInputs: [...this.run.configuration.requiredInputs],
          definedInputs: this.run.configuration.definedInputs.map((input) => ({ ...input }))
        },
        environment: this.run.environment ? {
          device: { ...this.run.environment.device },
          browser: { ...this.run.environment.browser },
          gpu: this.run.environment.gpu ? { ...this.run.environment.gpu } : void 0
        } : void 0,
        metadata: this.run.metadata ? { ...this.run.metadata } : void 0
      },
      frames: frameView,
      logs: filter?.includeLogs === false ? [] : this.logs.map((entry) => ({ ...entry })),
      errors: this.errors.map((entry) => ({ ...entry })),
      summary: {
        frameCount: filteredFrames.length,
        durationMs: Math.max(0, endedAt - this.run.startedAt),
        totalExecutionMs,
        averageExecutionMs: filteredFrames.length > 0 ? totalExecutionMs / filteredFrames.length : 0,
        errorCount: this.errors.length
      }
    };
  }
  /**
   * Remove the global log listener registered by this tracker.
   *
   * Should be called during simulation teardown to prevent memory leaks.
   */
  dispose() {
    if (this.logListener) {
      Logger.removeListener(this.logListener);
    }
  }
  /**
   * Whether this tracker is configured to capture per-frame agent states.
   *
   * @returns `true` if tracking is enabled and agent state capture is on.
   */
  capturesAgentStates() {
    return this.options.enabled && this.options.captureAgentStates;
  }
};

// src/simulation.ts
var MAX_AGENTS = 1e7;
var DEFAULT_CANVAS_WIDTH = 600;
var DEFAULT_CANVAS_HEIGHT = 600;
var DEFAULT_APPEARANCE = {
  agentColor: "#00FFFF",
  backgroundColor: "#000000",
  agentSize: 3,
  agentShape: "circle",
  showTrails: true,
  trailOpacity: 1,
  trailColor: "#50FFFF",
  speciesColors: ["#00FFFF"],
  obstacleColor: "#FF0000",
  obstacleBorderColor: "#FF0000",
  obstacleOpacity: 0.2
};
var createSeededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = state * 1664525 + 1013904223 >>> 0;
    return state / 4294967296;
  };
};
var normalizeSource = (config) => {
  if (config.source) {
    return config.source;
  }
  return {
    kind: "dsl",
    code: config.agentScript ?? ""
  };
};
var compileFromCustomSource = (source) => {
  const jsCode = typeof source.js === "function" ? source.js.toString() : source.js ?? "";
  return {
    requiredInputs: source.requiredInputs ? [...source.requiredInputs] : [],
    definedInputs: source.definedInputs ? source.definedInputs.map((input) => ({ ...input })) : [],
    wgslCode: source.wgsl ?? "",
    jsCode,
    WASMCode: source.wasmWat ?? "",
    speciesCount: source.speciesCount,
    numRandomCalls: source.numRandomCalls ?? 0
  };
};
var methodRequiresCode = (method, compilationResult) => {
  if ((method === "JavaScript" || method === "WebWorkers") && !compilationResult.jsCode.trim()) {
    return {
      available: false,
      reason: `Method ${method} requested but no JavaScript code is available for the simulation source.`
    };
  }
  if (method === "WebAssembly" && !compilationResult.WASMCode.trim()) {
    return {
      available: false,
      reason: "Method WebAssembly requested but no WAT/WASM code is available for the simulation source."
    };
  }
  if (method === "WebGPU" && !compilationResult.wgslCode.trim()) {
    return {
      available: false,
      reason: "Method WebGPU requested but no WGSL code is available for the simulation source."
    };
  }
  return { available: true };
};
var Simulation = class {
  /**
   * Create a new simulation instance.
   *
   * Compiles the provided DSL or custom code, initialises agents with random
   * (or seeded) positions, and sets up the compute engine, renderer, and
   * tracker.
   *
   * @param config - Full simulation configuration.
   * @throws {Error} If `options.agents` is not a positive integer or exceeds {@link MAX_AGENTS}.
   */
  constructor(config) {
    this.logger = new Logger("Simulation", "blue");
    this.renderer = null;
    this.frameInProgress = false;
    this.frameNumber = 0;
    this.frameInputs = {};
    this.obstacles = [];
    /** Current agent state array. Updated after each successful frame. */
    this.agents = [];
    /** Compilation output from the DSL compiler or custom source. */
    this.compilationResult = null;
    /** Trail intensity map (width × height `Float32Array`), or `null` if trails are not active. */
    this.trailMap = null;
    /** Pre-generated random values buffer for the current frame, or `null` if not needed. */
    this.randomValues = null;
    const { options } = config;
    if (!Number.isFinite(options.agents) || options.agents < 1) {
      throw new Error('Simulation option "agents" must be a positive integer.');
    }
    if (options.agents > MAX_AGENTS) {
      const message = `Number of agents exceeds maximum limit of ${MAX_AGENTS}.`;
      this.logger.error(message);
      throw new Error(message);
    }
    this.width = config.canvas?.width ?? options.width ?? DEFAULT_CANVAS_WIDTH;
    this.height = config.canvas?.height ?? options.height ?? DEFAULT_CANVAS_HEIGHT;
    this.appearance = {
      ...DEFAULT_APPEARANCE,
      ...config.appearance ?? {}
    };
    this.performanceMonitor = new PerformanceMonitor();
    this.compiler = new Compiler();
    this.source = normalizeSource(config);
    const compilationResult = this.source.kind === "dsl" ? this.compiler.compileAgentCode(this.source.code) : compileFromCustomSource(this.source.code);
    this.compilationResult = compilationResult;
    this.computeEngine = new ComputeEngine(compilationResult, this.performanceMonitor, options.agents, options.workers);
    if (config.canvas) {
      config.canvas.width = this.width;
      config.canvas.height = this.height;
      if (config.gpuCanvas) {
        config.gpuCanvas.width = this.width;
        config.gpuCanvas.height = this.height;
      }
      this.renderer = new Renderer(config.canvas, config.gpuCanvas ?? null, this.appearance);
    }
    this.agents = this.createInitialAgents(options.agents, compilationResult.speciesCount ?? 1, options.seed);
    this.tracker = new SimulationTracker({
      source: this.source,
      options,
      appearance: this.appearance,
      compilationResult,
      tracking: config.tracking,
      metadata: config.metadata
    });
    void this.tracker.collectEnvironmentMetrics();
  }
  /**
   * Generate the initial agent population with random or seeded positions.
   *
   * @param count - Number of agents to create.
   * @param speciesCount - Number of distinct species (for round-robin assignment).
   * @param seed - Optional PRNG seed for reproducible placement.
   * @returns Array of initialised agents.
   */
  createInitialAgents(count, speciesCount, seed) {
    const random = typeof seed === "number" ? createSeededRandom(seed) : Math.random;
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      x: random() * this.width,
      y: random() * this.height,
      vx: (random() - 0.5) * 2,
      vy: (random() - 0.5) * 2,
      species: index % Math.max(speciesCount, 1)
    }));
  }
  /**
   * Allocate or resize the trail-map buffer to match the given dimensions.
   *
   * @param width - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   */
  ensureTrailMap(width, height) {
    const expectedLength = width * height;
    if (!this.trailMap || this.trailMap.length !== expectedLength) {
      this.trailMap = new Float32Array(expectedLength);
    }
  }
  /**
   * Fill the random values buffer with fresh random numbers for this frame.
   *
   * @param requiredCalls - Number of random values needed per agent.
   */
  populateRandomValues(requiredCalls) {
    if (requiredCalls <= 0) {
      return;
    }
    const totalRandomValues = this.agents.length * requiredCalls;
    if (!this.randomValues || this.randomValues.length !== totalRandomValues) {
      this.randomValues = new Float32Array(totalRandomValues);
    }
    for (let i = 0; i < totalRandomValues; i++) {
      this.randomValues[i] = Math.random();
    }
  }
  /**
   * Resolve the current simulation dimensions from the renderer canvas
   * or the manually set width/height.
   *
   * @returns Current width and height.
   */
  resolveDimensions() {
    if (this.renderer) {
      this.width = this.renderer.canvas.width;
      this.height = this.renderer.canvas.height;
    }
    return { width: this.width, height: this.height };
  }
  /**
   * Merge user-supplied frame inputs with system inputs (dimensions, agents,
   * trail map, random values, obstacles, and defined input defaults) to produce
   * the final input map for the compute engine.
   *
   * @param frameInputValues - Per-frame input overrides from the caller.
   * @returns Fully resolved input values map.
   * @throws {Error} If any required input is missing.
   */
  buildInputs(frameInputValues) {
    if (!this.compilationResult) {
      throw new Error("Simulation compilation result is unavailable.");
    }
    const { width, height } = this.resolveDimensions();
    const needsTrailMap = this.compilationResult.requiredInputs.includes("trailMap");
    const needsRandomValues = this.compilationResult.requiredInputs.includes("randomValues");
    if (needsTrailMap) {
      this.ensureTrailMap(width, height);
    } else {
      this.trailMap = null;
    }
    if (needsRandomValues) {
      this.populateRandomValues(this.compilationResult.numRandomCalls ?? 0);
    } else {
      this.randomValues = null;
    }
    const mergedInputs = {
      width,
      height,
      agents: this.agents,
      ...this.frameInputs,
      ...frameInputValues
    };
    if (needsTrailMap && this.trailMap) {
      mergedInputs.trailMap = this.trailMap;
    }
    if (needsRandomValues && this.randomValues) {
      mergedInputs.randomValues = this.randomValues;
    }
    const needsObstacles = this.compilationResult.requiredInputs.includes("obstacles");
    if (needsObstacles) {
      mergedInputs.obstacles = mergedInputs.obstacles ?? this.obstacles;
      mergedInputs.obstacleCount = mergedInputs.obstacles.length;
    }
    this.compilationResult.definedInputs.forEach((input) => {
      if (!(input.name in mergedInputs)) {
        mergedInputs[input.name] = input.defaultValue;
      }
    });
    const missingInputs = this.compilationResult.requiredInputs.filter((name) => !(name in mergedInputs));
    if (missingInputs.length > 0) {
      const message = `Missing required input values: ${missingInputs.join(", ")}`;
      this.logger.error(message);
      throw new Error(message);
    }
    return mergedInputs;
  }
  /**
   * Initialise the WebGPU device and configure both the compute engine
   * and the renderer for GPU operation.
   *
   * Must be called before using `'WebGPU'` as a compute method or `'gpu'`
   * as a render mode.
   *
   * @throws {Error} If WebGPU is not available or the adapter cannot be obtained.
   */
  async initGPU() {
    const gpuHelper = new GPU("SimulationGPU");
    const gpuDevice = await gpuHelper.getDevice();
    this.computeEngine.initGPU(gpuDevice);
    if (this.renderer) {
      this.renderer.initGPU(gpuDevice);
    }
  }
  /**
   * Update the visual appearance at runtime.
   *
   * Only the provided properties are changed; all others remain as-is.
   *
   * @param nextAppearance - Partial appearance overrides.
   */
  updateAppearance(nextAppearance) {
    this.appearance = {
      ...this.appearance,
      ...nextAppearance
    };
    if (this.renderer) {
      this.renderer.setAppearance(this.appearance);
    }
  }
  /**
   * Merge dynamic input values that persist across frames.
   *
   * Values set here are included in every subsequent `runFrame` call
   * unless overridden by the per-frame `inputValues` argument.
   *
   * @param nextInputs - Input key-value pairs to merge.
   */
  setInputs(nextInputs) {
    this.frameInputs = {
      ...this.frameInputs,
      ...nextInputs
    };
  }
  /**
   * Replace the obstacle list used for `avoidObstacles` commands.
   *
   * @param obstacles - Array of rectangular obstacles.
   */
  setObstacles(obstacles) {
    this.obstacles = [...obstacles];
    this.frameInputs.obstacles = this.obstacles;
  }
  /**
   * Manually set the simulation world dimensions when no canvas is attached.
   *
   * If a trail map exists and its size no longer matches the new dimensions,
   * it is reallocated.
   *
   * @param width - New width in pixels.
   * @param height - New height in pixels.
   */
  setCanvasDimensions(width, height) {
    this.width = width;
    this.height = height;
    if (this.trailMap && this.trailMap.length !== width * height) {
      this.trailMap = new Float32Array(width * height);
    }
  }
  /**
   * Run a single simulation frame: compute agent updates, render, and record
   * tracking data.
   *
   * If a previous frame is still in progress, the call returns immediately
   * with `skipped: true`.
   *
   * @param method - Compute backend to use (e.g. `'JavaScript'`, `'WebGPU'`).
   * @param inputValues - Per-frame input overrides (merged with persistent inputs).
   * @param renderMode - Rendering strategy: `'cpu'`, `'gpu'`, or `'none'`.
   * @returns The frame result including updated agent positions.
   * @throws {Error} If the required compiled code is unavailable, or the render mode
   *   requires a canvas that was not provided.
   */
  async runFrame(method, inputValues = {}, renderMode = "cpu") {
    if (!this.compilationResult) {
      throw new Error("Simulation cannot run without compilation results.");
    }
    if (this.frameInProgress) {
      this.performanceMonitor.logMissingFrame();
      return {
        frameNumber: this.frameNumber,
        agents: this.agents,
        skipped: true
      };
    }
    const availability = methodRequiresCode(method, this.compilationResult);
    if (!availability.available) {
      throw new Error(availability.reason);
    }
    if ((renderMode === "cpu" || renderMode === "gpu") && !this.renderer) {
      throw new Error(
        `Render mode "${renderMode}" requires a canvas renderer. Use render mode "none" for headless execution.`
      );
    }
    const forceReadbackForTracking = method === "WebGPU" && renderMode === "gpu" && this.tracker.capturesAgentStates();
    const computeRenderMode = renderMode === "gpu" && !forceReadbackForTracking ? "gpu" : "cpu";
    const mergedInputs = this.buildInputs(inputValues);
    this.frameInProgress = true;
    try {
      const nextAgents = await this.computeEngine.runFrame(
        method,
        this.agents,
        mergedInputs,
        computeRenderMode
      );
      this.agents = nextAgents;
      let renderTime = 0;
      if (renderMode !== "none" && this.renderer) {
        const renderStart = performance.now();
        if (renderMode === "gpu") {
          await this.renderer.renderAgentsGPU(nextAgents, this.computeEngine.gpuRenderState, this.trailMap ?? void 0);
        } else {
          this.renderer.renderBackground();
          if (this.trailMap && this.renderer.getAppearance().showTrails) {
            this.renderer.renderTrails(this.trailMap, this.renderer.canvas.width, this.renderer.canvas.height);
          }
          this.renderer.renderAgents(nextAgents);
        }
        renderTime = performance.now() - renderStart;
      }
      const frames = this.performanceMonitor.frames;
      const lastFrame = frames.length > 0 ? frames[frames.length - 1] : void 0;
      if (lastFrame) {
        lastFrame.renderTime = renderTime;
        lastFrame.totalExecutionTime += renderTime;
      }
      const currentFrameNumber = this.frameNumber;
      this.frameNumber += 1;
      this.tracker.recordFrame({
        frameNumber: currentFrameNumber,
        method,
        renderMode,
        agents: nextAgents,
        inputs: mergedInputs,
        performance: lastFrame
      });
      return {
        frameNumber: currentFrameNumber,
        agents: nextAgents,
        skipped: false
      };
    } catch (error) {
      this.tracker.recordError(error);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to run simulation frame: ${message}`);
      throw error;
    } finally {
      this.frameInProgress = false;
    }
  }
  /**
   * Access the internal performance monitor for detailed frame-level metrics.
   *
   * @returns The shared {@link PerformanceMonitor} instance.
   */
  getPerformanceMonitor() {
    return this.performanceMonitor;
  }
  /**
   * Generate a structured tracking report covering the simulation run.
   *
   * @param filter - Optional filter to restrict the frame range and inclusions.
   * @returns A deep-cloned tracking report.
   */
  getTrackingReport(filter) {
    return this.tracker.getReport(filter);
  }
  /**
   * Export the tracking report as a formatted JSON string.
   *
   * @param filter - Optional filter to restrict the frame range and inclusions.
   * @returns Pretty-printed JSON string of the tracking report.
   */
  exportTrackingReport(filter) {
    return JSON.stringify(this.getTrackingReport(filter), null, 2);
  }
  /**
   * Tear down the simulation, releasing all resources.
   *
   * Completes the tracking session, disposes the log listener, destroys
   * the compute engine, and clears all buffers.
   */
  destroy() {
    this.tracker.complete();
    this.tracker.dispose();
    this.computeEngine.destroy();
    this.agents = [];
    this.trailMap = null;
    this.randomValues = null;
  }
};
var simulation_default = Simulation;
export {
  Simulation as AgentyxSimulation,
  Compiler,
  ComputeEngine,
  LogLevel,
  Logger,
  MAX_AGENTS,
  PerformanceMonitor,
  Simulation,
  SimulationTracker,
  collectRuntimeMetrics,
  simulation_default as default
};
//# sourceMappingURL=index.js.map