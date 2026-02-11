import { useState, useCallback } from 'react';
import { Obstacle } from '../simulation/types';

export interface UseObstaclesReturn {
    obstacles: Obstacle[];
    isPlacing: boolean;
    setIsPlacing: (isPlacing: boolean) => void;
    addObstacle: (obstacle: Obstacle) => void;
    removeObstacle: (index: number) => void;
    clearObstacles: () => void;
    setObstacles: (obstacles: Obstacle[]) => void;
}

export const useObstacles = (): UseObstaclesReturn => {
    const [obstacles, setObstacles] = useState<Obstacle[]>([]);
    const [isPlacing, setIsPlacing] = useState(false);

    const addObstacle = useCallback((obstacle: Obstacle) => {
        setObstacles(prev => [...prev, obstacle]);
    }, []);

    const removeObstacle = useCallback((index: number) => {
        setObstacles(prev => prev.filter((_, i) => i !== index));
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
        setObstacles
    };
};
