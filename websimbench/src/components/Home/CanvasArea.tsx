import React from "react";

import {
  Obstacle,
  SimulationAppearance,
  InputDefinition,
} from "@websimbench/agentyx";
import { CanvasInputs } from "./Controls/CanvasInputs";
import { CanvasActionBar } from "./Controls/CanvasActionBar";
import "./CanvasArea.css";

interface CanvasAreaProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  gpuCanvasRef: React.RefObject<HTMLCanvasElement>;
  renderMode: "cpu" | "gpu";
  isHidden?: boolean;
  isPlacing?: boolean;
  setIsPlacing?: (v: boolean) => void;
  onPlaceObstacle?: (
    x: number,
    y: number,
    simulationWidth: number,
    simulationHeight: number,
  ) => void;
  onClearObstacles?: () => void;
  obstacles?: Obstacle[];
  options?: SimulationAppearance;
  fps?: number;
  hideObstaclesUI?: boolean;
  inputs?: Record<string, number>;
  definedInputs?: InputDefinition[];
  handleInputChange?: (key: string, value: number) => void;
  isRunning?: boolean;
  handleRun?: () => void;
  showPlaceholder?: boolean;
  placeholderText?: string;
  canRun?: boolean;
}

interface ContainedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const getContainedRect = (
  containerWidth: number,
  containerHeight: number,
  contentWidth: number,
  contentHeight: number,
): ContainedRect => {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0
  ) {
    return { left: 0, top: 0, width: containerWidth, height: containerHeight };
  }

  const containerAspect = containerWidth / containerHeight;
  const contentAspect = contentWidth / contentHeight;

  if (containerAspect > contentAspect) {
    const height = containerHeight;
    const width = height * contentAspect;
    return {
      left: (containerWidth - width) / 2,
      top: 0,
      width,
      height,
    };
  }

  const width = containerWidth;
  const height = width / contentAspect;
  return {
    left: 0,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
};

export const CanvasArea = ({
  canvasRef,
  gpuCanvasRef,
  renderMode,
  isHidden,
  isPlacing,
  setIsPlacing,
  onPlaceObstacle,
  onClearObstacles,
  obstacles,
  options,
  fps,
  hideObstaclesUI,
  inputs,
  definedInputs,
  handleInputChange,
  isRunning,
  handleRun,
  showPlaceholder,
  placeholderText,
  canRun,
}: CanvasAreaProps) => {
  console.log("CanvasArea Props Check:", {
    inputs,
    definedInputs,
    hasHandleInputChange: !!handleInputChange,
    hideObstaclesUI,
  });

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = React.useState({
    width: 0,
    height: 0,
  });

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const simulationCanvas =
    renderMode === "gpu"
      ? (gpuCanvasRef.current ?? canvasRef.current)
      : canvasRef.current;
  const simulationWidth = simulationCanvas?.width ?? 800;
  const simulationHeight = simulationCanvas?.height ?? 600;

  const viewportRect = getContainedRect(
    containerSize.width,
    containerSize.height,
    simulationWidth,
    simulationHeight,
  );

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlacing || !onPlaceObstacle) return;

    const activeCanvas =
      renderMode === "gpu"
        ? (gpuCanvasRef.current ?? canvasRef.current)
        : canvasRef.current;
    if (!activeCanvas) return;
    const simWidth = activeCanvas.width || 800;
    const simHeight = activeCanvas.height || 600;

    const rect = e.currentTarget.getBoundingClientRect();
    const contentRect = getContainedRect(
      rect.width,
      rect.height,
      simWidth,
      simHeight,
    );
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    const withinX =
      localX >= contentRect.left &&
      localX <= contentRect.left + contentRect.width;
    const withinY =
      localY >= contentRect.top &&
      localY <= contentRect.top + contentRect.height;
    if (!withinX || !withinY) return;

    const relX = (localX - contentRect.left) / contentRect.width;
    const relY = (localY - contentRect.top) / contentRect.height;
    const simX = relX * simWidth;
    const simY = relY * simHeight;

    onPlaceObstacle(simX, simY, simWidth, simHeight);
  };

  const safeSimulationWidth = Math.max(simulationWidth, 1);
  const safeSimulationHeight = Math.max(simulationHeight, 1);

  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
      className={`canvas-area ${isHidden ? "hidden" : ""} ${isPlacing ? "cursor-crosshair" : ""}`}
    >
      {/* CPU rendering canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className={`canvas-layer ${renderMode === "cpu" ? "block" : "hidden"}`}
      />
      {/* GPU rendering canvas */}
      <canvas
        ref={gpuCanvasRef}
        width={800}
        height={600}
        className={`canvas-layer ${renderMode === "gpu" ? "block" : "hidden"}`}
      />

      {/* Inputs Overlay */}
      {!hideObstaclesUI && inputs && definedInputs && handleInputChange && (
        <CanvasInputs
          inputs={inputs}
          definedInputs={definedInputs}
          handleInputChange={handleInputChange}
        />
      )}

      {/* Obstacles Overlay */}
      <div
        className="canvas-overlay"
        style={{
          left: viewportRect.left,
          top: viewportRect.top,
          width: viewportRect.width,
          height: viewportRect.height,
        }}
      >
        {obstacles?.map((ob, i) => (
          <div
            key={i}
            style={{
              left: `${(ob.x / safeSimulationWidth) * 100}%`,
              top: `${(ob.y / safeSimulationHeight) * 100}%`,
              width: `${(ob.w / safeSimulationWidth) * 100}%`,
              height: `${(ob.h / safeSimulationHeight) * 100}%`,
              backgroundColor: options?.obstacleColor || "rgba(255, 0, 0, 0.2)",
              borderColor: options?.obstacleBorderColor || "red",
              opacity: options?.obstacleOpacity || 0.2,
              borderStyle: "solid",
              position: "absolute",
            }}
          />
        ))}
      </div>

      {showPlaceholder && !isHidden && (
        <div
          className="canvas-placeholder"
          style={{
            left: viewportRect.left,
            top: viewportRect.top,
            width: viewportRect.width,
            height: viewportRect.height,
          }}
        >
          {placeholderText || "Run the simulation to start rendering."}
        </div>
      )}

      {/* Floating Toolbar */}
      {setIsPlacing &&
        onClearObstacles &&
        !hideObstaclesUI &&
        handleInputChange &&
        inputs &&
        definedInputs &&
        handleRun &&
        isRunning !== undefined && (
          <CanvasActionBar
            isRunning={isRunning}
            onRun={handleRun}
            agentCount={inputs.agentCount || 1000}
            setAgentCount={(val) => handleInputChange("agentCount", val)}
            isAgentCountDefined={definedInputs.some(
              (d) => d.name === "agentCount",
            )}
            isPlacing={!!isPlacing}
            setIsPlacing={setIsPlacing}
            onClearObstacles={onClearObstacles}
            hideObstaclesUI={hideObstaclesUI}
            fps={fps}
            canRun={canRun}
          />
        )}
    </div>
  );
};
