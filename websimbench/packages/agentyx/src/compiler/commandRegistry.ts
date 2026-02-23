/**
 * @module commandRegistry
 * Centralised DSL command handling.
 *
 * Each DSL command is registered here with per-target code generation,
 * mirroring the {@link functionRegistry} pattern. This replaces the
 * per-compiler `CommandMap` string templates.
 */

import type { CompilerTarget, CompilationContext } from "./compilerTarget";
import type { AVAILABLE_COMMANDS } from "./parser";

// ─── DSL Command Definition ─────────────────────────────────────────

export interface DSLCommand {
  /** Command name in the DSL (must match AVAILABLE_COMMANDS) */
  name: AVAILABLE_COMMANDS;
  /** Emit target-specific code for this command invocation */
  emit(
    argument: string,
    target: CompilerTarget,
    ctx: CompilationContext,
  ): string[];
}

// ─── Registry ────────────────────────────────────────────────────────

const COMMANDS = new Map<string, DSLCommand>();

export function registerCommand(cmd: DSLCommand): void {
  COMMANDS.set(cmd.name, cmd);
}

/**
 * Emit code for a command invocation.
 * Returns the target-specific statements, or null if unrecognized.
 */
export function emitCommand(
  command: AVAILABLE_COMMANDS,
  argument: string,
  target: CompilerTarget,
  ctx: CompilationContext,
): string[] | null {
  const cmd = COMMANDS.get(command);
  if (!cmd) return null;
  return cmd.emit(argument, target, ctx);
}

// ─── Helper ──────────────────────────────────────────────────────────

/** Shorthand: emit the argument as a target expression */
function arg(
  argument: string,
  target: CompilerTarget,
  ctx: CompilationContext,
): string {
  return target.emitExpression(argument, ctx);
}

// ─── Movement Commands ───────────────────────────────────────────────

registerCommand({
  name: "moveUp",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`y = f(y - ${a});`];
    if (target.name === "wgsl") return [`y = y - ${a};`];
    return [`(local.set $y (f32.sub (local.get $y) ${a}))`];
  },
});

registerCommand({
  name: "moveDown",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`y = f(y + ${a});`];
    if (target.name === "wgsl") return [`y = y + ${a};`];
    return [`(local.set $y (f32.add (local.get $y) ${a}))`];
  },
});

registerCommand({
  name: "moveLeft",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`x = f(x - ${a});`];
    if (target.name === "wgsl") return [`x = x - ${a};`];
    return [`(local.set $x (f32.sub (local.get $x) ${a}))`];
  },
});

registerCommand({
  name: "moveRight",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`x = f(x + ${a});`];
    if (target.name === "wgsl") return [`x = x + ${a};`];
    return [`(local.set $x (f32.add (local.get $x) ${a}))`];
  },
});

registerCommand({
  name: "moveForward",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js")
      return [`x = f(x + f(vx * ${a})); y = f(y + f(vy * ${a}));`];
    if (target.name === "wgsl")
      return [
        `let _dist_mf = ${a}; let _dx_mf_t2 = vx * _dist_mf; let _dy_mf_t2 = vy * _dist_mf;  x = x + _dx_mf_t2; y = y + _dy_mf_t2;`,
      ];
    return [
      `(local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) ${a})))`,
      `(local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) ${a})))`,
    ];
  },
});

registerCommand({
  name: "updatePosition",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js")
      return [`x = f(x + f(vx * ${a})); y = f(y + f(vy * ${a}));`];
    if (target.name === "wgsl")
      return [
        `let _dt_up = ${a}; let _dx_mf_t1 = vx * _dt_up; let _dy_mf_t1 = vy * _dt_up; x = x + _dx_mf_t1; y = y + _dy_mf_t1;`,
      ];
    return [
      `(local.set $x (f32.add (local.get $x) (f32.mul (local.get $vx) ${a})))`,
      `(local.set $y (f32.add (local.get $y) (f32.mul (local.get $vy) ${a})))`,
    ];
  },
});

// ─── Velocity Commands ───────────────────────────────────────────────

registerCommand({
  name: "addVelocityX",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`vx = f(vx + ${a});`];
    if (target.name === "wgsl") return [`vx = vx + ${a};`];
    return [`(local.set $vx (f32.add (local.get $vx) ${a}))`];
  },
});

