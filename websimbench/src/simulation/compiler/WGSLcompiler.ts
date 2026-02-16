/**
 * WGSL Compiler Target
 * 
 * Implements the CompilerTarget interface for WebGPU Shading Language output.
 * Uses regex-based expression transpilation for WGSL-specific syntax.
 */

import Logger from "../helpers/logger";
import type { CommandMap, LineInfo, AVAILABLE_COMMANDS } from "./parser";
import { DSLParser } from "./parser";
import type { CompilerTarget, CompilationContext } from './compilerTarget';
import { createContext } from './compilerTarget';
import { transpileDSL } from './transpiler';

export const WORKGROUP_SIZE = 64;

// ─── WGSL Command Templates ─────────────────────────────────────────

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
    moveForward: 'let _dist_mf = {arg}; let _dx_mf_t2 = vx * _dist_mf; let _dy_mf_t2 = vy * _dist_mf;  x = x + _dx_mf_t2; y = y + _dy_mf_t2;',
    deposit: '_deposit(x, y, {arg});',
    sense: '_sense(x, y, vx, vy, {arg})', // Templated call
    enableTrails: '', // Configuration only
    print: 'agentLogs[i] = vec2<f32>(1.0, {arg});',
    species: '', // Configuration only
    avoidObstacles: '', // JS-only for now
};

// ─── WGSL Helper Functions ───────────────────────────────────────────

