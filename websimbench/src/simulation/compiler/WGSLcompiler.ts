import type Logger from "../helpers/logger";
import { Compiler, type CommandMap, type LineInfo } from "./compiler";

export const WORKGROUP_SIZE = 64;

const COMMANDS: CommandMap = {
    moveUp: 'agent.y -= {arg};',
    moveDown: 'agent.y += {arg};',
    moveLeft: 'agent.x -= {arg};',
    moveRight: 'agent.x += {arg};',
    addVelocityX: 'agent.vx += {arg};',
    addVelocityY: 'agent.vy += {arg};',
    setVelocityX: 'agent.vx = {arg};',
    setVelocityY: 'agent.vy = {arg};',
    updatePosition: 'agent.x += agent.vx * {arg}; agent.y += agent.vy * {arg};',
    borderWrapping: 'if (agent.x < 0) { agent.x += inputs.width; } if (agent.x > inputs.width) { agent.x -= inputs.width; } if (agent.y < 0) { agent.y += inputs.height; } if (agent.y > inputs.height) { agent.y -= inputs.height; }',
    borderBounce: 'if (agent.x < 0 || agent.x > inputs.width) { agent.vx = -agent.vx; } if (agent.y < 0 || agent.y > inputs.height) { agent.vy = -agent.vy; } agent.x = max(0.0, min(inputs.width, agent.x)); agent.y = max(0.0, min(inputs.height, agent.y));',
    limitSpeed: 'let _speed2 = agent.vx*agent.vx + agent.vy*agent.vy; if (_speed2 > {arg}*{arg}) { let _scale = sqrt({arg}*{arg} / _speed2); agent.vx *= _scale; agent.vy *= _scale; }',
};

/**
 * Context for tracking variable metadata during WGSL compilation
 */
interface WGSLContext {
    variables: Map<string, VariableInfo>;
    loopDepth: number;
    currentLoopVar?: string;
}

interface VariableInfo {
    type: 'neighbors' | 'mean_result' | 'scalar' | 'loop_index';
    // For neighbors: stores the radius expression
    radiusExpr?: string;
    // For mean: stores the collection and property
    collection?: string;
    property?: string;
}

/**
 * Transpiles expressions to WGSL
 */
function transpileExpression(expr: string, context: WGSLContext): string {
    let result = expr.trim();

    // Replace ^ with * for exponentiation (WGSL uses pow() but for x^2 we can use x*x)
    // Handle property access like inputs.something^2 first
    result = result.replace(/([\w.]+)\^2/g, '($1)*($1)');
    result = result.replace(/\^/g, '**'); // Keep for potential pow() conversion

    // Handle property access on tracked variables
    // e.g., nearbyAgents.vx -> this needs special handling
    const propAccessMatch = result.match(/^(\w+)\.(\w+)$/);
    if (propAccessMatch) {
        const varName = propAccessMatch[1];
        const prop = propAccessMatch[2];
        const varInfo = context.variables.get(varName);

        // If it's a neighbors collection, we can't directly access properties
        // This should be caught by mean() function
        if (varInfo?.type === 'neighbors') {
            // This is invalid in WGSL - should be used with mean()
            return `/* ERROR: Cannot access ${varName}.${prop} directly in WGSL */`;
        }
    }

    // Replace .length with _count suffix for neighbor arrays
    result = result.replace(/(\w+)\.length/g, (_, varName) => {
        const varInfo = context.variables.get(varName);
        if (varInfo?.type === 'neighbors') {
            return `${varName}_count`;
        }
        return `${varName}_count`;
    });

    // Handle sqrt() function - WGSL has native sqrt support
    // Note: sqrt() is already natively supported in WGSL, so we just need to ensure
    // the arguments are properly transpiled
    result = result.replace(/sqrt\(([^)]+)\)/g, (_match, arg) => {
        // Recursively transpile the argument
        const transpiledArg = transpileExpression(arg, context);
        return `sqrt(${transpiledArg})`;
    });

    // Handle references to agent properties (x, y, vx, vy)
    // Only add agent. prefix if the variable is not already tracked
    const agentProps = ['x', 'y', 'vx', 'vy'];
    for (const prop of agentProps) {
        // Match standalone property references (not part of a longer identifier)
        const regex = new RegExp(`\\b${prop}\\b(?!_)`, 'g');
        result = result.replace(regex, (match, offset) => {
            // Don't replace if it's part of another identifier or property access
            const before = offset > 0 ? result[offset - 1] : '';

            // Skip if it's part of a property access (e.g., other.x)
            if (before === '.') return match;

            // Skip if it's a tracked variable (e.g., neighbor_x)
            if (context.variables.has(match)) return match;

            // Add agent. prefix
            return `agent.${match}`;
        });
    }

    return result;
}

