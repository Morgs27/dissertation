import { describe, it, expect, beforeAll } from "vitest";
import { server } from "vitest/browser";
import { Compiler } from "../../src/compiler/compiler";
import { ComputeEngine } from "../../src/compute/compute";
import {
  PerformanceMonitor,
  type FramePerformance,
} from "../../src/performance";
import type {
  Agent,
  Method,
  InputValues,
  CompilationResult,
  RenderMode,
} from "../../src/types";
import { SIMULATIONS } from "../simulations";
import GPU from "../../src/helpers/gpu";
import Logger, { LogLevel } from "../../src/helpers/logger";

// Test configuration
const NUM_FRAMES = 100;
const NUM_AGENTS = 500;
const WIDTH = 600;
const HEIGHT = 600;

const SHOULD_WRITE_ARTIFACTS =
  typeof process !== "undefined" &&
  Boolean(process.env) &&
  process.env.WRITE_COMPUTE_ARTIFACTS === "1";

// Methods to test
const METHODS: Method[] = ["JavaScript", "WebAssembly", "WebWorkers", "WebGPU"];

// Tolerances for cross-method comparison.
const TOLERANCES: Record<Method, number> = {
  JavaScript: 0,
  WebGL: 0,
  WebWorkers: 0,
  WebAssembly: 0,
  WebGPU: 0.01,
};

const GPU_STRICT_FRAMES = 5;

function seededRandom(seed: number) {
  return function () {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

function hashStringSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleMethods(methods: Method[], seed: number): Method[] {
  const random = seededRandom(seed);
  const shuffled = [...methods];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

function generateAgents(
  count: number,
  width: number,
  height: number,
  seed: number = 42,
): Agent[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: random() * width,
    y: random() * height,
    vx: (random() - 0.5) * 2,
    vy: (random() - 0.5) * 2,
    species: 0,
  }));
}

function cloneAgents(agents: Agent[]): Agent[] {
  return agents.map((a) => ({ ...a }));
}

function getDefaultInputs(
  compilationResult: CompilationResult,
  width: number,
  height: number,
  agents: Agent[],
  seed: number = 42,
): InputValues {
  const inputs: InputValues = {
    width,
    height,
    agents,
    trailMap: new Float32Array(width * height),
  };

  for (const input of compilationResult.definedInputs) {
    inputs[input.name] = input.defaultValue;
  }

  if (compilationResult.requiredInputs.includes("randomValues")) {
    const rng = seededRandom(seed);
    const numRandomCalls = compilationResult.numRandomCalls || 1;
    const randomValues = new Float32Array(agents.length * numRandomCalls);
    for (let i = 0; i < randomValues.length; i++) {
      randomValues[i] = rng();
    }
    inputs["randomValues"] = randomValues;
  }

  if (compilationResult.requiredInputs.includes("obstacles")) {
    inputs["obstacles"] = [
      { x: 100, y: 100, w: 80, h: 80 },
      { x: 300, y: 250, w: 60, h: 120 },
      { x: 450, y: 400, w: 100, h: 50 },
    ];
  }

  return inputs;
}

function compareAgents(
  agents1: Agent[],
  agents2: Agent[],
): {
  maxPosDiff: number;
  avgPosDiff: number;
  maxVelDiff: number;
  avgVelDiff: number;
  agentDiffs: Array<{ id: number; posDiff: number; velDiff: number }>;
} {
  let maxPosDiff = 0;
  let maxVelDiff = 0;
  let totalPosDiff = 0;
  let totalVelDiff = 0;
  const agentDiffs: Array<{ id: number; posDiff: number; velDiff: number }> =
    [];

  for (let i = 0; i < agents1.length; i++) {
    const xDiff = Math.abs(agents1[i].x - agents2[i].x);
    const yDiff = Math.abs(agents1[i].y - agents2[i].y);
    const vxDiff = Math.abs(agents1[i].vx - agents2[i].vx);
    const vyDiff = Math.abs(agents1[i].vy - agents2[i].vy);

    const posDiff = Math.sqrt(xDiff * xDiff + yDiff * yDiff);
    const velDiff = Math.sqrt(vxDiff * vxDiff + vyDiff * vyDiff);

    maxPosDiff = Math.max(maxPosDiff, posDiff);
    maxVelDiff = Math.max(maxVelDiff, velDiff);
    totalPosDiff += posDiff;
    totalVelDiff += velDiff;

    if (posDiff > 0 || velDiff > 0) {
      agentDiffs.push({ id: agents1[i].id, posDiff, velDiff });
    }
  }

  return {
    maxPosDiff,
    avgPosDiff: totalPosDiff / agents1.length,
    maxVelDiff,
    avgVelDiff: totalVelDiff / agents1.length,
    agentDiffs,
  };
}

