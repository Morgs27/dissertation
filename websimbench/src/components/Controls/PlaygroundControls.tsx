import { Method, RenderMode, InputDefinition } from '../../simulation/types';
import { Combobox, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue, ComboboxList } from "@/components/ui/combobox";
import { Speedometer } from "@phosphor-icons/react";
import { ScrubbableInput } from "@/components/ui/scrubbable-input";
import { RunControl } from "./RunControl";

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

interface ControlsProps {
    method: Method;
    setMethod: (m: Method) => void;
    renderMode: RenderMode;
    setRenderMode: (r: RenderMode) => void;
    isRunning: boolean;
    handleRun: () => void;
}

interface InputsProps {
    inputs: Record<string, number>;
    definedInputs: InputDefinition[];
    handleInputChange: (key: string, value: number) => void;
}

export const Controls = ({
    method,
    setMethod,
    renderMode,
    setRenderMode,
    isRunning,
    handleRun
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
            </div>
        </RunControl>
    );
};

const formatInputName = (name: string) => {
    return name
        .replace(/([A-Z])/g, ' $1') // insert space before capital letters
        .replace(/^./, (str) => str.toUpperCase()); // uppercase the first character
};

export const PerformanceCard = ({ fps }: { fps: number }) => {
    return (
        <div className="flex items-center justify-between bg-[#1a2e33] p-3 rounded-xl border border-white/5">
            <div className="flex items-center gap-2">
                <Speedometer className="text-tropicalTeal" size={20} weight="fill" />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Performance</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xl font-mono font-bold text-white tracking-tight">
                    {fps}
                </span>
                <span className="text-[10px] font-bold text-gray-500 uppercase">FPS</span>
            </div>
        </div>
    );
};

export const Inputs = ({ inputs, definedInputs, handleInputChange }: InputsProps) => {
    return (
        <div className="space-y-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Parameters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                {/* Show default agent count slider only if not defined in DSL */}
                {!definedInputs.some(d => d.name === 'agentCount') && (
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-gray-400">Agent Count</span>
                        <ScrubbableInput
                            value={inputs.agentCount || 1000}
                            onChange={(val) => handleInputChange('agentCount', val)}
                            min={1}
                            step={1}
                            className="bg-black/40 border-white/10 h-9 text-xs font-mono text-tropicalTeal focus:ring-1 focus:ring-tropicalTeal/50"
                        />
                    </div>
                )}

                {/* Dynamic sliders from defined inputs */}
                {definedInputs.map((def) => (
                    <div key={def.name} className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-gray-400">{formatInputName(def.name)}</span>
                        <ScrubbableInput
                            value={inputs[def.name] ?? def.defaultValue}
                            onChange={(val) => handleInputChange(def.name, val)}
                            min={def.min}
                            max={def.max}
                            step={def.defaultValue % 1 !== 0 ? 0.01 : 1}
                            className="bg-black/40 border-white/10 h-9 text-xs font-mono text-tropicalTeal focus:ring-1 focus:ring-tropicalTeal/50"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};




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

// ... (keep Controls and Inputs components same, maybe add obstacle controls to Controls or new component)

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
            />
            <PerformanceCard fps={fps} />
            <Inputs
                inputs={inputs}
                definedInputs={definedInputs}
                handleInputChange={handleInputChange}
            />
        </div>
    );
};
