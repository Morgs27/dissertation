/**
 * @module agentyx
 *
 * **Agentyx** — A browser-native 2D agent-based simulation engine.
 *
 * Provides a DSL compiler, multi-backend compute engine (JavaScript, Web Workers,
 * WebAssembly, WebGPU), CPU/GPU renderer, and built-in tracking & performance
 * monitoring.
 *
 * @example
 * ```ts
 * import { Simulation } from '@websimbench/agentyx';
 *
 * const sim = new Simulation({
 *   agentScript: 'moveForward 1\nborderWrapping',
 *   options: { agents: 1000 },
 *   canvas: document.getElementById('canvas') as HTMLCanvasElement,
 * });
 *
 * const result = await sim.runFrame('JavaScript');
 * ```
 *
 * @packageDocumentation
 */

export {
  Simulation as AgentyxSimulation,
  Simulation,
  MAX_AGENTS,
} from "./simulation";
export { Compiler } from "./compiler/compiler";
export { ComputeEngine } from "./compute/compute";
export { PerformanceMonitor } from "./performance";
export {
  collectRuntimeMetrics,
  type RuntimeMetrics,
  type RuntimeDeviceMetrics,
  type RuntimeBrowserMetrics,
  type RuntimeGPUMetrics,
} from "./helpers/deviceInfo";
export {
  SimulationTracker,
  type SimulationTrackingReport,
  type SimulationTrackingFilter,
  type SimulationRunMetadata,
  type SimulationRunSummary,
  type SimulationFrameRecord,
  type SimulationLogEntry,
  type SimulationErrorEntry,
} from "./tracking";
export { default as Logger, LogLevel } from "./helpers/logger";
export type {
  Agent,
  CompilationResult,
  CustomCodeSource,
  InputDefinition,
  InputValues,
  Method,
  Obstacle,
  RenderMode,
  SimulationAppearance,
  SimulationConstructor,
  SimulationFrameResult,
  SimulationOptions,
  SimulationSource,
  TrackingOptions,
} from "./types";

export { default } from "./simulation";
