import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import { RenderMode } from '@websimbench/agentyx';
import { EditorPanel } from '../components/EditorPanel';
import { LogsPanel } from '../components/LogsPanel';
import { PlaygroundControls } from '../components/Controls/PlaygroundControls';
import { BenchmarkControls } from '../components/Controls/BenchmarkControls';
import { CanvasArea } from '../components/CanvasArea';

import { useCodeCompiler } from '../hooks/useCodeCompiler';
import { useSimulationRunner } from '../hooks/useSimulationRunner';
import { useLogger } from '../hooks/useLogger';
import { useObstacles } from '../hooks/useObstacles';

import { Tabs } from '../components/ui/tabs';
import { useState, useRef } from 'react';
import { GameControllerIcon, Gear } from '@phosphor-icons/react';
import { SimulationAppearanceOptions, UpdateOptionFn } from '@/hooks/useSimulationOptions';
import type { BenchmarkReport } from '@/types/benchmark';
import { OptionsView } from './OptionsView';
import { HeaderIconButton } from '@/components/ui/header-icon-button';


interface HomeProps {
  options: SimulationAppearanceOptions;
  updateOption: UpdateOptionFn;
  resetOptions: () => void;
  onBenchmarkComplete: (report: BenchmarkReport) => Promise<void> | void;
}

export const Home = ({ options, updateOption, resetOptions, onBenchmarkComplete }: HomeProps) => {
  const OBSTACLE_SIZE = 50;
  const OBSTACLE_HALF_SIZE = OBSTACLE_SIZE / 2;

  const [activeHomeTab, setActiveHomeTab] = useState('playground');
  const [benchmarkRenderMode, setBenchmarkRenderMode] = useState<RenderMode>('cpu');
  const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const controlsPanelRef = useRef<ImperativePanelHandle>(null);

  const {
    code,
    setCode,
    compiledCode,
    inputs,
    definedInputs,
    isCompiling,
    compileErrors,
    handleInputChange,
    handleSaveCode,
    handleLoadCode,
  } = useCodeCompiler();

  const {
    obstacles,
    isPlacing,
    setIsPlacing,
    addObstacle,
    clearObstacles,
  } = useObstacles();

  const {
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
  } = useSimulationRunner(code, inputs, options, obstacles);

  const { logs, clearLogs } = useLogger();

  const handlePlaceObstacle = (x: number, y: number, simulationWidth: number, simulationHeight: number) => {
    const maxX = Math.max(simulationWidth - OBSTACLE_SIZE, 0);
    const maxY = Math.max(simulationHeight - OBSTACLE_SIZE, 0);

    addObstacle({
      x: Math.min(Math.max(x - OBSTACLE_HALF_SIZE, 0), maxX),
      y: Math.min(Math.max(y - OBSTACLE_HALF_SIZE, 0), maxY),
      w: OBSTACLE_SIZE,
      h: OBSTACLE_SIZE
    });
  };

  const activeRenderMode =
    activeHomeTab === 'benchmark'
      ? benchmarkRenderMode
      : renderMode;
  const canRunSimulation = code.trim().length > 0;

  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={50} minSize={20}>
        <PanelGroup direction="vertical">
          <Panel defaultSize={80} minSize={20}>
            <EditorPanel
              code={code}
              setCode={setCode}
              handleSaveCode={handleSaveCode}
              handleLoadCode={handleLoadCode}
              compiledCode={compiledCode}
              isCompiling={isCompiling}
              compileErrors={compileErrors}
            />
          </Panel>

          <PanelResizeHandle className="panel-resize-row" />

          <Panel defaultSize={20} minSize={10}>
            <LogsPanel logs={logs} onClear={clearLogs} />
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className="panel-resize-col" />

      <Panel defaultSize={50} minSize={20}>
        <div className="page-container">
          <Tabs value={activeHomeTab} onValueChange={setActiveHomeTab} className="home-tabs">
            <div className="page-header-compact gap-4 justify-start">
              <PlaygroundControls
                method={method}
                setMethod={setMethod}
                renderMode={activeRenderMode === 'gpu' ? 'gpu' : 'cpu'}
                setRenderMode={setRenderMode}
              />

              <HeaderIconButton
                onClick={() => setOptionsOpen(true)}
                // className="ml-auto"
                title="System Configuration"
                icon={<Gear size={28} weight="fill" />}
                label="Options"
              />
            </div>

            <PanelGroup direction="vertical">
              <Panel defaultSize={100} minSize={20}>
                <div className="home-canvas-container">
                  <CanvasArea
                    canvasRef={canvasRef}
                    gpuCanvasRef={gpuCanvasRef}
                    renderMode={activeRenderMode === 'gpu' ? 'gpu' : 'cpu'}
                    isHidden={activeHomeTab === 'benchmark' && !isBenchmarkRunning}
                    isPlacing={isPlacing}
                    setIsPlacing={setIsPlacing}
                    onPlaceObstacle={handlePlaceObstacle}
                    onClearObstacles={clearObstacles}
                    obstacles={obstacles}
                    options={options}
                    fps={activeHomeTab === 'benchmark' ? undefined : fps}
                    hideObstaclesUI={activeHomeTab === 'benchmark'}
                    inputs={inputs}
                    definedInputs={definedInputs}
                    handleInputChange={handleInputChange}
                    isRunning={isRunning}
                    handleRun={handleRun}
                    canRun={canRunSimulation}
                    showPlaceholder={!hasStartedSimulation && obstacles.length === 0 && activeHomeTab !== 'benchmark'}
                    placeholderText="Run the simulation to start."
                  />
                </div>
              </Panel>
            </PanelGroup>
          </Tabs>
        </div>
      </Panel>

      <OptionsView
        options={options}
        updateOption={updateOption}
        resetOptions={resetOptions}
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
      />
    </PanelGroup>
  );
};
