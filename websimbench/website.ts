// import Simulation from "./simulation";
// import { Grapher, type BenchmarkResult } from "./simulation/helpers/grapher";
// import type { Method, RenderMode } from "./simulation/types";

// var simulationInterval: any = null;
// import { boidsDSL } from "../boids.ts";

// type MethodOption = {
//     id: string;
//     label: string;
//     method: Method;
//     renderMode: RenderMode;
// };
// let benchmarkCancelled = false;

// const options = {
//     agents: 1000  // Reduced for boids simulation performance
// };

// const AGENT_DSL = boidsDSL;

// // const AGENT_DSL = `
// //     vy += inputs.alignmentFactor;
// //     updatePosition(inputs.dt);

// //     var loop_count = inputs.agentCount;
// //     for (var i = 0; i < loop_count; i++) {
        
// //     } 

// //     var _boundary_width = inputs.width;
// //     var _boundary_height = inputs.height;
// //     borderWrapping();
// // `

// const FPS = 100;

// const simulation = new Simulation({
//     canvas: document.querySelector('#simulationCanvas') as HTMLCanvasElement,
//     gpuCanvas: document.querySelector('#gpuCanvas') as HTMLCanvasElement | null,
//     options,
//     agentScript: AGENT_DSL as any
// });

// const PERCEPTION_RADIUS = 40;
// const ALIGNMENT_FACTOR = 0.01;
// const COHESION_FACTOR = 0.001;
// const SEPARATION_FACTOR = 0.06;
// const SEPARATION_DIST = 40;
// const MAX_SPEED = 1;
// const DT = 1;

// const inputValues = {
//     perceptionRadius: PERCEPTION_RADIUS,
//     alignmentFactor: ALIGNMENT_FACTOR,
//     cohesionFactor: COHESION_FACTOR,
//     separationFactor: SEPARATION_FACTOR,
//     separationDist: SEPARATION_DIST,
//     maxSpeed: MAX_SPEED,
//     dt: DT,
//     agentCount: options.agents,
// };

// const startSimulation = (method: Method, renderMode: RenderMode) => {
//     if (simulationInterval) return;

//     simulationInterval = setInterval(() => {
//         void simulation.runFrame(method, inputValues, renderMode);
//     }, 1000 / FPS);
// };

// // Simple simulation controls
// document.getElementById('startButton')?.addEventListener('click', () => {
//     startSimulation("WebGPU", "gpu");
// });

// document.getElementById('startWebGPUButton')?.addEventListener('click', () => {
//     startSimulation("WebGPU", "gpu");
// });

// document.getElementById('stopButton')?.addEventListener('click', () => {
//     clearInterval(simulationInterval!);
//     simulationInterval = null;

//     simulation.renderFrameGraph();
// });

// // Benchmark controls
// const benchmarkCanvas = document.querySelector('#benchmarkCanvas') as HTMLCanvasElement;
// const benchmarkGrapher = new Grapher(benchmarkCanvas);

// const getInputValue = (id: string): number => {
//     const input = document.getElementById(id) as HTMLInputElement;
//     return parseInt(input.value, 10);
// };

// const getCheckboxValue = (id: string): boolean => {
//     const checkbox = document.getElementById(id) as HTMLInputElement;
//     return checkbox.checked;
// };

// const updateBenchmarkStatus = (message: string, state: 'running' | 'complete' | 'error' | 'none') => {
//     const statusDiv = document.getElementById('benchmarkStatus')!;
//     statusDiv.textContent = message;
//     statusDiv.className = state === 'none' ? '' : state;
// };

// const updateBenchmarkProgress = (message: string) => {
//     const progressDiv = document.getElementById('benchmarkProgress')!;
//     progressDiv.textContent = message;
// };

// const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// async function runBenchmark() {
//     benchmarkCancelled = false;

//     const startAgents = getInputValue('startAgents');
//     const endAgents = getInputValue('endAgents');
//     const stepAgents = getInputValue('stepAgents');
//     const framesPerTest = getInputValue('framesPerTest');
//     const warmupRun = getCheckboxValue('warmupRun');
//     const customAgentCountsInput = document.getElementById('customAgentCounts') as HTMLTextAreaElement | null;
//     const rawCustomAgentCounts = (customAgentCountsInput?.value ?? '')
//         .split(/[\s,]+/)
//         .map(token => token.trim())
//         .filter(token => token.length > 0);
//     const parsedCustomAgentCounts = rawCustomAgentCounts.map(token => Number(token));
//     const hasInvalidCustomCount = parsedCustomAgentCounts.some(
//         count => !Number.isFinite(count) || !Number.isInteger(count) || count <= 0
//     );
//     const useCustomAgentCounts = parsedCustomAgentCounts.length > 0;

//     // Get selected methods
//     const methodOptions: MethodOption[] = [
//         { id: 'methodJavaScript', label: 'JavaScript', method: 'JavaScript', renderMode: 'cpu' },
//         { id: 'methodWebAssembly', label: 'WebAssembly', method: 'WebAssembly', renderMode: 'cpu' },
//         { id: 'methodWebWorkers', label: 'WebWorkers', method: 'WebWorkers', renderMode: 'cpu' },
//         { id: 'methodWebGPUCpu', label: 'WebGPU (CPU render)', method: 'WebGPU', renderMode: 'cpu' },
//         { id: 'methodWebGPUGpu', label: 'WebGPU (GPU render)', method: 'WebGPU', renderMode: 'gpu' },
//         { id: 'methodWebGL', label: 'WebGL', method: 'WebGL', renderMode: 'cpu' }
//     ];

