import React, { useState, useRef } from 'react';
import {
    Button,
    Input,
    Progress,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
    Alert,
    AlertDescription,
    AlertTitle,
    Label,
    Checkbox
} from '@/components/ui';
import { toast } from "sonner";
import { CheckCircle } from "@phosphor-icons/react";

import { Simulation } from '../../simulation/simulation';
import { BenchmarkResult, BenchmarkConfiguration, DeviceInfo } from '../../simulation/helpers/grapher';
import { collectDeviceInfo } from '../../simulation/helpers/deviceInfo';
import { InputDefinition, Method, RenderMode } from '../../simulation/types';
import { SimulationAppearanceOptions } from '../../hooks/useSimulationOptions';

interface BenchmarkControlsProps {
    code: string;
    definedInputs: InputDefinition[];
    onComplete: (results: BenchmarkResult[], deviceInfo: DeviceInfo, config: BenchmarkConfiguration) => void;
    options: SimulationAppearanceOptions;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    gpuCanvasRef: React.RefObject<HTMLCanvasElement>;
}

type MethodOption = {
    id: string;
    label: string;
    method: Method;
    renderMode: RenderMode;
};

const METHOD_OPTIONS: MethodOption[] = [
    { id: 'methodJavaScript', label: 'JavaScript', method: 'JavaScript', renderMode: 'cpu' },
    { id: 'methodWebAssembly', label: 'WebAssembly', method: 'WebAssembly', renderMode: 'cpu' },
    { id: 'methodWebWorkers', label: 'WebWorkers', method: 'WebWorkers', renderMode: 'cpu' },
    { id: 'methodWebGPUCpu', label: 'WebGPU (CPU render)', method: 'WebGPU', renderMode: 'cpu' },
    { id: 'methodWebGPUGpu', label: 'WebGPU (GPU render)', method: 'WebGPU', renderMode: 'gpu' },
];

