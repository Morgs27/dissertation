import {
  Trash,
  Cube,
  Play,
  Stop,
  Users,
  Speedometer,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { cn } from "@/lib/utils";
import "./CanvasActionBar.css";

interface CanvasActionBarProps {
  isRunning: boolean;
  onRun: () => void;
  onStop?: () => void;
  agentCount: number;
  setAgentCount: (count: number) => void;
  isAgentCountDefined: boolean;
  isPlacing: boolean;
  setIsPlacing: (v: boolean) => void;
  onClearObstacles: () => void;
  hideObstaclesUI?: boolean;
  fps?: number;
  canRun?: boolean;
}

export const CanvasActionBar = ({
  isRunning,
  onRun,
  onStop,
  agentCount,
  setAgentCount,
  isAgentCountDefined,
  isPlacing,
  setIsPlacing,
  onClearObstacles,
  hideObstaclesUI,
  fps,
  canRun = true,
}: CanvasActionBarProps) => {
  return (
    <div
      className="canvas-action-bar"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Agent Control */}
      {!isAgentCountDefined && (
        <div className="action-bar-group">
          <div className="flex items-center text-tropicalTeal bg-tropicalTeal/20 p-1.5 rounded-full mr-1">
            <Users size={16} weight="fill" />
          </div>
          <div className="action-bar-input-wrapper">
            <span className="action-bar-label">Agents</span>
            <Input
              type="number"
              value={agentCount}
              onChange={(e) =>
                setAgentCount(Number.parseInt(e.target.value, 10) || 1)
              }
              min={1}
              step={1}
              className="action-bar-input"
            />
          </div>
        </div>
      )}

      {!hideObstaclesUI && (
        <>
          <div className="action-bar-divider" />

          {/* Obstacle Controls */}
          <div className="action-bar-group">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPlacing(!isPlacing)}
              className={cn(
                "action-bar-obstacle-btn",
                isPlacing
                  ? "obstacle-btn-active-place"
                  : "obstacle-btn-inactive",
              )}
            >
              <Cube weight={isPlacing ? "fill" : "regular"} size={16} />
              {isPlacing ? "Done" : "Place"}
            </Button>

            <HeaderIconButton
              onClick={onClearObstacles}
              title="Clear Obstacles"
              icon={<Trash size={16} weight="bold" />}
              className="hover:text-red-400 hover:bg-red-400/10"
            />
          </div>
        </>
      )}

      <div className="action-bar-divider" />

      {/* Run Controls & FPS */}
      <div className="action-bar-group">
        <Button
          onClick={isRunning ? onStop || onRun : onRun}
          disabled={!isRunning && !canRun}
          title={
            !isRunning && !canRun ? "Add simulation code to run." : undefined
          }
          size="sm"
          className={cn(
            "action-bar-run-btn",
            isRunning ? "run-btn-active" : "run-btn-inactive",
          )}
        >
          {isRunning ? (
            <Stop className="mr-2" size={16} weight="bold" />
          ) : (
            <Play className="mr-2" size={16} weight="bold" />
          )}
          {isRunning ? "Stop" : "Run"}
        </Button>

        {fps !== undefined && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded-md border border-white/10 ml-2">
            <Speedometer
              size={14}
              weight="fill"
              className="text-tropicalTeal"
            />
            <span className="font-mono text-sm font-bold text-white tracking-tight">
              {fps}
            </span>
            <span className="text-[9px] font-bold text-gray-500 uppercase">
              FPS
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