//     const selectedMethods = methodOptions.filter(option => getCheckboxValue(option.id));

//     // Validation
//     if (selectedMethods.length === 0) {
//         updateBenchmarkStatus('Please select at least one method to test', 'error');
//         return;
//     }

//     if (hasInvalidCustomCount) {
//         updateBenchmarkStatus('Custom agent counts must be positive integers', 'error');
//         return;
//     }

//     if (!useCustomAgentCounts) {
//         if (startAgents > endAgents) {
//             updateBenchmarkStatus('Start agent count must be less than or equal to end agent count', 'error');
//             return;
//         }
    
//         if (stepAgents <= 0) {
//             updateBenchmarkStatus('Step size must be greater than 0', 'error');
//             return;
//         }
//     }

//     // Disable controls
//     const runButton = document.getElementById('runBenchmark') as HTMLButtonElement;
//     const cancelButton = document.getElementById('cancelBenchmark') as HTMLButtonElement;
//     runButton.disabled = true;
//     cancelButton.disabled = false;

//     updateBenchmarkStatus('Starting benchmark...', 'running');

//     const results: BenchmarkResult[] = [];
//     const agentCounts: number[] = [];

//     if (useCustomAgentCounts) {
//         const uniqueCounts = Array.from(new Set(parsedCustomAgentCounts)).filter(count => count > 0);
//         uniqueCounts.sort((a, b) => a - b);
//         agentCounts.push(...uniqueCounts);
//     } else {
//         // Linear stepping (default)
//         for (let count = startAgents; count <= endAgents; count += stepAgents) {
//             agentCounts.push(count);
//         }
//     }

//     if (agentCounts.length === 0) {
//         updateBenchmarkStatus('No agent counts provided for benchmarking', 'error');
//         return;
//     }

//     const totalTests = agentCounts.length * selectedMethods.length;
//     let completedTests = 0;

//     try {
//         for (const agentCount of agentCounts) {
//             if (benchmarkCancelled) {
//                 updateBenchmarkStatus('Benchmark cancelled', 'error');
//                 break;
//             }

//             for (const { method, renderMode, label } of selectedMethods) {
//                 if (benchmarkCancelled) {
//                     updateBenchmarkStatus('Benchmark cancelled', 'error');
//                     break;
//                 }

//                 updateBenchmarkStatus(`Running benchmark...`, 'running');
//                 updateBenchmarkProgress(
//                     `Testing ${label} with ${agentCount.toLocaleString()} agents (${completedTests + 1}/${totalTests})`
//                 );

//                 // Create a new simulation for this test
//                 const testSimulation = new Simulation({
//                     canvas: benchmarkCanvas,
//                     gpuCanvas: benchmarkCanvas,
//                     options: { agents: agentCount },
//                     agentScript: AGENT_DSL as any
//                 });

//                 // Warmup run
//                 if (warmupRun) {
//                     await testSimulation.runFrame(method, inputValues, renderMode);
//                     await sleep(100);
//                 }

//                 // Clear performance monitor for actual test
//                 testSimulation.getPerformanceMonitor().reset();

//                 // Run test frames
//                 for (let i = 0; i < framesPerTest; i++) {
//                     await testSimulation.runFrame(method, inputValues, renderMode);
//                     await sleep(50); // Small delay between frames
//                 }

//                 // Collect results
//                 const frames = testSimulation.getPerformanceMonitor().frames;
//                 if (frames.length > 0) {
//                     const executionTimes = frames.map(f => f.totalExecutionTime);
//                     const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
//                     const minTime = Math.min(...executionTimes);
//                     const maxTime = Math.max(...executionTimes);

//                     results.push({
//                         method: label,
//                         agentCount,
//                         avgExecutionTime: avgTime,
//                         minExecutionTime: minTime,
//                         maxExecutionTime: maxTime,
//                         frameCount: frames.length
//                     });

//                     console.log(`${label} with ${agentCount} agents: ${avgTime.toFixed(2)} ms avg`);
//                 }

//                 completedTests++;
//             }
//         }

//         if (!benchmarkCancelled && results.length > 0) {
//             // Render the benchmark graph
//             benchmarkGrapher.renderBenchmark(results);
            
//             updateBenchmarkStatus(
//                 `Benchmark complete! Tested ${completedTests} configurations.`,
//                 'complete'
//             );
//             updateBenchmarkProgress('');

//             // Log summary
//             console.log('=== Benchmark Summary ===');
//             for (const { label } of selectedMethods) {
//                 console.log(`\n${label}:`);
//                 const methodResults = results.filter(r => r.method === label);
//                 for (const result of methodResults) {
//                     console.log(
//                         `  ${result.agentCount.toLocaleString()} agents: ` +
//                         `${result.avgExecutionTime.toFixed(2)} ms (min: ${result.minExecutionTime.toFixed(2)}, ` +
//                         `max: ${result.maxExecutionTime.toFixed(2)})`
//                     );
//                 }
//             }
//         }

//     } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         updateBenchmarkStatus(`Benchmark failed: ${message}`, 'error');
//         console.error('Benchmark error:', error);
//     } finally {
//         // Re-enable controls
//         runButton.disabled = false;
//         cancelButton.disabled = true;
//     }
// }

// document.getElementById('runBenchmark')?.addEventListener('click', () => {
//     void runBenchmark();
// });

// document.getElementById('cancelBenchmark')?.addEventListener('click', () => {
//     benchmarkCancelled = true;
//     updateBenchmarkStatus('Cancelling benchmark...', 'running');
// });
// function readFileSync(arg0: string, arg1: string) {
//     throw new Error("Function not implemented.");
// }

