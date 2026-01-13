import Logger from "../helpers/logger";
import { DSLParser, type CommandMap, type LineInfo } from "./parser";

export const WORKGROUP_SIZE = 64;

const COMMANDS: CommandMap = {
    moveUp: 'y = y - {arg};',
    moveDown: 'y = y + {arg};',
    moveLeft: 'x = x - {arg};',
    moveRight: 'x = x + {arg};',
    addVelocityX: 'vx = vx + {arg};',
    addVelocityY: 'vy = vy + {arg};',
    setVelocityX: 'vx = {arg};',
    setVelocityY: 'vy = {arg};',
    updatePosition: 'let _dt_up = {arg}; let _dx_mf_t1 = vx * _dt_up; let _dy_mf_t1 = vy * _dt_up; x = x + _dx_mf_t1; y = y + _dy_mf_t1;',
    borderWrapping: 'if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }',
    borderBounce: 'if (x < 0.0 || x >= inputs.width) { vx = -vx; } if (y < 0.0 || y >= inputs.height) { vy = -vy; } x = clamp(x, 0.0, inputs.width); y = clamp(y, 0.0, inputs.height);',
    limitSpeed: 'let _spd_ls = {arg}; let _spd_ls2 = _spd_ls * _spd_ls; let _vx2_ls = vx * vx; let _vy2_ls = vy * vy; let _cur_ls2 = _vx2_ls + _vy2_ls; if (_cur_ls2 > _spd_ls2) { let _scale_ls = sqrt(_spd_ls2 / _cur_ls2); vx = vx * _scale_ls; vy = vy * _scale_ls; }',
    turn: 'let _ang_t = {arg}; let _c_t = cos(_ang_t); let _s_t = sin(_ang_t); let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;',
    turnPrecomputed: 'let _c_t = {arg0}; let _s_t = {arg1}; let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;',
    moveForward: 'let _dist_mf = {arg}; let _dx_mf_t2 = vx * _dist_mf; let _dy_mf_t2 = vy * _dist_mf;  x = x + _dx_mf_t2; y = y + _dy_mf_t2;',
    deposit: '_deposit(x, y, {arg});',
    sense: '_sense(x, y, vx, vy, {arg})', // Templated call
    enableTrails: '', // Configuration only
    print: 'agentLogs[i] = vec2<f32>(1.0, {arg});',
};

const WGSL_HELPERS = `


fn _sense(x: f32, y: f32, vx: f32, vy: f32, angle_offset: f32, dist: f32) -> f32 {
    // Match JS: const currentAngle = f(Math.atan2(vy, vx));
    let angle_cur = atan2(vy, vx);
    
    // Match JS: const angle = f(currentAngle + ao);
    let angle_new = angle_cur + angle_offset;
    
    // Match JS: const sx = f(x + f(f(Math.cos(angle)) * dist));
    let cos_val = cos(angle_new);
    let cos_times_dist = cos_val * dist;
    let sx = x + cos_times_dist;
    
    // Match JS: const sy = f(y + f(f(Math.sin(angle)) * dist));
    let sin_val = sin(angle_new);
    let sin_times_dist = sin_val * dist;
    let sy = y + sin_times_dist;

    let w = inputs.width;
    let h = inputs.height;

    // Wrap coordinates - use i32() which is equivalent to Math.trunc
    var ix = i32(sx);
    var iy = i32(sy);

    if (ix < 0) { ix = ix + i32(w); }
    if (ix >= i32(w)) { ix = ix - i32(w); }
    if (iy < 0) { iy = iy + i32(h); }
    if (iy >= i32(h)) { iy = iy - i32(h); }

    let idx = u32(iy * i32(w) + ix);
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
    let fixed_amount = i32(amount * 1000000.0);
    atomicAdd(& trailMapWrite[idx], fixed_amount);
}
`;

/**
 * Context for tracking variable metadata during WGSL compilation
 */
interface WGSLContext {
    variables: Map<string, VariableInfo>;
    loopDepth: number;
    currentLoopVar?: string;
    randomInputs: Set<string>;
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

