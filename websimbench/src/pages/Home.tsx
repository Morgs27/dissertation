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

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useState, useRef } from 'react';
import { GameController, Speedometer } from '@phosphor-icons/react';
import { SimulationAppearanceOptions } from '@/hooks/useSimulationOptions';
import type { BenchmarkReport } from '@/types/benchmark';

interface HomeProps {
  options: SimulationAppearanceOptions;
  onBenchmarkComplete: (report: BenchmarkReport) => Promise<void> | void;
}

export const Home = ({ options, onBenchmarkComplete }: HomeProps) => {
  const [activeHomeTab, setActiveHomeTab] = useState('playground');
  const [benchmarkRenderMode, setBenchmarkRenderMode] = useState<RenderMode>('cpu');
  const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);
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
    canvasRef,
    gpuCanvasRef,
    handleRun,
  } = useSimulationRunner(code, inputs, options, obstacles);

  const { logs, clearLogs } = useLogger();

  const handlePlaceObstacle = (x: number, y: number) => {
    addObstacle({ x: x - 25, y: y - 25, w: 50, h: 50 });
  };

  const activeRenderMode =
    activeHomeTab === 'benchmark'
      ? benchmarkRenderMode
      : renderMode;

  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={50} minSize={20}>
        <PanelGroup direction="vertical">
          <Panel defaultSize={70} minSize={20}>
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

          <PanelResizeHandle className="h-1 bg-white/5 cursor-row-resize transition-all hover:bg-tropicalTeal/30" />

          <Panel defaultSize={30} minSize={10}>
            <LogsPanel logs={logs} onClear={clearLogs} />
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className="w-1 bg-white/5 cursor-col-resize transition-all hover:bg-tropicalTeal/30" />

      <Panel defaultSize={50} minSize={20}>
        <div className="flex flex-col h-full bg-black/20 overflow-hidden">
          <Tabs value={activeHomeTab} onValueChange={setActiveHomeTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-black/40 border-b border-white/5 px-4 h-12 flex items-center shrink-0">
              <TabsList className="bg-transparent h-8 p-0 gap-1">
                <TabsTrigger value="playground" className="px-3 h-8 data-[state=active]:bg-tropicalTeal data-[state=active]:text-jetBlack rounded-md text-xs font-bold transition-all flex items-center gap-2">
                  <GameController size={16} weight="fill" /> Playground
                </TabsTrigger>
                <TabsTrigger value="benchmark" className="px-3 h-8 data-[state=active]:bg-tropicalTeal data-[state=active]:text-jetBlack rounded-md text-xs font-bold transition-all flex items-center gap-2">
                  <Speedometer size={16} weight="fill" /> Benchmark
                </TabsTrigger>
              </TabsList>
            </div>

            <PanelGroup direction="vertical">
              <Panel ref={controlsPanelRef} defaultSize={40} minSize={20} className="flex flex-col">
                <div className="p-4 overflow-y-auto flex-1">
                  <TabsContent value="playground" className="m-0 focus-visible:outline-none">
                    <PlaygroundControls
                      method={method}
                      setMethod={setMethod}
                      renderMode={renderMode}
                      setRenderMode={setRenderMode}
                      isRunning={isRunning}
                      handleRun={handleRun}
                      fps={fps}
                      inputs={inputs}
                      definedInputs={definedInputs}
                      handleInputChange={handleInputChange}
                    />
                  </TabsContent>

                  <TabsContent value="benchmark" className="m-0 focus-visible:outline-none">
                    <BenchmarkControls
                      code={code}
                      definedInputs={definedInputs}
                      onComplete={onBenchmarkComplete}
                      options={options}
                      canvasRef={canvasRef}
                      gpuCanvasRef={gpuCanvasRef}
                      onRenderModeChange={setBenchmarkRenderMode}
                      onRunningChange={setIsBenchmarkRunning}
                    />
                  </TabsContent>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-white/5 cursor-row-resize transition-all hover:bg-tropicalTeal/30" />

              <Panel defaultSize={60} minSize={20}>
                <div className="flex-1 h-full min-h-0 bg-black relative shadow-inner">
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
                  />
                </div>
              </Panel>
            </PanelGroup>
          </Tabs>
        </div>
      </Panel>
    </PanelGroup>
  );
};
