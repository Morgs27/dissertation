
import type Logger from "../helpers/logger";
import { DSLParser, type CommandMap, type LineInfo } from "./parser";

const COMMANDS: CommandMap = {
    moveUp: 'y -= {arg};',
    moveDown: 'y += {arg};',
    moveLeft: 'x -= {arg};',
    moveRight: 'x += {arg};',
    addVelocityX: 'vx += {arg};',
    addVelocityY: 'vy += {arg};',
    setVelocityX: 'vx = {arg};',
    setVelocityY: 'vy = {arg};',
    updatePosition: 'x += vx * {arg}; y += vy * {arg};',
    borderWrapping: 'if (x < 0) x += inputs.width; if (x > inputs.width) x -= inputs.width; if (y < 0) y += inputs.height; if (y > inputs.height) y -= inputs.height;',
    borderBounce: 'if (x < 0 || x > inputs.width) vx = -vx; if (y < 0 || y > inputs.height) vy = -vy; x = Math.max(0, Math.min(inputs.width, x)); y = Math.max(0, Math.min(inputs.height, y));',
    limitSpeed: 'const __speed2 = vx*vx + vy*vy; if (__speed2 > {arg}**2) { const __scale = Math.sqrt({arg}**2 / __speed2); vx *= __scale; vy *= __scale; }',
    turn: 'const __c = Math.cos({arg}); const __s = Math.sin({arg}); const __vx = vx * __c - vy * __s; vy = vx * __s + vy * __c; vx = __vx;',
    moveForward: 'x += vx * {arg}; y += vy * {arg};',
    deposit: '_deposit({arg});',
    sense: '', // Handled as expression
    enableTrails: '',
};

/**
 * Transpiles a single line of DSL to JavaScript using shared parser
 */
