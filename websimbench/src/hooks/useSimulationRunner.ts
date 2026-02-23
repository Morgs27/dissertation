import { useState, useRef, useEffect, useCallback } from "react";
import {
  Logger,
  Method,
  Obstacle,
  RenderMode,
  Simulation,
} from "@websimbench/agentyx";
import { SimulationAppearanceOptions } from "./useSimulationOptions";

/**
 * React hook that manages the lifecycle, rendering, and state of a 2D agent simulation.
 * It handles the WebGPU/CPU context initialization, real-time performance tracking (FPS),
 * and dynamic appearance updates.
 *
 * @param code - The raw agent text code to be compiled and run by the simulation.
 * @param inputs - A record of user-defined input values to feed into the simulation.
 * @param options - Visual appearance options like colors, sizes, and trails.
 * @param obstacles - An array of obstacles defining boundaries and static objects in the environment.
 * @returns An object containing simulation state controls and references to canvas elements.
 */
export function useSimulationRunner(
  code: string,
  inputs: Record<string, number>,
  options: SimulationAppearanceOptions,
  obstacles: Obstacle[] = [],
) {
  const [method, setMethod] = useState<Method>("WebGPU");
  const [renderMode, setRenderMode] = useState<RenderMode>("gpu");
  const [fps, setFps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [hasStartedSimulation, setHasStartedSimulation] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation | null>(null);
  const animationFrameRef = useRef<number>();
  const isRunningRef = useRef<boolean>(false);
  const inputsRef = useRef<Record<string, number | Obstacle[]>>({
    ...inputs,
    obstacles,
  });
  const lastFrameTimeRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);

  const handleRun = useCallback(async () => {
    if (isRunningRef.current) {
      // Stop
      isRunningRef.current = false;
      setIsRunning(false);
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);

      // Print performance summary before destroying
      if (simulationRef.current) {
        simulationRef.current.getPerformanceMonitor().printSummary();
        simulationRef.current.destroy();
      }

      simulationRef.current = null;
      lastFrameTimeRef.current = 0;
      frameTimesRef.current = [];
      setFps(0);
      return;
    }

    if (code.trim().length === 0) {
      return;
    }

    if (!canvasRef.current) return;

    try {
      const primaryCanvas = canvasRef.current;
      const dedicatedGpuCanvas = gpuCanvasRef.current ?? primaryCanvas;

      // Construct appearance from options
      const appearance = {
        agentColor: options.agentColor,
        backgroundColor: options.backgroundColor,
        agentSize: options.agentSize,
        agentShape: options.agentShape,
        showTrails: options.showTrails,
        trailOpacity: options.trailOpacity,
        trailColor: options.trailColor,
        speciesColors: options.speciesColors,
        obstacleColor: options.obstacleColor,
        obstacleBorderColor: options.obstacleBorderColor,
        obstacleOpacity: options.obstacleOpacity,
      };

      simulationRef.current = new Simulation({
        canvas: primaryCanvas,
        gpuCanvas: dedicatedGpuCanvas,
        options: { agents: inputs.agentCount },
        agentScript: code as any,
        appearance,
        tracking: {
          enabled: false,
          captureAgentStates: false,
          captureFrameInputs: false,
          captureLogs: false,
          captureDeviceMetrics: false,
        },
      });

      await simulationRef.current.initGPU();

      lastFrameTimeRef.current = 0;
      frameTimesRef.current = [];
      setFps(0);
      setHasStartedSimulation(true);
      isRunningRef.current = true;
      setIsRunning(true);

      const loop = async () => {
        if (!simulationRef.current || !isRunningRef.current) return;

        try {
          // Use inputsRef.current to get the latest input values
          const currentInputs = { ...inputsRef.current };
          await simulationRef.current.runFrame(
            method,
            currentInputs,
            renderMode,
          );

          const now = performance.now();
          if (lastFrameTimeRef.current > 0) {
            const frameDelta = now - lastFrameTimeRef.current;
            frameTimesRef.current.push(frameDelta);
            if (frameTimesRef.current.length > 60)
              frameTimesRef.current.shift();

            if (frameTimesRef.current.length > 0) {
              const avgFrameTime =
                frameTimesRef.current.reduce((a, b) => a + b, 0) /
                frameTimesRef.current.length;
              const calculatedFps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;
              setFps(Math.min(Math.round(calculatedFps), 999));
            }
          }
          lastFrameTimeRef.current = now;
          animationFrameRef.current = requestAnimationFrame(loop);
        } catch (e) {
          console.error(e);
          isRunningRef.current = false;
          setIsRunning(false);
        }
      };

      loop();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Log to both console and UI Logger
      console.error("Simulation init error", e);
      const logger = new Logger("SimulationRunner", "red");
      logger.error(`Simulation init error: ${message}`);

      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, [code, inputs.agentCount, method, renderMode, obstacles, options]);

  // Update appearance in real-time without restarting
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.updateAppearance({
        agentColor: options.agentColor,
        backgroundColor: options.backgroundColor,
        agentSize: options.agentSize,
        agentShape: options.agentShape,
        showTrails: options.showTrails,
        trailOpacity: options.trailOpacity,
        trailColor: options.trailColor,
        speciesColors: options.speciesColors,
        obstacleColor: options.obstacleColor,
        obstacleBorderColor: options.obstacleBorderColor,
        obstacleOpacity: options.obstacleOpacity,
      });
    }
  }, [options]);

  // Keep inputsRef synchronized with inputs and obstacles
  useEffect(() => {
    inputsRef.current = { ...inputs, obstacles };
  }, [inputs, obstacles]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
      if (simulationRef.current) {
        simulationRef.current.getPerformanceMonitor().printSummary();
        simulationRef.current.destroy();
      }
    };
  }, []);

  return {
    method,
    setMethod,
    renderMode,
    setRenderMode,
    fps,
    isRunning,
    hasStartedSimulation,
    canvasRef,
    gpuCanvasRef,
    handleRun,
  };
}
