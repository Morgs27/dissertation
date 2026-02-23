import { InputDefinition } from "@websimbench/agentyx";
import { ScrubbableInput } from "@/components/ui/scrubbable-input";
import "./CanvasInputs.css";

interface CanvasInputsProps {
  inputs: Record<string, number>;
  definedInputs: InputDefinition[];
  handleInputChange: (key: string, value: number) => void;
}

const formatInputName = (name: string) => {
  return name
    .replace(/([A-Z])/g, " $1") // insert space before capital letters
    .replace(/^./, (str) => str.toUpperCase()); // uppercase the first character
};

export const CanvasInputs = ({
  inputs,
  definedInputs,
  handleInputChange,
}: CanvasInputsProps) => {
  // Show nothing if there are no dynamic inputs
  // We filter out agentCount just in case it's in definedInputs, since it's in PlaygroundControls now
  const availableInputs = definedInputs.filter((d) => d.name !== "agentCount");

  console.log("CanvasInputs render check:", {
    definedInputs,
    availableInputs,
    inputs,
  });

  if (availableInputs.length === 0) return null;

  return (
    <div
      className="canvas-inputs-container"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {availableInputs.map((def) => (
        <div key={def.name} className="canvas-inputs-item">
          <span className="canvas-inputs-label">
            {formatInputName(def.name)}
          </span>
          <ScrubbableInput
            value={inputs[def.name] ?? def.defaultValue}
            onChange={(val) => handleInputChange(def.name, val)}
            min={def.min}
            max={def.max}
            step={def.defaultValue % 1 !== 0 ? 0.01 : 1}
            className="canvas-inputs-slider"
          />
        </div>
      ))}
    </div>
  );
};
