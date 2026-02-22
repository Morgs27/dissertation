import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Input,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
  AlertTitle,
  Label,
  Checkbox,
  Button,
} from '@/components/ui';
import { toast } from 'sonner';
import { CheckCircle } from '@phosphor-icons/react';
import {
  InputDefinition,
  Method,
  RenderMode,
  Simulation,
} from '@websimbench/agentyx';
import { SimulationAppearanceOptions } from '@/hooks/useSimulationOptions';
import { RunControl } from './RunControl';
import type {
  BenchmarkReport,
  BenchmarkRunConfig,
  BenchmarkRunRecord,
  BenchmarkSummary,
  BenchmarkSweepConfig,
  CanvasSizeOption,
} from '@/types/benchmark';

interface BenchmarkControlsProps {
  code: string;
  definedInputs: InputDefinition[];
  onComplete: (report: BenchmarkReport) => Promise<void> | void;
  options: SimulationAppearanceOptions;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  gpuCanvasRef: React.RefObject<HTMLCanvasElement>;
  onRenderModeChange: (mode: RenderMode) => void;
  onRunningChange?: (isRunning: boolean) => void;
}

const METHOD_OPTIONS: Method[] = ['JavaScript', 'WebAssembly', 'WebWorkers', 'WebGPU'];
const RENDER_MODE_OPTIONS: RenderMode[] = ['cpu', 'gpu'];

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const parsePositiveIntegerList = (input: string): number[] => {
  return Array.from(
    new Set(
      input
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  ).sort((a, b) => a - b);
};

const parseCanvasSizeList = (input: string): CanvasSizeOption[] => {
  const sizes: CanvasSizeOption[] = [];

  input
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [widthText, heightText] = entry.toLowerCase().split('x');
      const width = Number.parseInt(widthText ?? '', 10);
      const height = Number.parseInt(heightText ?? '', 10);

      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        sizes.push({ width, height });
      }
    });

  return sizes;
};

const buildRunConfigurations = (config: {
  agentCounts: number[];
  methods: Method[];
  renderModes: RenderMode[];
  workerCounts: number[];
  canvasSizes: CanvasSizeOption[];
  runsPerConfig: number;
  framesPerRun: number;
  warmupFrames: number;
}): BenchmarkRunConfig[] => {
  const runConfigs: BenchmarkRunConfig[] = [];

  for (const canvas of config.canvasSizes) {
    for (const agents of config.agentCounts) {
      for (const method of config.methods) {
        const workersToTest = method === 'WebWorkers' ? config.workerCounts : [undefined];

        for (const workers of workersToTest) {
          for (const renderMode of config.renderModes) {
            for (let runIndex = 1; runIndex <= config.runsPerConfig; runIndex++) {
              runConfigs.push({
                agents,
                method,
                renderMode,
                workers,
                canvas,
                framesPerRun: config.framesPerRun,
                warmupFrames: config.warmupFrames,
                runIndex,
              });
            }
          }
        }
      }
    }
  }

  return runConfigs;
};

const summarizeRuns = (runs: BenchmarkRunRecord[]): BenchmarkSummary => {
  const completedRuns = runs.filter((run) => run.status === 'completed');
  const failedRuns = runs.filter((run) => run.status === 'failed');

  const totalFrames = completedRuns.reduce((sum, run) => sum + run.trackingReport.frames.length, 0);
  const totalExecutionMs = completedRuns.reduce(
    (sum, run) => sum + run.trackingReport.summary.totalExecutionMs,
    0
  );

  return {
    totalRuns: runs.length,
    completedRuns: completedRuns.length,
    failedRuns: failedRuns.length,
    totalFrames,
    totalExecutionMs,
    averageFrameExecutionMs: totalFrames > 0 ? totalExecutionMs / totalFrames : 0,
  };
};

