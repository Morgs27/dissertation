import { useState, useRef, useEffect, useCallback } from 'react';
import { Compiler } from '../../simulation/compiler/compiler';
import { ComputeEngine } from '../../simulation/compute/compute';
import { PerformanceMonitor } from '../../simulation/performance';
import type { Agent, Method, InputDefinition } from '../../simulation/types';
import { RunControl } from './RunControl';
import { Combobox, ComboboxList, ComboboxContent, ComboboxItem, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox";
import { Speedometer, WarningOctagon } from "@phosphor-icons/react";

const compareAgents = (agents1: Agent[], agents2: Agent[]) => {
    let totalPosDiff = 0;
    let maxPosDiff = 0;

    for (let i = 0; i < agents1.length; i++) {
        const dx = agents1[i].x - agents2[i].x;
        const dy = agents1[i].y - agents2[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        totalPosDiff += dist;
        maxPosDiff = Math.max(maxPosDiff, dist);
    }

    return {
        avg: totalPosDiff / agents1.length,
        max: maxPosDiff
    };
};

const ErrorStatsCard = ({ stats }: { stats: Record<string, { avg: number, max: number }> }) => {
    return (
        <div className="flex flex-col gap-2 bg-[#1a2e33] p-3 rounded-xl border border-white/5 w-full">
            <div className="flex items-center gap-2 mb-1">
                <WarningOctagon className="text-tropicalTeal" size={20} weight="fill" />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Error Rate (Avg)</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-1">Average deviation in pixels from the JavaScript baseline.</p>
            {Object.entries(stats).length === 0 ? (
                <span className="text-xs text-gray-500 font-mono text-center py-2">No comparison data</span>
            ) : (
                <div className="space-y-1.5 ">
                    {Object.entries(stats).map(([method, stat]) => (
                        <div key={method} className="flex justify-between items-center  px-2 py-2 rounded  border-white/5">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: METHOD_COLORS[method as Method] || '#fff', color: METHOD_COLORS[method as Method] || '#fff' }} />
                                <span className="text-[10px] font-bold text-gray-400 uppercase">{method}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`text-xs font-mono font-bold ${stat.avg > 0.1 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {stat.avg.toFixed(5)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const StatsCard = ({ frame }: { frame: number }) => {
    return (
        <div className="flex items-center justify-between bg-[#1a2e33] p-3 rounded-xl border border-white/5 w-full">
            <div className="flex items-center gap-2">
                <Speedometer className="text-tropicalTeal" size={20} weight="fill" />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Simulation</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xl font-mono font-bold text-white tracking-tight">
                    {frame}
                </span>
                <span className="text-[10px] font-bold text-gray-500 uppercase">Frame</span>
            </div>
        </div>
    );
};

interface CompareControlsProps {
    code: string;
    definedInputs: InputDefinition[];
    canvasRef: React.RefObject<HTMLCanvasElement>;
}

const METHOD_COLORS: Record<Method, string> = {
    'JavaScript': '#00ff00',
    'WebWorkers': '#ffff00',
    'WebAssembly': '#ff00ff',
    'WebGPU': '#00ffff',
    'WebGL': '#ff8800',
};

const AVAILABLE_METHODS: Method[] = ['JavaScript', 'WebWorkers', 'WebAssembly', 'WebGPU'];

export const CompareControls = ({ code, definedInputs, canvasRef }: CompareControlsProps) => {
    const [isRunning, setIsRunning] = useState(false);
    const [selectedMethods, setSelectedMethods] = useState<Method[]>(AVAILABLE_METHODS);
    const [agentsByMethod, setAgentsByMethod] = useState<Record<Method, Agent[]>>({} as Record<Method, Agent[]>);
    const [frame, setFrame] = useState(0);
    const [errorStats, setErrorStats] = useState<Record<string, { avg: number, max: number }>>({});
    const computeEnginesRef = useRef<Record<Method, ComputeEngine>>({} as Record<Method, ComputeEngine>);
    const animationRef = useRef<number | null>(null);
    const isRunningRef = useRef(false);

    const generateAgents = useCallback((count: number, width: number, height: number, seed: number): Agent[] => {
        const agents: Agent[] = [];
        let x = seed;
        const nextRandom = () => {
            x = (x * 1103515245 + 12345) & 0x7fffffff;
            return x / 0x7fffffff;
        };
        for (let i = 0; i < count; i++) {
            agents.push({
                id: i,
                x: nextRandom() * width,
                y: nextRandom() * height,
                vx: (nextRandom() - 0.5) * 2,
                vy: (nextRandom() - 0.5) * 2,
            });
        }
        return agents;
    }, []);

    const cloneAgents = (agents: Agent[]): Agent[] => {
        return agents.map(a => ({ ...a }));
    };

    const buildInputs = useCallback((
        width: number,
        height: number,
        agents: Agent[],
        numAgents: number,
        frameNum: number,
        requiredInputs: string[]
    ): Record<string, number | Float32Array | Agent[]> => {
        const inputs: Record<string, number | Float32Array | Agent[]> = {
            width,
            height,
            agents,
        };
        definedInputs.forEach(def => {
            if (!(def.name in inputs)) {
                inputs[def.name] = def.defaultValue;
            }
        });

        if (requiredInputs.includes('randomValues')) {
            const randomValues = new Float32Array(numAgents);
            let seed = frameNum;
            for (let i = 0; i < numAgents; i++) {
                seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                randomValues[i] = seed / 0x7fffffff;
            }
            inputs.randomValues = randomValues;
        }

        return inputs;
    }, [definedInputs]);

    const handleRun = useCallback(async () => {
        if (!code || selectedMethods.length === 0) return;

        setIsRunning(true);
        isRunningRef.current = true;
        setFrame(0);

        const width = canvasRef.current?.width || 600;
        const height = canvasRef.current?.height || 600;
        const numAgents = 500;

        const compiler = new Compiler();
        const compiled = compiler.compileAgentCode(code);
        const requiredInputs = compiled.requiredInputs;
        const seedAgents = generateAgents(numAgents, width, height, 42);

        const engines: Record<Method, ComputeEngine> = {} as Record<Method, ComputeEngine>;
        const methodAgents: Record<Method, Agent[]> = {} as Record<Method, Agent[]>;
        const methodTrailMaps: Record<Method, Float32Array> = {} as Record<Method, Float32Array>;
        const perfMonitor = new PerformanceMonitor();

        let gpuDevice: GPUDevice | null = null;
        if (selectedMethods.includes('WebGPU') && navigator.gpu) {
            try {
                const adapter = await navigator.gpu.requestAdapter();
                if (adapter) {
                    gpuDevice = await adapter.requestDevice();
                }
            } catch (e) {
                console.warn('Failed to get WebGPU device:', e);
            }
        }

        const needsTrailMap = requiredInputs.includes('trailMap');

        for (const method of selectedMethods) {
            const engine = new ComputeEngine(compiled, perfMonitor, numAgents, 4);
            if (method === 'WebGPU' && gpuDevice) {
                engine.initGPU(gpuDevice);
            }
            engines[method] = engine;
            methodAgents[method] = cloneAgents(seedAgents);
            if (needsTrailMap) {
                methodTrailMaps[method] = new Float32Array(width * height);
            }
        }

        computeEnginesRef.current = engines;
        setAgentsByMethod(methodAgents);

        let currentFrame = 0;
        const animate = async () => {
            if (!isRunningRef.current) return;
            const newAgentsByMethod: Record<Method, Agent[]> = {} as Record<Method, Agent[]>;
            for (const method of selectedMethods) {
                const engine = engines[method];
                const agents = methodAgents[method];
                const inputs = buildInputs(width, height, agents, numAgents, currentFrame, requiredInputs);
                if (needsTrailMap && methodTrailMaps[method]) {
                    inputs.trailMap = methodTrailMaps[method];
                }
                const result = await engine.runFrame(method, agents, inputs, 'cpu');
                if (result) {
                    methodAgents[method] = result;
                    newAgentsByMethod[method] = result;
                }
            }

            // Calculate errors
            const methods = selectedMethods.filter(m => newAgentsByMethod[m]);
            if (methods.length > 1) {
                // Prefer JavaScript as baseline, otherwise first available
                const baselineMethod = methods.includes('JavaScript') ? 'JavaScript' : methods[0];
                const baselineAgents = newAgentsByMethod[baselineMethod];

                const frameStats: Record<string, { avg: number, max: number }> = {};

                methods.forEach(method => {
                    if (method === baselineMethod) return;
                    frameStats[method] = compareAgents(baselineAgents, newAgentsByMethod[method]);
                });

                setErrorStats(frameStats);
            } else {
                setErrorStats({});
            }

            setAgentsByMethod({ ...newAgentsByMethod });
            currentFrame++;
            setFrame(currentFrame);
            animationRef.current = requestAnimationFrame(animate);
        };
        animationRef.current = requestAnimationFrame(animate);
    }, [code, selectedMethods, generateAgents, buildInputs, canvasRef]);

    const handleStop = useCallback(() => {
        isRunningRef.current = false;
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }
        setIsRunning(false);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (const method of selectedMethods) {
            const agents = agentsByMethod[method];
            if (!agents) continue;
            ctx.fillStyle = METHOD_COLORS[method];
            const radius = 2;
            agents.forEach(agent => {
                ctx.beginPath();
                ctx.arc(agent.x, agent.y, radius, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }, [agentsByMethod, selectedMethods, canvasRef]);

    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);



    return (
        <div className="flex flex-col gap-4">
            <RunControl
                isRunning={isRunning}
                onRun={handleRun}
                onStop={handleStop}
            >
                <div className="w-full max-w-md">
                    <Combobox value={selectedMethods} onValueChange={(val) => !isRunning && setSelectedMethods(val as Method[])} multiple>
                        <ComboboxTrigger className="w-full h-9 bg-black/40 border-none focus:ring-1 focus:ring-tropicalTeal/50 text-xs font-bold px-3 py-1 flex items-center justify-between rounded-md text-white">
                            <ComboboxValue>
                                {({ value }) => (
                                    <div className="flex flex-nowrap gap-1 overflow-hidden items-center">
                                        {(!value || (value as Method[]).length === 0) && <span className="text-gray-400 font-normal">Select Methods</span>}
                                        {(value as Method[] || []).length > 0 && (
                                            <span className="truncate">
                                                {(value as Method[]).length === AVAILABLE_METHODS.length
                                                    ? "All Methods"
                                                    : (value as Method[]).join(", ")}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </ComboboxValue>
                        </ComboboxTrigger>
                        <ComboboxContent className="bg-[#1a2e33] border-white/10" sideOffset={5}>
                            <ComboboxList className="bg-transparent p-1">
                                {AVAILABLE_METHODS.map((method) => (
                                    <ComboboxItem key={method} value={method} className="text-gray-200 focus:bg-tropicalTeal focus:text-black rounded-sm text-xs py-1.5 pl-2 pr-8 relative cursor-pointer select-none">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: METHOD_COLORS[method] }} />
                                            {method}
                                        </div>
                                    </ComboboxItem>
                                ))}
                            </ComboboxList>
                        </ComboboxContent>
                    </Combobox>
                </div>
            </RunControl>

            <StatsCard frame={frame} />
            <ErrorStatsCard stats={errorStats} />
        </div>
    );
};
