import { useState, useCallback } from "react";
import { Obstacle } from "@websimbench/agentyx";

/**
 * Core interface defining the capabilities of the useObstacles hook.
 */
export interface UseObstaclesReturn {
  obstacles: Obstacle[];
  isPlacing: boolean;
  setIsPlacing: (isPlacing: boolean) => void;
  addObstacle: (obstacle: Obstacle) => void;
  removeObstacle: (index: number) => void;
  clearObstacles: () => void;
  setObstacles: (obstacles: Obstacle[]) => void;
}

/**
 * Hook managing the interactive canvas obstacles (environmental barriers).
 * Maintains obstacle locations, states, and the interactive placement mode.
 *
 * @returns An object conforming to UseObstaclesReturn with state and mutation tools.
 */
export const useObstacles = (): UseObstaclesReturn => {
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [isPlacing, setIsPlacing] = useState(false);

  const addObstacle = useCallback((obstacle: Obstacle) => {
    setObstacles((prev) => [...prev, obstacle]);
  }, []);

  const removeObstacle = useCallback((index: number) => {
    setObstacles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearObstacles = useCallback(() => {
    setObstacles([]);
  }, []);

  return {
    obstacles,
    isPlacing,
    setIsPlacing,
    addObstacle,
    removeObstacle,
    clearObstacles,
    setObstacles,
  };
};
