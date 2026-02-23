/**
 * @module parser
 * DSL lexer and line-level parser.
 *
 * Provides the {@link DSLParser} class which tokenises individual lines of
 * Agentyx DSL code into structured {@link ParsedLineType} unions, identifying
 * variable declarations, control flow, commands, assignments, and loops.
 */

/** Characters that begin single-line comments in DSL source. */
export const COMMENT_CHARACTERS = ["//", "#"];

export type AVAILABLE_COMMANDS =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "addVelocityX"
  | "addVelocityY"
  | "setVelocityX"
  | "setVelocityY"
  | "updatePosition"
  | "borderWrapping"
  | "borderBounce"
  | "limitSpeed"
  | "turn"
  | "moveForward"
  | "sense"
  | "deposit"
  | "enableTrails"
  | "print"
  | "species"
  | "avoidObstacles";

export const AVAILABLE_COMMANDS_LIST: AVAILABLE_COMMANDS[] = [
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
  "avoidObstacles",
];

/**
 * A parsed DSL command with its name and arguments.
 *
 * @property command - One of the {@link AVAILABLE_COMMANDS} identifiers.
 * @property argument - The raw argument string (e.g. `'1'`, `'inputs.speed'`).
 */
export interface ParsedCommand {
  command: AVAILABLE_COMMANDS;
  argument: string;
}

/**
 * Source location metadata for a single DSL line.
 *
 * @property content - The trimmed line content.
 * @property lineIndex - Zero-based line index in the original source.
 */
export interface LineInfo {
  content: string;
  lineIndex: number;
}

/**
 * Discriminated union of all possible parsed DSL line types.
 *
 * Each variant carries the data needed by the transpiler to emit
 * target-specific code.
 */
export type ParsedLineType =
  | { type: "empty" | "brace" | "else" }
  | { type: "var"; name: string; expression: string }
  | { type: "if"; condition: string }
  | { type: "elseif"; condition: string }
  | {
      type: "foreach";
      collection: string;
      varName?: string;
      itemAlias?: string;
    }
  | { type: "for"; init: string; condition: string; increment: string }
  | { type: "assignment"; target: string; expression: string }
  | { type: "command"; command: AVAILABLE_COMMANDS; argument: string }
  | { type: "unknown" };

