import { describe, it, expect } from "vitest";
import { server } from "vitest/browser";
import { Compiler } from "../../src/compiler/compiler";
import { SIMULATIONS } from "../simulations";
import { MICRO_SIMULATIONS } from "../simulations/micro";

// ─── Full Simulation Compilation Tests ───────────────────────────────

describe("Compiler Tests", () => {
  for (const [simulationName, sourceCode] of Object.entries(SIMULATIONS)) {
    it(`should compile ${simulationName} simulation`, async () => {
      const compiler = new Compiler();
      const result = compiler.compileAgentCode(sourceCode);

      // Assertions
      expect(result).toBeDefined();
      expect(result.jsCode).toBeDefined();
      expect(result.wgslCode).toBeDefined();
      expect(result.WASMCode).toBeDefined();

      // Write outputs using Vitest server commands
      await server.commands.writeFile(
        `tests/compiler/outputs/${simulationName}/output.js`,
        result.jsCode,
      );
      await server.commands.writeFile(
        `tests/compiler/outputs/${simulationName}/output.wgsl`,
        result.wgslCode,
      );
      await server.commands.writeFile(
        `tests/compiler/outputs/${simulationName}/output.wat`,
        result.WASMCode,
      );
    });
  }
});

// ─── Micro-Simulation Feature Tests ──────────────────────────────────

describe("Micro-Simulation Feature Tests", () => {
  for (const [name, sourceCode] of Object.entries(MICRO_SIMULATIONS)) {
    describe(`${name}`, () => {
      it("should compile without errors", () => {
        const compiler = new Compiler();
        const result = compiler.compileAgentCode(sourceCode);
        expect(result).toBeDefined();
        expect(result.jsCode).toBeDefined();
        expect(result.wgslCode).toBeDefined();
        expect(result.WASMCode).toBeDefined();
      });

      it("should produce non-empty JS output", () => {
        const compiler = new Compiler();
        const result = compiler.compileAgentCode(sourceCode);
        expect(result.jsCode.length).toBeGreaterThan(10);
      });

      it("should produce non-empty WGSL output", () => {
        const compiler = new Compiler();
        const result = compiler.compileAgentCode(sourceCode);
        expect(result.wgslCode.length).toBeGreaterThan(10);
      });

      it("should produce non-empty WAT output", () => {
        const compiler = new Compiler();
        const result = compiler.compileAgentCode(sourceCode);
        expect(result.WASMCode.length).toBeGreaterThan(10);
      });
    });
  }
});

// ─── JS Output Structural Validation ─────────────────────────────────

