
import type Logger from "../helpers/logger";
import { DSLParser, type CommandMap, type LineInfo } from "./parser";
import { transformExpression, isArrayExpression } from "./expressionAST";

// COMMANDS updated to use Float32 precision via f() wrapper for WASM/WebGPU parity
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
    sense: '', // Handled as expression
    enableTrails: '',
    print: 'if (inputs.print) inputs.print(id, {arg});',
    species: '', // Configuration only
    avoidObstacles: '_avoidObstacles({arg});',
};

/**
 * Transpiles a single line of DSL to JavaScript using shared parser
 * @param randomInputs Set of random input names for proper variable resolution
 */
function transpileLine(line: string, randomInputs: Set<string> = new Set()): string | null {
    const parsed = DSLParser.parseDSLLine(line);

    switch (parsed.type) {
        case 'empty':
            return '';

        case 'brace':
            return line.trim();

        case 'var': {
            // Use AST-based transformation for proper Float32 wrapping
            const exprTranspiled = transformExpression(parsed.expression, randomInputs);
            // Don't wrap arrays like neighbors() in f()
            if (isArrayExpression(parsed.expression)) {
                return `let ${parsed.name} = ${exprTranspiled}; `;
            }
            // The AST already wraps the final result, no need for extra f()
            return `let ${parsed.name} = ${exprTranspiled}; `;
        }

        case 'if':
            return `if (${transformExpression(parsed.condition, randomInputs)}) {
    `;

        case 'elseif':
            return `else if (${transformExpression(parsed.condition, randomInputs)}) {
        `;

        case 'else':
            return 'else {';

        case 'foreach': {
            const loopVar = parsed.varName || parsed.itemAlias;
            if (loopVar) {
                return `for (const ${loopVar} of ${parsed.collection}) {
            `;
            }
            return '';
        }

        case 'for': {
            // Handle for loops: for (var i = 0; i < n; i++)
            const init = parsed.init.replace(/^var\s+/, 'let ');
            const condition = transformExpression(parsed.condition, randomInputs);
            const increment = parsed.increment;
            return `for (${init}; ${condition}; ${increment}) {
                `;
        }

        case 'assignment': {
            // Handle compound assignments (+=, -=, etc.) with AST-based Float32 wrapping
            const target = parsed.target.trim();
            const expression = parsed.expression.trim();
            const exprTranspiled = transformExpression(expression, randomInputs);
            // Don't wrap arrays
            if (isArrayExpression(expression)) {
                return `${target} = ${exprTranspiled}; `;
            }
            // The AST already wraps arithmetic, no extra f() needed
            return `${target} = ${exprTranspiled}; `;
        }

        case 'command':
            if (COMMANDS[parsed.command] !== undefined) {
                const template = COMMANDS[parsed.command];
                // Handle configuration-only commands with empty templates
                if (!template) return '';
                // Use AST for argument transformation
                const arg = transformExpression(parsed.argument, randomInputs);
                const result = DSLParser.applyCommandTemplate(template, arg);
                return result.endsWith(';') ? result : result + ';';
            }
            return null;

        case 'unknown':
        default:
            return null;
    }
}

/**
 * Parse and transpile DSL with bracket-based blocks
 */
function parseBoidsDSL(lines: LineInfo[], logger: Logger, rawScript: string, randomInputs: string[]): string[] {
    const statements: string[] = [];
    const randomInputsSet = new Set(randomInputs);

    for (const line of lines) {
        const trimmed = line.content.trim();
        if (!trimmed) continue;

        const transpiled = transpileLine(trimmed, randomInputsSet);
        if (transpiled !== null) {
            statements.push(transpiled);
        } else {
            // If transpileLine returns null for a non-empty/brace line, it's an error
            logger.codeError("Unknown syntax or command", rawScript, line.lineIndex);
        }
    }

    return statements;
}