export class DSLParser {
  /**
   * Helper to extract content between balanced parentheses
   */
  static extractBalanced(str: string, startIdx: number): string | null {
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
  static parseDSLLine(line: string): ParsedLineType {
    const trimmed = line.trim();

    // Handle empty lines or just braces
    if (trimmed === "" || trimmed === "{" || trimmed === "}") {
      return { type: trimmed === "" ? "empty" : "brace" };
    }

    // Handle variable declarations: var name = expression;
    if (trimmed.startsWith("var ")) {
      const rest = trimmed.substring(4).trim().replace(/;$/, "");
      const eqIndex = rest.indexOf("=");
      if (eqIndex > 0) {
        const name = rest.substring(0, eqIndex).trim();
        const expression = rest.substring(eqIndex + 1).trim();
        return { type: "var", name, expression };
      }
    }

    // Handle conditionals: if (condition) {
    if (trimmed.startsWith("if")) {
      const openParen = trimmed.indexOf("(");
      if (openParen > -1) {
        const condition = DSLParser.extractBalanced(trimmed, openParen);
        if (condition !== null) {
          return { type: "if", condition: condition.trim() };
        }
      }
    }

    // Handle else if
    if (
      trimmed.startsWith("} else if") ||
      trimmed.startsWith("else if") ||
      trimmed.startsWith("elseif")
    ) {
      const openParen = trimmed.indexOf("(");
      if (openParen > -1) {
        const condition = DSLParser.extractBalanced(trimmed, openParen);
        if (condition !== null) {
          return { type: "elseif", condition: condition.trim() };
        }
      }
    }

    // Handle else
    if (trimmed === "} else {" || trimmed === "else {" || trimmed === "else") {
      return { type: "else" };
    }

    // Handle for loops: for (var i = 0; i < n; i++) {
    if (trimmed.startsWith("for ")) {
      const openParen = trimmed.indexOf("(");
      if (openParen > -1) {
        const content = DSLParser.extractBalanced(trimmed, openParen);
        if (content !== null) {
          // Naive split by semicolon for now, assuming no semicolons in expressions
          // A robust parser would also respect parens/strings when splitting by semicolon
          const parts = content.split(";");
          if (parts.length === 3) {
            return {
              type: "for",
              init: parts[0].trim(),
              condition: parts[1].trim(),
              increment: parts[2].trim(),
            };
          }
        }
      }
    }

    // Handle foreach loops
    if (trimmed.startsWith("foreach")) {
      const openParen = trimmed.indexOf("(");
      if (openParen > -1) {
        const content = DSLParser.extractBalanced(trimmed, openParen);
        if (content !== null) {
          const asIndex = content.indexOf(" as ");
          if (asIndex > -1) {
            return {
              type: "foreach",
              collection: content.substring(0, asIndex).trim(),
              varName: content.substring(asIndex + 4).trim(),
            };
          } else {
            const trimmedColl = content.trim();
            return {
              type: "foreach",
              collection: trimmedColl,
              itemAlias: trimmedColl,
            };
          }
        }
      }
    }

    // Handle assignments (but not comparisons)
    if (
      trimmed.includes("=") &&
      !trimmed.includes("==") &&
      !trimmed.includes("!=") &&
      !trimmed.includes("<=") &&
      !trimmed.includes(">=")
    ) {
      const cleaned = trimmed.replace(/;$/, "");

      // Check for compound assignment operators (+=, -=, *=, /=)
      const compoundMatch = cleaned.match(/^(\w+)\s*([\+\-\*\/])=\s*(.+)$/);
      if (compoundMatch) {
        const varName = compoundMatch[1];
        const op = compoundMatch[2];
        const rhs = compoundMatch[3];
        // Convert compound assignment to regular assignment
        // e.g., vx += expr becomes vx = vx + expr
        return {
          type: "assignment",
          target: varName,
          expression: `${varName} ${op} ${rhs}`,
        };
      }

      // Regular assignment
      const eqIndex = cleaned.indexOf("=");
      if (eqIndex > 0) {
        const target = cleaned.substring(0, eqIndex).trim();
        const expression = cleaned.substring(eqIndex + 1).trim();
        // Make sure it's not a var declaration (already handled above)
        if (!trimmed.startsWith("var ")) {
          return { type: "assignment", target, expression };
        }
      }
    }

    // Try to match as a command
    const parsed = DSLParser.parseCommandLine(trimmed);
    if (parsed) {
      return {
        type: "command",
        command: parsed.command,
        argument: parsed.argument,
      };
    }

    return { type: "unknown" };
  }

  /**
   * Parses a single line of DSL code to extract command and argument
   * Returns null if the line is not a valid command
   */
  static parseCommandLine(line: string): ParsedCommand | null {
    const openParen = line.indexOf("(");
    if (openParen === -1) return null;

    // Find matching command
    const commandStr = line
      .substring(0, openParen)
      .trim() as AVAILABLE_COMMANDS;
    if (!AVAILABLE_COMMANDS_LIST.includes(commandStr)) {
      return null;
    }

    // Extract argument between parentheses
    const argument = DSLParser.extractBalanced(line, openParen);
    if (argument === null) return null;

    return { command: commandStr, argument: argument.trim() };
  }

  /**
   * Replaces all occurrences of {arg} in a template string with the given argument
   */
  static applyCommandTemplate(template: string, arg: string): string {
    return template.replace(/\{arg\}/g, arg);
  }

  /**
   * Parses an array of LineInfo objects, expanding any recognised commands
   * via the supplied command-template map. Non-command lines are skipped.
   */
  static parseLines(
    lines: LineInfo[],
    commandMap: Record<AVAILABLE_COMMANDS, string>,
  ): string[] {
    const result: string[] = [];
    for (const line of lines) {
      const parsed = DSLParser.parseCommandLine(line.content.trim());
      if (parsed) {
        const template = commandMap[parsed.command];
        if (template) {
          result.push(
            DSLParser.applyCommandTemplate(template, parsed.argument),
          );
        }
      }
    }
    return result;
  }
}
