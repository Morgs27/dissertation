import React from 'react';

import { Obstacle, SimulationAppearance, InputDefinition } from '@websimbench/agentyx';
import { ObstacleToolbar } from './ObstacleToolbar';
import { PerformanceWidget } from './Controls/PerformanceWidget';
import { CanvasInputs } from './Controls/CanvasInputs';

interface CanvasAreaProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    gpuCanvasRef: React.RefObject<HTMLCanvasElement>;
    renderMode: 'cpu' | 'gpu';
    isHidden?: boolean;
    isPlacing?: boolean;
    setIsPlacing?: (v: boolean) => void;
    onPlaceObstacle?: (x: number, y: number) => void;
    onClearObstacles?: () => void;
    obstacles?: Obstacle[];
    options?: SimulationAppearance;
    fps?: number;
    hideObstaclesUI?: boolean;
    inputs?: Record<string, number>;
    definedInputs?: InputDefinition[];
    handleInputChange?: (key: string, value: number) => void;
}

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
    handleInputChange
}: CanvasAreaProps) => {

    console.log("CanvasArea Props Check:", {
        inputs,
        definedInputs,
        hasHandleInputChange: !!handleInputChange,
        hideObstaclesUI
    });

    const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isPlacing || !onPlaceObstacle || !canvasRef.current) return;

        const rect = e.currentTarget.getBoundingClientRect();
        // Calculate relative position (0-1)
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;

        // Map to simulation coordinates (800x600 default)
        const simX = relX * 800;
        const simY = relY * 600;

        onPlaceObstacle(simX, simY);
    };

    return (
        <div
            onClick={handleCanvasClick}
            className={`w-full h-full relative flex bg-transparent items-center justify-center transition-opacity duration-300 ${isHidden ? 'hidden' : ''} ${isPlacing ? 'cursor-crosshair' : ''}`}
        >
            {/* CPU rendering canvas */}
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className={`absolute inset-0 w-full h-full object-contain ${renderMode === 'cpu' ? 'block' : 'hidden'}`}
            />
            {/* GPU rendering canvas */}
            <canvas
                ref={gpuCanvasRef}
                width={800}
                height={600}
                className={`absolute inset-0 w-full h-full object-contain ${renderMode === 'gpu' ? 'block' : 'hidden'}`}
            />

            {/* Performance Overlay */}
            {fps !== undefined && !hideObstaclesUI && (
                <PerformanceWidget fps={fps} />
            )}

            {/* Inputs Overlay */}
            {!hideObstaclesUI && inputs && definedInputs && handleInputChange && (
                <CanvasInputs
                    inputs={inputs}
                    definedInputs={definedInputs}
                    handleInputChange={handleInputChange}
                />
            )}

            {/* Obstacles Overlay */}
            <div className="absolute inset-0 w-full h-full pointer-events-none">
                {obstacles?.map((ob, i) => (
                    <div
                        key={i}
                        className="absolute"
                        style={{
                            left: `${(ob.x / 800) * 100}%`,
                            top: `${(ob.y / 600) * 100}%`,
                            width: `${(ob.w / 800) * 100}%`,
                            height: `${(ob.h / 600) * 100}%`,
                            backgroundColor: options?.obstacleColor || 'rgba(255, 0, 0, 0.2)',
                            borderColor: options?.obstacleBorderColor || 'red',
                            opacity: options?.obstacleOpacity || 0.2,
                            borderWidth: '1px',
                            borderStyle: 'solid'
                        }}
                    />
                ))}
            </div>

            {/* Floating Toolbar */}
            {setIsPlacing && onClearObstacles && !hideObstaclesUI && (
                <div className="absolute top-4 left-4 z-10 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                    <ObstacleToolbar
                        isPlacing={!!isPlacing}
                        setIsPlacing={setIsPlacing}
                        onClear={onClearObstacles}
                        obstacleCount={obstacles?.length || 0}
                    />
                </div>
            )}
        </div>
    );
};