    // Replace loop variable property access if active
    if (context.currentLoopVar) {
        const regex = new RegExp(`\\b${context.currentLoopVar}\\.(\\w+)`, 'g');
        result = result.replace(regex, '_loop_other.$1');
    }

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
            return `${varName} _count`;
        }
        return `${varName} _count`;
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
        const regex = new RegExp(`\\b${prop} \\b(?!_)`, 'g');
        result = result.replace(regex, (match, offset) => {
            // Don't replace if it's part of another identifier or property access
            const before = offset > 0 ? result[offset - 1] : '';

            // Skip if it's part of a property access (e.g., other.x)
            if (before === '.') return match;

            // Skip if it's a tracked variable (e.g., neighbor_x)
            if (context.variables.has(match)) return match;

            // Add agent. prefix
            return `agent.${match} `;
        });
    }

    // Handle sense() calls in expressions
    result = result.replace(/sense\(([^)]+)\)/g, (_match, args) => {
        const parts = args.split(',').map((s: string) => s.trim());
        const angle = transpileExpression(parts[0], context);
        const dist = transpileExpression(parts[1], context);
        return `_sense(agent.x, agent.y, agent.vx, agent.vy, ${angle}, ${dist})`;
    });

    // Handle inputs.randomValues[id] special case
    result = result.replace(/inputs\.randomValues\[([^\]]+)\]/g, 'randomValues[u32($1)]');
    // inputs.random sugar -> randomValues[id]
    result = result.replace(/inputs\.random\b/g, 'randomValues[u32(agent.id)]');

    result = result.replace(/inputs\.randomValues/g, 'randomValues'); // simplified if just array passed? no, array access needed.

    // Replace inputs.r with r if r is a random input
    if (context.randomInputs.size > 0) {
        // We use a regex to match inputs.NAME
        result = result.replace(/inputs\.(\w+)/g, (match, name) => {
            if (context.randomInputs.has(name)) {
                return name;
            }
            return match;
        });
    }

    return result;
}

/**
 * Transpiles a single line of DSL to WGSL
 */
