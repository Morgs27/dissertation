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
const NUM_FRAMES = 100; // Reduced to prevent WebSocket payload overflow with 500 agents
const NUM_AGENTS = 500; // Increased to stress test GPU precision
const WIDTH = 600;
const HEIGHT = 600;

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
        vy: (random() - 0.5) * 2,
        species: 0
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
function compareAgents(agents1: Agent[], agents2: Agent[]): {
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

        if (posDiff > 0 || velDiff > 0) {
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

// Interface for position data export
interface PositionDataExport {
    simulation: string;
    generatedAt: string;
    numFrames: number;
    numAgents: number;
    width: number;
    height: number;
    methods: Record<string, {
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
    }>;
}

describe('Compute Cross-Method Comparison', () => {
    for (const [simulationName, sourceCode] of Object.entries(SIMULATIONS)) {
        describe(`${simulationName} simulation`, () => {
            let compilationResult: CompilationResult;
            let initialAgents: Agent[];
            let gpuDevice: any | null = null;

            beforeAll(async () => {
                // Reduce log level to prevent WebSocket payload overflow with large agent counts
                Logger.setGlobalLogLevel(LogLevel.Error);

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

                // Build and export position data for all methods
                const positionData: PositionDataExport = {
                    simulation: simulationName,
                    generatedAt: new Date().toISOString(),
                    numFrames: NUM_FRAMES,
                    numAgents: NUM_AGENTS,
                    width: WIDTH,
                    height: HEIGHT,
                    methods: {}
                };

                for (const [method, result] of results) {
                    positionData.methods[method] = {
                        available: result.available,
                        frames: result.frames.map((agents, frameIdx) => ({
                            frame: frameIdx,
                            agents: agents.map(a => ({
                                id: a.id,
                                x: a.x,
                                y: a.y,
                                vx: a.vx,
                                vy: a.vy
                            }))
                        }))
                    };
                }

                // Write position data to file
                const positionDataPath = `tests/compute/outputs/${simulationName}/positions_data.json`;
                await writeOutputFile(positionDataPath, JSON.stringify(positionData, null, 2));

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

                // Header for detailed report
                console.log('\n' + '='.repeat(80));
                console.log(`PARITY REPORT: ${simulationName.toUpperCase()}`);
                console.log(`Agents: ${NUM_AGENTS} | Frames: ${NUM_FRAMES}`);
                console.log('='.repeat(80));

                // Compare each method against JavaScript
                for (const [method, result] of results) {
                    if (method === 'JavaScript' || !result.available) continue;

                    const tolerance = TOLERANCES[method];
                    const frameComparisons: typeof comparisonReport.comparisons[0]['vsJavaScript'] = [];

                    let totalAvgError = 0;
                    let overallMaxError = 0;
                    let overallMinError = Infinity;

                    console.log(`\n${method} vs JavaScript (tolerance: ${tolerance})`);
                    console.log('-'.repeat(60));
                    console.log('Frame | Avg Error  | Max Error  | Min Error  | Status');
                    console.log('-'.repeat(60));

                    for (let frame = 0; frame < NUM_FRAMES; frame++) {
                        const jsAgents = jsResult!.frames[frame];
                        const methodAgents = result.frames[frame];

                        // Verify agent count matches
                        expect(methodAgents.length).toBe(jsAgents.length);

                        const comparison = compareAgents(jsAgents, methodAgents);

                        // Calculate min position diff for agents that have any diff
                        const agentsWithDiff = comparison.agentDiffs.filter(d => d.posDiff > 0);
                        const minPosDiff = agentsWithDiff.length > 0
                            ? Math.min(...agentsWithDiff.map(d => d.posDiff))
                            : 0;

                        frameComparisons.push({
                            frame,
                            maxPosDiff: comparison.maxPosDiff,
                            avgPosDiff: comparison.avgPosDiff,
                            minPosDiff,
                            passed: comparison.maxPosDiff <= tolerance
                        });

                        // Track overall stats
                        totalAvgError += comparison.avgPosDiff;
                        overallMaxError = Math.max(overallMaxError, comparison.maxPosDiff);
                        if (comparison.maxPosDiff > 0) {
                            overallMinError = Math.min(overallMinError, minPosDiff > 0 ? minPosDiff : Infinity);
                        }

                        // Only log every 50 frames or on failure to reduce output
                        const shouldLog = frame % 50 === 0 || frame === NUM_FRAMES - 1 || comparison.maxPosDiff > tolerance;
                        if (shouldLog) {
                            const status = comparison.maxPosDiff <= tolerance ? '✓ PASS' : '✗ FAIL';
                            console.log(
                                `${String(frame).padStart(5)} | ` +
                                `${comparison.avgPosDiff.toFixed(6).padStart(10)} | ` +
                                `${comparison.maxPosDiff.toFixed(6).padStart(10)} | ` +
                                `${minPosDiff.toFixed(6).padStart(10)} | ` +
                                status
                            );
                        }

                        // Assert positions match within tolerance
                        expect(
                            comparison.maxPosDiff,
                            `${method} frame ${frame} position difference exceeds tolerance`
                        ).toBeLessThanOrEqual(tolerance);
                    }

                    const avgError = totalAvgError / NUM_FRAMES;
                    if (overallMinError === Infinity) overallMinError = 0;

                    console.log('-'.repeat(60));
                    console.log(
                        `OVERALL | ` +
                        `${avgError.toFixed(6).padStart(10)} | ` +
                        `${overallMaxError.toFixed(6).padStart(10)} | ` +
                        `${overallMinError.toFixed(6).padStart(10)} | ` +
                        (overallMaxError <= tolerance ? '✓ PASS' : '✗ FAIL')
                    );

                    comparisonReport.comparisons.push({
                        method,
                        vsJavaScript: frameComparisons,
                        overall: {
                            avgError,
                            maxError: overallMaxError,
                            minError: overallMinError
                        }
                    });
                }

                console.log('\n' + '='.repeat(80));
                console.log('SUMMARY');
                console.log('='.repeat(80));
                for (const comp of comparisonReport.comparisons) {
                    const tolerance = TOLERANCES[comp.method as Method];
                    const status = comp.overall.maxError <= tolerance ? '✓' : '✗';
                    console.log(
                        `${status} ${comp.method}: ` +
                        `avg=${comp.overall.avgError.toFixed(6)}, ` +
                        `max=${comp.overall.maxError.toFixed(6)}, ` +
                        `tolerance=${tolerance}`
                    );
                }
                console.log('='.repeat(80) + '\n');

                // Write comparison report
                const reportPath = `tests/compute/outputs/${simulationName}/comparison_report.json`;
                await writeOutputFile(reportPath, JSON.stringify(comparisonReport, null, 2));
            });
        });
    }
});
