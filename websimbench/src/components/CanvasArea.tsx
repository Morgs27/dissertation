import React from 'react';

import { Obstacle } from '../simulation/types';

interface CanvasAreaProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    gpuCanvasRef: React.RefObject<HTMLCanvasElement>;
    renderMode: 'cpu' | 'gpu';
    isHidden?: boolean;
    isPlacing?: boolean;
    onPlaceObstacle?: (x: number, y: number) => void;
    obstacles?: Obstacle[];
}

export const CanvasArea = ({
    canvasRef,
    gpuCanvasRef,
    renderMode,
    isHidden,
    isPlacing,
    onPlaceObstacle,
    obstacles
}: CanvasAreaProps) => {

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
            className={`w-full h-full border-t border-white/5 relative flex bg-transparent items-center justify-center transition-opacity duration-300 ${isHidden ? 'hidden' : ''} ${isPlacing ? 'cursor-crosshair' : ''}`}
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

            {/* Obstacles Overlay */}
            {obstacles?.map((ob, i) => (
                <div key={i} className="absolute border border-red-500 bg-red-500/20" style={{
                    left: `${(ob.x / 800) * 100}%`,
                    top: `${(ob.y / 600) * 100}%`,
                    width: `${(ob.w / 800) * 100}%`,
                    height: `${(ob.h / 600) * 100}%`,
                }} />
            ))}
        </div>
    );
};