registerCommand({
  name: "addVelocityY",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`vy = f(vy + ${a});`];
    if (target.name === "wgsl") return [`vy = vy + ${a};`];
    return [`(local.set $vy (f32.add (local.get $vy) ${a}))`];
  },
});

registerCommand({
  name: "setVelocityX",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`vx = f(${a});`];
    if (target.name === "wgsl") return [`vx = ${a};`];
    return [`(local.set $vx ${a})`];
  },
});

registerCommand({
  name: "setVelocityY",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`vy = f(${a});`];
    if (target.name === "wgsl") return [`vy = ${a};`];
    return [`(local.set $vy ${a})`];
  },
});

registerCommand({
  name: "limitSpeed",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") {
      return [
        `const __speed2 = f(f(vx*vx) + f(vy*vy)); if (__speed2 > f(${a}*${a})) { const __scale = f(Math.sqrt(f(f(${a}*${a}) / __speed2))); vx = f(vx * __scale); vy = f(vy * __scale); }`,
      ];
    }
    if (target.name === "wgsl") {
      return [
        `let _spd_ls = ${a}; let _spd_ls2 = _spd_ls * _spd_ls; let _vx2_ls = vx * vx; let _vy2_ls = vy * vy; let _cur_ls2 = _vx2_ls + _vy2_ls; if (_cur_ls2 > _spd_ls2) { let _scale_ls = sqrt(_spd_ls2 / _cur_ls2); vx = vx * _scale_ls; vy = vy * _scale_ls; }`,
      ];
    }
    // WAT
    ctx.localVars.add("__speed2");
    ctx.localVars.add("__scale");
    return [
      `(local.set $__speed2 (f32.add (f32.mul (local.get $vx) (local.get $vx)) (f32.mul (local.get $vy) (local.get $vy))))`,
      `(if (f32.gt (local.get $__speed2) (f32.mul ${a} ${a})) (then`,
      `  (local.set $__scale (f32.sqrt (f32.div (f32.mul ${a} ${a}) (local.get $__speed2))))`,
      `  (local.set $vx (f32.mul (local.get $vx) (local.get $__scale)))`,
      `  (local.set $vy (f32.mul (local.get $vy) (local.get $__scale)))`,
      `))`,
    ];
  },
});

// ─── Rotation Commands ───────────────────────────────────────────────

registerCommand({
  name: "turn",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") {
      return [
        `const __c = f(Math.cos(${a})); const __s = f(Math.sin(${a})); const __vx = f(f(vx * __c) - f(vy * __s)); vy = f(f(vx * __s) + f(vy * __c)); vx = __vx;`,
      ];
    }
    if (target.name === "wgsl") {
      return [
        `let _ang_t = ${a}; let _c_t = cos(_ang_t); let _s_t = sin(_ang_t); let _term1_t = vx * _c_t; let _term2_t = vy * _s_t; let _term3_t = vx * _s_t; let _term4_t = vy * _c_t; let _vx_new_t = _term1_t - _term2_t; let _vy_new_t = _term3_t + _term4_t; vx = _vx_new_t; vy = _vy_new_t;`,
      ];
    }
    // WAT
    ctx.localVars.add("__c");
    ctx.localVars.add("__s");
    ctx.localVars.add("__vx");
    return [
      `(local.set $__c (call $cos ${a}))`,
      `(local.set $__s (call $sin ${a}))`,
      `(local.set $__vx (f32.sub (f32.mul (local.get $vx) (local.get $__c)) (f32.mul (local.get $vy) (local.get $__s))))`,
      `(local.set $vy (f32.add (f32.mul (local.get $vx) (local.get $__s)) (f32.mul (local.get $vy) (local.get $__c))))`,
      `(local.set $vx (local.get $__vx))`,
    ];
  },
});

// ─── Boundary Commands ───────────────────────────────────────────────

