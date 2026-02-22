import { Method, RenderMode, InputDefinition } from '@websimbench/agentyx';
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue, ComboboxList } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { RunControl } from "./RunControl";

interface PlaygroundControlsProps {
    method: Method;
    setMethod: (m: Method) => void;
    renderMode: RenderMode;
    setRenderMode: (r: RenderMode) => void;
    isRunning: boolean;
    handleRun: () => void;
    inputs: Record<string, number>;
    definedInputs: InputDefinition[];
    handleInputChange: (key: string, value: number) => void;
}

interface ControlsProps {
    method: Method;
    setMethod: (m: Method) => void;
    renderMode: RenderMode;
    setRenderMode: (r: RenderMode) => void;
    isRunning: boolean;
    handleRun: () => void;
    agentCount: number;
    setAgentCount: (count: number) => void;
    isAgentCountDefined: boolean;
}

export const Controls = ({
    method,
    setMethod,
    renderMode,
    setRenderMode,
    isRunning,
    handleRun,
    agentCount,
    setAgentCount,
    isAgentCountDefined
}: ControlsProps) => {
    return (
        <RunControl isRunning={isRunning} onRun={handleRun}>

            <div className="flex items-center gap-2 w-full">
                <div className="flex-1 min-w-0">
                    <Combobox value={method} onValueChange={(v) => setMethod(v as Method)}>
                        <ComboboxTrigger className="w-full h-9 bg-black/40 border-none focus:ring-1 focus:ring-tropicalTeal/50 text-xs px-3 text-white flex items-center justify-between rounded-md">
                            <ComboboxValue />
                        </ComboboxTrigger>
                        <ComboboxContent className="bg-[#1a2e33] border-white/10" sideOffset={5}>
                            <ComboboxList className="bg-transparent p-1">
                                {['JavaScript', 'WebAssembly', 'WebGPU', 'WebWorkers'].map((m) => (
                                    <ComboboxItem
                                        key={m}
                                        value={m}
                                        className="text-gray-200 focus:bg-tropicalTeal focus:text-black rounded-sm text-xs py-1.5 pl-2 pr-8 relative cursor-pointer select-none"
                                    >
                                        {m}
                                    </ComboboxItem>
                                ))}
                            </ComboboxList>
                        </ComboboxContent>
                    </Combobox>
                </div>

                <div className="flex-1 min-w-0">
                    <Combobox value={renderMode} onValueChange={(v) => setRenderMode(v as RenderMode)}>
                        <ComboboxTrigger className="w-full h-9 bg-black/40 border-none focus:ring-1 focus:ring-tropicalTeal/50 text-xs px-3 text-white flex items-center justify-between rounded-md">
                            <ComboboxValue />
                        </ComboboxTrigger>
                        <ComboboxContent className="bg-[#1a2e33] border-white/10" sideOffset={5}>
                            <ComboboxList className="bg-transparent p-1">
                                <ComboboxItem value="cpu" className="text-gray-200 focus:bg-tropicalTeal focus:text-black rounded-sm text-xs py-1.5 pl-2 pr-8 relative cursor-pointer select-none">CPU Render</ComboboxItem>
                                <ComboboxItem value="gpu" className="text-gray-200 focus:bg-tropicalTeal focus:text-black rounded-sm text-xs py-1.5 pl-2 pr-8 relative cursor-pointer select-none">GPU Render</ComboboxItem>
                            </ComboboxList>
                        </ComboboxContent>
                    </Combobox>
                </div>

                {!isAgentCountDefined && (
                    <div className="flex-1 min-w-0">
                        <div className="w-full h-9 bg-black/40 border-none flex items-center justify-between rounded-md px-2 focus-within:ring-1 focus-within:ring-tropicalTeal/50">
                            <span className="text-[10px] uppercase font-bold text-gray-400 mr-2 shrink-0">Agents</span>
                            <Input
                                type="number"
                                value={agentCount}
                                onChange={(e) => setAgentCount(Number.parseInt(e.target.value, 10) || 1)}
                                min={1}
                                step={1}
                                className="bg-transparent border-none p-0 h-full text-xs font-mono text-tropicalTeal w-full text-right focus:ring-0"
                            />
                        </div>
                    </div>
                )}
            </div>
        </RunControl>
    );
};

export const PlaygroundControls = ({
    method,
    setMethod,
    renderMode,
    setRenderMode,
    isRunning,
    handleRun,
    inputs,
    definedInputs,
    handleInputChange,
}: PlaygroundControlsProps) => {
    return (
        <div className="flex flex-col gap-4">
            <Controls
                method={method}
                setMethod={setMethod}
                renderMode={renderMode}
                setRenderMode={setRenderMode}
                isRunning={isRunning}
                handleRun={handleRun}
                agentCount={inputs.agentCount || 1000}
                setAgentCount={(val) => handleInputChange('agentCount', val)}
                isAgentCountDefined={definedInputs.some(d => d.name === 'agentCount')}
            />
        </div>
    );
};
