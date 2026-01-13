import { forwardRef, ReactNode } from 'react';
import { RenderMode } from '../../simulation/types';

interface CanvasProps {
  renderMode: RenderMode;
  gpuRef: React.RefObject<HTMLCanvasElement>;
  children?: ReactNode;
}

export const Canvas = forwardRef<HTMLCanvasElement, CanvasProps>(({ renderMode, gpuRef, children }, ref) => {
  return (
    <div className="flex-1 bg-black relative">
      {/* CPU Canvas */}
      <canvas
        ref={ref}
        width={800}
        height={600}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: renderMode === 'cpu' ? 2 : 1,
          visibility: renderMode === 'cpu' ? 'visible' : 'hidden'
        }}
      />

      {/* GPU Canvas */}
      <canvas
        ref={gpuRef}
        width={800}
        height={600}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: renderMode === 'gpu' ? 2 : 1,
          visibility: renderMode === 'gpu' ? 'visible' : 'hidden'
        }}
      />

      {children}
    </div>
  );
});