/**
 * Transpiles a single line of DSL to WGSL
 */
function transpileLine(line: string, context: WGSLContext): string[] {
    const parsed = Compiler.parseDSLLine(line);
    const statements: string[] = [];

    switch (parsed.type) {
        case 'empty':
            return [];

        case 'brace':
            return [line.trim()];

        case 'var': {
            // Check if this is a neighbors() call
            const neighborsMatch = parsed.expression.match(/neighbors\(([^)]+)\)/);
            if (neighborsMatch) {
                const radiusExpr = transpileExpression(neighborsMatch[1], context);

                // Track this variable as a neighbors collection
                context.variables.set(parsed.name, {
                    type: 'neighbors',
                    radiusExpr
                });

                // Generate neighbor finding code
                statements.push(`// Find neighbors for ${parsed.name}`);
                statements.push(`var ${parsed.name}_count: u32 = 0u;`);
                statements.push(`var ${parsed.name}_sum_x: f32 = 0.0;`);
                statements.push(`var ${parsed.name}_sum_y: f32 = 0.0;`);
                statements.push(`var ${parsed.name}_sum_vx: f32 = 0.0;`);
                statements.push(`var ${parsed.name}_sum_vy: f32 = 0.0;`);
                statements.push(`for (var _ni: u32 = 0u; _ni < arrayLength(&agents); _ni++) {`);
                statements.push(`if (_ni == i) { continue; }`);
                statements.push(`let other = agents[_ni];`);
                statements.push(`let dx = agent.x - other.x;`);
                statements.push(`let dy = agent.y - other.y;`);
                statements.push(`let dist = sqrt(dx*dx + dy*dy);`);
                statements.push(`if (dist < ${radiusExpr}) {`);
                statements.push(`${parsed.name}_count += 1u;`);
                statements.push(`${parsed.name}_sum_x += other.x;`);
                statements.push(`${parsed.name}_sum_y += other.y;`);
                statements.push(`${parsed.name}_sum_vx += other.vx;`);
                statements.push(`${parsed.name}_sum_vy += other.vy;`);
                statements.push(`}`);
                statements.push(`}`);
                return statements;
            }

            // Check if this is a mean() call
            const meanMatch = parsed.expression.match(/mean\((\w+)\.(\w+)\)/);
            if (meanMatch) {
                const collection = meanMatch[1];
                const property = meanMatch[2];
                const collectionInfo = context.variables.get(collection);

                if (collectionInfo?.type === 'neighbors') {
                    // Use pre-computed sum
                    context.variables.set(parsed.name, {
                        type: 'mean_result',
                        collection,
                        property
                    });

                    statements.push(`var ${parsed.name}: f32 = 0.0;`);
                    statements.push(`if (${collection}_count > 0u) {`);
                    statements.push(`${parsed.name} = ${collection}_sum_${property} / f32(${collection}_count);`);
                    statements.push(`}`);
                    return statements;
                }
            }

            // Check for array indexing like nearbyAgents[i].x
            const arrayAccessMatch = parsed.expression.match(/(\w+)\[(\w+)\]\.(\w+)/);
            if (arrayAccessMatch) {
                // Replace with _loop_other reference if inside a loop
                let expression = parsed.expression;
                if (context.loopDepth > 0) {
                    expression = expression.replace(
                        /(\w+)\[(\w+)\]\.(\w+)/g,
                        '_loop_other.$3'
                    );
                }
                const transpiled = transpileExpression(expression, context);
                statements.push(`var ${parsed.name}: f32 = ${transpiled};`);
                context.variables.set(parsed.name, { type: 'scalar' });
                return statements;
            }

            // Regular variable assignment
            const transpiled = transpileExpression(parsed.expression, context);
            statements.push(`var ${parsed.name}: f32 = ${transpiled};`);
            context.variables.set(parsed.name, { type: 'scalar' });
            return statements;
        }

        case 'if': {
            let condition = transpileExpression(parsed.condition, context);

            // Fix type consistency: if comparing a _count variable (u32) with 0, use 0u
            condition = condition.replace(/(\w+_count)\s*>\s*0\b/g, '$1 > 0u');

            statements.push(`if (${condition}) {`);
            return statements;
        }

        case 'for': {
            // Handle for loops over neighbor arrays
            // for (var i = 0; i < nearbyAgents.length; i++)
            const lengthMatch = parsed.condition.match(/(\w+)\s*<\s*(\w+)\.length/);
            if (lengthMatch) {
                const loopVar = lengthMatch[1];
                const collection = lengthMatch[2];
                const collectionInfo = context.variables.get(collection);

                if (collectionInfo?.type === 'neighbors') {
                    // We need to iterate over ALL agents and check if they're neighbors
                    const radiusExpr = collectionInfo.radiusExpr!;

                    // Use a unique loop variable name to avoid collision with outer 'i'
                    const uniqueLoopVar = `_${loopVar}_loop`;
                    context.currentLoopVar = uniqueLoopVar;
                    context.loopDepth++;

                    statements.push(`// Loop over ${collection}`);
                    statements.push(`for (var ${uniqueLoopVar}: u32 = 0u; ${uniqueLoopVar} < arrayLength(&agents); ${uniqueLoopVar}++) {`);
                    statements.push(`if (${uniqueLoopVar} == i) { continue; }`);
                    statements.push(`let _loop_other = agents[${uniqueLoopVar}];`);
                    statements.push(`let _loop_dx = agent.x - _loop_other.x;`);
                    statements.push(`let _loop_dy = agent.y - _loop_other.y;`);
                    statements.push(`let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);`);
                    statements.push(`if (_loop_dist >= ${radiusExpr}) { continue; }`);
                    statements.push(`// Nearby agent found - execute loop body`);
                    return statements;
                }
            }

            // Regular for loop
            const init = parsed.init.replace(/^var\s+/, '');
            const condition = transpileExpression(parsed.condition, context);
            const increment = parsed.increment;
            statements.push(`for (var ${init}; ${condition}; ${increment}) {`);
            context.loopDepth++;
            return statements;
        }

        case 'assignment': {
            // Handle array indexing in assignment RHS
            let expression = parsed.expression;

            // Replace array[loopVar].property with _loop_other.property
            // For the neighbors loop, we need to match the original DSL loop variable (i)
            // against our internal unique loop variable
            if (context.loopDepth > 0) {
                // Replace nearbyAgents[i].property with _loop_other.property
                // Match any collection name with [i] or similar
                expression = expression.replace(
                    /(\w+)\[(\w+)\]\.(\w+)/g,
                    '_loop_other.$3'
                );
            }

            const transpiled = transpileExpression(expression, context);

            // Add agent. prefix to target if it's an agent property
            let target = parsed.target;
            const agentProps = ['x', 'y', 'vx', 'vy'];
            if (agentProps.includes(target) && !context.variables.has(target)) {
                target = `agent.${target}`;
            }

            statements.push(`${target} = ${transpiled};`);
            return statements;
        }

        case 'command': {
            if (COMMANDS[parsed.command]) {
                const template = COMMANDS[parsed.command];
                const arg = transpileExpression(parsed.argument, context);
                const result = Compiler.applyCommandTemplate(template, arg);
                statements.push(result);
                return statements;
            }
            return [];
        }

        case 'unknown':
        default:
            return [];
    }
}