describe("JS Structural Validation", () => {
  it("should produce a valid arrow function for gravity", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input gravity = 9.8;
            moveDown(inputs.gravity);
        `);

    // JS output should be evaluable as a function
    expect(() => new Function("return " + result.jsCode)).not.toThrow();
  });

  it("should produce a function that returns agent properties", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input gravity = 9.8;
            moveDown(inputs.gravity);
        `);

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 0, vy: 0, species: 0 };
    const inputs = { gravity: 9.8, width: 100, height: 100 };
    const output = fn(agent, inputs);

    expect(output).toHaveProperty("id");
    expect(output).toHaveProperty("x");
    expect(output).toHaveProperty("y");
    expect(output).toHaveProperty("vx");
    expect(output).toHaveProperty("vy");
    expect(output).toHaveProperty("species");
  });

  it("should apply gravity (moveDown) correctly in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input gravity = 9.8;
            moveDown(inputs.gravity);
        `);

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 0, vy: 0, species: 0 };
    const inputs = { gravity: 9.8 };
    const output = fn(agent, inputs);

    // moveDown adds to y
    expect(output.y).toBeCloseTo(59.8, 0);
    // x should be unchanged
    expect(output.x).toBeCloseTo(50, 0);
  });

  it("should apply moveUp correctly in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(5);");

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 0, vy: 0, species: 0 };
    const output = fn(agent, {});

    expect(output.y).toBeCloseTo(45, 0);
  });

  it("should apply moveLeft correctly in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveLeft(10);");

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 0, vy: 0, species: 0 };
    const output = fn(agent, {});

    expect(output.x).toBeCloseTo(40, 0);
  });

  it("should apply moveRight correctly in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveRight(10);");

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 0, vy: 0, species: 0 };
    const output = fn(agent, {});

    expect(output.x).toBeCloseTo(60, 0);
  });

  it("should apply updatePosition correctly in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("updatePosition(1.0);");

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 2, vy: -3, species: 0 };
    const output = fn(agent, {});

    expect(output.x).toBeCloseTo(52, 0);
    expect(output.y).toBeCloseTo(47, 0);
  });

  it("should apply addVelocity commands correctly in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            addVelocityX(1);
            addVelocityY(2);
        `);

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 0, vy: 0, species: 0 };
    const output = fn(agent, {});

    expect(output.vx).toBeCloseTo(1, 0);
    expect(output.vy).toBeCloseTo(2, 0);
  });

  it("should apply setVelocity commands correctly in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            setVelocityX(5);
            setVelocityY(-3);
        `);

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 100, vy: 100, species: 0 };
    const output = fn(agent, {});

    expect(output.vx).toBeCloseTo(5, 0);
    expect(output.vy).toBeCloseTo(-3, 0);
  });

  it("should handle compound assignments in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            vx += 5;
            vy -= 3;
        `);

    const fn = new Function("return " + result.jsCode)();
    const agent = { id: 0, x: 50, y: 50, vx: 10, vy: 10, species: 0 };
    const output = fn(agent, {});

    expect(output.vx).toBeCloseTo(15, 0);
    expect(output.vy).toBeCloseTo(7, 0);
  });

  it("should handle if/else control flow in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            if (x > 50) {
                moveRight(1);
            } else {
                moveLeft(1);
            }
        `);

    const fn = new Function("return " + result.jsCode)();

    // x > 50 → moveRight
    const agent1 = { id: 0, x: 60, y: 50, vx: 0, vy: 0, species: 0 };
    const out1 = fn(agent1, {});
    expect(out1.x).toBeCloseTo(61, 0);

    // x <= 50 → moveLeft
    const agent2 = { id: 0, x: 40, y: 50, vx: 0, vy: 0, species: 0 };
    const out2 = fn(agent2, {});
    expect(out2.x).toBeCloseTo(39, 0);
  });

  it("should handle species comparison in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            species(2);
            if (species == 0) {
                moveUp(1);
            } else {
                moveDown(1);
            }
        `);

    const fn = new Function("return " + result.jsCode)();

    const agent0 = { id: 0, x: 50, y: 50, vx: 0, vy: 0, species: 0 };
    const out0 = fn(agent0, {});
    expect(out0.y).toBeCloseTo(49, 0); // moveUp

    const agent1 = { id: 0, x: 50, y: 50, vx: 0, vy: 0, species: 1 };
    const out1 = fn(agent1, {});
    expect(out1.y).toBeCloseTo(51, 0); // moveDown
  });

  it("should handle borderWrapping in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("borderWrapping();");

    const fn = new Function("return " + result.jsCode)();

    const agent = { id: 0, x: 110, y: -5, vx: 0, vy: 0, species: 0 };
    const inputs = { width: 100, height: 100 };
    const output = fn(agent, inputs);

    expect(output.x).toBeCloseTo(10, 0);
    expect(output.y).toBeCloseTo(95, 0);
  });

  it("should handle limitSpeed in JS", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("limitSpeed(5);");

    const fn = new Function("return " + result.jsCode)();

    // Speed = sqrt(100+100) ≈ 14.1, should be clamped to 5
    const agent = { id: 0, x: 50, y: 50, vx: 10, vy: 10, species: 0 };
    const output = fn(agent, {});

    const speed = Math.sqrt(output.vx ** 2 + output.vy ** 2);
    expect(speed).toBeCloseTo(5, 0);
  });

  it("should produce valid JS for all full simulations", () => {
    const compiler = new Compiler();
    for (const [name, source] of Object.entries(SIMULATIONS)) {
      const result = compiler.compileAgentCode(source);
      expect(
        () => new Function("return " + result.jsCode),
        `JS syntax error in ${name}`,
      ).not.toThrow();
    }
  });
});

// ─── WGSL Structural Validation ──────────────────────────────────────

