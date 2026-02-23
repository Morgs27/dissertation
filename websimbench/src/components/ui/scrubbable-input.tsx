import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ArrowsLeftRight } from "@phosphor-icons/react";

interface ScrubbableInputProps extends Omit<
  React.ComponentProps<"input">,
  "onChange"
> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  sensitivity?: number;
}

const ScrubbableInput = React.forwardRef<
  HTMLInputElement,
  ScrubbableInputProps
>(
  (
    {
      className,
      value,
      onChange,
      min = -Infinity,
      max = Infinity,
      step,
      sensitivity = 1,
      ...props
    },
    ref,
  ) => {
    const [isEditing, setIsEditing] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const startXRef = React.useRef<number>(0);
    const startValueRef = React.useRef<number>(0);

    // Merge refs
    React.useImperativeHandle(ref, () => inputRef.current!);

    // Calculate effective step
    const effectiveStep = React.useMemo(() => {
      if (step !== undefined) return step;
      if (
        Number.isInteger(value) &&
        Number.isInteger(min) &&
        Number.isInteger(max)
      )
        return 1;
      // Check for decimal places
      const valueString = value.toString();
      if (valueString.includes(".")) {
        const decimals = valueString.split(".")[1].length;
        return Math.pow(10, -decimals);
      }
      return 1;
    }, [step, value, min, max]);

    const handlePointerDown = (e: React.PointerEvent) => {
      if (isEditing) return;
      if (e.button !== 0) return; // Left click only

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      startXRef.current = e.clientX;
      startValueRef.current = Number(value);
      setIsDragging(false);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      if (isEditing) return;
      if (!startXRef.current) return;
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        const deltaX = e.clientX - startXRef.current;

        // Threshold for dragging
        if (!isDragging && Math.abs(deltaX) > 3) {
          setIsDragging(true);
          document.body.style.cursor = "ew-resize";
        }

        if (isDragging) {
          const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;

          // Pixel to value mapping
          // For small ranges (0-1), 1px should be small
          // For large ranges (0-1000), 1px should be large?
          // Actually usually a fixed "pixels per step" is best.

          const pixelsPerStep = 5; // 5px movement = 1 step
          const steps = deltaX / pixelsPerStep;

          let newValue =
            startValueRef.current +
            steps * effectiveStep * multiplier * sensitivity;

          // Clamp
          if (min !== undefined) newValue = Math.max(newValue, min);
          if (max !== undefined) newValue = Math.min(newValue, max);

          // Round to clean decimals if step implies it
          const decimals = effectiveStep.toString().split(".")[1]?.length || 0;
          if (decimals > 0) {
            newValue = parseFloat(newValue.toFixed(decimals));
          } else {
            newValue = Math.round(newValue);
          }

          onChange(newValue);
        }
      }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      if (isEditing) return;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      document.body.style.cursor = "";

      if (!isDragging) {
        setIsEditing(true);
        // Wait for render to reveal input, then focus
        requestAnimationFrame(() => inputRef.current?.focus());
      }

      setIsDragging(false);
      startXRef.current = 0;
    };

    const handleBlur = () => {
      setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        inputRef.current?.blur();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        onChange(val);
      }
    };

    return (
      <div className="relative group w-full">
        {!isEditing && (
          <div
            className="absolute inset-0 z-10 cursor-ew-resize flex items-center px-3 text-xs font-mono text-tropicalTeal bg-transparent rounded-md"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Visualizer of value */}
            <span className="flex-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 text-white px-1 rounded absolute right-2 pointer-events-none text-[10px]">
              Drag to adjust
            </span>
          </div>
        )}
        <Input
          ref={inputRef}
          type="number"
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            "font-mono text-tropicalTeal cursor-text",
            !isEditing && "cursor-ew-resize select-none pointer-events-none",
            className,
          )}
          {...props}
        />
        {!isEditing && (
          <ArrowsLeftRight
            weight="bold"
            size={12}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none group-hover:text-tropicalTeal transition-colors"
          />
        )}
      </div>
    );
  },
);
ScrubbableInput.displayName = "ScrubbableInput";

export { ScrubbableInput };