/**
 * Parse and transpile DSL with full boids support
 */
function parseBoidsDSL(lines: LineInfo[], logger: Logger, rawScript: string): string[] {
    const statements: string[] = [];
    const context: WGSLContext = {
        variables: new Map(),
        loopDepth: 0
    };

    let currentIndent = '';

    for (const line of lines) {
        const trimmed = line.content.trim();
        if (!trimmed) continue;

        // Handle closing braces
        if (trimmed === '}') {
            currentIndent = currentIndent.slice(4); // Remove 4 spaces
            statements.push(currentIndent + '}');
            if (context.loopDepth > 0) {
                context.loopDepth--;
                if (context.loopDepth === 0) {
                    context.currentLoopVar = undefined;
                }
            }
            continue;
        }

        const transpiled = transpileLine(trimmed, context);
        if (transpiled.length === 0 && trimmed !== '{') {
            // If we got no statements back and it wasn't just braces/empty, check if it was unknown
            const parsed = Compiler.parseDSLLine(trimmed);
            if (parsed.type === 'unknown') {
                logger.codeError("Unknown syntax or command", rawScript, line.lineIndex);
            }
        }

        for (const stmt of transpiled) {
            // Check if this statement closes a brace before adding it
            const closesBrace = stmt.trim() === '}';
            if (closesBrace && currentIndent.length >= 4) {
                currentIndent = currentIndent.slice(4);
            }

            statements.push(currentIndent + stmt);

            // Increase indent after opening braces (but not if the brace also closes on same line)
            const opensBrace = stmt.includes('{') && !stmt.includes('}');
            if (opensBrace) {
                currentIndent += '    ';
            }
        }
    }

    return statements;
}

