/**
 * Shared Transpiler Orchestrator
 * 
 * Replaces the duplicated `parseBoidsDSL` functions across all 3 compilers.
 * Iterates over parsed DSL lines, delegates to the CompilerTarget's emit methods,
 * and checks the FunctionRegistry for custom function handling.
 */

import type Logger from '../helpers/logger';
import type { LineInfo } from './parser';
import { DSLParser } from './parser';
import type { CompilerTarget, CompilationContext } from './compilerTarget';
import { tryEmitFunctionVar } from './functionRegistry';
import { emitCommand as registryEmitCommand } from './commandRegistry';

/**
 * Transpile parsed DSL lines using the given compiler target.
 * This is the single shared entry point that replaces per-compiler parseBoidsDSL.
 */
export function transpileDSL(
    lines: LineInfo[],
    target: CompilerTarget,
    logger: Logger,
    rawScript: string,
    ctx: CompilationContext,
): string[] {
    const statements: string[] = [];

    for (const line of lines) {
        const trimmed = line.content.trim();
        if (!trimmed) continue;

        const parsed = DSLParser.parseDSLLine(trimmed);
        let emitted: string[] = [];

        // Detect if the original line had a leading '}' that was consumed by the parser
        // for elseif/else patterns (e.g., "} else if (...)" or "} else {")
        const startsWithBrace = trimmed.startsWith('}') && parsed.type !== 'brace';

        switch (parsed.type) {
            case 'empty':
                continue;

            case 'brace':
                emitted = target.emitCloseBrace(ctx);
                break;

            case 'var': {
                // Try function registry first (neighbors, mean, sense, random, etc.)
                const functionResult = tryEmitFunctionVar(parsed.name, parsed.expression, target, ctx);
                if (functionResult) {
                    emitted = functionResult;
                } else {
                    emitted = target.emitVar(parsed.name, parsed.expression, ctx);
                }
                break;
            }

            case 'if':
                emitted = target.emitIf(parsed.condition, ctx);
                break;

            case 'elseif':
                emitted = target.emitElseIf(parsed.condition, ctx);
                break;

            case 'else':
                emitted = target.emitElse(ctx);
                break;

            case 'for':
                emitted = target.emitFor(parsed.init, parsed.condition, parsed.increment, ctx);
                break;

            case 'foreach':
                emitted = target.emitForeach(parsed.collection, parsed.varName, parsed.itemAlias, ctx);
                break;

            case 'assignment':
                emitted = target.emitAssignment(parsed.target, parsed.expression, ctx);
                break;

            case 'command':
                emitted = registryEmitCommand(parsed.command, parsed.argument, target, ctx) ?? [];
                break;

            case 'unknown':
            default:
                logger.codeError('Unknown syntax or command', rawScript, line.lineIndex);
                continue;
        }

        // If original line started with '}', prepend the closing brace
        if (startsWithBrace && emitted.length > 0) {
            emitted[0] = '} ' + emitted[0];
        }

        for (const stmt of emitted) {
            if (stmt !== '') {
                statements.push(stmt);
            }
        }
    }

    return statements;
}
