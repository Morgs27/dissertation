import { Button } from "@/components/ui/button";
import { Play, Stop } from "@phosphor-icons/react";
import React from "react";

interface RunControlProps {
    isRunning: boolean;
    onRun: () => void;
    onStop?: () => void;
    children?: React.ReactNode;
}

export const RunControl = ({ isRunning, onRun, onStop, children }: RunControlProps) => {
    return (
        <div className="run-control">
            <div className="run-control-content">
                {children}
            </div>

            <Button
                onClick={isRunning ? (onStop || onRun) : onRun}
                size="sm"
                className={`run-btn ${isRunning ? "run-btn-active" : "run-btn-inactive"}`}
            >
                {isRunning ? <Stop className="mr-2" size={16} weight="bold" /> : <Play className="mr-2" size={16} weight="bold" />}
                {isRunning ? "Stop" : "Run"}
            </Button>
        </div>
    );
};