export const BenchmarkControls: React.FC<BenchmarkControlsProps> = ({
  code,
  definedInputs,
  onComplete,
  options,
  canvasRef,
  gpuCanvasRef,
  onRenderModeChange,
  onRunningChange,
}) => {
  const [agentRangeMode, setAgentRangeMode] = useState<'manual' | 'range'>('manual');
  const [agentCountsInput, setAgentCountsInput] = useState('100, 500, 1000, 2000');
  const [agentStart, setAgentStart] = useState(100);
  const [agentEnd, setAgentEnd] = useState(2000);
  const [agentStep, setAgentStep] = useState(300);

  const [selectedMethods, setSelectedMethods] = useState<Method[]>(['WebGPU']);
  const [selectedRenderModes, setSelectedRenderModes] = useState<RenderMode[]>(['gpu']);

  const [workerCountsInput, setWorkerCountsInput] = useState('1, 2, 4');
  const [canvasSizesInput, setCanvasSizesInput] = useState('800x600');

  const [framesPerRun, setFramesPerRun] = useState(120);
  const [warmupFrames, setWarmupFrames] = useState(0);
  const [runsPerConfig, setRunsPerConfig] = useState(1);

  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  const cancelledRef = useRef(false);

  useEffect(() => {
    onRunningChange?.(isRunning);
  }, [isRunning, onRunningChange]);

  const estimatedRunCount = useMemo(() => {
    const agentCounts = agentRangeMode === 'manual'
      ? parsePositiveIntegerList(agentCountsInput)
      : (() => {
          if (agentStart >= agentEnd || agentStep <= 0) return [];
          const values: number[] = [];
          for (let value = agentStart; value <= agentEnd; value += agentStep) {
            values.push(value);
          }
          return values;
        })();

    const renderModes = selectedRenderModes.length > 0 ? selectedRenderModes : [];
    const methods = selectedMethods.length > 0 ? selectedMethods : [];
    const canvasSizes = parseCanvasSizeList(canvasSizesInput);
    const workerCounts = parsePositiveIntegerList(workerCountsInput);

    if (agentCounts.length === 0 || renderModes.length === 0 || methods.length === 0 || canvasSizes.length === 0) {
      return 0;
    }

    return buildRunConfigurations({
      agentCounts,
      methods,
      renderModes,
      workerCounts: workerCounts.length > 0 ? workerCounts : [1],
      canvasSizes,
      runsPerConfig: Math.max(runsPerConfig, 1),
      framesPerRun: Math.max(framesPerRun, 1),
      warmupFrames: Math.max(warmupFrames, 0),
    }).length;
  }, [
    agentRangeMode,
    agentCountsInput,
    agentStart,
    agentEnd,
    agentStep,
    selectedMethods,
    selectedRenderModes,
    workerCountsInput,
    canvasSizesInput,
    runsPerConfig,
    framesPerRun,
    warmupFrames,
  ]);

  const toggleMethod = (method: Method) => {
    setSelectedMethods((previous) =>
      previous.includes(method)
        ? previous.filter((entry) => entry !== method)
        : [...previous, method]
    );
  };

  const toggleRenderMode = (mode: RenderMode) => {
    setSelectedRenderModes((previous) =>
      previous.includes(mode)
        ? previous.filter((entry) => entry !== mode)
        : [...previous, mode]
    );
  };

  const runBenchmark = async () => {
    if (!canvasRef.current || !gpuCanvasRef.current) {
      toast.error('Canvas is not ready yet.');
      return;
    }

    if (!code.trim()) {
      toast.error('Simulation code is empty.');
      return;
    }

    if (selectedMethods.length === 0) {
      toast.error('Select at least one compute method.');
      return;
    }

    if (selectedRenderModes.length === 0) {
      toast.error('Select at least one render mode.');
      return;
    }

    const agentCounts =
      agentRangeMode === 'manual'
        ? parsePositiveIntegerList(agentCountsInput)
        : (() => {
            if (agentStart >= agentEnd || agentStep <= 0) return [];
            const values: number[] = [];
            for (let value = agentStart; value <= agentEnd; value += agentStep) {
              values.push(value);
            }
            return values;
          })();

    if (agentCounts.length === 0) {
      toast.error('Provide a valid agent sweep configuration.');
      return;
    }

    const workerCounts = parsePositiveIntegerList(workerCountsInput);
    if (selectedMethods.includes('WebWorkers') && workerCounts.length === 0) {
      toast.error('Provide valid WebWorker counts, e.g. "1, 2, 4".');
      return;
    }

    const canvasSizes = parseCanvasSizeList(canvasSizesInput);
    if (canvasSizes.length === 0) {
      toast.error('Provide valid canvas sizes, e.g. "800x600, 1280x720".');
      return;
    }

    const safeFramesPerRun = Math.max(framesPerRun, 1);
    const safeWarmupFrames = Math.max(warmupFrames, 0);
    const safeRunsPerConfig = Math.max(runsPerConfig, 1);

    const runConfigurations = buildRunConfigurations({
      agentCounts,
      methods: selectedMethods,
      renderModes: selectedRenderModes,
      workerCounts: workerCounts.length > 0 ? workerCounts : [1],
      canvasSizes,
      runsPerConfig: safeRunsPerConfig,
      framesPerRun: safeFramesPerRun,
      warmupFrames: safeWarmupFrames,
    });

    if (runConfigurations.length === 0) {
      toast.error('No benchmark runs were generated from the selected configuration.');
      return;
    }

    const defaultInputs: Record<string, number> = {};
    definedInputs.forEach((definition) => {
      defaultInputs[definition.name] = definition.defaultValue;
    });

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
    } as const;

    setIsRunning(true);
    setShowSuccess(false);
    cancelledRef.current = false;
    setProgress(0);
    setStatusMessage(`Preparing ${runConfigurations.length} runs...`);

    const runRecords: BenchmarkRunRecord[] = [];

    try {
      for (let index = 0; index < runConfigurations.length; index++) {
        if (cancelledRef.current) {
          break;
        }

        const runConfig = runConfigurations[index];
        const startedAt = Date.now();

        setStatusMessage(
          `Run ${index + 1}/${runConfigurations.length}: ${runConfig.method} ${runConfig.renderMode.toUpperCase()} | ${runConfig.agents} agents | ${runConfig.canvas.width}x${runConfig.canvas.height}`
        );

        onRenderModeChange(runConfig.renderMode);

        const cpuCanvas = canvasRef.current;
        const gpuCanvas = gpuCanvasRef.current;

        cpuCanvas.width = runConfig.canvas.width;
        cpuCanvas.height = runConfig.canvas.height;
        gpuCanvas.width = runConfig.canvas.width;
        gpuCanvas.height = runConfig.canvas.height;

        const simulation = new Simulation({
          canvas: cpuCanvas,
          gpuCanvas,
          options: {
            agents: runConfig.agents,
            workers: runConfig.workers,
            width: runConfig.canvas.width,
            height: runConfig.canvas.height,
          },
          source: {
            kind: 'dsl',
            code,
          },
          appearance,
          tracking: {
            enabled: true,
            captureAgentStates: true,
            captureFrameInputs: false,
            captureLogs: true,
            captureDeviceMetrics: true,
          },
          metadata: {
            benchmarkRun: index + 1,
            benchmarkTotalRuns: runConfigurations.length,
          },
        });

        let runRecord: BenchmarkRunRecord;

        try {
          if (runConfig.method === 'WebGPU') {
            await simulation.initGPU();
          }

          const inputs = {
            ...defaultInputs,
            agentCount: runConfig.agents,
          };

          for (let frame = 0; frame < runConfig.warmupFrames; frame++) {
            if (cancelledRef.current) {
              break;
            }
            await simulation.runFrame(runConfig.method, inputs, runConfig.renderMode);
          }

          for (let frame = 0; frame < runConfig.framesPerRun; frame++) {
            if (cancelledRef.current) {
              break;
            }
            await simulation.runFrame(runConfig.method, inputs, runConfig.renderMode);
          }

          const trackingReport = simulation.getTrackingReport();

          runRecord = {
            id: generateId(),
            startedAt,
            endedAt: Date.now(),
            status: 'completed',
            config: runConfig,
            runtimeMetrics: trackingReport.run.environment,
            trackingReport,
          };
        } catch (error) {
          const trackingReport = simulation.getTrackingReport();
          const message = error instanceof Error ? error.message : String(error);

          runRecord = {
            id: generateId(),
            startedAt,
            endedAt: Date.now(),
            status: 'failed',
            config: runConfig,
            runtimeMetrics: trackingReport.run.environment,
            trackingReport,
            error: message,
          };
        } finally {
          simulation.destroy();
        }

        runRecords.push(runRecord);
        setProgress(((index + 1) / runConfigurations.length) * 100);
      }

      if (runRecords.length > 0) {
        const sweepConfig: BenchmarkSweepConfig = {
          agentCounts,
          methods: selectedMethods,
          renderModes: selectedRenderModes,
          workerCounts: workerCounts.length > 0 ? workerCounts : [1],
          canvasSizes,
          framesPerRun: safeFramesPerRun,
          warmupFrames: safeWarmupFrames,
          runsPerConfig: safeRunsPerConfig,
        };

        const report: BenchmarkReport = {
          id: generateId(),
          timestamp: Date.now(),
          sourceCode: code,
          sweepConfig,
          runs: runRecords,
          summary: summarizeRuns(runRecords),
        };

        await onComplete(report);
        setShowSuccess(true);

        if (cancelledRef.current) {
          setStatusMessage('Benchmark cancelled. Partial report saved.');
        } else {
          setStatusMessage('Benchmark complete. Report saved.');
        }
      } else if (cancelledRef.current) {
        setStatusMessage('Benchmark cancelled before first run completed.');
      }
    } finally {
      setIsRunning(false);
    }
  };

  const stopBenchmark = () => {
    cancelledRef.current = true;
    setStatusMessage('Cancelling benchmark...');
  };

  return (
    <div className="flex flex-col gap-6">
      <RunControl isRunning={isRunning} onRun={runBenchmark} onStop={stopBenchmark}>
        <div className="text-xs font-mono text-gray-400">
          Estimated runs: <span className="text-white font-bold">{estimatedRunCount}</span>
        </div>
      </RunControl>

      {(isRunning || progress > 0) && (
        <div className="space-y-2 bg-black/20 p-3 rounded-lg border border-white/5">
          <div className="flex justify-between text-[11px] font-mono text-gray-400">
            <span>{statusMessage}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-gray-400">Agent Sweep</Label>
            <div className="flex flex-col gap-2">
              <Select value={agentRangeMode} onValueChange={(value: 'manual' | 'range') => setAgentRangeMode(value)}>
                <SelectTrigger className="h-9 bg-black/40 border-white/5">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={5} className="bg-[#1a2e33] border-white/10 text-white">
                  <SelectItem value="manual">Manual list</SelectItem>
                  <SelectItem value="range">Range stepper</SelectItem>
                </SelectContent>
              </Select>

              {agentRangeMode === 'manual' ? (
                <Input
                  value={agentCountsInput}
                  onChange={(event) => setAgentCountsInput(event.target.value)}
                  placeholder="100, 500, 1000"
                  className="h-9 bg-black/40 border-white/10 text-tropicalTeal font-mono text-xs"
                />
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    type="number"
                    value={agentStart}
                    onChange={(event) => setAgentStart(Number.parseInt(event.target.value, 10))}
                    className="h-9 bg-black/40 border-white/10 text-tropicalTeal font-mono text-xs"
                    placeholder="Start"
                  />
                  <Input
                    type="number"
                    value={agentEnd}
                    onChange={(event) => setAgentEnd(Number.parseInt(event.target.value, 10))}
                    className="h-9 bg-black/40 border-white/10 text-tropicalTeal font-mono text-xs"
                    placeholder="End"
                  />
                  <Input
                    type="number"
                    value={agentStep}
                    onChange={(event) => setAgentStep(Number.parseInt(event.target.value, 10))}
                    className="h-9 bg-black/40 border-white/10 text-tropicalTeal font-mono text-xs"
                    placeholder="Step"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-gray-400">Methods</Label>
            <div className="bg-black/20 p-3 rounded-md border border-white/5 grid grid-cols-2 gap-2">
              {METHOD_OPTIONS.map((method) => (
                <label key={method} className="flex items-center gap-2 text-xs text-gray-200">
                  <Checkbox
                    checked={selectedMethods.includes(method)}
                    onCheckedChange={() => toggleMethod(method)}
                    className="border-white/20 data-checked:bg-tropicalTeal data-checked:text-black"
                  />
                  {method}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-gray-400">Render Modes</Label>
            <div className="bg-black/20 p-3 rounded-md border border-white/5 grid grid-cols-2 gap-2">
              {RENDER_MODE_OPTIONS.map((mode) => (
                <label key={mode} className="flex items-center gap-2 text-xs text-gray-200 uppercase">
                  <Checkbox
                    checked={selectedRenderModes.includes(mode)}
                    onCheckedChange={() => toggleRenderMode(mode)}
                    className="border-white/20 data-checked:bg-tropicalTeal data-checked:text-black"
                  />
                  {mode}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-gray-400">Configuration Sweep</Label>
            <div className="bg-black/20 p-3 rounded-md border border-white/5 space-y-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-gray-500 font-bold uppercase">Worker Counts (WebWorkers)</Label>
                <Input
                  value={workerCountsInput}
                  onChange={(event) => setWorkerCountsInput(event.target.value)}
                  className="h-8 bg-black/40 border-white/10 text-xs font-mono text-tropicalTeal"
                  placeholder="1, 2, 4"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-gray-500 font-bold uppercase">Canvas Sizes</Label>
                <Input
                  value={canvasSizesInput}
                  onChange={(event) => setCanvasSizesInput(event.target.value)}
                  className="h-8 bg-black/40 border-white/10 text-xs font-mono text-tropicalTeal"
                  placeholder="800x600, 1280x720"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase font-bold text-gray-400">Run Controls</Label>
            <div className="grid grid-cols-3 gap-2 bg-black/20 p-3 rounded-md border border-white/5">
              <div className="space-y-1">
                <Label className="text-[10px] text-gray-500 font-bold uppercase">Frames</Label>
                <Input
                  type="number"
                  value={framesPerRun}
                  onChange={(event) => setFramesPerRun(Number.parseInt(event.target.value, 10))}
                  className="h-8 bg-black/40 border-white/10 text-xs text-center"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-gray-500 font-bold uppercase">Warmup</Label>
                <Input
                  type="number"
                  value={warmupFrames}
                  onChange={(event) => setWarmupFrames(Number.parseInt(event.target.value, 10))}
                  className="h-8 bg-black/40 border-white/10 text-xs text-center"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-gray-500 font-bold uppercase">Repeats</Label>
                <Input
                  type="number"
                  value={runsPerConfig}
                  onChange={(event) => setRunsPerConfig(Number.parseInt(event.target.value, 10))}
                  className="h-8 bg-black/40 border-white/10 text-xs text-center"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {showSuccess && (
        <Alert className="bg-teal-900/20 border-teal-500/50 mt-4">
          <CheckCircle className="h-4 w-4 text-teal-500" />
          <AlertTitle className="text-teal-500 font-bold">Benchmark Complete</AlertTitle>
          <AlertDescription className="text-xs opacity-80">
            Raw benchmark report saved to IndexedDB and available in Reports.
          </AlertDescription>
        </Alert>
      )}

      {!isRunning && progress > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setProgress(0);
            setStatusMessage('Idle');
          }}
        >
          Reset Progress
        </Button>
      )}
    </div>
  );
};
