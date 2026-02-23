import { useState, useEffect } from "react";
import { Logger, LogLevel } from "@websimbench/agentyx";

export type AgentShape = "circle" | "square";

/**
 * Configurable visual appearance parameters for the simulation renderer.
 */
export interface SimulationAppearanceOptions {
  agentColor: string;
  backgroundColor: string;
  agentSize: number;
  agentShape: AgentShape;
  showTrails: boolean;
  trailOpacity: number;
  trailColor: string;
  logLevel: LogLevel;
  speciesColors: string[];
  obstacleColor: string;
  obstacleBorderColor: string;
  obstacleOpacity: number;
}

/**
 * Typed function signature for updating a single visual configuration option.
 */
export type UpdateOptionFn = <K extends keyof SimulationAppearanceOptions>(
  key: K,
  value: SimulationAppearanceOptions[K],
) => void;

const DEFAULT_OPTIONS: SimulationAppearanceOptions = {
  agentColor: "#00FFFF", // Cyan (Default species 0)
  backgroundColor: "#000000", // Black
  agentSize: 3,
  agentShape: "circle",
  showTrails: true,
  trailOpacity: 1.0,
  trailColor: "#50FFFF", // Light Cyan default
  logLevel: LogLevel.Info,
  speciesColors: [
    "#00FFFF", // Cyan
    "#FF4466", // Red-pink
    "#44FF66", // Green
    "#FFAA22", // Orange
    "#AA66FF", // Purple
  ],
  obstacleColor: "#FF0000",
  obstacleBorderColor: "#FF0000",
  obstacleOpacity: 0.2,
};

/**
 * Hook to manage customizable visual themes and renderer aesthetics.
 * Synchronizes selected appearance options directly with localStorage.
 *
 * @returns An object containing the options, a selective update function, and a reset utility.
 */
export function useSimulationOptions() {
  const [options, setOptions] = useState<SimulationAppearanceOptions>(() => {
    try {
      const saved = localStorage.getItem("websimbench_options");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with default options to ensure new fields are present
        return { ...DEFAULT_OPTIONS, ...parsed };
      }
      return DEFAULT_OPTIONS;
    } catch (e) {
      return DEFAULT_OPTIONS;
    }
  });

  useEffect(() => {
    localStorage.setItem("websimbench_options", JSON.stringify(options));

    // Ensure logLevel is valid before setting
    const level =
      options.logLevel !== undefined
        ? options.logLevel
        : DEFAULT_OPTIONS.logLevel;
    Logger.setGlobalLogLevel(level);
  }, [options]);

  const updateOption: UpdateOptionFn = (key, value) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const resetOptions = () => setOptions(DEFAULT_OPTIONS);

  return { options, updateOption, resetOptions };
}
