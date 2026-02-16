import { Trash, Cursor, Cube } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ObstacleToolbarProps {
    isPlacing: boolean;
    setIsPlacing: (v: boolean) => void;
    onClear: () => void;
    obstacleCount: number;
}

export const ObstacleToolbar = ({
    isPlacing,
    setIsPlacing,
    onClear,
    obstacleCount
}: ObstacleToolbarProps) => {
    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur-md border border-white/10 p-2 rounded-2xl shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300 z-10">

            <div className="flex items-center gap-3 px-2 border-r border-white/10">
                <div className="w-8 h-8 rounded-full bg-tropicalTeal/20 flex items-center justify-center text-tropicalTeal">
                    <Cube weight="fill" size={16} />
                </div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-white tracking-wide">OBSTACLES</span>
                    <span className="text-[10px] text-gray-400 font-mono">{obstacleCount} Active</span>
                </div>
            </div>

            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPlacing(false)}
                    className={cn(
                        "h-8 px-3 rounded-lg text-xs font-bold gap-2 transition-all",
                        !isPlacing ? "bg-white/10 text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                >
                    <Cursor weight={!isPlacing ? "fill" : "regular"} size={16} />
                    Select
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPlacing(true)}
                    className={cn(
                        "h-8 px-3 rounded-lg text-xs font-bold gap-2 transition-all",
                        isPlacing ? "bg-tropicalTeal text-jetBlack shadow-[0_0_15px_rgba(45,212,191,0.3)]" : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                >
                    <Cube weight={isPlacing ? "fill" : "regular"} size={16} />
                    Place
                </Button>

                <div className="w-px h-4 bg-white/10 mx-1" />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClear}
                    className="h-8 w-8 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                >
                    <Trash size={16} weight="bold" />
                </Button>
            </div>

            {isPlacing && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/10 pointer-events-none whitespace-nowrap">
                    Click to place obstacle
                </div>
            )}
        </div>
    );
};
