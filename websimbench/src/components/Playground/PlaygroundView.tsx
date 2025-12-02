import { Flex } from '@chakra-ui/react';
import { Method, RenderMode, InputDefinition } from '../../simulation/types';
import { Controls } from './Controls';
import { Canvas } from './Canvas';
import { Inputs } from './Inputs';

interface PlaygroundViewProps {
    method: Method;
    setMethod: (m: Method) => void;
    renderMode: RenderMode;
    setRenderMode: (r: RenderMode) => void;
    isRunning: boolean;
    handleRun: () => void;
    fps: number;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    gpuCanvasRef: React.RefObject<HTMLCanvasElement>;
    inputs: Record<string, number>;
    definedInputs: InputDefinition[];
    handleInputChange: (key: string, value: number) => void;
}

export const PlaygroundView = ({
    method,
    setMethod,
    renderMode,
    setRenderMode,
    isRunning,
    handleRun,
    fps,
    canvasRef,
    gpuCanvasRef,
    inputs,
    definedInputs,
    handleInputChange
}: PlaygroundViewProps) => {
    return (
        <Flex direction="column" h="100%">
            <Controls
                method={method}
                setMethod={setMethod}
                renderMode={renderMode}
                setRenderMode={setRenderMode}
                isRunning={isRunning}
                handleRun={handleRun}
                fps={fps}
            />
            <Canvas
                ref={canvasRef}
                gpuRef={gpuCanvasRef}
                renderMode={renderMode}
            >
                <Inputs
                    inputs={inputs}
                    definedInputs={definedInputs}
                    handleInputChange={handleInputChange}
                />
            </Canvas>
        </Flex>
    );
};

