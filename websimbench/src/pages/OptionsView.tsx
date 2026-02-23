import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  SimulationAppearanceOptions,
  UpdateOptionFn,
} from "../hooks/useSimulationOptions";

import {
  Palette,
  Monitor,
  Circle,
  Square,
  Cube,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useEffect, type ReactNode } from "react";
import "./OptionsView.css";

interface OptionsViewProps {
  options: SimulationAppearanceOptions;
  updateOption: UpdateOptionFn;
  resetOptions: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FALLBACK_SPECIES_COLORS = ["#00FFFF"];

const formatValue = (value: number, decimals = 2) => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(decimals);
};

interface OptionsSectionProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

const OptionsSection = ({ icon, title, children }: OptionsSectionProps) => (
  <section className="options-section animate-in fade-in slide-in-from-bottom-3 duration-300">
    <div className="options-section-title">
      {icon}
      <h3>{title}</h3>
    </div>
    <div className="options-grid">{children}</div>
  </section>
);

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

const ColorField = ({
  label,
  value,
  onChange,
  compact = false,
}: ColorFieldProps) => (
  <div
    className={cn(
      "options-card options-card-focus",
      compact && "options-card-compact",
    )}
  >
    <Label className="options-label">{label}</Label>
    <div className="options-color-field">
      <div
        className={cn(
          "options-color-preview",
          compact && "options-color-preview-small",
        )}
      >
        <Input
          type="color"
          className="options-color-input"
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onChange(e.target.value)
          }
        />
      </div>
      <Input
        type="text"
        className="options-text-input"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
      />
    </div>
  </div>
);

export const OptionsView = ({
  options,
  updateOption,
  resetOptions,
  open,
  onOpenChange,
}: OptionsViewProps) => {
  useEffect(() => {
    if (!open) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEsc);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEsc);
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  const speciesColors = options.speciesColors?.length
    ? options.speciesColors
    : FALLBACK_SPECIES_COLORS;

  const updateSpeciesColor = (index: number, value: string) => {
    const updated = [...speciesColors];
    updated[index] = value;
    updateOption("speciesColors", updated);
    if (index === 0) updateOption("agentColor", value);
  };

  return (
    <div className="options-overlay" onClick={() => onOpenChange(false)}>
      <div className="options-backdrop" />
      <div
        className="options-panel animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-label="System Configuration"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="options-header">
          <div className="options-header-copy">
            <h2 className="options-heading">System Configuration</h2>
            <p className="options-subheading">
              Appearance, trails, and runtime diagnostics
            </p>
          </div>
          <div className="options-header-actions">
            <Button
              variant="outline"
              size="sm"
              className="options-reset-btn"
              onClick={resetOptions}
            >
              Reset to Defaults
            </Button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="options-close-btn"
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </div>

        <div className="options-content">
          <div className="options-stack">
            <OptionsSection
              icon={<Palette className="text-zinc-400" size={17} />}
              title="Appearance"
            >
              <div className="options-card options-card-focus">
                <Label className="options-label">Species Colors</Label>
                <div className="options-swatch-grid">
                  {speciesColors.map((color, index) => (
                    <div key={index} className="options-swatch-item">
                      <div className="options-swatch-chip">
                        <Input
                          type="color"
                          className="options-color-input"
                          value={color}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            updateSpeciesColor(index, e.target.value)
                          }
                        />
                      </div>
                      <span className="options-swatch-label">#{index}</span>
                    </div>
                  ))}
                </div>
              </div>

              <ColorField
                label="Background Color"
                value={options.backgroundColor}
                onChange={(value) => updateOption("backgroundColor", value)}
              />

              {options.showTrails && (
                <ColorField
                  label="Trail Color"
                  value={options.trailColor}
                  onChange={(value) => updateOption("trailColor", value)}
                />
              )}
            </OptionsSection>

            <OptionsSection
              icon={<Monitor className="text-zinc-400" size={17} />}
              title="Simulation"
            >
              <div className="options-grid options-grid-2">
                <div className="options-card">
                  <div className="options-card-header">
                    <Label className="options-label">Agent Size</Label>
                    <span className="options-badge">
                      {formatValue(options.agentSize, 1)}
                    </span>
                  </div>
                  <Slider
                    min={1}
                    max={20}
                    step={0.5}
                    value={[options.agentSize]}
                    onValueChange={(values: number[]) =>
                      updateOption("agentSize", values[0])
                    }
                    className="options-slider"
                  />
                </div>

                <div className="options-card">
                  <Label className="options-label">Agent Shape</Label>
                  <div className="options-segmented">
                    <button
                      type="button"
                      className={cn(
                        "options-segment",
                        options.agentShape === "circle" && "is-active",
                      )}
                      onClick={() => updateOption("agentShape", "circle")}
                    >
                      <Circle weight="fill" size={14} />
                      Circle
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "options-segment",
                        options.agentShape === "square" && "is-active",
                      )}
                      onClick={() => updateOption("agentShape", "square")}
                    >
                      <Square weight="fill" size={14} />
                      Square
                    </button>
                  </div>
                </div>
              </div>
            </OptionsSection>

            <OptionsSection
              icon={<Cube size={17} className="text-zinc-400" weight="fill" />}
              title="Obstacles"
            >
              <div className="options-grid options-grid-2">
                <ColorField
                  label="Fill Color"
                  value={options.obstacleColor}
                  onChange={(value) => updateOption("obstacleColor", value)}
                  compact
                />
                <ColorField
                  label="Border Color"
                  value={options.obstacleBorderColor}
                  onChange={(value) =>
                    updateOption("obstacleBorderColor", value)
                  }
                  compact
                />
              </div>

              <div className="options-card">
                <div className="options-card-header">
                  <Label className="options-label">Opacity</Label>
                  <span className="options-badge">
                    {formatValue(options.obstacleOpacity ?? 0.2, 2)}
                  </span>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[options.obstacleOpacity ?? 0.2]}
                  onValueChange={(values: number[]) =>
                    updateOption("obstacleOpacity", values[0])
                  }
                  className="options-slider"
                />
              </div>
            </OptionsSection>
          </div>
        </div>
      </div>
    </div>
  );
};
