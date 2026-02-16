import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import { RenderMode } from '../simulation/types';
import { EditorPanel } from '../components/EditorPanel';
import { LogsPanel } from '../components/LogsPanel';
import { PlaygroundControls } from '../components/Controls/PlaygroundControls';
import { CompareControls } from '../components/Controls/CompareControls';
import { BenchmarkControls } from '../components/Controls/BenchmarkControls';
import { CanvasArea } from '../components/CanvasArea';


import { useCodeCompiler } from '../hooks/useCodeCompiler';
import { useSimulationRunner } from '../hooks/useSimulationRunner';
import { useLogger } from '../hooks/useLogger';
import { useSimulationOptions } from '../hooks/useSimulationOptions';
import { useObstacles } from '../hooks/useObstacles';

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useState, useRef } from 'react';
import { useBenchmarkHistory } from '@/hooks/useBenchmarkHistory';
import { GameController, Scales, Speedometer } from "@phosphor-icons/react";

export const Home = () => {
    const [activeHomeTab, setActiveHomeTab] = useState('playground');
    const [benchmarkRenderMode, setBenchmarkRenderMode] = useState<RenderMode>('cpu');
    const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);
    const controlsPanelRef = useRef<ImperativePanelHandle>(null);


    // Hooks
    const {
        code,
        setCode,
        compiledCode,
        inputs,
        definedInputs,
        isCompiling,
        handleInputChange,
        handleSaveCode,
        handleLoadCode
    } = useCodeCompiler();

    const { options } = useSimulationOptions();

    // Obstacles
    const {
        obstacles,
        isPlacing,
        setIsPlacing,
        addObstacle,
        clearObstacles
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
        handleRun
    } = useSimulationRunner(code, inputs, options, obstacles);

    const { addReport } = useBenchmarkHistory();

    const { logs, clearLogs } = useLogger();

    const handlePlaceObstacle = (x: number, y: number) => {
        // Place 50x50 obstacle centered at click
        addObstacle({ x: x - 25, y: y - 25, w: 50, h: 50 });
    };

    return (
        <PanelGroup direction="horizontal">

            {/* Left Panel: Editor & Logs */}
            <Panel defaultSize={50} minSize={20}>
                <PanelGroup direction="vertical">
                    {/* Editor Panel */}
                    <Panel defaultSize={70} minSize={20}>
                        <EditorPanel
                            code={code}
                            setCode={setCode}
                            handleSaveCode={handleSaveCode}
                            handleLoadCode={handleLoadCode}
                            compiledCode={compiledCode}
                            isCompiling={isCompiling}
                        />
                    </Panel>

                    <PanelResizeHandle className="h-1 bg-white/5 cursor-row-resize transition-all hover:bg-tropicalTeal/30" />

                    {/* Logs Panel */}
                    <Panel defaultSize={30} minSize={10}>
                        <LogsPanel
                            logs={logs}
                            onClear={clearLogs}
                        />
                    </Panel>
                </PanelGroup>
            </Panel>

            <PanelResizeHandle className="w-1 bg-white/5 cursor-col-resize transition-all hover:bg-tropicalTeal/30" />

            {/* Right Panel: Controls & Canvas */}
            <Panel defaultSize={50} minSize={20}>
                <div className="flex flex-col h-full bg-black/20 overflow-hidden">
                    <Tabs value={activeHomeTab} onValueChange={setActiveHomeTab} className="flex-1 flex flex-col overflow-hidden">
                        <div className="bg-black/40 border-b border-white/5 px-4 h-12 flex items-center shrink-0">
                            <TabsList className="bg-transparent h-8 p-0 gap-1">
                                <TabsTrigger value="playground" className="px-3 h-8 data-[state=active]:bg-tropicalTeal data-[state=active]:text-jetBlack rounded-md text-xs font-bold transition-all flex items-center gap-2">
                                    <GameController size={16} weight="fill" /> Playground
                                </TabsTrigger>
                                <TabsTrigger value="compare" className="px-3 h-8 data-[state=active]:bg-tropicalTeal data-[state=active]:text-jetBlack rounded-md text-xs font-bold transition-all flex items-center gap-2">
                                    <Scales size={16} weight="fill" /> Compare
                                </TabsTrigger>
                                <TabsTrigger value="benchmark" className="px-3 h-8 data-[state=active]:bg-tropicalTeal data-[state=active]:text-jetBlack rounded-md text-xs font-bold transition-all flex items-center gap-2">
                                    <Speedometer size={16} weight="fill" /> Benchmark
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <PanelGroup direction="vertical">
                            {/* Config Section (Top) */}
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

                                    <TabsContent value="compare" className="m-0 focus-visible:outline-none">
                                        <CompareControls
                                            code={code}
                                            definedInputs={definedInputs}
                                            canvasRef={canvasRef}
                                        />
                                    </TabsContent>

                                    <TabsContent value="benchmark" className="m-0 focus-visible:outline-none">
                                        <BenchmarkControls
                                            code={code}
                                            definedInputs={definedInputs}
                                            onComplete={addReport}
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

                            {/* Canvas Section (Bottom) */}
                            <Panel defaultSize={60} minSize={20}>
                                <div className="flex-1 h-full min-h-0 bg-black relative shadow-inner">
                                    <CanvasArea
                                        canvasRef={canvasRef}
                                        gpuCanvasRef={gpuCanvasRef}
                                        renderMode={activeHomeTab === 'benchmark' ? benchmarkRenderMode : (activeHomeTab === 'playground' ? renderMode : 'cpu')}
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