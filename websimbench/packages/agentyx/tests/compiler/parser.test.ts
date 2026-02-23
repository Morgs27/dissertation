import { describe, it, expect } from "vitest";
import { DSLParser, AVAILABLE_COMMANDS_LIST } from "../../src/compiler/parser";
import type { ParsedLineType } from "../../src/compiler/parser";

describe("DSLParser", () => {
  // ─── parseDSLLine ────────────────────────────────────────────────

  describe("parseDSLLine", () => {
    // Empty / brace lines
    describe("empty and brace lines", () => {
      it("should parse empty string as empty", () => {
        expect(DSLParser.parseDSLLine("")).toEqual({ type: "empty" });
      });

      it("should parse whitespace-only as empty", () => {
        expect(DSLParser.parseDSLLine("   ")).toEqual({ type: "empty" });
      });

      it("should parse { as brace", () => {
        expect(DSLParser.parseDSLLine("{")).toEqual({ type: "brace" });
      });

      it("should parse } as brace", () => {
        expect(DSLParser.parseDSLLine("}")).toEqual({ type: "brace" });
      });
    });

    // Variable declarations
    describe("var declarations", () => {
      it("should parse simple var declaration", () => {
        const result = DSLParser.parseDSLLine("var x = 5;");
        expect(result).toEqual({ type: "var", name: "x", expression: "5" });
      });

      it("should parse var with complex expression", () => {
        const result = DSLParser.parseDSLLine("var dist2 = dx*dx + dy*dy;");
        expect(result).toEqual({
          type: "var",
          name: "dist2",
          expression: "dx*dx + dy*dy",
        });
      });

      it("should parse var with function call", () => {
        const result = DSLParser.parseDSLLine(
          "var nearby = neighbors(inputs.perceptionRadius);",
        );
        expect(result).toEqual({
          type: "var",
          name: "nearby",
          expression: "neighbors(inputs.perceptionRadius)",
        });
      });

      it("should parse var with mean() call", () => {
        const result = DSLParser.parseDSLLine(
          "var avgVx = mean(nearbyAgents.vx);",
        );
        expect(result).toEqual({
          type: "var",
          name: "avgVx",
          expression: "mean(nearbyAgents.vx)",
        });
      });

      it("should parse var with sense() call", () => {
        const result = DSLParser.parseDSLLine(
          "var sL = sense(inputs.sensorAngle, inputs.sensorDist);",
        );
        expect(result).toEqual({
          type: "var",
          name: "sL",
          expression: "sense(inputs.sensorAngle, inputs.sensorDist)",
        });
      });

      it("should parse var with random() call", () => {
        const result = DSLParser.parseDSLLine("var r = random();");
        expect(result).toEqual({
          type: "var",
          name: "r",
          expression: "random()",
        });
      });

      it("should parse var without semicolon", () => {
        const result = DSLParser.parseDSLLine("var count = 0");
        expect(result).toEqual({ type: "var", name: "count", expression: "0" });
      });

      it("should parse var with negative value", () => {
        const result = DSLParser.parseDSLLine("var dx = x - neighbor_x;");
        expect(result).toEqual({
          type: "var",
          name: "dx",
          expression: "x - neighbor_x",
        });
      });
    });

    // If statements
    describe("if statements", () => {
      it("should parse simple if", () => {
        const result = DSLParser.parseDSLLine("if (x > 0) {");
        expect(result).toEqual({ type: "if", condition: "x > 0" });
      });

      it("should parse if with complex condition", () => {
        const result = DSLParser.parseDSLLine(
          "if (dist2 < inputs.separationDist^2 && dist2 > 0) {",
        );
        expect(result).toEqual({
          type: "if",
          condition: "dist2 < inputs.separationDist^2 && dist2 > 0",
        });
      });

      it("should parse if with nested parentheses", () => {
        const result = DSLParser.parseDSLLine("if ((a + b) > (c * d)) {");
        expect(result).toEqual({
          type: "if",
          condition: "(a + b) > (c * d)",
        });
      });

      it("should parse if with equality", () => {
        const result = DSLParser.parseDSLLine("if (species == 0) {");
        expect(result).toEqual({ type: "if", condition: "species == 0" });
      });

      it("should parse if with function call in condition", () => {
        const result = DSLParser.parseDSLLine("if (random() < 0.1) {");
        expect(result).toEqual({ type: "if", condition: "random() < 0.1" });
      });
    });

    // Else if
    describe("else if statements", () => {
      it("should parse } else if", () => {
        const result = DSLParser.parseDSLLine("} else if (x > 5) {");
        expect(result).toEqual({ type: "elseif", condition: "x > 5" });
      });

      it("should parse else if without closing brace", () => {
        const result = DSLParser.parseDSLLine("else if (sR > sL) {");
        expect(result).toEqual({ type: "elseif", condition: "sR > sL" });
      });
    });

    // Else
    describe("else statements", () => {
      it("should parse } else {", () => {
        const result = DSLParser.parseDSLLine("} else {");
        expect(result).toEqual({ type: "else" });
      });

      it("should parse else {", () => {
        const result = DSLParser.parseDSLLine("else {");
        expect(result).toEqual({ type: "else" });
      });

      it("should parse standalone else", () => {
        const result = DSLParser.parseDSLLine("else");
        expect(result).toEqual({ type: "else" });
      });
    });

    // For loops
    describe("for loops", () => {
      it("should parse standard for loop", () => {
        const result = DSLParser.parseDSLLine(
          "for (var i = 0; i < nearbyAgents.length; i++) {",
        );
        expect(result).toEqual({
          type: "for",
          init: "var i = 0",
          condition: "i < nearbyAgents.length",
          increment: "i++",
        });
      });

      it("should parse for loop with expression", () => {
        const result = DSLParser.parseDSLLine("for (var j = 0; j < 10; j++) {");
        expect(result).toEqual({
          type: "for",
          init: "var j = 0",
          condition: "j < 10",
          increment: "j++",
        });
      });
    });

    // Foreach loops
    describe("foreach loops", () => {
      it("should parse foreach with as keyword", () => {
        const result = DSLParser.parseDSLLine(
          "foreach (nearbyAgents as neighbor) {",
        );
        expect(result).toEqual({
          type: "foreach",
          collection: "nearbyAgents",
          varName: "neighbor",
        });
      });

      it("should parse foreach without as keyword", () => {
        const result = DSLParser.parseDSLLine("foreach(nearby) {");
        expect(result).toEqual({
          type: "foreach",
          collection: "nearby",
          itemAlias: "nearby",
        });
      });
    });

    // Assignments
    describe("assignments", () => {
      it("should parse simple assignment", () => {
        const result = DSLParser.parseDSLLine("species = 1;");
        expect(result).toEqual({
          type: "assignment",
          target: "species",
          expression: "1",
        });
      });

      it("should parse compound += assignment", () => {
        const result = DSLParser.parseDSLLine("vx += dx * force;");
        expect(result).toEqual({
          type: "assignment",
          target: "vx",
          expression: "vx + dx * force",
        });
      });

      it("should parse compound -= assignment", () => {
        const result = DSLParser.parseDSLLine("vy -= 1;");
        expect(result).toEqual({
          type: "assignment",
          target: "vy",
          expression: "vy - 1",
        });
      });

      it("should parse compound *= assignment", () => {
        const result = DSLParser.parseDSLLine("vx *= inputs.damping;");
        expect(result).toEqual({
          type: "assignment",
          target: "vx",
          expression: "vx * inputs.damping",
        });
      });

      it("should parse compound /= assignment", () => {
        const result = DSLParser.parseDSLLine("avgVx /= count;");
        expect(result).toEqual({
          type: "assignment",
          target: "avgVx",
          expression: "avgVx / count",
        });
      });

      it("should parse assignment with complex expression", () => {
        const result = DSLParser.parseDSLLine("x = random() * inputs.width;");
        expect(result).toEqual({
          type: "assignment",
          target: "x",
          expression: "random() * inputs.width",
        });
      });

      it("should parse assignment to y", () => {
        const result = DSLParser.parseDSLLine("y = inputs.height;");
        expect(result).toEqual({
          type: "assignment",
          target: "y",
          expression: "inputs.height",
        });
      });
    });

    // Commands
    describe("commands", () => {
      it("should parse moveUp", () => {
        const result = DSLParser.parseDSLLine("moveUp(0.5);");
        expect(result).toEqual({
          type: "command",
          command: "moveUp",
          argument: "0.5",
        });
      });

      it("should parse moveDown with input reference", () => {
        const result = DSLParser.parseDSLLine("moveDown(inputs.gravity);");
        expect(result).toEqual({
          type: "command",
          command: "moveDown",
          argument: "inputs.gravity",
        });
      });

      it("should parse moveRight with expression", () => {
        const result = DSLParser.parseDSLLine("moveRight(dx);");
        expect(result).toEqual({
          type: "command",
          command: "moveRight",
          argument: "dx",
        });
      });

      it("should parse borderWrapping with no args", () => {
        const result = DSLParser.parseDSLLine("borderWrapping()");
        expect(result).toEqual({
          type: "command",
          command: "borderWrapping",
          argument: "",
        });
      });

      it("should parse limitSpeed", () => {
        const result = DSLParser.parseDSLLine("limitSpeed(inputs.maxSpeed);");
        expect(result).toEqual({
          type: "command",
          command: "limitSpeed",
          argument: "inputs.maxSpeed",
        });
      });

      it("should parse updatePosition", () => {
        const result = DSLParser.parseDSLLine("updatePosition(inputs.dt);");
        expect(result).toEqual({
          type: "command",
          command: "updatePosition",
          argument: "inputs.dt",
        });
      });

      it("should parse turn with expression", () => {
        const result = DSLParser.parseDSLLine("turn(inputs.turnAngle);");
        expect(result).toEqual({
          type: "command",
          command: "turn",
          argument: "inputs.turnAngle",
        });
      });

      it("should parse turn with negative expression", () => {
        const result = DSLParser.parseDSLLine("turn(-inputs.turnAngle);");
        expect(result).toEqual({
          type: "command",
          command: "turn",
          argument: "-inputs.turnAngle",
        });
      });

      it("should parse moveForward", () => {
        const result = DSLParser.parseDSLLine("moveForward(inputs.speed);");
        expect(result).toEqual({
          type: "command",
          command: "moveForward",
          argument: "inputs.speed",
        });
      });

      it("should parse deposit", () => {
        const result = DSLParser.parseDSLLine("deposit(1.0);");
        expect(result).toEqual({
          type: "command",
          command: "deposit",
          argument: "1.0",
        });
      });

      it("should parse sense with two args", () => {
        const result = DSLParser.parseDSLLine(
          "sense(inputs.sensorAngle, inputs.sensorDist);",
        );
        expect(result).toEqual({
          type: "command",
          command: "sense",
          argument: "inputs.sensorAngle, inputs.sensorDist",
        });
      });

      it("should parse enableTrails with two args", () => {
        const result = DSLParser.parseDSLLine(
          "enableTrails(inputs.depositAmount, inputs.decayFactor);",
        );
        expect(result).toEqual({
          type: "command",
          command: "enableTrails",
          argument: "inputs.depositAmount, inputs.decayFactor",
        });
      });

      it("should parse species", () => {
        const result = DSLParser.parseDSLLine("species(3);");
        expect(result).toEqual({
          type: "command",
          command: "species",
          argument: "3",
        });
      });

      it("should parse print", () => {
        const result = DSLParser.parseDSLLine("print(x);");
        expect(result).toEqual({
          type: "command",
          command: "print",
          argument: "x",
        });
      });

      it("should parse avoidObstacles", () => {
        const result = DSLParser.parseDSLLine("avoidObstacles(1.0);");
        expect(result).toEqual({
          type: "command",
          command: "avoidObstacles",
          argument: "1.0",
        });
      });
    });

    // Unknown lines
    describe("unknown lines", () => {
      it("should return unknown for unrecognized syntax", () => {
        const result = DSLParser.parseDSLLine("foobar baz");
        expect(result).toEqual({ type: "unknown" });
      });

      it("should return unknown for invalid command", () => {
        const result = DSLParser.parseDSLLine("notACommand(42);");
        expect(result).toEqual({ type: "unknown" });
      });
    });
  });

  // ─── parseCommandLine ────────────────────────────────────────────

  describe("parseCommandLine", () => {
    it("should return null for non-command lines", () => {
      expect(DSLParser.parseCommandLine("var x = 5")).toBeNull();
      expect(DSLParser.parseCommandLine("if (x > 0) {")).toBeNull();
      expect(DSLParser.parseCommandLine("x = 5")).toBeNull();
    });

    it("should return null for unknown commands", () => {
      expect(DSLParser.parseCommandLine("unknownCmd(42)")).toBeNull();
    });

    it("should parse all available commands", () => {
      for (const cmd of AVAILABLE_COMMANDS_LIST) {
        const result = DSLParser.parseCommandLine(`${cmd}(testArg)`);
        expect(result).not.toBeNull();
        expect(result!.command).toBe(cmd);
        expect(result!.argument).toBe("testArg");
      }
    });

    it("should handle empty arguments", () => {
      const result = DSLParser.parseCommandLine("borderWrapping()");
      expect(result).not.toBeNull();
      expect(result!.argument).toBe("");
    });

    it("should handle nested parentheses in arguments", () => {
      const result = DSLParser.parseCommandLine("turn((r - 0.5) * 0.5)");
      expect(result).not.toBeNull();
      expect(result!.argument).toBe("(r - 0.5) * 0.5");
    });

    it("should handle multiple comma-separated arguments", () => {
      const result = DSLParser.parseCommandLine(
        "sense(inputs.angle, inputs.dist)",
      );
      expect(result).not.toBeNull();
      expect(result!.argument).toBe("inputs.angle, inputs.dist");
    });

    it("should return null for unbalanced parentheses", () => {
      const result = DSLParser.parseCommandLine("moveUp(5");
      expect(result).toBeNull();
    });
  });

  // ─── extractBalanced ─────────────────────────────────────────────

  describe("extractBalanced", () => {
    it("should extract simple parenthesized content", () => {
      expect(DSLParser.extractBalanced("(hello)", 0)).toBe("hello");
    });

    it("should handle nested parentheses", () => {
      expect(DSLParser.extractBalanced("((a + b) * c)", 0)).toBe("(a + b) * c");
    });

    it("should handle deeply nested parentheses", () => {
      expect(DSLParser.extractBalanced("(((x)))", 0)).toBe("((x))");
    });

    it("should extract from offset", () => {
      expect(DSLParser.extractBalanced("foo(bar)", 3)).toBe("bar");
    });

    it("should return null for unbalanced", () => {
      expect(DSLParser.extractBalanced("(no close", 0)).toBeNull();
    });

    it("should return null for empty open", () => {
      expect(DSLParser.extractBalanced("no parens", 5)).toBeNull();
    });
  });

  // ─── applyCommandTemplate ────────────────────────────────────────

  describe("applyCommandTemplate", () => {
    it("should replace single {arg}", () => {
      expect(DSLParser.applyCommandTemplate("y = y - {arg};", "5")).toBe(
        "y = y - 5;",
      );
    });

    it("should replace multiple {arg}", () => {
      expect(DSLParser.applyCommandTemplate("{arg} * {arg}", "3")).toBe(
        "3 * 3",
      );
    });

    it("should handle complex arg expression", () => {
      expect(
        DSLParser.applyCommandTemplate("x = x + {arg};", "inputs.speed * dt"),
      ).toBe("x = x + inputs.speed * dt;");
    });
  });

  // ─── parseLines ──────────────────────────────────────────────────

  describe("parseLines", () => {
    it("should parse multiple command lines", () => {
      const commandMap: Record<string, string> = {
        moveUp: "y = y - {arg};",
        moveDown: "y = y + {arg};",
        moveLeft: "x = x - {arg};",
        moveRight: "x = x + {arg};",
        addVelocityX: "",
        addVelocityY: "",
        setVelocityX: "",
        setVelocityY: "",
        updatePosition: "",
        borderWrapping: "",
        borderBounce: "",
        limitSpeed: "",
        turn: "",
        moveForward: "",
        sense: "",
        deposit: "",
        enableTrails: "",
        print: "",
        species: "",
        avoidObstacles: "",
      };

      const lines = [
        { content: "moveUp(5)", lineIndex: 0 },
        { content: "moveRight(3)", lineIndex: 1 },
      ];

      const result = DSLParser.parseLines(lines, commandMap as any);
      expect(result).toEqual(["y = y - 5;", "x = x + 3;"]);
    });

    it("should skip non-command lines", () => {
      const commandMap: Record<string, string> = {
        moveUp: "y = y - {arg};",
        moveDown: "",
        moveLeft: "",
        moveRight: "",
        addVelocityX: "",
        addVelocityY: "",
        setVelocityX: "",
        setVelocityY: "",
        updatePosition: "",
        borderWrapping: "",
        borderBounce: "",
        limitSpeed: "",
        turn: "",
        moveForward: "",
        sense: "",
        deposit: "",
        enableTrails: "",
        print: "",
        species: "",
        avoidObstacles: "",
      };

      const lines = [
        { content: "var x = 5", lineIndex: 0 },
        { content: "moveUp(2)", lineIndex: 1 },
        { content: "if (x > 0) {", lineIndex: 2 },
      ];

      const result = DSLParser.parseLines(lines, commandMap as any);
      expect(result).toEqual(["y = y - 2;"]);
    });

    it("should return empty array for no commands", () => {
      const commandMap: Record<string, string> = {
        moveUp: "",
        moveDown: "",
        moveLeft: "",
        moveRight: "",
        addVelocityX: "",
        addVelocityY: "",
        setVelocityX: "",
        setVelocityY: "",
        updatePosition: "",
        borderWrapping: "",
        borderBounce: "",
        limitSpeed: "",
        turn: "",
        moveForward: "",
        sense: "",
        deposit: "",
        enableTrails: "",
        print: "",
        species: "",
        avoidObstacles: "",
      };

      const lines = [{ content: "var x = 5", lineIndex: 0 }];

      const result = DSLParser.parseLines(lines, commandMap as any);
      expect(result).toEqual([]);
    });
  });
});
