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
        <div className="flex items-center gap-4 bg-transparent p-0 rounded-xl">
            <div className="flex-1 flex items-center gap-2">
                {children}
            </div>

            <Button
                onClick={isRunning ? (onStop || onRun) : onRun}
                size="sm"
                className={`h-9 px-6 font-bold transition-all duration-300 ${isRunning
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20"
                    : "bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-500/20"
                    }`}
            >
                {isRunning ? <Stop className="mr-2" size={16} weight="bold" /> : <Play className="mr-2" size={16} weight="bold" />}
                {isRunning ? "Stop" : "Run"}
            </Button>
        </div>
    );
};
