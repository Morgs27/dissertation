import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Label,
} from '@/components/ui';
import { SimulationAppearanceOptions, UpdateOptionFn } from '../hooks/useSimulationOptions';
import { LogLevel } from '@websimbench/agentyx';
import { Palette, Monitor, ShootingStar, Info, Circle, Square, Cube, X } from "@phosphor-icons/react";

interface OptionsViewProps {
  options: SimulationAppearanceOptions;
  updateOption: UpdateOptionFn;
  resetOptions: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const OptionsView = ({ options, updateOption, resetOptions, open, onOpenChange }: OptionsViewProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl h-full bg-[#0a1a1f] border-l border-white/[0.06] shadow-2xl shadow-black/60 overflow-hidden animate-in slide-in-from-right duration-300 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-12 flex items-center justify-between px-6 bg-white/[0.02] border-b border-white/[0.06] shrink-0">
          <h2 className="text-sm font-bold text-white tracking-tight">System Configuration</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-red-400 border-red-400/30 hover:bg-red-500/10 hover:border-red-400 transition-all font-bold text-[11px]"
              onClick={resetOptions}
            >
              Reset to Defaults
            </Button>
            <button
              onClick={() => onOpenChange(false)}
              className="w-8 h-8 rounded-md flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Appearance Section */}
            <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
                <Palette className="text-tropicalTeal" size={20} />
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-gray-400">Appearance</h3>
              </div>

              <div className="grid gap-8">
                <div className="space-y-3">
                  <Label className="text-xs font-bold text-gray-400 flex items-center gap-2">
                    Species Colors
                  </Label>
                  <div className="grid grid-cols-5 gap-2">
                    {(options.speciesColors || ['#00FFFF']).map((color, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-4 bg-[#0c1317] p-2 rounded-xl border border-white/[0.08] focus-within:border-tropicalTeal/30 transition-all">
                          <div className="relative w-full aspect-square shrink-0 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                            <Input
                              type="color"
                              className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer border-none p-0"
                              value={color}
                              onChange={(e) => {
                                const newColors = [...(options.speciesColors || [])];
                                newColors[idx] = e.target.value;
                                updateOption('speciesColors', newColors);
                                if (idx === 0) updateOption('agentColor', e.target.value); // Sync primarily color
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-[10px] text-center text-gray-500 font-mono">#{idx}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-xs font-bold text-gray-400">Background Color</Label>
                  <div className="flex items-center gap-4 bg-[#0c1317] p-3 rounded-xl border border-white/[0.08] focus-within:border-tropicalTeal/30 transition-all">
                    <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                      <Input
                        type="color"
                        className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer border-none p-0"
                        value={options.backgroundColor}
                        onChange={(e) => updateOption('backgroundColor', e.target.value)}
                      />
                    </div>
                    <Input
                      type="text"
                      className="flex-1 h-10 bg-transparent border-none text-sm font-mono focus:ring-0"
                      value={options.backgroundColor}
                      onChange={(e) => updateOption('backgroundColor', e.target.value)}
                    />
                  </div>
                </div>

                {options.showTrails && (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <Label className="text-xs font-bold text-gray-400 flex items-center gap-2">
                      <ShootingStar size={14} /> Trail Color
                    </Label>
                    <div className="flex items-center gap-4 bg-[#0c1317] p-3 rounded-xl border border-white/[0.08] focus-within:border-tropicalTeal/30 transition-all">
                      <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden border border-white/10 shadow-lg">
                        <Input
                          type="color"
                          className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer border-none p-0"
                          value={options.trailColor}
                          onChange={(e) => updateOption('trailColor', e.target.value)}
                        />
                      </div>
                      <Input
                        type="text"
                        className="flex-1 h-10 bg-transparent border-none text-sm font-mono focus:ring-0"
                        value={options.trailColor}
                        onChange={(e) => updateOption('trailColor', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4 pt-6 border-t border-white/[0.08] animate-in fade-in duration-500 delay-100">
                <div className="flex items-center gap-2 mb-4">
                  <Cube size={16} className="text-tropicalTeal" weight="fill" />
                  <Label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Obstacle Appearance</Label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] text-gray-500 uppercase font-bold">Fill Color</Label>
                    <div className="flex items-center gap-3 bg-[#0c1317] p-2 rounded-xl border border-white/[0.08] focus-within:border-tropicalTeal/30 transition-all">
                      <div className="relative w-8 h-8 shrink-0 rounded-lg overflow-hidden border border-white/10 shadow-sm">
                        <Input
                          type="color"
                          className="absolute inset-[-5px] w-[200%] h-[200%] cursor-pointer border-none p-0"
                          value={options.obstacleColor}
                          onChange={(e) => updateOption('obstacleColor', e.target.value)}
                        />
                      </div>
                      <Input
                        type="text"
                        className="flex-1 h-8 bg-transparent border-none text-xs font-mono focus:ring-0 text-white"
                        value={options.obstacleColor}
                        onChange={(e) => updateOption('obstacleColor', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] text-gray-500 uppercase font-bold">Border Color</Label>
                    <div className="flex items-center gap-3 bg-[#0c1317] p-2 rounded-xl border border-white/[0.08] focus-within:border-tropicalTeal/30 transition-all">
                      <div className="relative w-8 h-8 shrink-0 rounded-lg overflow-hidden border border-white/10 shadow-sm">
                        <Input
                          type="color"
                          className="absolute inset-[-5px] w-[200%] h-[200%] cursor-pointer border-none p-0"
                          value={options.obstacleBorderColor}
                          onChange={(e) => updateOption('obstacleBorderColor', e.target.value)}
                        />
                      </div>
                      <Input
                        type="text"
                        className="flex-1 h-8 bg-transparent border-none text-xs font-mono focus:ring-0 text-white"
                        value={options.obstacleBorderColor}
                        onChange={(e) => updateOption('obstacleBorderColor', e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mt-2 bg-[#0c1317] p-4 rounded-xl border border-white/[0.08]">
                  <div className="flex justify-between items-center">
                    <Label className="text-[10px] text-gray-500 uppercase font-bold">Opacity</Label>
                    <span className="text-xs font-mono text-tropicalTeal bg-tropicalTeal/10 px-2 py-0.5 rounded">{options.obstacleOpacity?.toFixed(2) ?? "0.20"}</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={[options.obstacleOpacity ?? 0.2]}
                    onValueChange={(v) => updateOption('obstacleOpacity', v[0])}
                    className="py-1"
                  />
                </div>
              </div>
            </section>

            {/* Configuration Section */}
            <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
              <div className="flex items-center gap-2 pb-2 border-b border-white/[0.08]">
                <Monitor className="text-tropicalTeal" size={20} />
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-gray-400">Simulation Config</h3>
              </div>

              <div className="grid gap-8">
                <div className="space-y-4 bg-[#0c1317] p-6 rounded-2xl border border-white/[0.08]">
                  <div className="flex justify-between items-center mb-2">
                    <Label className="text-sm font-medium">Agent Size (px)</Label>
                    <span className="text-xs font-mono bg-tropicalTeal/10 text-tropicalTeal px-2 py-1 rounded-md">{options.agentSize}</span>
                  </div>
                  <Slider
                    min={1}
                    max={20}
                    step={0.5}
                    value={[options.agentSize]}
                    onValueChange={(val) => updateOption('agentSize', val[0])}
                    className="py-2"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3 bg-[#0c1317] p-5 rounded-2xl border border-white/[0.08]">
                    <Label className="text-xs font-bold text-gray-400">Agent Shape</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={options.agentShape === 'circle' ? 'default' : 'outline'}
                        onClick={() => updateOption('agentShape', 'circle')}
                        className={`flex-1 ${options.agentShape === 'circle' ? 'bg-tropicalTeal text-jetBlack hover:bg-tropicalTeal/80' : 'bg-transparent border-white/10 hover:bg-white/5'}`}
                      >
                        <Circle weight="fill" className="mr-2" /> Circle
                      </Button>
                      <Button
                        variant={options.agentShape === 'square' ? 'default' : 'outline'}
                        onClick={() => updateOption('agentShape', 'square')}
                        className={`flex-1 ${options.agentShape === 'square' ? 'bg-tropicalTeal text-jetBlack hover:bg-tropicalTeal/80' : 'bg-transparent border-white/10 hover:bg-white/5'}`}
                      >
                        <Square weight="fill" className="mr-2" /> Square
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 bg-[#0c1317] p-5 rounded-2xl border border-white/[0.08] flex flex-col justify-between">
                    <div className="flex justify-between items-center mb-2">
                      <Label htmlFor="trail-opacity" className="text-xs font-bold text-gray-400">
                        Trail Opacity
                      </Label>
                      <span className="text-xs font-mono bg-tropicalTeal/10 text-tropicalTeal px-2 py-1 rounded-md">{options.trailOpacity?.toFixed(2) ?? "1.00"}</span>
                    </div>
                    <Slider
                      id="trail-opacity"
                      min={0}
                      max={1}
                      step={0.01}
                      value={[options.trailOpacity ?? 1]}
                      onValueChange={(v) => updateOption('trailOpacity', v[0])}
                      className="py-2"
                    />
                    <p className="text-[10px] text-gray-500 leading-tight flex items-start gap-1 mt-2">
                      <Info size={12} className="shrink-0 mt-0.5" />
                      Adjusts the intensity of the agent trails. 0 = No trails.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 bg-[#0c1317] p-5 rounded-2xl border border-white/[0.08]">
                  <Label className="text-xs font-bold text-gray-400">Log Verbosity</Label>
                  <Select
                    value={String(options.logLevel)}
                    onValueChange={(v) => updateOption('logLevel', parseInt(v) as LogLevel)}
                  >
                    <SelectTrigger className="bg-black/20 border-white/5 h-11">
                      <SelectValue placeholder="Select Level" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0c1317] border-white/[0.08]">
                      <SelectItem value={String(LogLevel.None)}>None - Quiet Mode</SelectItem>
                      <SelectItem value={String(LogLevel.Error)}>Error - Critical failures</SelectItem>
                      <SelectItem value={String(LogLevel.Warning)}>Warning - Potential issues</SelectItem>
                      <SelectItem value={String(LogLevel.Info)}>Info - Standard output</SelectItem>
                      <SelectItem value={String(LogLevel.Verbose)}>Verbose - Full Debug</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
