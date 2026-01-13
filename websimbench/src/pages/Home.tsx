import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
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

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useState } from 'react';
import { useBenchmarkHistory } from '@/hooks/useBenchmarkHistory';

export const Home = () => {
    const [activeHomeTab, setActiveHomeTab] = useState('playground');

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

    const { options, updateOption, resetOptions } = useSimulationOptions();

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
    } = useSimulationRunner(code, inputs, options);

    const { addReport } = useBenchmarkHistory();

    const { logs, clearLogs } = useLogger();

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
                                <TabsTrigger value="playground" className="px-4 h-8 data-[state=active]:bg-tropicalTeal data-[state=active]:text-jetBlack rounded-md text-xs font-bold transition-all">Playground</TabsTrigger>
                                <TabsTrigger value="compare" className="px-4 h-8 data-[state=active]:bg-tropicalTeal data-[state=active]:text-jetBlack rounded-md text-xs font-bold transition-all">Compare</TabsTrigger>
                                <TabsTrigger value="benchmark" className="px-4 h-8 data-[state=active]:bg-tropicalTeal data-[state=active]:text-jetBlack rounded-md text-xs font-bold transition-all">Benchmark</TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Config Section (Top) */}
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
                                />
                            </TabsContent>
                        </div>

                        {/* Canvas Section (Bottom) */}
                        <div className="flex-1 min-h-0 bg-black relative shadow-inner">
                            <CanvasArea
                                canvasRef={canvasRef}
                                gpuCanvasRef={gpuCanvasRef}
                                renderMode={activeHomeTab === 'playground' ? renderMode : 'cpu'}
                                isHidden={activeHomeTab === 'benchmark' && !isRunning}
                            />
                        </div>
                    </Tabs>
                </div>
            </Panel>
        </PanelGroup>
    );
};