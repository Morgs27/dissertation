/**
 * @module transpiler
 * Shared DSL transpilation orchestrator.
 *
 * Replaces the duplicated `parseBoidsDSL` functions across all backends.
 * Iterates over parsed DSL lines, delegates to the {@link CompilerTarget}
 * emit methods, and checks the {@link FunctionRegistry} for custom function
 * handling.
 */

import type { LineInfo } from "./parser";
import { DSLParser } from "./parser";
import type { CompilerTarget, CompilationContext } from "./compilerTarget";
import { tryEmitFunctionVar } from "./functionRegistry";
import { emitCommand as registryEmitCommand } from "./commandRegistry";
import { validateExpressionString } from "./expressionAST";

/**
 * Transpile parsed DSL lines using the given compiler target.
 * This is the single shared entry point that replaces per-compiler parseBoidsDSL.
 */
export function transpileDSL(
  lines: LineInfo[],
  target: CompilerTarget,
  ctx: CompilationContext,
): string[] {
  const statements: string[] = [];

  for (const line of lines) {
    const trimmed = line.content.trim();
    if (!trimmed) continue;

    ctx.currentLineIndex = line.lineIndex;

    const parsed = DSLParser.parseDSLLine(trimmed);
    let emitted: string[] = [];

    // Detect if the original line had a leading '}' that was consumed by the parser
    // for elseif/else patterns (e.g., "} else if (...)" or "} else {")
    const startsWithBrace = trimmed.startsWith("}") && parsed.type !== "brace";

    // If the line starts with '}' (e.g., "} else {"), handle the implicit close brace
    // by popping the blockStack — the '}' closes one block, the else/elseif opens another
    if (startsWithBrace) {
      const closedBlock = ctx.blockStack.pop();
      if (closedBlock === "loop") {
        ctx.loopDepth--;
        if (ctx.loopDepth === 0) ctx.currentLoopVar = undefined;
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
        // Try function registry first (neighbors, mean, sense, random, etc.)
        const functionResult = tryEmitFunctionVar(
          parsed.name,
          parsed.expression,
          target,
          ctx,
        );
        if (functionResult) {
          emitted = functionResult;
        } else {
          emitted = target.emitVar(parsed.name, parsed.expression, ctx);
        }

        // Ensure var is tracked across all compilation pipelines for AST validation
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
        emitted = target.emitFor(
          parsed.init,
          parsed.condition,
          parsed.increment,
          ctx,
        );
        break;
      }

      case "foreach":
        emitted = target.emitForeach(
          parsed.collection,
          parsed.varName,
          parsed.itemAlias,
          ctx,
        );
        break;

      case "assignment":
        // Check that target variable exists (unless it's an array indexing assignment)
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
        emitted =
          registryEmitCommand(parsed.command, parsed.argument, target, ctx) ??
          [];
        break;

      case "unknown":
      default:
        ctx.errors.push({
          message: "Unknown syntax or command",
          lineIndex: line.lineIndex,
        });
        continue;
    }

    // If original line started with '}', prepend the closing brace
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
