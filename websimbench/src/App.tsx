import { Flex, Tabs, TabList, TabPanels, Tab, TabPanel, useColorModeValue } from '@chakra-ui/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Navbar } from './components/Layout/Navbar';
import { EditorPanel } from './components/Editor/EditorPanel';
import { LogsPanel } from './components/Editor/LogsPanel';
import { PlaygroundView } from './components/Playground/PlaygroundView';
import { BenchmarkView } from './components/BenchmarkView';
import { ReportsView } from './components/ReportsView';
import { OptionsView } from './components/OptionsView';

import { useCodeCompiler } from './hooks/useCodeCompiler';
import { useSimulationRunner } from './hooks/useSimulationRunner';
import { useLogger } from './hooks/useLogger';
import { useBenchmarkHistory } from './hooks/useBenchmarkHistory';
import { useSimulationOptions, UpdateOptionFn } from './hooks/useSimulationOptions';

function App() {
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

  const { logs, clearLogs } = useLogger();
  const { reports, addReport, updateReportName, clearReports } = useBenchmarkHistory();

  // Styles
  const bg = useColorModeValue('jetBlack', 'gray.900');
  const handleColor = useColorModeValue('cerulean', 'tropicalTeal');

  return (
    <Flex direction="column" h="100vh" w="100vw" overflow="hidden" bg={bg} color="teaGreen">
      <Navbar />

      {/* Main Content with Resizable Panels */}
      <Flex flex="1" overflow="hidden">
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

              {/* Vertical Resize Handle */}
              <PanelResizeHandle
                style={{
                  height: '4px',
                  background: handleColor,
                  cursor: 'row-resize',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => ((e.currentTarget as unknown) as HTMLElement).style.background = '#70a9a1'}
                onMouseLeave={(e) => ((e.currentTarget as unknown) as HTMLElement).style.background = handleColor}
              />

              {/* Logs Panel */}
              <Panel defaultSize={30} minSize={10}>
                <LogsPanel
                  logs={logs}
                  onClear={clearLogs}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          {/* Horizontal Resize Handle */}
          <PanelResizeHandle
            style={{
              width: '4px',
              background: handleColor,
              cursor: 'col-resize',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as unknown) as HTMLElement).style.background = '#70a9a1'}
            onMouseLeave={(e) => ((e.currentTarget as unknown) as HTMLElement).style.background = handleColor}
          />

          {/* Right Panel: Canvas & Controls */}
          <Panel defaultSize={50} minSize={20}>
            <Flex direction="column" h="100%">
              <Tabs variant="enclosed" colorScheme="teal" h="100%" display="flex" flexDirection="column">
                <TabList bg="rgba(0,0,0,0.2)" px={4} pt={2}>
                  <Tab>Playground</Tab>
                  <Tab>Benchmark</Tab>
                  <Tab>Reports</Tab>
                  <Tab>Options</Tab>
                </TabList>

                <TabPanels flex="1" overflow="hidden" p={0}>
                  {/* Playground Panel */}
                  <TabPanel h="100%" p={0} display="flex" flexDirection="column">
                    <PlaygroundView
                      method={method}
                      setMethod={setMethod}
                      renderMode={renderMode}
                      setRenderMode={setRenderMode}
                      isRunning={isRunning}
                      handleRun={handleRun}
                      fps={fps}
                      canvasRef={canvasRef}
                      gpuCanvasRef={gpuCanvasRef}
                      inputs={inputs}
                      definedInputs={definedInputs}
                      handleInputChange={handleInputChange}
                    />
                  </TabPanel>

                  {/* Benchmark Panel */}
                  <TabPanel h="100%" p={0}>
                    <BenchmarkView
                      code={code}
                      definedInputs={definedInputs}
                      onComplete={addReport}
                      options={options}
                    />
                  </TabPanel>

                  {/* Reports Panel */}
                  <TabPanel h="100%" p={0}>
                    <ReportsView
                      reports={reports}
                      onClear={clearReports}
                      onRename={updateReportName}
                    />
                  </TabPanel>

                  {/* Options Panel */}
                  <TabPanel h="100%" p={0}>
                    <OptionsView
                      options={options}
                      updateOption={updateOption as UpdateOptionFn}
                      resetOptions={resetOptions}
                    />
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </Flex>
          </Panel>
        </PanelGroup>
      </Flex>
    </Flex>
  );
}

export default App;
