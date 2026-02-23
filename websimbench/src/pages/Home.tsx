import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { EditorPanel } from "../components/Home/EditorPanel";
import { LogsPanel } from "../components/Home/LogsPanel";
import { CanvasArea } from "../components/Home/CanvasArea";
import { NavDropdown } from "@/components/ui/nav-dropdown";
import { Gamepad2Icon } from "lucide-react";
import { Method } from "@websimbench/agentyx";
import "../components/Home/Controls/ControlPanels.css";

import { useCodeCompiler } from "../hooks/useCodeCompiler";
import { useSimulationRunner } from "../hooks/useSimulationRunner";
import { useLogger } from "../hooks/useLogger";
import { useObstacles } from "../hooks/useObstacles";

import { useState } from "react";
import { Gear } from "@phosphor-icons/react";
import {
  SimulationAppearanceOptions,
  UpdateOptionFn,
} from "@/hooks/useSimulationOptions";
import { OptionsView } from "./OptionsView";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import "./PageLayouts.css";

interface HomeProps {
  options: SimulationAppearanceOptions;
  updateOption: UpdateOptionFn;
  resetOptions: () => void;
}

/**
 * Principal workbench view for simulating and testing agent logic.
 * Contains the canvas playground, real-time code editor, and options panel.
 *
 * @param props - Component properties for handling simulation state and options updates.
 */
export const Home = ({ options, updateOption, resetOptions }: HomeProps) => {
  const OBSTACLE_SIZE = 50;
  const OBSTACLE_HALF_SIZE = OBSTACLE_SIZE / 2;

  const [optionsOpen, setOptionsOpen] = useState(false);

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

  const { obstacles, isPlacing, setIsPlacing, addObstacle, clearObstacles } =
    useObstacles();

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

  const handlePlaceObstacle = (
    x: number,
    y: number,
    simulationWidth: number,
    simulationHeight: number,
  ) => {
    const maxX = Math.max(simulationWidth - OBSTACLE_SIZE, 0);
    const maxY = Math.max(simulationHeight - OBSTACLE_SIZE, 0);

    addObstacle({
      x: Math.min(Math.max(x - OBSTACLE_HALF_SIZE, 0), maxX),
      y: Math.min(Math.max(y - OBSTACLE_HALF_SIZE, 0), maxY),
      w: OBSTACLE_SIZE,
      h: OBSTACLE_SIZE,
    });
  };

  const activeRenderMode = renderMode;
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
          <div className="page-header-compact gap-4 justify-start">
            <div className="control-row">
              <div className="control-item min-w-[150px]">
                <NavDropdown
                  icon={<Gamepad2Icon size={16} />}
                  label="Playground"
                  value={
                    method === "WebGPU"
                      ? activeRenderMode === "gpu"
                        ? "WebGPU (GPU)"
                        : "WebGPU (CPU)"
                      : method
                  }
                  onValueChange={(v) => {
                    if (v === "WebGPU (GPU)") {
                      setMethod("WebGPU");
                      setRenderMode("gpu");
                    } else if (v === "WebGPU (CPU)") {
                      setMethod("WebGPU");
                      setRenderMode("cpu");
                    } else {
                      setMethod(v as Method);
                      setRenderMode("cpu");
                    }
                  }}
                  options={[
                    { value: "JavaScript", label: "JavaScript" },
                    { value: "WebAssembly", label: "WebAssembly" },
                    { value: "WebWorkers", label: "WebWorkers" },
                    { value: "WebGPU (CPU)", label: "WebGPU (CPU)" },
                    { value: "WebGPU (GPU)", label: "WebGPU (GPU)" },
                  ]}
                />
              </div>
            </div>

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
                  renderMode={activeRenderMode === "gpu" ? "gpu" : "cpu"}
                  isHidden={false}
                  isPlacing={isPlacing}
                  setIsPlacing={setIsPlacing}
                  onPlaceObstacle={handlePlaceObstacle}
                  onClearObstacles={clearObstacles}
                  obstacles={obstacles}
                  options={options}
                  fps={fps}
                  hideObstaclesUI={false}
                  inputs={inputs}
                  definedInputs={definedInputs}
                  handleInputChange={handleInputChange}
                  isRunning={isRunning}
                  handleRun={handleRun}
                  canRun={canRunSimulation}
                  showPlaceholder={
                    !hasStartedSimulation && obstacles.length === 0
                  }
                  placeholderText="Run the simulation to start."
                />
              </div>
            </Panel>
          </PanelGroup>
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