const WGSL_HELPERS = `


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

// ─── Expression Transpilation ────────────────────────────────────────

/**
 * Transpiles expressions to WGSL syntax
 */
function transpileExpression(expr: string, ctx: CompilationContext): string {
    let result = expr.trim();

    // Handle numeric literals - ensure they are floats for WGSL
    if (/^-?\d+(\.\d+)?$/.test(result)) {
        return result.includes('.') ? result : `${result}.0`;
    }

    // Handle species
    if (result === 'species') return 'species';
    if (result.includes('_species')) return result;

    // Replace ^ with * for exponentiation
    result = result.replace(/([\w.]+)\^2/g, '($1)*($1)');
    result = result.replace(/\^/g, '**');

    // Replace loop variable property access if active
    if (ctx.currentLoopVar) {
        const regex = new RegExp(`\\b${ctx.currentLoopVar}\\.(\\w+)`, 'g');
        result = result.replace(regex, '_loop_other.$1');
    }

    // Handle property access on tracked variables
    const propAccessMatch = result.match(/^(\w+)\.(\w+)$/);
    if (propAccessMatch) {
        const varName = propAccessMatch[1];
        const prop = propAccessMatch[2];
        const varInfo = ctx.variables.get(varName);
        if (varInfo?.type === 'neighbors') {
            return `/* ERROR: Cannot access ${varName}.${prop} directly in WGSL */`;
        }
    }

    // Replace .length with _count suffix for neighbor arrays
    result = result.replace(/(\w+)\.length/g, (_, varName) => {
        return `${varName}_count`;
    });

    // Handle sqrt()
    result = result.replace(/sqrt\(([^)]+)\)/g, (_match, arg) => {
        const transpiledArg = transpileExpression(arg, ctx);
        return `sqrt(${transpiledArg})`;
    });

    // Handle sense() calls in expressions
    result = result.replace(/sense\(([^)]+)\)/g, (_match, args) => {
        const parts = args.split(',').map((s: string) => s.trim());
        const angle = transpileExpression(parts[0], ctx);
        const dist = transpileExpression(parts[1], ctx);
        return `_sense(agent.x, agent.y, agent.vx, agent.vy, ${angle}, ${dist})`;
    });

    // Handle inputs.randomValues[id] special case
    result = result.replace(/inputs\.randomValues\[([^\]]+)\]/g, 'randomValues[u32($1)]');
    result = result.replace(/inputs\.random\b/g, 'randomValues[u32(agent.id)]');
    result = result.replace(/inputs\.randomValues/g, 'randomValues');

    // Handle random() calls
    result = result.replace(/random\(([^)]*)\)/g, (_match, args) => {
        const parts = args.split(',').filter((s: string) => s.trim().length > 0).map((s: string) => s.trim());
        const randVal = 'randomValues[u32(agent.id)]';

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

    // Bare integers → float
    if (/^\d+$/.test(result)) {
        return result + ".0";
    }

    // Replace inputs.NAME with NAME if it's a random input
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

// ─── WGSL Target Implementation ─────────────────────────────────────

export const WGSLTarget: CompilerTarget = {
    name: 'wgsl',
    commands: COMMANDS,

    emitExpression(expr: string, ctx: CompilationContext): string {
        return transpileExpression(expr, ctx);
    },

    emitVar(name: string, expression: string, ctx: CompilationContext): string[] {
        // Check for array indexing like nearbyAgents[i].x
        const arrayAccessMatch = expression.match(/(\w+)\[(\w+)\]\.(\w+)/);
        if (arrayAccessMatch) {
            let expr = expression;
            if (ctx.loopDepth > 0) {
                expr = expr.replace(
                    /(\w+)\[(\w+)\]\.(\w+)/g,
                    '_loop_other.$3'
                );
            }
            const transpiled = transpileExpression(expr, ctx);
            ctx.variables.set(name, { type: 'scalar' });
            return [`var ${name}: f32 = ${transpiled};`];
        }

        // Regular variable assignment
        const transpiled = transpileExpression(expression, ctx);
        ctx.variables.set(name, { type: 'scalar' });
        return [`var ${name}: f32 = ${transpiled};`];
    },

    emitIf(condition: string, ctx: CompilationContext): string[] {
        let cond = transpileExpression(condition, ctx);
        // Fix type consistency: _count (u32) vs 0
        cond = cond.replace(/(\w+_count)\s*>\s*0\b/g, '$1 > 0u');
        return [`if (${cond}) {`];
    },

    emitElseIf(condition: string, ctx: CompilationContext): string[] {
        let cond = transpileExpression(condition, ctx);
        cond = cond.replace(/(\w+_count)\s*>\s*0\b/g, '$1 > 0u');
        return [`else if (${cond}) {`];
    },

    emitElse(_ctx: CompilationContext): string[] {
        return ['else {'];
    },

    emitFor(init: string, condition: string, increment: string, ctx: CompilationContext): string[] {
        // Handle for loops over neighbor arrays
        const lengthMatch = condition.match(/(\w+)\s*<\s*(\w+)\.length/);
        if (lengthMatch) {
            const loopVar = lengthMatch[1];
            const collection = lengthMatch[2];
            const collectionInfo = ctx.variables.get(collection);

            if (collectionInfo?.type === 'neighbors') {
                const radiusExpr = collectionInfo.radiusExpr!;
                const uniqueLoopVar = `_${loopVar}_loop`;
                ctx.currentLoopVar = uniqueLoopVar;
                ctx.loopDepth++;

                return [
                    `// Loop over ${collection}`,
                    `for (var ${uniqueLoopVar}: u32 = 0u; ${uniqueLoopVar} < arrayLength(&agents); ${uniqueLoopVar}++) {`,
                    `if (${uniqueLoopVar} == i) { continue; }`,
                    `let _loop_other = agents[${uniqueLoopVar}];`,
                    `let _loop_dx = x - _loop_other.x;`,
                    `let _loop_dy = y - _loop_other.y;`,
                    `let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);`,
                    `if (_loop_dist >= ${radiusExpr}) { continue; }`,
                    `// Nearby agent found - execute loop body`,
                ];
            }
        }

        // Regular for loop
        const jsInit = init.replace(/^var\s+/, '');
        const cond = transpileExpression(condition, ctx);
        ctx.loopDepth++;
        return [`for (var ${jsInit}; ${cond}; ${increment}) {`];
    },

    emitForeach(collection: string, varName: string | undefined, _itemAlias: string | undefined, ctx: CompilationContext): string[] {
        const loopVar = varName || _itemAlias;
        const collectionInfo = ctx.variables.get(collection);

        if (collectionInfo?.type === 'neighbors' && loopVar) {
            const radiusExpr = collectionInfo.radiusExpr!;
            ctx.currentLoopVar = loopVar;
            ctx.loopDepth++;

            return [
                `// Foreach over ${collection}`,
                `for (var _ni: u32 = 0u; _ni < arrayLength(&agentsRead); _ni++) {`,
                `if (_ni == i) { continue; }`,
                `let _loop_other = agentsRead[_ni];`,
                `let _loop_dx = x - _loop_other.x;`,
                `let _loop_dy = y - _loop_other.y;`,
                `let _loop_dist = sqrt(_loop_dx*_loop_dx + _loop_dy*_loop_dy);`,
                `if (_loop_dist >= ${radiusExpr}) { continue; }`,
            ];
        }
        return [];
    },

    emitAssignment(target: string, expression: string, ctx: CompilationContext): string[] {
        let expr = expression;
        if (ctx.loopDepth > 0) {
            expr = expr.replace(
                /(\w+)\[(\w+)\]\.(\w+)/g,
                '_loop_other.$3'
            );
        }
        const transpiled = transpileExpression(expr, ctx);
        return [`${target} = ${transpiled};`];
    },

    emitCommand(command: AVAILABLE_COMMANDS, argument: string, ctx: CompilationContext): string[] {
        if (COMMANDS[command] === undefined) return [];

        // Handle sense command specially for 2 args
        if (command === 'sense') {
            const args = argument.split(',').map(s => s.trim());
            const angleArg = transpileExpression(args[0], ctx);
            const distArg = transpileExpression(args[1], ctx);
            return [`_sense(x, y, vx, vy, ${angleArg}, ${distArg})`];
        }

        const template = COMMANDS[command];
        if (!template) return [];
        const arg = transpileExpression(argument, ctx);
        const result = DSLParser.applyCommandTemplate(template, arg);
        return [result];
    },

    emitCloseBrace(ctx: CompilationContext): string[] {
        if (ctx.loopDepth > 0) {
            ctx.loopDepth--;
            if (ctx.loopDepth === 0) ctx.currentLoopVar = undefined;
        }
        return ['}'];
    },

    emitProgram(statements: string[], inputs: string[], randomInputs: string[], _ctx: CompilationContext): string {
        // Identify scalar inputs vs buffer inputs
        const bufferInputs = ['trailMap', 'randomValues'];
        const scalarInputs = inputs.filter(i => !bufferInputs.includes(i));
        const hasTrailMap = inputs.includes('trailMap');
        const hasRandomValues = inputs.includes('randomValues');

        // Generate structs
        const inputFields =
            scalarInputs.length > 0
                ? scalarInputs.map(k => `    ${k}: f32,`).join('\n')
                : '    _dummy: f32,';

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

        const trailMapReadBinding = hasTrailMap
            ? `@group(0) @binding(2) var<storage, read> trailMapRead : array<f32>;`
            : '';
        const trailMapWriteBinding = hasTrailMap
            ? `@group(0) @binding(4) var<storage, read_write> trailMapWrite : array<atomic<i32>>;`
            : '';
        const randomValuesBinding = hasRandomValues
            ? `@group(0) @binding(3) var<storage, read> randomValues : array<f32>;`
            : '';

        let mainBody = statements.join('\n        ');
        if (statements.length === 0) {
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
        var species = agent.species;
        
        // Load random values based on agent.id for parity with JS
        ${randomInputs.map(r => `var ${r} = randomValues[u32(agent.id)];`).join('\n        ')}
        
        ${mainBody}
        
        agent.x = x;
        agent.y = y;
        agent.vx = vx;
        agent.vy = vy;
        agent.species = species;
        agents[i] = agent;
    }
}`.trim();

        const helpers = hasTrailMap ? WGSL_HELPERS : '';

        return [agentStruct, inputStruct, trailMapReadBinding, randomValuesBinding, trailMapWriteBinding, helpers, computeFn].join('\n\n');
    },
};

// ─── Entry Point ─────────────────────────────────────────────────────

export const compileDSLtoWGSL = (
    lines: LineInfo[],
    inputs: string[],
    logger: Logger,
    rawScript: string,
    randomInputs: string[] = [],
): string => {
    const ctx = createContext(randomInputs);
    const statements = transpileDSL(lines, WGSLTarget, logger, rawScript, ctx);

    return WGSLTarget.emitProgram(statements, inputs, randomInputs, ctx);
};
