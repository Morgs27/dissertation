import { useEffect, useState, type CSSProperties } from "react";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { BookOpenText, RocketLaunch } from "@phosphor-icons/react";
import { Gamepad2 } from "lucide-react";
import "./OnboardingModal.css";

interface OnboardingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
  onOpenDocs: () => void;
}

export const OnboardingModal = ({
  open,
  onOpenChange,
  onContinue,
  onOpenDocs,
}: OnboardingModalProps) => {
  const [pointer, setPointer] = useState({ x: 50, y: 35 });

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    let rafId = 0;
    let nextX = pointer.x;
    let nextY = pointer.y;

    const updatePointer = () => {
      setPointer((current) => ({
        x: current.x + (nextX - current.x) * 0.12,
        y: current.y + (nextY - current.y) * 0.12,
      }));
      rafId = window.requestAnimationFrame(updatePointer);
    };

    const handleWindowPointerMove = (event: MouseEvent) => {
      const width = window.innerWidth || 1;
      const height = window.innerHeight || 1;
      nextX = (event.clientX / width) * 100;
      nextY = (event.clientY / height) * 100;
    };

    const handleWindowPointerLeave = () => {
      nextX = 50;
      nextY = 35;
    };

    window.addEventListener("mousemove", handleWindowPointerMove);
    window.addEventListener("mouseout", handleWindowPointerLeave);
    rafId = window.requestAnimationFrame(updatePointer);

    return () => {
      window.removeEventListener("mousemove", handleWindowPointerMove);
      window.removeEventListener("mouseout", handleWindowPointerLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, [open]);

  const surfaceStyle = {
    "--mx": `${pointer.x}%`,
    "--my": `${pointer.y}%`,
  } as CSSProperties;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="onboarding-modal"
        aria-describedby="onboarding-description"
      >
        <div className="onboarding-surface" style={surfaceStyle}>
          <div className="onboarding-hero">
            <div className="onboarding-hero-text">
              <div className="onboarding-badge">
                <RocketLaunch size={14} weight="bold" />
                Welcome to WebSimBench
              </div>
              <h2 className="onboarding-heading">
                Fast simulation workflow for 2D agent experiments.
              </h2>
              <p id="onboarding-description" className="onboarding-copy">
                WebSimBench wraps agentyx to help you run simulations and
                benchmark performance accross different compute environments
                with minimal setup.
              </p>
            </div>

            <div className="onboarding-hero-graphic" aria-hidden="true">
              <svg viewBox="0 0 360 220" className="onboarding-hero-svg">
                <defs>
                  <linearGradient
                    id="lineGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#00ffd5" stopOpacity="0.2" />
                    <stop offset="50%" stopColor="#00ffd5" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#1f363d" stopOpacity="0.2" />
                  </linearGradient>
                  <radialGradient id="coreGrad" cx="50%" cy="50%" r="60%">
                    <stop offset="0%" stopColor="#00ffd5" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#00ffd5" stopOpacity="0.1" />
                  </radialGradient>
                </defs>

                <rect
                  x="8"
                  y="8"
                  width="344"
                  height="204"
                  rx="16"
                  className="onboarding-hero-panel"
                />
                <line
                  x1="50"
                  y1="112"
                  x2="310"
                  y2="112"
                  stroke="url(#lineGrad)"
                  strokeWidth="2"
                />
                <line
                  x1="180"
                  y1="34"
                  x2="180"
                  y2="190"
                  stroke="url(#lineGrad)"
                  strokeWidth="2"
                />

                <g className="onboarding-orbit onboarding-orbit-a">
                  <circle cx="180" cy="112" r="50" fill="none" />
                </g>
                <g className="onboarding-orbit onboarding-orbit-b">
                  <circle cx="180" cy="112" r="74" fill="none" />
                </g>
                <g className="onboarding-orbit onboarding-orbit-c">
                  <circle cx="180" cy="112" r="96" fill="none" />
                </g>

                <circle
                  cx="180"
                  cy="112"
                  r="22"
                  fill="url(#coreGrad)"
                  className="onboarding-core"
                />
                <circle
                  cx="180"
                  cy="112"
                  r="5"
                  className="onboarding-core-dot"
                />
                <circle
                  cx="230"
                  cy="112"
                  r="4"
                  className="onboarding-node onboarding-node-a"
                />
                <circle
                  cx="180"
                  cy="38"
                  r="4"
                  className="onboarding-node onboarding-node-b"
                />
                <circle
                  cx="110"
                  cy="112"
                  r="4"
                  className="onboarding-node onboarding-node-c"
                />
              </svg>
            </div>
          </div>

          <div className="onboarding-actions">
            <Button
              variant="outline"
              onClick={onOpenDocs}
              className="onboarding-btn-outline"
            >
              <BookOpenText size={16} />
              Documentation
            </Button>
            <Button onClick={onContinue} className="onboarding-btn-primary">
              <Gamepad2 size={16} />
              Open Playground
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