registerCommand({
  name: "borderWrapping",
  emit(_argument, target, _ctx) {
    // All targets must use consistent >= for upper bound to ensure parity
    // (position == width means agent is at the edge and should wrap to 0)
    if (target.name === "js") {
      return [
        `if (x < 0) x = f(x + f(inputs.width)); if (x >= f(inputs.width)) x = f(x - f(inputs.width)); if (y < 0) y = f(y + f(inputs.height)); if (y >= f(inputs.height)) y = f(y - f(inputs.height));`,
      ];
    }
    if (target.name === "wgsl") {
      return [
        `if (x < 0.0) { x = x + inputs.width; } if (x >= inputs.width) { x = x - inputs.width; } if (y < 0.0) { y = y + inputs.height; } if (y >= inputs.height) { y = y - inputs.height; }`,
      ];
    }
    // WAT
    return [
      `(if (f32.lt (local.get $x) (f32.const 0)) (then (local.set $x (f32.add (local.get $x) (global.get $inputs_width)))))`,
      `(if (f32.ge (local.get $x) (global.get $inputs_width)) (then (local.set $x (f32.sub (local.get $x) (global.get $inputs_width)))))`,
      `(if (f32.lt (local.get $y) (f32.const 0)) (then (local.set $y (f32.add (local.get $y) (global.get $inputs_height)))))`,
      `(if (f32.ge (local.get $y) (global.get $inputs_height)) (then (local.set $y (f32.sub (local.get $y) (global.get $inputs_height)))))`,
    ];
  },
});

registerCommand({
  name: "borderBounce",
  emit(_argument, target, _ctx) {
    if (target.name === "js") {
      return [
        `if (x < 0 || x > f(inputs.width)) vx = f(-vx); if (y < 0 || y > f(inputs.height)) vy = f(-vy); x = f(Math.max(0, Math.min(f(inputs.width), x))); y = f(Math.max(0, Math.min(f(inputs.height), y)));`,
      ];
    }
    if (target.name === "wgsl") {
      return [
        `if (x < 0.0 || x >= inputs.width) { vx = -vx; } if (y < 0.0 || y >= inputs.height) { vy = -vy; } x = clamp(x, 0.0, inputs.width); y = clamp(y, 0.0, inputs.height);`,
      ];
    }
    // WAT
    return [
      `(if (i32.or (f32.lt (local.get $x) (f32.const 0)) (f32.gt (local.get $x) (global.get $inputs_width))) (then (local.set $vx (f32.neg (local.get $vx)))))`,
      `(if (i32.or (f32.lt (local.get $y) (f32.const 0)) (f32.gt (local.get $y) (global.get $inputs_height))) (then (local.set $vy (f32.neg (local.get $vy)))))`,
      `(local.set $x (f32.max (f32.const 0) (f32.min (global.get $inputs_width) (local.get $x))))`,
      `(local.set $y (f32.max (f32.const 0) (f32.min (global.get $inputs_height) (local.get $y))))`,
    ];
  },
});

// ─── Trail Commands ──────────────────────────────────────────────────

registerCommand({
  name: "deposit",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js") return [`_deposit(${a});`];
    if (target.name === "wgsl") return [`_deposit(x, y, ${a});`];
    return [`(call $deposit (local.get $x) (local.get $y) ${a})`];
  },
});

registerCommand({
  name: "sense",
  emit(argument, target, ctx) {
    const args = argument.split(",").map((s) => s.trim());
    const angle = target.emitExpression(args[0], ctx);
    const dist = target.emitExpression(args[1], ctx);
    if (target.name === "js") return [`_sense(${angle}, ${dist})`];
    if (target.name === "wgsl")
      return [`_sense(x, y, vx, vy, ${angle}, ${dist})`];
    return [`(call $sense ${angle} ${dist})`];
  },
});

// ─── Config-Only Commands ────────────────────────────────────────────

registerCommand({
  name: "enableTrails",
  emit(_argument, target, _ctx) {
    if (target.name === "wat") return ["nop"];
    return []; // Config only — processed at preprocessing stage
  },
});

registerCommand({
  name: "species",
  emit(_argument, target, _ctx) {
    if (target.name === "wat") return ["nop"];
    return []; // Config only
  },
});

