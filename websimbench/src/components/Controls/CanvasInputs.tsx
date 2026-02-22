import { useState } from 'react';
import { InputDefinition } from '@websimbench/agentyx';
import { ScrubbableInput } from '@/components/ui/scrubbable-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface CanvasInputsProps {
    inputs: Record<string, number>;
    definedInputs: InputDefinition[];
    handleInputChange: (key: string, value: number) => void;
}

const formatInputName = (name: string) => {
    return name
        .replace(/([A-Z])/g, ' $1') // insert space before capital letters
        .replace(/^./, (str) => str.toUpperCase()); // uppercase the first character
};

export const CanvasInputs = ({ inputs, definedInputs, handleInputChange }: CanvasInputsProps) => {
    // Show nothing if there are no dynamic inputs
    // We filter out agentCount just in case it's in definedInputs, since it's in PlaygroundControls now
    const availableInputs = definedInputs.filter(d => d.name !== 'agentCount');

    console.log("CanvasInputs render check:", {
        definedInputs,
        availableInputs,
        inputs
    });

    if (availableInputs.length === 0) return null;

    // By default, pin all available inputs
    const [pinnedInputs, setPinnedInputs] = useState<string[]>(availableInputs.map(d => d.name));

    const togglePin = (name: string) => {
        setPinnedInputs(prev =>
            prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
        );
    };

    const pinnedDefs = availableInputs.filter(d => pinnedInputs.includes(d.name));

    return (
        <div className="absolute bottom-6 left-0 right-0 z-10 flex flex-row gap-4 items-end justify-center pointer-events-none px-6">

            {/* Settings Dropdown Button */}
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-full bg-black/40 backdrop-blur-md border border-white/10 hover:bg-black/60 pointer-events-auto shadow-lg">
                        <SlidersHorizontal className="h-5 w-5 text-tropicalTeal" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2 bg-[#1a2e33] border border-white/10 pointer-events-auto shadow-xl" side="top" align="center" sideOffset={12}>
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">Canvas Inputs</span>
                        {availableInputs.map((def) => (
                            <label key={def.name} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-white/5 cursor-pointer">
                                <Checkbox
                                    checked={pinnedInputs.includes(def.name)}
                                    onCheckedChange={() => togglePin(def.name)}
                                    className="border-white/20 data-[state=checked]:bg-tropicalTeal data-[state=checked]:text-black"
                                />
                                <span className="text-xs text-gray-300 truncate">{formatInputName(def.name)}</span>
                            </label>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            {/* Pinned Sliders */}
            {pinnedDefs.length > 0 && (
                <div className="bg-black/40 backdrop-blur-md rounded-xl shadow-lg border border-white/10 px-4 py-3 flex flex-row flex-wrap items-center gap-x-6 gap-y-3 pointer-events-auto max-w-[80%]">
                    {pinnedDefs.map((def) => (
                        <div key={def.name} className="flex flex-row items-center gap-3">
                            <span className="text-[10px] whitespace-nowrap font-bold text-gray-400 uppercase tracking-wider">{formatInputName(def.name)}</span>
                            <ScrubbableInput
                                value={inputs[def.name] ?? def.defaultValue}
                                onChange={(val) => handleInputChange(def.name, val)}
                                min={def.min}
                                max={def.max}
                                step={def.defaultValue % 1 !== 0 ? 0.01 : 1}
                                className="bg-black/40 border-white/5 h-7 w-20 text-[11px] font-mono text-tropicalTeal focus:ring-1 focus:ring-tropicalTeal/50 px-2"
                            />
                        </div>
                    ))}
                </div>
            )}

        </div>
    );
};
