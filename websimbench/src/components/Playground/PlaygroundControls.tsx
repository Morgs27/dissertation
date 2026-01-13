import { Method, RenderMode, InputDefinition } from '../../simulation/types';
import { Controls } from './Controls';
import { Inputs } from './Inputs';

interface PlaygroundControlsProps {
    method: Method;
    setMethod: (m: Method) => void;
    renderMode: RenderMode;
    setRenderMode: (r: RenderMode) => void;
    isRunning: boolean;
    handleRun: () => void;
    fps: number;
    inputs: Record<string, number>;
    definedInputs: InputDefinition[];
    handleInputChange: (key: string, value: number) => void;
}

export const PlaygroundControls = ({
    method,
    setMethod,
    renderMode,
    setRenderMode,
    isRunning,
    handleRun,
    fps,
    inputs,
    definedInputs,
    handleInputChange
}: PlaygroundControlsProps) => {
    return (
        <div className="flex flex-col gap-6">
            <Controls
                method={method}
                setMethod={setMethod}
                renderMode={renderMode}
                setRenderMode={setRenderMode}
                isRunning={isRunning}
                handleRun={handleRun}
                fps={fps}
            />
            <Inputs
                inputs={inputs}
                definedInputs={definedInputs}
                handleInputChange={handleInputChange}
            />
        </div>
    );
};
