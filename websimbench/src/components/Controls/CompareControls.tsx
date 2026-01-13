import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Compiler } from '../../simulation/compiler/compiler';
import { ComputeEngine } from '../../simulation/compute/compute';
import { PerformanceMonitor } from '../../simulation/performance';
import type { Agent, Method, InputDefinition } from '../../simulation/types';

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
    const [selectedMethods, setSelectedMethods] = useState<Method[]>(['JavaScript', 'WebAssembly']);
    const [agentsByMethod, setAgentsByMethod] = useState<Record<Method, Agent[]>>({} as Record<Method, Agent[]>);
    const [frame, setFrame] = useState(0);
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
            let seed = 12345 + frameNum;
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

        const width = canvasRef.current?.width || 800;
        const height = canvasRef.current?.height || 600;
        const numAgents = 500;

        const compiler = new Compiler();
        const compiled = compiler.compileAgentCode(code);
        const requiredInputs = compiled.requiredInputs;
        const seedAgents = generateAgents(numAgents, width, height, 12345);

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
            const engine = new ComputeEngine(compiled, perfMonitor, numAgents);
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

    const toggleMethod = (method: Method) => {
        if (selectedMethods.includes(method)) {
            setSelectedMethods(selectedMethods.filter(m => m !== method));
        } else {
            setSelectedMethods([...selectedMethods, method]);
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4 items-center">
                <Button
                    variant={isRunning ? "destructive" : "default"}
                    onClick={isRunning ? handleStop : handleRun}
                    size="sm"
                    className={!isRunning ? "bg-teal-600 hover:bg-teal-700" : ""}
                >
                    {isRunning ? 'Stop' : 'Run Compare'}
                </Button>
                <span className="text-sm font-mono flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                    Frame: {frame}
                </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {AVAILABLE_METHODS.map(method => (
                    <div
                        key={method}
                        className={`flex items-center justify-between p-2 rounded-md border transition-all ${selectedMethods.includes(method)
                            ? 'bg-white/10 border-white/20'
                            : 'bg-black/20 border-white/5 opacity-50'
                            }`}
                        onClick={() => !isRunning && toggleMethod(method)}
                    >
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id={`compare-${method}`}
                                checked={selectedMethods.includes(method)}
                                onCheckedChange={() => !isRunning && toggleMethod(method)}
                                disabled={isRunning}
                            />
                            <label className="text-xs font-bold cursor-pointer">{method}</label>
                        </div>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: METHOD_COLORS[method] }} />
                    </div>
                ))}
            </div>
        </div>
    );
};
