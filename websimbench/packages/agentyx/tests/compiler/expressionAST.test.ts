import { describe, it, expect } from "vitest";
import {
  transformExpression,
  isArrayExpression,
  generateJS,
} from "../../src/compiler/expressionAST";
import type { ExprNode } from "../../src/compiler/expressionAST";

// We need to import tokenize and Parser indirectly via transformExpression
// since they're not exported. We test them through the public API.

describe("Expression AST", () => {
  // ─── transformExpression (end-to-end) ─────────────────────────────

  describe("transformExpression", () => {
    // Numbers
    describe("numbers", () => {
      it("should wrap integer literals in f()", () => {
        expect(transformExpression("5")).toBe("f(5)");
      });

      it("should wrap float literals in f()", () => {
        expect(transformExpression("3.14")).toBe("f(3.14)");
      });

      it("should wrap zero", () => {
        expect(transformExpression("0")).toBe("f(0)");
      });

      it("should handle negative number", () => {
        const result = transformExpression("-5");
        expect(result).toContain("f(");
        expect(result).toContain("-");
        expect(result).toContain("5");
      });
    });

    // Identifiers (agent variables)
    describe("identifiers", () => {
      it("should not wrap agent variables (x, y, vx, vy)", () => {
        expect(transformExpression("x")).toBe("x");
        expect(transformExpression("y")).toBe("y");
        expect(transformExpression("vx")).toBe("vx");
        expect(transformExpression("vy")).toBe("vy");
      });

      it("should return id as-is", () => {
        expect(transformExpression("id")).toBe("id");
      });

      it("should return user-defined variables as-is", () => {
        expect(transformExpression("count")).toBe("count");
      });
    });

    // Property access
    describe("property access", () => {
      it("should handle inputs.width", () => {
        const result = transformExpression("inputs.width");
        expect(result).toBe("f(inputs.width)");
      });

      it("should handle inputs.property", () => {
        const result = transformExpression("inputs.gravity");
        expect(result).toBe("f(inputs.gravity)");
      });

      it("should handle .length without wrapping", () => {
        const result = transformExpression("nearbyAgents.length");
        expect(result).toContain("nearbyAgents.length");
      });
    });

    // Arithmetic
    describe("arithmetic operations", () => {
      it("should wrap addition in f()", () => {
        const result = transformExpression("x + 1");
        expect(result).toBe("f(x + f(1))");
      });

      it("should wrap subtraction in f()", () => {
        const result = transformExpression("x - y");
        expect(result).toBe("f(x - y)");
      });

      it("should wrap multiplication in f()", () => {
        const result = transformExpression("vx * vy");
        expect(result).toBe("f(vx * vy)");
      });

      it("should wrap division in f()", () => {
        const result = transformExpression("x / 2");
        expect(result).toBe("f(x / f(2))");
      });

      it("should handle complex expression (dx*dx + dy*dy)", () => {
        const result = transformExpression("dx*dx + dy*dy");
        // Should wrap inner multiplications and outer addition
        expect(result).toContain("f(");
        expect(result).toContain("dx");
        expect(result).toContain("dy");
      });

      it("should handle exponentiation ^2 as multiplication", () => {
        const result = transformExpression("x^2");
        // Should convert a^2 to f(a * a) or similar
        expect(result).toContain("f(");
      });

      it("should handle ** operator", () => {
        const result = transformExpression("x**2");
        expect(result).toContain("f(");
      });
    });

    // Comparisons
    describe("comparison operators", () => {
      it("should not wrap comparison result in f()", () => {
        const result = transformExpression("x > 0");
        expect(result).toBe("(x > f(0))");
      });

      it("should not wrap equality", () => {
        const result = transformExpression("species == 0");
        expect(result).toBe("(species == f(0))");
      });

      it("should handle !=", () => {
        const result = transformExpression("x != 0");
        expect(result).toBe("(x != f(0))");
      });

      it("should handle >=", () => {
        const result = transformExpression("x >= 10");
        expect(result).toBe("(x >= f(10))");
      });

      it("should handle <=", () => {
        const result = transformExpression("y <= 5");
        expect(result).toBe("(y <= f(5))");
      });
    });

    // Logical operators
    describe("logical operators", () => {
      it("should handle &&", () => {
        const result = transformExpression("x > 0 && y > 0");
        expect(result).toContain("&&");
      });

      it("should handle ||", () => {
        const result = transformExpression("x < 0 || x > 100");
        expect(result).toContain("||");
      });
    });

    // Function calls
    describe("function calls", () => {
      it("should map sqrt to Math.sqrt with f() wrapper", () => {
        const result = transformExpression("sqrt(x)");
        expect(result).toBe("f(Math.sqrt(x))");
      });

      it("should map neighbors()", () => {
        const result = transformExpression("neighbors(50)");
        expect(result).toContain("_neighbors");
      });

      it("should map mean(collection.prop)", () => {
        const result = transformExpression("mean(nearbyAgents.vx)");
        expect(result).toContain("_mean");
        expect(result).toContain("nearbyAgents");
        expect(result).toContain("vx");
      });

      it("should map sense()", () => {
        const result = transformExpression("sense(0.5, 10)");
        expect(result).toContain("_sense");
      });

      it("should map random() with no args", () => {
        const result = transformExpression("random()");
        expect(result).toContain("_random");
      });

      it("should map random(max)", () => {
        const result = transformExpression("random(10)");
        expect(result).toContain("_random");
      });

      it("should map random(min, max)", () => {
        const result = transformExpression("random(1, 10)");
        expect(result).toContain("_random");
      });
    });

    // Random inputs
    describe("random inputs", () => {
      it("should replace inputs.r with r when r is a random input", () => {
        const result = transformExpression("inputs.r", new Set(["r"]));
        expect(result).toBe("r");
      });

      it("should not replace non-random inputs", () => {
        const result = transformExpression("inputs.width", new Set(["r"]));
        expect(result).toBe("f(inputs.width)");
      });
    });

    // Parenthesized expressions
    describe("parenthesized expressions", () => {
      it("should handle (a + b) * c", () => {
        const result = transformExpression("(x + 1) * 2");
        expect(result).toContain("f(");
      });

      it("should handle nested parentheses", () => {
        const result = transformExpression("((x + y) * (vx - vy))");
        expect(result).toContain("f(");
      });
    });

    // Complex real-world expressions from simulations
    describe("real-world expressions", () => {
      it("should handle (avgVx - vx) * inputs.alignmentFactor", () => {
        const result = transformExpression(
          "(avgVx - vx) * inputs.alignmentFactor",
        );
        expect(result).toContain("f(");
        expect(result).toContain("avgVx");
        expect(result).toContain("inputs.alignmentFactor");
      });

      it("should handle (r - 0.5) * inputs.turbulence", () => {
        const result = transformExpression("(r - 0.5) * inputs.turbulence");
        expect(result).toContain("f(");
        expect(result).toContain("inputs.turbulence");
      });

      it("should handle empty expression", () => {
        const result = transformExpression("");
        expect(result).toBe("");
      });
    });
  });

  // ─── isArrayExpression ────────────────────────────────────────────

  describe("isArrayExpression", () => {
    it("should return true for neighbors() call", () => {
      expect(isArrayExpression("neighbors(50)")).toBe(true);
    });

    it("should return true for _neighbors() call", () => {
      expect(isArrayExpression("_neighbors(50)")).toBe(true);
    });

    it("should return false for non-array expressions", () => {
      expect(isArrayExpression("x + 1")).toBe(false);
      expect(isArrayExpression("mean(arr.x)")).toBe(false);
      expect(isArrayExpression("5")).toBe(false);
    });
  });
});
