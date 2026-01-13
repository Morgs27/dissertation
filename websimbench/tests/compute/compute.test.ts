import { describe, it, expect, beforeAll } from 'vitest';
import { server } from 'vitest/browser';
import { Compiler } from '../../src/simulation/compiler/compiler';
import { ComputeEngine } from '../../src/simulation/compute/compute';
import { PerformanceMonitor } from '../../src/simulation/performance';
import type { Agent, Method, InputValues, CompilationResult } from '../../src/simulation/types';
import { SIMULATIONS } from '../simulations';
import GPU from '../../src/simulation/helpers/gpu';
import Logger, { LogLevel } from '../../src/simulation/helpers/logger';

// Test configuration
const NUM_FRAMES = 50;  // Increased from 5 for more thorough testing
const NUM_AGENTS = 500;
const WIDTH = 200;
const HEIGHT = 100;

// Methods to test
const METHODS: Method[] = ['JavaScript', 'WebAssembly', 'WebWorkers', 'WebGPU'];

// Lowered tolerances to verify exact parity where possible
const TOLERANCES: Record<Method, number> = {
    'JavaScript': 0,
    'WebGL': 0,
    'WebWorkers': 0,        // Should be exact parity with delta-based merge
    'WebAssembly': 0,       // Strict parity required
    'WebGPU': 0             // Strict parity required
};

// Create a seeded random number generator for reproducible tests
function seededRandom(seed: number) {
    return function () {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
}

// Generate deterministic initial agents
function generateAgents(count: number, width: number, height: number, seed: number = 42): Agent[] {
    const random = seededRandom(seed);
    return Array.from({ length: count }, (_, i) => ({
        id: i,
        x: random() * width,
        y: random() * height,
        vx: (random() - 0.5) * 2,
        vy: (random() - 0.5) * 2
    }));
}

// Deep clone agents to avoid mutation issues
function cloneAgents(agents: Agent[]): Agent[] {
    return agents.map(a => ({ ...a }));
}

// Get default input values for a simulation
function getDefaultInputs(
    compilationResult: CompilationResult,
    width: number,
    height: number,
    agents: Agent[],
    seed: number = 42
): InputValues {
    const inputs: InputValues = {
        width,
        height,
        agents,
        trailMap: new Float32Array(width * height)
    };

    // Add default values from defined inputs
    for (const input of compilationResult.definedInputs) {
        inputs[input.name] = input.defaultValue;
    }

    // Add randomValues if required
    if (compilationResult.requiredInputs.includes('randomValues')) {
        const rng = seededRandom(seed);
        const randomValues = new Float32Array(agents.length);
        for (let i = 0; i < agents.length; i++) {
            randomValues[i] = rng();
        }
        inputs['randomValues'] = randomValues;
    }

    return inputs;
}

// Compare two agent arrays and compute differences
function compareAgents(agents1: Agent[], agents2: Agent[], frame: number = 0, tolerance: number = 0): {
    maxPosDiff: number;
    avgPosDiff: number;
    maxVelDiff: number;
    agentDiffs: Array<{ id: number; posDiff: number; velDiff: number }>;
} {
    let maxPosDiff = 0;
    let maxVelDiff = 0;
    let totalPosDiff = 0;
    const agentDiffs: Array<{ id: number; posDiff: number; velDiff: number }> = [];

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

        if (posDiff > tolerance || velDiff > tolerance) {
            console.log(`[DIVERGENCE] Frame ${frame} Agent ${agents1[i].id}: posDiff=${posDiff}, velDiff=${velDiff}`);
            console.log(`  JS: x=${agents2[i].x}, y=${agents2[i].y}, vx=${agents2[i].vx}, vy=${agents2[i].vy}`);
            console.log(`  GPU: x=${agents1[i].x}, y=${agents1[i].y}, vx=${agents1[i].vx}, vy=${agents1[i].vy}`);
            agentDiffs.push({ id: agents1[i].id, posDiff, velDiff });
        }
    }

    return {
        maxPosDiff,
        avgPosDiff: totalPosDiff / agents1.length,
        maxVelDiff,
        agentDiffs
    };
}

// Helper to write file using Vitest server commands
async function writeOutputFile(relativePath: string, content: string) {
    try {
        await server.commands.writeFile(relativePath, content);
    } catch (error) {
        console.error(`Failed to write file ${relativePath}:`, error);
    }
}

interface MethodResult {
    method: Method;
    frames: Agent[][];
    available: boolean;
}

