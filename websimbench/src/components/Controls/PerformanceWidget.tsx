import { Speedometer } from "@phosphor-icons/react";

export const PerformanceWidget = ({ fps }: { fps: number }) => {
    return (
        <div className="absolute top-4 right-4 z-10 bg-black/60 backdrop-blur-md border border-white/10 p-2 px-3 rounded-2xl shadow-lg flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-tropicalTeal/20 flex items-center justify-center text-tropicalTeal">
                    <Speedometer size={14} weight="fill" />
                </div>
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">Performance</span>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-baseline gap-1">
                <span className="text-sm font-mono font-bold text-white tracking-tight">
                    {fps}
                </span>
                <span className="text-[9px] font-bold text-gray-500 uppercase">FPS</span>
            </div>
        </div>
    );
};