registerCommand({
  name: "avoidObstacles",
  emit(argument, target, ctx) {
    const a = argument.trim()
      ? arg(argument, target, ctx)
      : arg("1.0", target, ctx);
    if (target.name === "js") return [`_avoidObstacles(${a});`];
    if (target.name === "wgsl")
      return [`_avoidObstacles(${a}, &x, &y, &vx, &vy);`];
    if (target.name === "wat") {
      // WAT: call the avoidObstacles function, passing strength, then reload modified vx/vy
      ctx.localVars.add("_obs_idx");
      ctx.localVars.add("_obs_ptr");
      ctx.localVars.add("_obs_x");
      ctx.localVars.add("_obs_y");
      ctx.localVars.add("_obs_w");
      ctx.localVars.add("_obs_h");
      ctx.localVars.add("_obs_cx");
      ctx.localVars.add("_obs_cy");
      ctx.localVars.add("_obs_dx");
      ctx.localVars.add("_obs_dy");
      ctx.localVars.add("_obs_dist");
      return [
        `;; avoidObstacles (strength=${a})`,
        `(local.set $_obs_idx (i32.const 0))`,
        `(local.set $_obs_ptr (global.get $obstaclesPtr))`,
        `(block $_obs_exit`,
        `  (loop $_obs_loop`,
        `    (br_if $_obs_exit (i32.ge_u (local.get $_obs_idx) (global.get $inputs_obstacleCount)))`,
        `    (local.set $_obs_x (f32.load (local.get $_obs_ptr)))`,
        `    (local.set $_obs_y (f32.load (i32.add (local.get $_obs_ptr) (i32.const 4))))`,
        `    (local.set $_obs_w (f32.load (i32.add (local.get $_obs_ptr) (i32.const 8))))`,
        `    (local.set $_obs_h (f32.load (i32.add (local.get $_obs_ptr) (i32.const 12))))`,
        `    ;; Check if agent is inside obstacle + 5px margin`,
        `    (if (i32.and`,
        `      (i32.and`,
        `        (f32.gt (local.get $x) (f32.sub (local.get $_obs_x) (f32.const 5)))`,
        `        (f32.lt (local.get $x) (f32.add (f32.add (local.get $_obs_x) (local.get $_obs_w)) (f32.const 5)))`,
        `      )`,
        `      (i32.and`,
        `        (f32.gt (local.get $y) (f32.sub (local.get $_obs_y) (f32.const 5)))`,
        `        (f32.lt (local.get $y) (f32.add (f32.add (local.get $_obs_y) (local.get $_obs_h)) (f32.const 5)))`,
        `      )`,
        `    ) (then`,
        `      ;; Compute direction away from obstacle center`,
        `      (local.set $_obs_cx (f32.add (local.get $_obs_x) (f32.mul (local.get $_obs_w) (f32.const 0.5))))`,
        `      (local.set $_obs_cy (f32.add (local.get $_obs_y) (f32.mul (local.get $_obs_h) (f32.const 0.5))))`,
        `      (local.set $_obs_dx (f32.sub (local.get $x) (local.get $_obs_cx)))`,
        `      (local.set $_obs_dy (f32.sub (local.get $y) (local.get $_obs_cy)))`,
        `      (local.set $_obs_dist (f32.sqrt (f32.add (f32.mul (local.get $_obs_dx) (local.get $_obs_dx)) (f32.mul (local.get $_obs_dy) (local.get $_obs_dy)))))`,
        `      (if (f32.gt (local.get $_obs_dist) (f32.const 0.001)) (then`,
        `        (local.set $_obs_dx (f32.div (local.get $_obs_dx) (local.get $_obs_dist)))`,
        `        (local.set $_obs_dy (f32.div (local.get $_obs_dy) (local.get $_obs_dist)))`,
        `      ))`,
        `      (local.set $vx (f32.add (local.get $vx) (f32.mul (local.get $_obs_dx) ${a})))`,
        `      (local.set $vy (f32.add (local.get $vy) (f32.mul (local.get $_obs_dy) ${a})))`,
        `    ))`,
        `    (local.set $_obs_idx (i32.add (local.get $_obs_idx) (i32.const 1)))`,
        `    (local.set $_obs_ptr (i32.add (local.get $_obs_ptr) (i32.const 16)))`,
        `    (br $_obs_loop)`,
        `  )`,
        `)`,
      ];
    }
    return [];
  },
});

// ─── Debug Commands ──────────────────────────────────────────────────

registerCommand({
  name: "print",
  emit(argument, target, ctx) {
    const a = arg(argument, target, ctx);
    if (target.name === "js")
      return [`if (inputs.print) inputs.print(id, ${a});`];
    if (target.name === "wgsl") return [`agentLogs[i] = vec2<f32>(1.0, ${a});`];
    return [`(call $print (local.get $_agent_id) ${a})`];
  },
});
