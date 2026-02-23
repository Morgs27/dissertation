import { describe, it, expect } from "vitest";
import { Compiler } from "../../src/compiler/compiler";
import { AVAILABLE_COMMANDS_LIST } from "../../src/compiler/parser";
import { SIMULATIONS } from "../simulations";
import { MICRO_SIMULATIONS } from "../simulations/micro";

/**
 * Cross-compiler consistency tests.
 * Verify that all 3 backends (JS, WGSL, WAT) handle the same DSL
 * constructs and extract the same metadata.
 */
describe("Cross-Compiler Consistency", () => {
  // ─── All simulations produce output for all targets ──────────────

  describe("all backends produce output", () => {
    for (const [name, source] of Object.entries(SIMULATIONS)) {
      it(`${name}: all 3 backends produce non-empty output`, () => {
        const compiler = new Compiler();
        const result = compiler.compileAgentCode(source);

        expect(result.jsCode.length, `JS empty for ${name}`).toBeGreaterThan(
          50,
        );
        expect(
          result.wgslCode.length,
          `WGSL empty for ${name}`,
        ).toBeGreaterThan(50);
        expect(result.WASMCode.length, `WAT empty for ${name}`).toBeGreaterThan(
          50,
        );
      });
    }
  });

  // ─── Micro-simulations produce output for all targets ────────────

  describe("micro-simulations: all 3 backends produce output", () => {
    for (const [name, source] of Object.entries(MICRO_SIMULATIONS)) {
      it(`${name}: all 3 backends produce non-empty output`, () => {
        const compiler = new Compiler();
        const result = compiler.compileAgentCode(source);

        expect(result.jsCode.length, `JS empty for ${name}`).toBeGreaterThan(
          10,
        );
        expect(
          result.wgslCode.length,
          `WGSL empty for ${name}`,
        ).toBeGreaterThan(10);
        expect(result.WASMCode.length, `WAT empty for ${name}`).toBeGreaterThan(
          10,
        );
      });
    }
  });

  // ─── Input extraction is consistent ──────────────────────────────

  describe("input extraction consistency", () => {
    for (const [name, source] of Object.entries(SIMULATIONS)) {
      it(`${name}: requiredInputs is consistent across compilations`, () => {
        const compiler1 = new Compiler();
        const result1 = compiler1.compileAgentCode(source);

        // Compile twice — inputs should be deterministic
        const compiler2 = new Compiler();
        const result2 = compiler2.compileAgentCode(source);

        expect(result1.requiredInputs.sort()).toEqual(
          result2.requiredInputs.sort(),
        );
        expect(result1.definedInputs.map((i) => i.name).sort()).toEqual(
          result2.definedInputs.map((i) => i.name).sort(),
        );
      });
    }
  });

  // ─── Command coverage: each command compiles in all backends ─────

  describe("command coverage across backends", () => {
    const commandTestCases: Record<string, string> = {
      moveUp: "moveUp(1);",
      moveDown: "moveDown(1);",
      moveLeft: "moveLeft(1);",
      moveRight: "moveRight(1);",
      addVelocityX: "addVelocityX(1);",
      addVelocityY: "addVelocityY(1);",
      setVelocityX: "setVelocityX(1);",
      setVelocityY: "setVelocityY(1);",
      updatePosition: "updatePosition(1.0);",
      borderWrapping: "borderWrapping();",
      borderBounce: "borderBounce();",
      limitSpeed: "limitSpeed(5);",
      turn: "turn(0.5);",
      moveForward: "moveForward(1);",
      deposit: `
                input depositAmount = 1.0;
                input decayFactor = 0.05;
                enableTrails(inputs.depositAmount, inputs.decayFactor);
                deposit(1.0);
            `,
      species: "species(2);",
    };

    for (const [cmd, source] of Object.entries(commandTestCases)) {
      it(`${cmd}: compiles in all 3 backends without error`, () => {
        const compiler = new Compiler();
        expect(
          () => compiler.compileAgentCode(source),
          `Compilation failed for command: ${cmd}`,
        ).not.toThrow();
      });
    }
  });

  // ─── Structural equivalence checks ───────────────────────────────

  describe("structural equivalence", () => {
    it("if/else produces conditional in all backends", () => {
      const compiler = new Compiler();
      const result = compiler.compileAgentCode(`
                if (x > 50) {
                    moveUp(1);
                } else {
                    moveDown(1);
                }
            `);

      // JS should have if/else
      expect(result.jsCode).toContain("if");
      expect(result.jsCode).toContain("else");

      // WGSL should have if/else
      expect(result.wgslCode).toContain("if");
      expect(result.wgslCode).toContain("else");

      // WAT should have if/else
      expect(result.WASMCode).toContain("(if");
      expect(result.WASMCode).toContain("(else");
    });

    it("for loop produces loop structure in all backends", () => {
      const compiler = new Compiler();
      const result = compiler.compileAgentCode(`
                input perceptionRadius = 40;
                var nearbyAgents = neighbors(inputs.perceptionRadius);
                foreach (nearbyAgents as neighbor) {
                    var dx = x - neighbor.x;
                    vx += dx * 0.01;
                }
            `);

      // JS should have for..of or for loop
      expect(result.jsCode).toMatch(/for\b/);

      // WGSL should have loop or for
      expect(result.wgslCode).toMatch(/for|loop/);

      // WAT should have loop/block
      expect(result.WASMCode).toMatch(/loop|block/);
    });

    it("var declaration produces variable in all backends", () => {
      const compiler = new Compiler();
      const result = compiler.compileAgentCode("var myVar = 42;");

      // JS should declare
      expect(result.jsCode).toContain("myVar");

      // WGSL should declare
      expect(result.wgslCode).toContain("myVar");

      // WAT should have local
      expect(result.WASMCode).toContain("myVar");
    });
  });
});