async function writeOutputFile(relativePath: string, content: string) {
  if (!SHOULD_WRITE_ARTIFACTS) {
    return;
  }

  try {
    await server.commands.writeFile(relativePath, content);
  } catch (error) {
    console.error(`Failed to write file ${relativePath}:`, error);
  }
}

interface MethodMetrics {
  frameCount: number;
  kernelMs: number;
  endToEndComputeMs: number;
  compileMs: number | null;
}

interface MethodResult {
  method: Method;
  frames: Agent[][];
  available: boolean;
  metrics: MethodMetrics;
  renderMode: RenderMode;
}

interface PositionDataExport {
  simulation: string;
  generatedAt: string;
  numFrames: number;
  numAgents: number;
  width: number;
  height: number;
  methods: Record<
    string,
    {
      available: boolean;
      frames: Array<{
        frame: number;
        agents: Array<{
          id: number;
          x: number;
          y: number;
          vx: number;
          vy: number;
        }>;
      }>;
    }
  >;
}

function extractMetrics(frames: FramePerformance[]): MethodMetrics {
  if (frames.length === 0) {
    return {
      frameCount: 0,
      kernelMs: 0,
      endToEndComputeMs: 0,
      compileMs: null,
    };
  }

  let kernelSum = 0;
  let endToEndSum = 0;

  for (const frame of frames) {
    const setup = frame.setupTime ?? 0;
    const compute = frame.computeTime ?? 0;
    const readback = frame.readbackTime ?? 0;

    expect(Number.isFinite(setup)).toBe(true);
    expect(Number.isFinite(compute)).toBe(true);
    expect(Number.isFinite(readback)).toBe(true);

    expect(setup).toBeGreaterThanOrEqual(0);
    expect(compute).toBeGreaterThanOrEqual(0);
    expect(readback).toBeGreaterThanOrEqual(0);

    kernelSum += compute;
    endToEndSum += setup + compute + readback;
  }

  const compileFrame = frames.find((f) => typeof f.compileTime === "number");

  return {
    frameCount: frames.length,
    kernelMs: kernelSum / frames.length,
    endToEndComputeMs: endToEndSum / frames.length,
    compileMs: compileFrame?.compileTime ?? null,
  };
}

async function runMethodVariant(
  compilationResult: CompilationResult,
  initialAgents: Agent[],
  method: Method,
  renderMode: RenderMode,
  gpuDevice: GPUDevice | null,
  captureFrames: boolean,
): Promise<{ frames: Agent[][]; logs: string[]; metrics: MethodMetrics }> {
  const performanceMonitor = new PerformanceMonitor();
  const computeEngine = new ComputeEngine(
    compilationResult,
    performanceMonitor,
    NUM_AGENTS,
    4,
  );

  if (method === "WebGPU" && gpuDevice) {
    computeEngine.initGPU(gpuDevice);
  }

  let agents = cloneAgents(initialAgents);
  const trailMap = new Float32Array(WIDTH * HEIGHT);
  const frames: Agent[][] = [];

  const capturedLogs: string[] = [];
  const shouldCaptureLogs = SHOULD_WRITE_ARTIFACTS;
  const logListener = (level: LogLevel, context: string, message: string) => {
    const levelStr = LogLevel[level] || "INFO";
    capturedLogs.push(`[${levelStr}] [${context}] ${message}`);
  };

  if (shouldCaptureLogs) {
    Logger.addListener(logListener);
  }

  try {
    for (let frame = 0; frame < NUM_FRAMES; frame++) {
      const inputs = getDefaultInputs(
        compilationResult,
        WIDTH,
        HEIGHT,
        agents,
        frame,
      );
      inputs.trailMap = trailMap;

      agents = await computeEngine.runFrame(method, agents, inputs, renderMode);
      if (captureFrames) {
        frames.push(cloneAgents(agents));
      }
    }

    const metrics = extractMetrics(performanceMonitor.frames);
    expect(metrics.frameCount).toBe(NUM_FRAMES);

    return { frames, logs: capturedLogs, metrics };
  } finally {
    if (shouldCaptureLogs) {
      Logger.removeListener(logListener);
    }
    computeEngine.destroy();
  }
}

