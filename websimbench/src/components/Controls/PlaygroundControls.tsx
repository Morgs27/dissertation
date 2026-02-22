import { Method, RenderMode } from '@websimbench/agentyx';

import { NavDropdown } from "@/components/ui/nav-dropdown";
import { Gamepad2Icon } from "lucide-react";

interface PlaygroundControlsProps {
    method: Method;
    setMethod: (m: Method) => void;
    renderMode: RenderMode;
    setRenderMode: (r: RenderMode) => void;
}

export const PlaygroundControls = ({
    method,
    setMethod,
    renderMode,
    setRenderMode,
}: PlaygroundControlsProps) => {
    return (
        <div className="control-row">
            <div className="control-item min-w-[150px]">
                <NavDropdown
                    icon={<Gamepad2Icon size={16} />}
                    label="Playground"
                    value={method === 'WebGPU' ? (renderMode === 'gpu' ? 'WebGPU (GPU)' : 'WebGPU (CPU)') : method}
                    onValueChange={(v) => {
                        if (v === 'WebGPU (GPU)') {
                            setMethod('WebGPU');
                            setRenderMode('gpu');
                        } else if (v === 'WebGPU (CPU)') {
                            setMethod('WebGPU');
                            setRenderMode('cpu');
                        } else {
                            setMethod(v as Method);
                            setRenderMode('cpu');
                        }
                    }}
                    options={[
                        { value: 'JavaScript', label: 'JavaScript' },
                        { value: 'WebAssembly', label: 'WebAssembly' },
                        { value: 'WebWorkers', label: 'WebWorkers' },
                        { value: 'WebGPU (CPU)', label: 'WebGPU (CPU)' },
                        { value: 'WebGPU (GPU)', label: 'WebGPU (GPU)' }
                    ]}
                />
            </div>
        </div>
    );
};
