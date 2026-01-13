import { Slider } from "@/components/ui/slider";
import { InputDefinition } from '../../simulation/types';

interface InputsProps {
  inputs: Record<string, number>;
  definedInputs: InputDefinition[];
  handleInputChange: (key: string, value: number) => void;
}

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
