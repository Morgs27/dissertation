import React from 'react';

interface CanvasAreaProps {
    canvasRef: React.RefObject<HTMLCanvasElement>;
    gpuCanvasRef: React.RefObject<HTMLCanvasElement>;
    renderMode: 'cpu' | 'gpu';
    isHidden?: boolean;
}

export const CanvasArea = ({ canvasRef, gpuCanvasRef, renderMode, isHidden }: CanvasAreaProps) => {

    return (
        <div className={`w-full h-full border-t border-white/5 relative flex bg-transparent items-center justify-center transition-opacity duration-300 ${isHidden ? 'hidden' : ''}`}>
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
        </div>
    );
};
