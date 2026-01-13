import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Play, Stop, Speedometer } from "@phosphor-icons/react";
import { Method, RenderMode } from '../../simulation/types';

interface ControlsProps {
  method: Method;
  setMethod: (m: Method) => void;
  renderMode: RenderMode;
  setRenderMode: (r: RenderMode) => void;
  isRunning: boolean;
  handleRun: () => void;
  fps: number;
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