export const BenchmarkControls: React.FC<BenchmarkControlsProps> = ({
    code,
    definedInputs,
    onComplete,
    options,
    canvasRef,
    gpuCanvasRef
}) => {
    // Configuration State
    const [agentRangeMode, setAgentRangeMode] = useState<'manual' | 'range'>('manual');
    const [agentCountsInput, setAgentCountsInput] = useState('100, 500, 1000, 2000');
    const [agentStart, setAgentStart] = useState(100);
    const [agentEnd, setAgentEnd] = useState(5000);
    const [agentStep, setAgentStep] = useState(500);

    const [testWorkerVariations, setTestWorkerVariations] = useState(false);
    const [workerCountsInput, setWorkerCountsInput] = useState('1, 2, 4, max');
    const [testWorkgroupVariations, setTestWorkgroupVariations] = useState(false);

    const [framesPerTest, setFramesPerTest] = useState(100);
    const [warmupRun, setWarmupRun] = useState(true);
    const [selectedMethods, setSelectedMethods] = useState<Set<string>>(new Set(['methodWebGPUGpu']));

    // Execution State
    const [isRunning, setIsRunning] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [progress, setProgress] = useState(0);
    const [showSuccess, setShowSuccess] = useState(false);

    const cancelledRef = useRef(false);

    const handleMethodToggle = (id: string) => {
        const newSelected = new Set(selectedMethods);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedMethods(newSelected);
    };

    const handleWorkerVariationsToggle = (enabled: boolean) => {
        setTestWorkerVariations(enabled);
        if (enabled) {
            const newSelected = new Set(selectedMethods);
            newSelected.add('methodWebWorkers');
            setSelectedMethods(newSelected);
        }
    };

    const handleWorkgroupVariationsToggle = (enabled: boolean) => {
        setTestWorkgroupVariations(enabled);
        if (enabled) {
            const newSelected = new Set(selectedMethods);
            newSelected.add('methodWebGPUCpu');
            newSelected.add('methodWebGPUGpu');
            setSelectedMethods(newSelected);
        }
    };

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const runBenchmark = async () => {
        if (!canvasRef.current || !gpuCanvasRef.current) return;

        if (selectedMethods.size === 0) {
            toast.error("Please select at least one method to test");
            return;
        }

        let agentCounts: number[] = [];
        if (agentRangeMode === 'manual') {
            agentCounts = agentCountsInput
                .split(',')
                .map(s => parseInt(s.trim()))
                .filter(n => !isNaN(n) && n > 0)
                .sort((a, b) => a - b);
        } else {
            if (agentStart >= agentEnd || agentStep <= 0) {
                toast.error("Invalid agent range configuration");
                return;
            }
            for (let n = agentStart; n <= agentEnd; n += agentStep) {
                agentCounts.push(n);
            }
        }

        if (agentCounts.length === 0) {
            toast.error("Please enter valid agent counts");
            return;
        }

        setIsRunning(true);
        setShowSuccess(false);
        cancelledRef.current = false;
        setStatusMessage('Collecting device information...');
        setProgress(0);

        const deviceInfo = await collectDeviceInfo();

        let workerCounts: number[] | undefined = undefined;
        if (testWorkerVariations) {
            const parsedCounts = workerCountsInput
                .split(',')
                .map(s => s.trim().toLowerCase())
                .map(s => s === 'max' ? deviceInfo.hardwareConcurrency : parseInt(s))
                .filter(n => !isNaN(n) && n >= 1);

            if (parsedCounts.length === 0) {
                toast.error("Please enter valid worker counts (must be >= 1)");
                setIsRunning(false);
                return;
            }
            workerCounts = parsedCounts;
        }

        const workgroupSizes = testWorkgroupVariations ? [64, 128, 256] : undefined;
        const methodsToTest = METHOD_OPTIONS.filter(m => selectedMethods.has(m.id));

        let totalTests = 0;
        for (const _agentCount of agentCounts) {
            for (const { method } of methodsToTest) {
                if (method === 'WebWorkers' && workerCounts) {
                    totalTests += workerCounts.length;
                } else if (method === 'WebGPU' && workgroupSizes) {
                    totalTests += workgroupSizes.length;
                } else {
                    totalTests += 1;
                }
            }
        }

        let completedTests = 0;
        const newResults: BenchmarkResult[] = [];
        const defaultInputs: Record<string, number> = {};
        definedInputs.forEach(def => {
            defaultInputs[def.name] = def.defaultValue;
        });

        const appearance = {
            agentColor: options.agentColor,
            backgroundColor: options.backgroundColor,
            agentSize: options.agentSize,
            agentShape: options.agentShape,
            showTrails: options.showTrails,
            trailColor: options.trailColor
        };

        try {
            for (const agentCount of agentCounts) {
                if (cancelledRef.current) break;
                for (const { method, renderMode, label } of methodsToTest) {
                    if (cancelledRef.current) break;
                    let variations: Array<{ workerCount?: number, workgroupSize?: number }> = [{}];
                    if (method === 'WebWorkers' && workerCounts) {
                        variations = workerCounts.map(wc => ({ workerCount: wc }));
                    } else if (method === 'WebGPU' && workgroupSizes) {
                        variations = workgroupSizes.map(ws => ({ workgroupSize: ws }));
                    }

                    for (const variation of variations) {
                        if (cancelledRef.current) break;
                        const variationLabel = variation.workerCount !== undefined
                            ? ` (${variation.workerCount} workers)`
                            : variation.workgroupSize !== undefined
                                ? ` (WG: ${variation.workgroupSize})`
                                : '';

                        setStatusMessage(`Testing ${label}${variationLabel} with ${agentCount} agents...`);

                        const simOptions: any = { agents: agentCount };
                        if (variation.workerCount !== undefined) {
                            simOptions.workers = variation.workerCount;
                        }

                        const sim = new Simulation({
                            canvas: canvasRef.current!,
                            gpuCanvas: gpuCanvasRef.current!,
                            options: simOptions,
                            agentScript: code as any,
                            appearance
                        });

                        if (method === 'WebGPU') {
                            await sim.initGPU();
                        }

                        const runInputs = { ...defaultInputs, agentCount };
                        if (warmupRun) {
                            await sim.runFrame(method, runInputs, renderMode);
                            await sleep(50);
                        }

                        sim.getPerformanceMonitor().reset();
                        for (let i = 0; i < framesPerTest; i++) {
                            if (cancelledRef.current) break;
                            await sim.runFrame(method, runInputs, renderMode);
                            await sleep(10);
                        }

                        if (cancelledRef.current) {
                            sim.destroy();
                            break;
                        }

                        const frames = sim.getPerformanceMonitor().frames;
                        if (frames.length > 0) {
                            const executionTimes = frames.map(f => f.totalExecutionTime);
                            const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
                            const minTime = Math.min(...executionTimes);
                            const maxTime = Math.max(...executionTimes);

                            const avgSetup = frames.reduce((sum, f) => sum + (f.setupTime || 0), 0) / frames.length;
                            const avgCompute = frames.reduce((sum, f) => sum + (f.computeTime || 0), 0) / frames.length;
                            const avgRender = frames.reduce((sum, f) => sum + (f.renderTime || 0), 0) / frames.length;
                            const avgReadback = frames.reduce((sum, f) => sum + (f.readbackTime || 0), 0) / frames.length;
                            const avgCompile = frames.find(f => f.compileTime)?.compileTime;

                            const specificStats: Record<string, number> = {};
                            const firstFrame = frames[0];
                            if (firstFrame.specificStats) {
                                for (const key of Object.keys(firstFrame.specificStats)) {
                                    specificStats[key] = frames.reduce((sum, f) => sum + (f.specificStats?.[key] || 0), 0) / frames.length;
                                }
                            }

                            newResults.push({
                                method: label,
                                agentCount,
                                workerCount: variation.workerCount,
                                workgroupSize: variation.workgroupSize,
                                avgExecutionTime: avgTime,
                                minExecutionTime: minTime,
                                maxExecutionTime: maxTime,
                                avgSetupTime: avgSetup,
                                avgComputeTime: avgCompute,
                                avgRenderTime: avgRender,
                                avgReadbackTime: avgReadback,
                                avgCompileTime: avgCompile,
                                frameCount: frames.length,
                                specificStats: Object.keys(specificStats).length > 0 ? specificStats : undefined
                            });
                        }

                        sim.destroy();
                        completedTests++;
                        setProgress((completedTests / totalTests) * 100);
                    }
                }
            }

            if (!cancelledRef.current) {
                setStatusMessage('Benchmark complete!');
                setShowSuccess(true);
                const config: BenchmarkConfiguration = {
                    agentRange: agentRangeMode === 'range'
                        ? { start: agentStart, end: agentEnd, step: agentStep }
                        : { start: Math.min(...agentCounts), end: Math.max(...agentCounts), step: 0 },
                    workerCounts: workerCounts,
                    workgroupSizes: workgroupSizes,
                    methods: methodsToTest.map(m => ({ method: m.label, renderMode: m.renderMode })),
                    framesPerTest,
                    warmupRun
                };
                onComplete(newResults, deviceInfo, config);
            } else {
                setStatusMessage('Benchmark cancelled.');
            }
        } catch (e) {
            console.error(e);
            setStatusMessage(`Error: ${e instanceof Error ? e.message : String(e)} `);
        } finally {
            setIsRunning(false);
        }
    };

    const cancelBenchmark = () => {
        cancelledRef.current = true;
        setStatusMessage('Cancelling...');
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs uppercase font-bold text-gray-400">Agent Configuration</Label>
                        <Select value={agentRangeMode} onValueChange={(v: 'manual' | 'range') => setAgentRangeMode(v)}>
                            <SelectTrigger className="h-9 bg-black/40">
                                <SelectValue placeholder="Select mode" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manual">Manual (comma separated)</SelectItem>
                                <SelectItem value="range">Range (start, end, step)</SelectItem>
                            </SelectContent>
                        </Select>
                        {agentRangeMode === 'manual' ? (
                            <Input
                                value={agentCountsInput}
                                onChange={(e) => setAgentCountsInput(e.target.value)}
                                placeholder="100, 500, 1000"
                                className="h-9 bg-black/40"
                            />
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                <Input type="number" value={agentStart} onChange={(e) => setAgentStart(parseInt(e.target.value))} className="h-9 bg-black/40" placeholder="Start" />
                                <Input type="number" value={agentEnd} onChange={(e) => setAgentEnd(parseInt(e.target.value))} className="h-9 bg-black/40" placeholder="End" />
                                <Input type="number" value={agentStep} onChange={(e) => setAgentStep(parseInt(e.target.value))} className="h-9 bg-black/40" placeholder="Step" />
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs uppercase font-bold text-gray-400">Variations</Label>
                        <div className="bg-black/20 p-3 rounded-md space-y-4 border border-white/5">
                            <div className="flex items-center justify-between">
                                <span className="text-sm">WebWorker variations</span>
                                <Switch checked={testWorkerVariations} onCheckedChange={handleWorkerVariationsToggle} />
                            </div>
                            {testWorkerVariations && (
                                <Input value={workerCountsInput} onChange={(e) => setWorkerCountsInput(e.target.value)} className="h-9 bg-black/40" placeholder="1, 2, 4, max" />
                            )}
                            <div className="flex items-center justify-between">
                                <span className="text-sm">GPU Workgroup variations</span>
                                <Switch checked={testWorkgroupVariations} onCheckedChange={handleWorkgroupVariationsToggle} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs uppercase font-bold text-gray-400">Methods to Test</Label>
                        <div className="grid grid-cols-2 gap-2 bg-black/20 p-3 rounded-md border border-white/5">
                            {METHOD_OPTIONS.map(opt => (
                                <div key={opt.id} className="flex items-center space-x-2">
                                    <Checkbox id={opt.id} checked={selectedMethods.has(opt.id)} onCheckedChange={() => handleMethodToggle(opt.id)} />
                                    <Label htmlFor={opt.id} className="text-xs cursor-pointer">{opt.label}</Label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <Label className="text-xs">Frames/Test</Label>
                            <Input type="number" value={framesPerTest} onChange={(e) => setFramesPerTest(parseInt(e.target.value))} className="h-9 bg-black/40" />
                        </div>
                        <div className="flex items-end pb-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox id="warmup" checked={warmupRun} onCheckedChange={(v) => setWarmupRun(!!v)} />
                                <Label htmlFor="warmup" className="text-xs cursor-pointer">Warmup</Label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-4 bg-black/40 p-3 rounded-lg border border-white/5">
                <Button
                    className={`${isRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-teal-600 hover:bg-teal-700'} h-10 px-6 font-bold`}
                    onClick={isRunning ? cancelBenchmark : runBenchmark}
                >
                    {isRunning ? "Stop Benchmark" : "Execute Suite"}
                </Button>
                <div className="flex-1 space-y-2">
                    <div className="flex justify-between text-[11px] font-mono text-gray-400">
                        <span>{statusMessage}</span>
                        {isRunning && <span>{Math.round(progress)}%</span>}
                    </div>
                    <Progress value={progress} className="h-1.5" />
                </div>
            </div>

            {showSuccess && (
                <Alert className="bg-teal-900/20 border-teal-500/50">
                    <CheckCircle className="h-4 w-4 text-teal-500" />
                    <AlertTitle className="text-teal-500 font-bold">Benchmark Complete</AlertTitle>
                    <AlertDescription className="text-xs opacity-80">
                        Detailed results are now available in the Reports tab.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
};