export const compileDSLtoJS = (lines: LineInfo[], _inputs: string[], logger: Logger, rawScript: string, randomInputs: string[] = []): string => {
    // Try new parser for boids-style DSL
    const boidStatements = parseBoidsDSL(lines, logger, rawScript, randomInputs);

    // If no boid statements, try old command-based approach
    if (boidStatements.length === 0) {
        const statements = DSLParser.parseLines(lines, COMMANDS);
        if (statements.length < 1) {
            return `(agent) => ({ ...agent })`;
        }

        return `(agent, inputs) => {
                    let { id, x, y, vx, vy } = agent;
                    let species = agent.species || 0;
            ${statements.join('\n            ')}
                    return { id, x, y, vx, vy, species };
                } `;
    }

    // Generate function with helper functions
    // f() is the Float32 wrapper for WASM/WebGPU parity
    const agentFunction = `(agent, inputs) => {
                    // Float32 wrapper for precision parity with WASM/WebGPU
                    const f = Math.fround;
                    
                    // Destructure agent properties with Float32 conversion
                    let { id } = agent;
                    let x = f(agent.x);
                    let y = f(agent.y);
                    let vx = f(agent.vx);
                    let vy = f(agent.vy);
                    let species = agent.species || 0;

                    // Get agents array
                    const agents = inputs.agents || [];

                    // Helper function for random values (returns Float32)
                    const _random = (min, max) => {
                        if (max === undefined) {
                            if (min === undefined) return f(Math.random());
                            return f(f(Math.random()) * f(min));
                        }
                        return f(f(min) + f(f(Math.random()) * f(f(max) - f(min))));
                    };

        // Initialize random input variables (Float32)
        ${randomInputs.map(r => `let ${r} = f((inputs.randomValues && inputs.randomValues[id] !== undefined) ? inputs.randomValues[id] : _random());`).join('\n        ')}

                    // Helper function: calculate mean of an array or array property (returns Float32)
                    const _mean = (arr, prop) => {
                        if (!Array.isArray(arr)) return f(0);
                        if (arr.length === 0) return f(0);
                        if (prop) {
                            // Extract property from each element
                            const values = arr.map(item => f(item[prop] || 0));
                            return f(values.reduce((sum, val) => f(sum + val), f(0)) / f(values.length));
                        }
                        return f(arr.reduce((sum, val) => f(sum + f(val)), f(0)) / f(arr.length));
                    };

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
                    };

                    const _sense = (angleOffset, distance) => {
                        // Read from trailMapRead (previous frame state) for order-independent sensing
                        const readMap = inputs.trailMapRead || inputs.trailMap;
                        const ao = f(angleOffset);
                        const dist = f(distance);
                        
                        // angle based on current velocity (Float32 precision)
                        const currentAngle = f(Math.atan2(vy, vx));
                        const angle = f(currentAngle + ao);
                        const sx = f(x + f(f(Math.cos(angle)) * dist));
                        const sy = f(y + f(f(Math.sin(angle)) * dist));
                        // Wrap coordinates - use Math.trunc to match WASM's i32.trunc_f32_s
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
                    };

                    const _deposit = (amount) => {
                        // Write to trailMapWrite (new deposits for this frame)
                        const writeMap = inputs.trailMapWrite || inputs.trailMap;
                        if (!writeMap) return;
                        const amt = f(amount);
                        
                        // Use Math.trunc to match WASM's i32.trunc_f32_s
                        let ix = Math.trunc(x);
                        let iy = Math.trunc(y);
                        const w = Math.trunc(f(inputs.width));
                        const h = Math.trunc(f(inputs.height));
                        if (ix < 0) ix += w;
                        if (ix >= w) ix -= w;
                        if (iy < 0) iy += h;
                        if (iy >= h) iy -= h;

                        // Atomic add to write buffer (Float32)
                        writeMap[iy * w + ix] = f(writeMap[iy * w + ix] + amt);
                    };


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
                                // Inside obstacle region — push away from center
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
                    };



        // Execute DSL code
        ${boidStatements.join('\n        ')}

                    // Return updated agent (ensure Float32 values)
                    return { id, x: f(x), y: f(y), vx: f(vx), vy: f(vy), species };
                } `;

    logger.info('Generated boids-style JavaScript function');

    return agentFunction;
};