function transpileLine(line: string, randomInputs: Set<string>): string | null {
    const parsed = DSLParser.parseDSLLine(line);

    switch (parsed.type) {
        case 'empty':
            return '';

        case 'brace':
            return line.trim();

        case 'var':
            return `let ${parsed.name} = ${transpileExpression(parsed.expression, randomInputs)}; `;

        case 'if':
            return `if (${transpileExpression(parsed.condition, randomInputs)}) {
    `;

        case 'elseif':
            return `else if (${transpileExpression(parsed.condition, randomInputs)}) {
        `;

        case 'else':
            return 'else {';

        case 'foreach': ``
            return `for (const ${parsed.varName} of ${parsed.collection}) {
            `;

        case 'for': {
            // Handle for loops: for (var i = 0; i < n; i++)
            const init = parsed.init.replace(/^var\s+/, 'let ');
            const condition = transpileExpression(parsed.condition, randomInputs);
            const increment = parsed.increment;
            return `for (${init}; ${condition}; ${increment}) {
                `;
        }

        case 'assignment': {
            // Handle compound assignments (+=, -=, etc.)
            const target = parsed.target.trim();
            const expression = parsed.expression.trim();
            return `${target} = ${transpileExpression(expression, randomInputs)}; `;
        }

        case 'command':
            if (COMMANDS[parsed.command] !== undefined) {
                const template = COMMANDS[parsed.command];
                // Handle configuration-only commands with empty templates
                if (!template) return '';
                const arg = transpileExpression(parsed.argument, randomInputs);
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
 * Transpiles expressions to JavaScript
 */
function transpileExpression(expr: string, randomInputs: Set<string> = new Set()): string {
    let result = expr.trim();

    // Replace ^ with ** for exponentiation
    result = result.replace(/\^/g, '**');

    // Replace inputs.* references
    result = result.replace(/inputs\.(\w+)/g, 'inputs.$1');

    // Replace agents.count with agents.length
    result = result.replace(/(\w+)\.count/g, '$1.length');

    // Handle array indexing with property access: collection[i].property
    // This pattern matches nearbyAgents[i].x and keeps it as is
    // (JavaScript handles this natively)

    // Handle function calls like mean(agents.vx)
    result = result.replace(/mean\(([^)]+)\)/g, (_match, arg) => {
        const trimmed = arg.trim();
        // Check if it's property access like agents.vx
        const propMatch = trimmed.match(/(\w+)\.(\w+)/);
        if (propMatch) {
            return `_mean(${propMatch[1]}, '${propMatch[2]}')`;
        }
        return `_mean(${trimmed})`;
    });

    result = result.replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)');
    result = result.replace(/neighbors\(([^)]+)\)/g, '_neighbors($1)');
    result = result.replace(/sense\(([^)]+)\)/g, '_sense($1)');
    result = result.replace(/random\(([^)]*)\)/g, '_random($1)');

    // Handle random inputs replacement
    if (randomInputs.size > 0) {
        result = result.replace(/inputs\.(\w+)/g, (match, name) => {
            if (randomInputs.has(name)) {
                return name;
            }
            return match;
        });
    }

    // Handle random inputs replacement
    if (randomInputs.size > 0) {
        result = result.replace(/inputs\.(\w+)/g, (match, name) => {
            if (randomInputs.has(name)) {
                return name;
            }
            return match;
        });
    }

    return result;
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
            ${statements.join('\n            ')}
                    return { id, x, y, vx, vy };
                } `;
    }

    // Generate function with helper functions
    const agentFunction = `(agent, inputs) => {
                    // Destructure agent properties for direct access
                    let { id, x, y, vx, vy } = agent;

                    // Get agents array
                    const agents = inputs.agents || [];

                    // Helper function for random values
                    const _random = (min, max) => {
                        if (max === undefined) {
                            if (min === undefined) return Math.random();
                            return Math.random() * min;
                        }
                        return min + Math.random() * (max - min);
                    };

        // Initialize random input variables
        ${randomInputs.map(r => `let ${r} = (inputs.randomValues && inputs.randomValues[id] !== undefined) ? inputs.randomValues[id] : _random();`).join('\n        ')}

                    // Helper function: calculate mean of an array or array property
                    const _mean = (arr, prop) => {
                        if (!Array.isArray(arr)) return 0;
                        if (arr.length === 0) return 0;
                        if (prop) {
                            // Extract property from each element
                            const values = arr.map(item => item[prop] || 0);
                            return values.reduce((sum, val) => sum + val, 0) / values.length;
                        }
                        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
                    };

                    // Helper function: find nearby neighbors
                    const _neighbors = (radius) => {
                        return agents.filter(a => {
                            if (a.id === id) return false;
                            const dx = x - a.x;
                            const dy = y - a.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            return dist < radius;
                        });
                    };

                    const _sense = (angleOffset, distance) => {
                        // angle based on current velocity
                        if (vx === 0 && vy === 0) {
                            // Random angle if stopped? or just 0
                            // If stopped, let's assume direction 0
                        }
                        const currentAngle = Math.atan2(vy, vx);
                        const angle = currentAngle + angleOffset;
                        const sx = x + Math.cos(angle) * distance;
                        const sy = y + Math.sin(angle) * distance;
                        // Wrap coordinates
                        let ix = Math.floor(sx);
                        let iy = Math.floor(sy);
                        if (ix < 0) ix += inputs.width;
                        if (ix >= inputs.width) ix -= inputs.width;
                        if (iy < 0) iy += inputs.height;
                        if (iy >= inputs.height) iy -= inputs.height;

                        if (inputs.trailMap) {
                            return inputs.trailMap[iy * inputs.width + ix];
                        }
                        return 0;
                    };

                    const _deposit = (amount) => {
                        if (!inputs.trailMap) return;
                        let ix = Math.floor(x);
                        let iy = Math.floor(y);
                        if (ix < 0) ix += inputs.width;
                        if (ix >= inputs.width) ix -= inputs.width;
                        if (iy < 0) iy += inputs.height;
                        if (iy >= inputs.height) iy -= inputs.height;

                        // Simple atomic add
                        inputs.trailMap[iy * inputs.width + ix] += amount;
                    };



        // Execute DSL code
        ${boidStatements.join('\n        ')}

                    // Return updated agent
                    return { id, x, y, vx, vy };
                } `;

    logger.info('Generated boids-style JavaScript function');

    return agentFunction;
};
