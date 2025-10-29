import type Logger from "../logger";
import type { CommandMap } from "./compiler";

const COMMANDS: Record<string, { target: "x" | "y"; op: "add" | "sub" }> = {
  moveUp: { target: "y", op: "sub" },
  moveDown: { target: "y", op: "add" },
  moveLeft: { target: "x", op: "sub" },
  moveRight: { target: "x", op: "add" },
};

export const compileDSLtoWAT = (
  lines: string[],
  inputs: string[],
  logger: Logger
): string => {
  const statements: string[] = [];

  for (const line of lines) {
    const s = parseLine(line);
    if (s) statements.push(s);
  }

  if (statements.length === 0) {
    logger.warn("No WASM statements produced from DSL. Emitting identity function.");
    statements.push("; no-op");
  }

  const inputGlobals =
    inputs.length > 0
      ? inputs
          .map(
            name =>
              `(global $inputs_${name} (export "inputs_${name}") (mut f32) (f32.const 0))`
          )
          .join("\n  ")
      : "";

  const mainBody = `
    (local $x f32)
    (local $y f32)
    ;; load agent fields
    (local.set $x (f32.load (i32.add (local.get $ptr) (i32.const 4))))
    (local.set $y (f32.load (i32.add (local.get $ptr) (i32.const 8))))

    ;; execute DSL
    ${statements.join("\n    ")}

    ;; write updated values back
    (f32.store (i32.add (local.get $ptr) (i32.const 4)) (local.get $x))
    (f32.store (i32.add (local.get $ptr) (i32.const 8)) (local.get $y))
  `.trim();

  const wasmCode = `
(module
   (import "env" "memory" (memory 1))

   ${inputGlobals}

  (func (export "step") (param $ptr i32)
    ${mainBody}
  )
)
`.trim();

  return wasmCode;
};

function parseLine(line: string): string | null {
  if (!line.includes("(") || !line.includes(")")) return null;

  const cmdKey = Object.keys(COMMANDS).find(c => line.startsWith(c + "("));
  if (!cmdKey) return null;

  const { target, op } = COMMANDS[cmdKey];
  const argStart = line.indexOf("(") + 1;
  const argEnd = line.indexOf(")");
  const argRaw = line.substring(argStart, argEnd).trim();

  const argExpr = normalizeExpression(argRaw);
  const opInstr = op === "add" ? "f32.add" : "f32.sub";

  return `(local.set $${target} (${opInstr} (local.get $${target}) ${argExpr}))`;
}

function normalizeExpression(expr: string): string {
    let result = expr.trim();

    // ✅ Replace inputs.someVar → (global.get $inputs_someVar)
    result = result.replace(/inputs\.([a-zA-Z_]\w*)/g, "(global.get $inputs_$1)");

    // ✅ If the expression is a pure number, wrap it
    if (/^-?\d+(\.\d+)?$/.test(result)) {
        return `(f32.const ${result})`;
    }

    // ✅ If the expression is already a global.get or f32.const, return it
    if (result.startsWith("(global.get") || result.startsWith("(f32.const")) {
        return result;
    }

    // ✅ Otherwise, wrap unknown identifiers safely (for future DSL extensions)
    return result;
}