describe('Compute Cross-Method Comparison', () => {
    for (const [simulationName, sourceCode] of Object.entries(SIMULATIONS)) {
        describe(`${simulationName} simulation`, () => {
            let compilationResult: CompilationResult;
            let initialAgents: Agent[];
            let gpuDevice: any | null = null;

            beforeAll(async () => {
                // Compile the simulation
                const compiler = new Compiler();
                compilationResult = compiler.compileAgentCode(sourceCode);
                initialAgents = generateAgents(NUM_AGENTS, WIDTH, HEIGHT);

                // Try to initialize GPU
                try {
                    const gpuHelper = new GPU('ComputeTest');
                    gpuDevice = await gpuHelper.getDevice();
                } catch (e) {
                    console.warn('WebGPU not available:', e);
                }
            });

            it('should produce matching results across all compute methods', async () => {
                const results: Map<Method, MethodResult> = new Map();

                // Run each method
                for (const method of METHODS) {
                    // Skip WebGPU if not available
                    if (method === 'WebGPU' && !gpuDevice) {
                        console.warn(`Skipping ${method} - GPU device not available`);
                        results.set(method, { method, frames: [], available: false });
                        continue;
                    }

                    const performanceMonitor = new PerformanceMonitor();
                    const computeEngine = new ComputeEngine(
                        compilationResult,
                        performanceMonitor,
                        NUM_AGENTS,
                        4
                    );

                    // Initialize GPU for WebGPU method
                    if (method === 'WebGPU' && gpuDevice) {
                        computeEngine.initGPU(gpuDevice);
                    }

                    // Start with fresh clone of initial agents
                    let agents = cloneAgents(initialAgents);
                    const trailMap = new Float32Array(WIDTH * HEIGHT);
                    const frames: Agent[][] = [];

                    // Setup log capturing
                    const capturedLogs: string[] = [];
                    const logListener = (level: LogLevel, context: string, message: string) => {
                        const levelStr = LogLevel[level] || 'INFO';
                        capturedLogs.push(`[${levelStr}] [${context}] ${message}`);
                    };
                    Logger.addListener(logListener);

                    try {
                        // Run frames
                        for (let frame = 0; frame < NUM_FRAMES; frame++) {
                            const inputs = getDefaultInputs(compilationResult, WIDTH, HEIGHT, agents, frame);
                            inputs.trailMap = trailMap;

                            agents = await computeEngine.runFrame(method, agents, inputs, 'cpu');
                            frames.push(cloneAgents(agents));
                        }
                    } finally {
                        Logger.removeListener(logListener);
                    }

                    // Write logs to file
                    const logPath = `tests/compute/outputs/${simulationName}/${method}_logs.txt`;
                    await writeOutputFile(logPath, capturedLogs.join('\n'));

                    results.set(method, { method, frames, available: true });
                }

                // Use JavaScript as the reference for comparison
                const jsResult = results.get('JavaScript');
                expect(jsResult?.available).toBe(true);

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
                    comparisons: []
                };

                // Collect failures to assert after report is written
                const failures: string[] = [];

                // Compare each method against JavaScript
                for (const [method, result] of results) {
                    if (method === 'JavaScript' || !result.available) continue;

                    const tolerance = TOLERANCES[method];
                    const frameComparisons: typeof comparisonReport.comparisons[0]['vsJavaScript'] = [];

                    let totalAvgError = 0;
                    let overallMaxError = 0;
                    let overallMinError = Infinity;
                    let failedFrames = 0;

                    for (let frame = 0; frame < NUM_FRAMES; frame++) {
                        const jsAgents = jsResult!.frames[frame];
                        const methodAgents = result.frames[frame];

                        if (methodAgents.length !== jsAgents.length) {
                            failures.push(`${method} frame ${frame}: agent count mismatch (${methodAgents.length} vs ${jsAgents.length})`);
                            continue;
                        }

                        const comparison = compareAgents(jsAgents, methodAgents, frame, tolerance);

                        // Calculate min position diff for agents that have any diff
                        const agentsWithDiff = comparison.agentDiffs.filter(d => d.posDiff > 0);
                        const minPosDiff = agentsWithDiff.length > 0
                            ? Math.min(...agentsWithDiff.map(d => d.posDiff))
                            : 0;

                        const passed = comparison.maxPosDiff <= tolerance;
                        frameComparisons.push({
                            frame,
                            maxPosDiff: comparison.maxPosDiff,
                            avgPosDiff: comparison.avgPosDiff,
                            minPosDiff,
                            passed
                        });

                        // Track overall stats
                        totalAvgError += comparison.avgPosDiff;
                        overallMaxError = Math.max(overallMaxError, comparison.maxPosDiff);
                        if (comparison.maxPosDiff > 0) {
                            overallMinError = Math.min(overallMinError, minPosDiff > 0 ? minPosDiff : Infinity);
                        }

                        if (!passed) {
                            failedFrames++;
                            failures.push(`${method} frame ${frame}: maxPosDiff=${comparison.maxPosDiff.toFixed(6)} exceeds tolerance=${tolerance}`);
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
                            minError: overallMinError
                        }
                    });

                    // Summary log for this method
                    const status = overallMaxError <= tolerance ? '✓ PASS' : `✗ FAIL (${failedFrames}/${NUM_FRAMES} frames)`;
                    console.log(`${method}: avg=${avgError.toFixed(6)}, max=${overallMaxError.toFixed(6)}, tolerance=${tolerance} → ${status}`);
                }

                // Write comparison report (always, even on failure)
                const reportPath = `tests/compute/outputs/${simulationName}/comparison_report.json`;
                await writeOutputFile(reportPath, JSON.stringify(comparisonReport, null, 2));

                // Now assert after report is written
                if (failures.length > 0) {
                    console.log(`\n${failures.length} failure(s) detected. See ${reportPath} for details.`);
                    expect.fail(`Parity check failed:\n${failures.slice(0, 5).join('\n')}${failures.length > 5 ? `\n... and ${failures.length - 5} more` : ''}`);
                }
            });
        });
    }
});