describe("WGSL Structural Validation", () => {
  it("should contain Agent struct", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.wgslCode).toContain("struct Agent");
  });

  it("should contain Inputs struct", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.wgslCode).toContain("struct Inputs");
  });

  it("should contain compute entry point", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.wgslCode).toContain("@compute");
    expect(result.wgslCode).toContain("fn main");
  });

  it("should contain agent storage binding", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.wgslCode).toContain("@group(0) @binding(0)");
  });

  it("should generate trail map bindings when trails are used", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input depositAmount = 1.0;
            input decayFactor = 0.05;
            enableTrails(inputs.depositAmount, inputs.decayFactor);
            deposit(1.0);
        `);
    expect(result.wgslCode).toContain("trailMapRead");
    expect(result.wgslCode).toContain("trailMapWrite");
  });

  it("should NOT generate trail map bindings when trails are not used", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.wgslCode).not.toContain("trailMapRead");
  });

  it("should include input fields for declared inputs", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input gravity = 9.8;
            moveDown(inputs.gravity);
        `);
    expect(result.wgslCode).toContain("gravity: f32");
  });

  it("should include randomValues binding when random is used", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input r = random();
        `);
    expect(result.wgslCode).toContain("randomValues");
  });
});

// ─── WAT Structural Validation ───────────────────────────────────────

describe("WAT Structural Validation", () => {
  it("should contain module declaration", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.WASMCode).toContain("(module");
  });

  it("should contain memory import", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.WASMCode).toContain('(import "env" "memory"');
  });

  it("should contain step function export", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.WASMCode).toContain('(export "step"');
  });

  it("should contain agent field loading", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.WASMCode).toContain("local.set $_agent_id");
    expect(result.WASMCode).toContain("local.set $x");
    expect(result.WASMCode).toContain("local.set $y");
  });

  it("should contain agent field storing", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.WASMCode).toContain("f32.store");
  });

  it("should include input globals for declared inputs", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input gravity = 9.8;
            moveDown(inputs.gravity);
        `);
    expect(result.WASMCode).toContain("$inputs_gravity");
  });

  it("should include sin/cos imports", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("moveUp(1);");
    expect(result.WASMCode).toContain("(func $sin");
    expect(result.WASMCode).toContain("(func $cos");
  });
});

// ─── Input Extraction ────────────────────────────────────────────────

describe("Input Extraction", () => {
  it("should extract declared inputs", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input gravity = 9.8;
            moveDown(inputs.gravity);
        `);
    expect(result.requiredInputs).toContain("gravity");
  });

  it("should extract defined input metadata with range", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input gravity = 9.8 [0, 20];
        `);
    expect(result.definedInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "gravity",
          defaultValue: 9.8,
          min: 0,
          max: 20,
        }),
      ]),
    );
  });

  it("should use default range when no range annotation provided", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input speed = 5;
        `);
    expect(result.definedInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "speed",
          defaultValue: 5,
          min: 0,
          max: 100,
        }),
      ]),
    );
  });

  it("should extract implicit width/height inputs for borderWrapping", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("borderWrapping();");
    expect(result.requiredInputs).toContain("width");
    expect(result.requiredInputs).toContain("height");
  });

  it("should extract trailMap for deposit/sense commands", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input depositAmount = 1.0;
            input decayFactor = 0.05;
            enableTrails(inputs.depositAmount, inputs.decayFactor);
            deposit(1.0);
        `);
    expect(result.requiredInputs).toContain("trailMap");
  });

  it("should extract speciesCount from species command", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("species(3);");
    expect(result.speciesCount).toBe(3);
  });

  it("should identify random inputs", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input r = random();
        `);
    expect(result.requiredInputs).toContain("randomValues");
  });

  it("should extract trailEnvironmentConfig from enableTrails", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            input depositAmount = 1.0;
            input decayFactor = 0.05;
            enableTrails(inputs.depositAmount, inputs.decayFactor);
        `);
    expect(result.trailEnvironmentConfig).toBeDefined();
    expect(result.trailEnvironmentConfig?.depositAmountInput).toBe(
      "depositAmount",
    );
    expect(result.trailEnvironmentConfig?.decayFactorInput).toBe("decayFactor");
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("should handle empty input", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("");
    expect(result).toBeDefined();
    expect(result.jsCode).toBeDefined();
  });

  it("should handle undefined input", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(undefined);
    expect(result).toBeDefined();
  });

  it("should handle whitespace-only input", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode("   \n  \n   ");
    expect(result).toBeDefined();
  });

  it("should handle comment-only input", () => {
    const compiler = new Compiler();
    const result = compiler.compileAgentCode(`
            // This is a comment
            # This is also a comment
        `);
    expect(result).toBeDefined();
  });
});