function transpileLine(line: string, context: WGSLContext): string[] {
    const parsed = DSLParser.parseDSLLine(line);
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
                statements.push(`for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {`);
                statements.push(`if (_ni == i) { continue; }`);
                statements.push(`let other = agentsRead[_ni];`);
                statements.push(`let dx = x - other.x;`);
                statements.push(`let dy = y - other.y;`);
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

        case 'foreach': {
            const collection = parsed.collection;
            const loopVar = parsed.varName;
            const collectionInfo = context.variables.get(collection);

            if (collectionInfo?.type === 'neighbors') {
                const radiusExpr = collectionInfo.radiusExpr!;

                context.currentLoopVar = loopVar;
                context.loopDepth++;

                statements.push(`// Foreach over ${collection}`);
                statements.push(`for (var _ni: u32 = 0u; _ni < u32(inputs.agentCount); _ni++) {`);
                statements.push(`if (_ni == i) { continue; }`);
                statements.push(`let _loop_other = agentsRead[_ni];`);
                statements.push(`let _loop_dx = x - _loop_other.x;`);
                statements.push(`let _loop_dy = y - _loop_other.y;`);
                statements.push(`let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);`);
                statements.push(`if (_loop_dist >= ${radiusExpr}) { continue; }`);
                return statements;
            }
            return [];
        }

        case 'if': {
            let condition = transpileExpression(parsed.condition, context);

            // Fix type consistency: if comparing a _count variable (u32) with 0, use 0u
            condition = condition.replace(/(\w+_count)\s*>\s*0\b/g, '$1 > 0u');

            statements.push(`if (${condition}) {`);
            return statements;
        }

        case 'elseif': {
            let condition = transpileExpression(parsed.condition, context);
            // Fix type consistency: if comparing a _count variable (u32) with 0, use 0u
            condition = condition.replace(/(\w+_count)\s*>\s*0\b/g, '$1 > 0u');
            statements.push(`else if (${condition}) {`);
            return statements;
        }

        case 'else': {
            statements.push('else {');
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
                    statements.push(`let _loop_dx = x - _loop_other.x;`);
                    statements.push(`let _loop_dy = y - _loop_other.y;`);
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
                // If it's one of the local agent properties, assign directly to the local variable
                statements.push(`${target} = ${transpiled};`);
            } else {
                // Otherwise, it's a regular variable or an agent property that needs 'agent.' prefix
                // (e.g., agent.id, or a new variable)
                statements.push(`${target} = ${transpiled};`);
            }
            return statements;
        }

        case 'command': {
            if (COMMANDS[parsed.command] !== undefined) {
                // Handle sense command specially to account for 2 args
                if (parsed.command === 'sense') {
                    // sense(angle, dist) -> we need to split args
                    // This is hacky because parseCommand only extracts one argument string "a, b"
                    const args = parsed.argument.split(',').map(s => s.trim());
                    const angleArg = transpileExpression(args[0], context);
                    const distArg = transpileExpression(args[1], context);
                    // _sense(x, y, vx, vy, angle, dist)
                    const result = `_sense(agent.x, agent.y, agent.vx, agent.vy, ${angleArg}, ${distArg})`;
                    statements.push(result); // This pushes the expression as a statement? No wait, sense returns a value.
                    // sense is an expression, not a command usually. 
                    // BUT parseCommandLine detects it as a command if it starts with sense(...)
                    // TranspileExpression also handles it?
                    // DSLParser.ts parses lines. If `var s = sense(...)` it is parsed as var.
                    // If `sense(...)` is a statement (unused return), it hits here.
                    // But sense is used in assignments.
                    return statements;
                }

                const template = COMMANDS[parsed.command];
                const arg = transpileExpression(parsed.argument, context);
                const result = DSLParser.applyCommandTemplate(template, arg);
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
function parseBoidsDSL(lines: LineInfo[], logger: Logger, rawScript: string, randomInputs: string[]): string[] {
    const statements: string[] = [];
    const context: WGSLContext = {
        variables: new Map(),
        loopDepth: 0,
        randomInputs: new Set(randomInputs)
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
            const parsed = DSLParser.parseDSLLine(trimmed);
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

export const compileDSLtoWGSL = (lines: LineInfo[], inputs: string[], logger: Logger, rawScript: string, randomInputs: string[] = []): string => {
    // Try new parser for boids-style DSL
    const boidStatements = parseBoidsDSL(lines, logger, rawScript, randomInputs);

    // Identify scalar inputs vs buffer inputs
    const bufferInputs = ['trailMap', 'randomValues'];
    const scalarInputs = inputs.filter(i => !bufferInputs.includes(i));
    const hasTrailMap = inputs.includes('trailMap');
    const hasRandomValues = inputs.includes('randomValues');

    // Generate structs
    const inputFields = scalarInputs.map(k => `    ${k}: f32,`).join('\n');

    const inputStruct = `
struct Inputs {
    agentCount: f32,
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

@group(0) @binding(0) var<storage, read_write> agents : array<Agent>;
@group(0) @binding(5) var<storage, read> agentsRead : array<Agent>;
@group(0) @binding(6) var<storage, read_write> agentLogs : array<vec2<f32>>;`.trim();

    // Separate trail map bindings for double-buffering
    const trailMapReadBinding = hasTrailMap
        ? `@group(0) @binding(2) var<storage, read> trailMapRead : array<f32>;`
        : '';

    const trailMapWriteBinding = hasTrailMap
        ? `@group(0) @binding(4) var<storage, read_write> trailMapWrite : array<atomic<i32>>;`
        : '';

    const randomValuesBinding = hasRandomValues
        ? `@group(0) @binding(3) var<storage, read> randomValues : array<f32>;`
        : '';

    // If no boid statements (and also no fallback needed really as boid parser covers all),
    // we just use what we have. If empty, it's a no-op shader.
    // The old command-based parser text was confusing and redundant.

    // If boidStatements is empty but we have lines, maybe try the legacy parsing? 
    // But boid parser builds on the same logic so it should be fine.
    // The only case parseBoidsDSL returns empty is if there are no lines or errors.

    // Fallback for simple command list without braces if needed, but slime.ts and boids.ts use braces/structure.
    // If specific lines fail in parseBoidsDSL, they are skipped/logged.

    let mainBody = boidStatements.join('\n        ');
    if (boidStatements.length === 0 && lines.length > 0) {
        // Try simple command parsing for legacy specific lines if parseBoidsDSL didn't catch them
        // (Actually parseBoidsDSL calls transpileLine which handles commands, so it should be fine)
        mainBody = '// no-op or failed to parse';
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
        var x = agent.x;
        var y = agent.y;
        var vx = agent.vx;
        var vy = agent.vy;
        
        // Load random values based on agent.id for parity with JS
        ${randomInputs.map(r => `var ${r} = randomValues[u32(agent.id)];`).join('\n        ')}
        
        ${mainBody}
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agents[i] = agent;
    }
}`.trim();

    const helpers = hasTrailMap ? WGSL_HELPERS : '';

    return [agentStruct, inputStruct, trailMapReadBinding, trailMapWriteBinding, randomValuesBinding, helpers, computeFn].join('\n\n');
};
