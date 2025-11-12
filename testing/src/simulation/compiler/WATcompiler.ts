import type Logger from "../helpers/logger";
import { Compiler, type AVAILABLE_COMMANDS } from "./compiler";

const COMMANDS: Record<AVAILABLE_COMMANDS, { target: "x" | "y"; op: "add" | "sub" }> = {
  moveUp: { target: "y", op: "sub" },
  moveDown: { target: "y", op: "add" },
  moveLeft: { target: "x", op: "sub" },
  moveRight: { target: "x", op: "add" },
};

/**
 * Normalizes expressions for WASM (converts to S-expressions)
 */
function normalizeWASMExpression(expr: string): string {
  let r = expr.trim();

  // Replace inputs.* with global references
  r = r.replace(/inputs\.([a-zA-Z_]\w*)/g, "(global.get $inputs_$1)");

  // Wrap numeric literals in f32.const
  if (/^-?\d+(\.\d+)?$/.test(r)) return `(f32.const ${r})`;

  return r;
}

export const compileDSLtoWAT = (
  lines: string[],
  inputs: string[],
  logger: Logger
): string => {
  const statements: string[] = [];

  for (const line of lines) {
    const parsed = Compiler.parseCommandLine(line);
    if (parsed) {
      const { target, op } = COMMANDS[parsed.command];
      const argExpr = normalizeWASMExpression(parsed.argument);
      const opInstr = op === "add" ? "f32.add" : "f32.sub";
      
      const statement = `(local.set $${target} (${opInstr} (local.get $${target}) ${argExpr}))`;
      statements.push(statement);
    }
  }

  if (statements.length === 0) {
    logger.warn("No WASM statements produced from DSL. Emitting identity function.");
    statements.push("; no-op");
  }

  const inputGlobals =
    inputs.length > 0
      ? inputs
        .map(
          n =>
            `(global $inputs_${n} (export "inputs_${n}") (mut f32) (f32.const 0))`
        )
        .join("\n  ")
      : "";

  const agentKernel = `
    ;; load agent fields: id(0), x(+4), y(+8)
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))

    ;; execute DSL
    ${statements.join("\n    ")}

    ;; store back
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))

  `.trim();

  const wasm = `
  (module
    ;; Shared memory is provided by JS
    (import "env" "memory" (memory 1))
    ${inputGlobals}

    ;; Optional single-agent step (for debugging)
    (func (export "step") (param $ptr i32)
      (local $x f32)
      (local $y f32)
      ${agentKernel}
    )

    ;; Batch version
    (func (export "step_all") (param $base i32) (param $count i32)
      (local $i i32)
      (local $ptr i32)
      (local $x f32)
      (local $y f32)

      (local.set $i (i32.const 0))
      (local.set $ptr (local.get $base))

      (block $exit
        (loop $loop
          (br_if $exit (i32.ge_u (local.get $i) (local.get $count)))

          ;; ---- per-agent kernel ----
          ${agentKernel}

          ;; increment i and ptr
          (local.set $i   (i32.add (local.get $i) (i32.const 1)))
          (local.set $ptr (i32.add (local.get $ptr) (i32.const 12)))

          (br $loop)
        )
      )
    )
  )
  `.trim();

  return wasm;
};
