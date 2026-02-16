/**
 * JavaScript Compiler Target
 * 
 * Implements the CompilerTarget interface for JavaScript output.
 * Uses the expressionAST for Float32-wrapped expression transformation.
 */

import type Logger from '../helpers/logger';
import type { CommandMap, LineInfo, AVAILABLE_COMMANDS } from './parser';
import { DSLParser } from './parser';
import { transformExpression } from './expressionAST';
import type { CompilerTarget, CompilationContext } from './compilerTarget';
import { createContext } from './compilerTarget';
import { transpileDSL } from './transpiler';

// ─── JS Command Templates ───────────────────────────────────────────

const COMMANDS: CommandMap = {
    moveUp: 'y = f(y - {arg});',
    moveDown: 'y = f(y + {arg});',
    moveLeft: 'x = f(x - {arg});',
    moveRight: 'x = f(x + {arg});',
    addVelocityX: 'vx = f(vx + {arg});',
    addVelocityY: 'vy = f(vy + {arg});',
    setVelocityX: 'vx = f({arg});',
    setVelocityY: 'vy = f({arg});',
    updatePosition: 'x = f(x + f(vx * {arg})); y = f(y + f(vy * {arg}));',
    borderWrapping: 'if (x < 0) x = f(x + f(inputs.width)); if (x > f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y > f(inputs.height)) y = f(y - f(inputs.height));',
    borderBounce: 'if (x < 0 || x > f(inputs.width)) vx = f(-vx); if (y < 0 || y > f(inputs.height)) vy = f(-vy); x = f(Math.max(0, Math.min(f(inputs.width), x))); y = f(Math.max(0, Math.min(f(inputs.height), y)));',
    limitSpeed: 'const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f({arg}*{arg})) { const __scale = f(Math.sqrt(f(f({arg}*{arg}) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); }',
    turn: 'const __c = f(Math.cos({arg})); const __s = f(Math.sin({arg})); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;',
    moveForward: 'x = f(x + f(vx * {arg})); y = f(y + f(vy * {arg}));',
    deposit: '_deposit({arg});',
    sense: '', // Handled as expression via FunctionRegistry
    enableTrails: '',
    print: 'if (inputs.print) inputs.print(id, {arg});',
    species: '', // Configuration only
    avoidObstacles: '_avoidObstacles({arg});',
};

// ─── JS Target Implementation ────────────────────────────────────────

export const JSTarget: CompilerTarget = {
    name: 'js',
    commands: COMMANDS,

    emitExpression(expr: string, ctx: CompilationContext): string {
        return transformExpression(expr, ctx.randomInputs);
    },

    emitVar(name: string, expression: string, ctx: CompilationContext): string[] {
        const exprTranspiled = transformExpression(expression, ctx.randomInputs);
        ctx.variables.set(name, { type: 'scalar' });
        return [`let ${name} = ${exprTranspiled}; `];
    },

    emitIf(condition: string, ctx: CompilationContext): string[] {
        return [`if (${transformExpression(condition, ctx.randomInputs)}) {`];
    },

    emitElseIf(condition: string, ctx: CompilationContext): string[] {
        return [`else if (${transformExpression(condition, ctx.randomInputs)}) {`];
    },

    emitElse(_ctx: CompilationContext): string[] {
        return [`else {`];
    },

    emitFor(init: string, condition: string, increment: string, ctx: CompilationContext): string[] {
        const jsInit = init.replace(/^var\s+/, 'let ');
        const jsCond = transformExpression(condition, ctx.randomInputs);
        return [`for (${jsInit}; ${jsCond}; ${increment}) {`];
    },

    emitForeach(collection: string, varName: string | undefined, _itemAlias: string | undefined, ctx: CompilationContext): string[] {
        const loopVar = varName || _itemAlias;
        if (!loopVar) return [];

        ctx.loopDepth++;
        ctx.currentLoopVar = loopVar;

        if (loopVar === collection) {
            return [
                `for (const _${loopVar} of ${collection}) {`,
                `const ${loopVar} = _${loopVar};`,
            ];
        }
        return [`for (const ${loopVar} of ${collection}) {`];
    },

    emitAssignment(target: string, expression: string, ctx: CompilationContext): string[] {
        const exprTranspiled = transformExpression(expression, ctx.randomInputs);
        return [`${target.trim()} = ${exprTranspiled}; `];
    },

    emitCommand(command: AVAILABLE_COMMANDS, argument: string, ctx: CompilationContext): string[] {
        const template = COMMANDS[command];
        if (!template) return []; // Configuration-only commands (enableTrails, species, sense)
        const arg = transformExpression(argument, ctx.randomInputs);
        const result = DSLParser.applyCommandTemplate(template, arg);
        return [result.endsWith(';') ? result : result + ';'];
    },

    emitCloseBrace(ctx: CompilationContext): string[] {
        if (ctx.loopDepth > 0) {
            ctx.loopDepth--;
            if (ctx.loopDepth === 0) ctx.currentLoopVar = undefined;
        }
        return ['}'];
    },

    emitProgram(statements: string[], _inputs: string[], randomInputs: string[], ctx: CompilationContext): string {
        if (statements.length === 0) {
            return `(agent) => ({ ...agent })`;
        }

        // Determine which helpers to include based on used functions
        const used = ctx.usedFunctions;
        const helpers: string[] = [];

        // Random helper is always included (needed for random() calls and random inputs)
        helpers.push(`
                    // Helper function for random values (returns Float32)
                    const _random = (min, max) => {
                        if (max === undefined) {
                            if (min === undefined) return f(Math.random());
                            return f(f(Math.random()) * f(min));
                        }
                        return f(f(min) + f(f(Math.random()) * f(f(max) - f(min))));
                    };`);

        // Random input initialization
        if (randomInputs.length > 0) {
            helpers.push(`
        // Initialize random input variables (Float32)
        ${randomInputs.map(r => `let ${r} = f((inputs.randomValues && inputs.randomValues[id] !== undefined) ? inputs.randomValues[id] : _random());`).join('\n        ')}`);
        }

        if (used.has('mean')) {
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

        if (used.has('neighbors')) {
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

        if (used.has('sense')) {
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
        const usesDeposit = statements.some(s => s.includes('_deposit('));
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
        const usesAvoidObstacles = statements.some(s => s.includes('_avoidObstacles('));
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
${helpers.join('\n')}

  // Execute DSL code
  ${statements.join('\n  ')}

  // Return updated agent (ensure Float32 values)
  return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
}`;
    },
};

// ─── Entry Point ─────────────────────────────────────────────────────

export const compileDSLtoJS = (
    lines: LineInfo[],
    inputs: string[],
    logger: Logger,
    rawScript: string,
    randomInputs: string[] = [],
): string => {
    const ctx = createContext(randomInputs);
    const statements = transpileDSL(lines, JSTarget, logger, rawScript, ctx);

    const result = JSTarget.emitProgram(statements, inputs, randomInputs, ctx);

    logger.info('Generated JavaScript function');
    return result;
};