export const compileDSLtoWGSL = (lines: LineInfo[], inputs: string[], logger: Logger, rawScript: string): string => {
    // Try new parser for boids-style DSL
    const boidStatements = parseBoidsDSL(lines, logger, rawScript);

    // If no boid statements, try old command-based approach
    if (boidStatements.length === 0) {
        const statements: string[] = [];
        for (const line of lines) {
            const parsed = Compiler.parseCommandLine(line.content.trim());
            if (parsed) {
                const normalizedArg = parsed.argument.replace(/inputs\.([a-zA-Z_]\w*)/g, 'inputs.$1');
                const statement = Compiler.applyCommandTemplate(COMMANDS[parsed.command], normalizedArg);
                statements.push(statement);
            }
        }

        if (statements.length === 0) {
            logger.warn('No WGSL statements produced from DSL. Emitting identity shader.');
        }

        const inputFields =
            inputs.length > 0
                ? inputs.map(k => `${k}: f32,`).join('\n  ')
                : 'dummy: f32,';

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
};

@group(0) @binding(0) var<storage, read_write> agents : array<Agent>;`.trim();

        const mainBody = statements.length > 0 ? statements.join('\n        ') : '// no-op';

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
        ${mainBody}
        agents[i] = agent;
    }
}`.trim();

        return [agentStruct, inputStruct, computeFn].join('\n\n');
    }

    // Generate structs
    const inputFields =
        inputs.length > 0
            ? inputs.map(k => `    ${k}: f32,`).join('\n')
            : '    dummy: f32,';

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
};

@group(0) @binding(0) var<storage, read_write> agents : array<Agent>;`.trim();

    const mainBody = boidStatements.join('\n        ');

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
        
        ${mainBody}
        
        agents[i] = agent;
    }
}`.trim();

    logger?.info?.('Generated boids-style WGSL shader');

    return [agentStruct, inputStruct, computeFn].join('\n\n');
};
