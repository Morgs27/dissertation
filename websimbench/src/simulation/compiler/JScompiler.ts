import type Logger from "../helpers/logger";
import { Compiler, type CommandMap, type LineInfo } from "./compiler";

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
};

/**
 * Transpiles a single line of DSL to JavaScript using shared parser
 */
function transpileLine(line: string): string | null {
    const parsed = Compiler.parseDSLLine(line);
    
    switch (parsed.type) {
        case 'empty':
            return '';
        
        case 'brace':
            return line.trim();
        
        case 'var':
            return `let ${parsed.name} = ${transpileExpression(parsed.expression)};`;
        
        case 'if':
            return `if (${transpileExpression(parsed.condition)}) {`;
        
        case 'foreach':
            return `for (const ${parsed.varName} of ${parsed.collection}) {`;
        
        case 'for': {
            // Handle for loops: for (var i = 0; i < n; i++)
            const init = parsed.init.replace(/^var\s+/, 'let ');
            const condition = transpileExpression(parsed.condition);
            const increment = parsed.increment;
            return `for (${init}; ${condition}; ${increment}) {`;
        }
        
        case 'assignment': {
            // Handle compound assignments (+=, -=, etc.)
            const target = parsed.target.trim();
            const expression = parsed.expression.trim();
            return `${target} = ${transpileExpression(expression)};`;
        }
        
        case 'command':
            if (COMMANDS[parsed.command]) {
                const template = COMMANDS[parsed.command];
                const arg = transpileExpression(parsed.argument);
                const result = Compiler.applyCommandTemplate(template, arg);
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
function transpileExpression(expr: string): string {
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
    
    return result;
}

/**
 * Parse and transpile DSL with bracket-based blocks
 */
function parseBoidsDSL(lines: LineInfo[], logger: Logger, rawScript: string): string[] {
    const statements: string[] = [];
    
    for (const line of lines) {
        const trimmed = line.content.trim();
        if (!trimmed) continue;
        
        const transpiled = transpileLine(trimmed);
        if (transpiled !== null) {
            statements.push(transpiled);
        } else {
             // If transpileLine returns null for a non-empty/brace line, it's an error
             logger.codeError("Unknown syntax or command", rawScript, line.lineIndex);
        }
    }
    
    return statements;
}

export const compileDSLtoJS = (lines: LineInfo[], _inputs: string[], logger: Logger, rawScript: string): string => {
    // Try new parser for boids-style DSL
    const boidStatements = parseBoidsDSL(lines, logger, rawScript);
    
    // If no boid statements, try old command-based approach
    if (boidStatements.length === 0) {
        const statements = Compiler.parseLines(lines, COMMANDS);
        if (statements.length < 1) {
            return `(agent) => ({ ...agent })`;
        }
        
        return `(agent, inputs) => {
            let { id, x, y, vx, vy } = agent;
            ${statements.join('\n            ')}
            return { id, x, y, vx, vy };
        }`;
    }
    
    // Generate function with helper functions
    const agentFunction = `(agent, inputs) => {
        // Destructure agent properties for direct access
        let { id, x, y, vx, vy } = agent;
        
        // Get agents array
        const agents = inputs.agents || [];
        
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
                const dist = Math.sqrt(dx*dx + dy*dy);
                return dist < radius;
            });
        };
        
        // Execute DSL code
        ${boidStatements.join('\n        ')}
        
        // Return updated agent
        return { id, x, y, vx, vy };
    }`;
    
    logger.info('Generated boids-style JavaScript function');
    
    return agentFunction;
};
