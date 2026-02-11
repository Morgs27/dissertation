import { useState, useRef, useEffect, useCallback } from 'react';
import { Simulation } from '../simulation/simulation';
import Logger from '../simulation/helpers/logger';
import { Method, RenderMode } from '../simulation/types';
import { SimulationAppearanceOptions } from './useSimulationOptions';

export function useSimulationRunner(code: string, inputs: Record<string, number>, options: SimulationAppearanceOptions) {
  const [method, setMethod] = useState<Method>('WebGPU');
  const [renderMode, setRenderMode] = useState<RenderMode>('gpu');
  const [fps, setFps] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<Simulation | null>(null);
  const animationFrameRef = useRef<number>();
  const isRunningRef = useRef<boolean>(false);
  const inputsRef = useRef<Record<string, number>>(inputs);
  const lastFrameTimeRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);

  const handleRun = useCallback(async () => {
    if (isRunningRef.current) {
      // Stop
      isRunningRef.current = false;
      setIsRunning(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);

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

    if (!canvasRef.current || !gpuCanvasRef.current) return;

    try {
      // Construct appearance from options
      const appearance = {
        agentColor: options.agentColor,
        backgroundColor: options.backgroundColor,
        agentSize: options.agentSize,
        agentShape: options.agentShape,
        showTrails: options.showTrails,
        trailColor: options.trailColor
      };

      simulationRef.current = new Simulation({
        canvas: canvasRef.current,
        gpuCanvas: gpuCanvasRef.current,
        options: { agents: inputs.agentCount },
        agentScript: code as any,
        appearance
      });

      await simulationRef.current.initGPU();

      lastFrameTimeRef.current = 0;
      frameTimesRef.current = [];
      setFps(0);
      isRunningRef.current = true;
      setIsRunning(true);

      const loop = async () => {
        if (!simulationRef.current || !isRunningRef.current) return;

        try {
          // Use inputsRef.current to get the latest input values
          const currentInputs = { ...inputsRef.current };
          await simulationRef.current.runFrame(method, currentInputs, renderMode);

          const now = performance.now();
          if (lastFrameTimeRef.current > 0) {
            const frameDelta = now - lastFrameTimeRef.current;
            frameTimesRef.current.push(frameDelta);
            if (frameTimesRef.current.length > 60) frameTimesRef.current.shift();

            if (frameTimesRef.current.length > 0) {
              const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
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
      const logger = new Logger('SimulationRunner', 'red');
      logger.error(`Simulation init error: ${message}`);

      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, [code, inputs, method, renderMode, options]);

  // Keep inputsRef synchronized with inputs
  useEffect(() => {
    inputsRef.current = inputs;
  }, [inputs]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
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
    canvasRef,
    gpuCanvasRef,
    handleRun
  };
}
