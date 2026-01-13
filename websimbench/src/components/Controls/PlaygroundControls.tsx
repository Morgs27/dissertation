import { Method, RenderMode, InputDefinition } from '../../simulation/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Play, Stop, Speedometer } from "@phosphor-icons/react";
import { Slider } from "@/components/ui/slider";

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
    fps: number;
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
    handleRun,
    fps
}: ControlsProps) => {
    return (
        <div className="flex items-center gap-4 bg-black/10 p-3 rounded-xl border border-white/5">
            <div className="flex items-center gap-2">
                <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                    <SelectTrigger className="w-[140px] h-9 bg-black/40 border-none focus:ring-1 focus:ring-tropicalTeal/50 text-xs font-bold">
                        <SelectValue placeholder="Method" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a2e33] border-white/10">
                        <SelectItem value="JavaScript">JavaScript</SelectItem>
                        <SelectItem value="WebAssembly">WebAssembly</SelectItem>
                        <SelectItem value="WebGPU">WebGPU</SelectItem>
                        <SelectItem value="WebWorkers">WebWorkers</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={renderMode} onValueChange={(v) => setRenderMode(v as RenderMode)}>
                    <SelectTrigger className="w-[110px] h-9 bg-black/40 border-none focus:ring-1 focus:ring-tropicalTeal/50 text-xs font-bold">
                        <SelectValue placeholder="Render" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1a2e33] border-white/10">
                        <SelectItem value="cpu">CPU Render</SelectItem>
                        <SelectItem value="gpu">GPU Render</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Button
                onClick={handleRun}
                size="sm"
                className={`h-9 px-6 font-bold transition-all duration-300 ${isRunning
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20"
                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20"
                    }`}
            >
                {isRunning ? <Stop className="mr-2" size={16} weight="bold" /> : <Play className="mr-2" size={16} weight="bold" />}
                {isRunning ? "Stop" : "Run Sim"}
            </Button>

            <div className="ml-auto flex items-center bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                <Speedometer className="mr-2 text-tropicalTeal" size={18} />
                <span className="text-xs font-mono font-bold tracking-tight">
                    {fps} <span className="text-gray-500 text-[10px] uppercase ml-0.5">FPS</span>
                </span>
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
                    <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-300">agentCount</span>
                            <span className="text-[11px] font-mono bg-black/40 px-2 py-0.5 rounded text-tropicalTeal">{inputs.agentCount || 1000}</span>
                        </div>
                        <Slider
                            value={[inputs.agentCount || 1000]}
                            min={10}
                            max={100000}
                            step={10}
                            onValueChange={(vals) => handleInputChange('agentCount', vals[0])}
                            className="py-1"
                        />
                    </div>
                )}

                {/* Dynamic sliders from defined inputs */}
                {definedInputs.map((def) => (
                    <div key={def.name} className="flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-gray-300">{def.name}</span>
                            <span className="text-[11px] font-mono bg-black/40 px-2 py-0.5 rounded text-tropicalTeal">{inputs[def.name] ?? def.defaultValue}</span>
                        </div>
                        <Slider
                            value={[inputs[def.name] ?? def.defaultValue]}
                            min={def.min ?? 0}
                            max={def.max ?? 100}
                            step={(def.max && def.max <= 1) ? 0.001 : 0.01}
                            onValueChange={(vals) => handleInputChange(def.name, vals[0])}
                            className="py-1"
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};


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