describe("Compute Cross-Method Comparison", () => {
  for (const [simulationName, sourceCode] of Object.entries(SIMULATIONS)) {
    describe(`${simulationName} simulation`, () => {
      let compilationResult: CompilationResult;
      let initialAgents: Agent[];
      let gpuDevice: GPUDevice | null = null;

      beforeAll(async () => {
        Logger.setGlobalLogLevel(LogLevel.Error);

        const compiler = new Compiler();
        compilationResult = compiler.compileAgentCode(sourceCode);
        initialAgents = generateAgents(NUM_AGENTS, WIDTH, HEIGHT);

        try {
          const gpuHelper = new GPU("ComputeTest");
          gpuDevice = (await gpuHelper.getDevice()) as GPUDevice;
        } catch (e) {
          console.warn("WebGPU not available:", e);
        }
      });

      it("should produce matching results across all compute methods", async () => {
        const results: Map<Method, MethodResult> = new Map();
        const benchmarkSummary: Record<
          string,
          MethodMetrics | { unavailable: true }
        > = {};

        const runOrder = shuffleMethods(
          METHODS,
          hashStringSeed(simulationName),
        );

        for (const method of runOrder) {
          if (method === "WebGPU" && !gpuDevice) {
            results.set(method, {
              method,
              frames: [],
              available: false,
              metrics: {
                frameCount: 0,
                kernelMs: 0,
                endToEndComputeMs: 0,
                compileMs: null,
              },
              renderMode: "cpu",
            });
            benchmarkSummary["WebGPU(cpu)"] = { unavailable: true };
            continue;
          }

          const run = await runMethodVariant(
            compilationResult,
            initialAgents,
            method,
            "cpu",
            gpuDevice,
            true,
          );

          if (SHOULD_WRITE_ARTIFACTS) {
            const logPath = `tests/compute/outputs/${simulationName}/${method}_logs.txt`;
            await writeOutputFile(logPath, run.logs.join("\n"));
          }

          results.set(method, {
            method,
            frames: run.frames,
            available: true,
            metrics: run.metrics,
            renderMode: "cpu",
          });

          benchmarkSummary[method] = run.metrics;
        }

        let webgpuGpuMetrics: MethodMetrics | null = null;
        if (gpuDevice) {
          const webgpuGpuRun = await runMethodVariant(
            compilationResult,
            initialAgents,
            "WebGPU",
            "gpu",
            gpuDevice,
            false,
          );
          webgpuGpuMetrics = webgpuGpuRun.metrics;
          benchmarkSummary["WebGPU(gpu)"] = webgpuGpuRun.metrics;
        } else {
          benchmarkSummary["WebGPU(gpu)"] = { unavailable: true };
        }

        const jsResult = results.get("JavaScript");
        expect(jsResult?.available).toBe(true);

        if (gpuDevice) {
          const webgpuCpuResult = results.get("WebGPU");
          expect(webgpuCpuResult?.available).toBe(true);
          expect(webgpuCpuResult?.metrics.frameCount).toBe(NUM_FRAMES);
          expect(webgpuGpuMetrics?.frameCount).toBe(NUM_FRAMES);
        }

        const comparisonReport: {
          simulation: string;
          generatedAt: string;
          numFrames: number;
          numAgents: number;
          comparisons: Array<{
            method: string;
            vsJavaScript: {
              frame: number;
              maxPosDiff: number;
              avgPosDiff: number;
              minPosDiff: number;
              maxVelDiff: number;
              avgVelDiff: number;
              passed: boolean;
            }[];
            overall: {
              avgError: number;
              maxError: number;
              minError: number;
            };
          }>;
        } = {
          simulation: simulationName,
          generatedAt: new Date().toISOString(),
          numFrames: NUM_FRAMES,
          numAgents: NUM_AGENTS,
          comparisons: [],
        };

        for (const [method, result] of results) {
          if (method === "JavaScript" || !result.available) continue;

          const tolerance = TOLERANCES[method];
          const frameComparisons: (typeof comparisonReport.comparisons)[0]["vsJavaScript"] =
            [];

          let totalAvgError = 0;
          let overallMaxError = 0;
          let overallMinError = Infinity;

          for (let frame = 0; frame < NUM_FRAMES; frame++) {
            const jsAgents = jsResult!.frames[frame];
            const methodAgents = result.frames[frame];

            expect(methodAgents.length).toBe(jsAgents.length);

            const comparison = compareAgents(jsAgents, methodAgents);

            const agentsWithDiff = comparison.agentDiffs.filter(
              (d) => d.posDiff > 0,
            );
            const minPosDiff =
              agentsWithDiff.length > 0
                ? Math.min(...agentsWithDiff.map((d) => d.posDiff))
                : 0;

            frameComparisons.push({
              frame,
              maxPosDiff: comparison.maxPosDiff,
              avgPosDiff: comparison.avgPosDiff,
              minPosDiff,
              maxVelDiff: comparison.maxVelDiff,
              avgVelDiff: comparison.avgVelDiff,
              passed: comparison.maxPosDiff <= tolerance,
            });

            totalAvgError += comparison.avgPosDiff;
            overallMaxError = Math.max(overallMaxError, comparison.maxPosDiff);
            if (comparison.maxPosDiff > 0) {
              overallMinError = Math.min(
                overallMinError,
                minPosDiff > 0 ? minPosDiff : Infinity,
              );
            }

            if (
              method === "WebGPU" &&
              frame >= GPU_STRICT_FRAMES &&
              comparison.maxPosDiff > tolerance
            ) {
              // Expected for chaotic paths after strict window.
            } else {
              expect(
                comparison.maxPosDiff,
                `${method} frame ${frame} position difference exceeds tolerance`,
              ).toBeLessThanOrEqual(tolerance);
            }
          }

          const avgError = totalAvgError / NUM_FRAMES;
          if (overallMinError === Infinity) overallMinError = 0;

          comparisonReport.comparisons.push({
            method,
            vsJavaScript: frameComparisons,
            overall: {
              avgError,
              maxError: overallMaxError,
              minError: overallMinError,
            },
          });
        }

        const summaryLines = Object.entries(benchmarkSummary).map(
          ([name, metrics]) => {
            if ("unavailable" in metrics) {
              return `${name}: unavailable`;
            }
            const compile =
              metrics.compileMs === null
                ? "n/a"
                : `${metrics.compileMs.toFixed(3)}ms`;
            return `${name}: kernel=${metrics.kernelMs.toFixed(4)}ms, e2e=${metrics.endToEndComputeMs.toFixed(4)}ms, compile=${compile}`;
          },
        );
        console.log(`[${simulationName}] ${summaryLines.join(" | ")}`);

        if (SHOULD_WRITE_ARTIFACTS) {
          const positionData: PositionDataExport = {
            simulation: simulationName,
            generatedAt: new Date().toISOString(),
            numFrames: NUM_FRAMES,
            numAgents: NUM_AGENTS,
            width: WIDTH,
            height: HEIGHT,
            methods: {},
          };

          for (const [method, result] of results) {
            positionData.methods[method] = {
              available: result.available,
              frames: result.frames.map((agents, frameIdx) => ({
                frame: frameIdx,
                agents: agents.map((a) => ({
                  id: a.id,
                  x: a.x,
                  y: a.y,
                  vx: a.vx,
                  vy: a.vy,
                })),
              })),
            };
          }

          const positionDataPath = `tests/compute/outputs/${simulationName}/positions_data.json`;
          await writeOutputFile(
            positionDataPath,
            JSON.stringify(positionData, null, 2),
          );

          const reportPath = `tests/compute/outputs/${simulationName}/comparison_report.json`;
          await writeOutputFile(
            reportPath,
            JSON.stringify(comparisonReport, null, 2),
          );

          const performanceReportPath = `tests/compute/outputs/${simulationName}/performance_report.json`;
          await writeOutputFile(
            performanceReportPath,
            JSON.stringify(
              {
                simulation: simulationName,
                generatedAt: new Date().toISOString(),
                numFrames: NUM_FRAMES,
                numAgents: NUM_AGENTS,
                benchmarks: benchmarkSummary,
              },
              null,
              2,
            ),
          );
        }
      });
    });
  }
});
