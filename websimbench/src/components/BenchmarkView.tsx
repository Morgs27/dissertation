import React, { useState, useRef } from 'react';
import {
    Box,
    Button,
    Checkbox,
    Flex,
    FormControl,
    FormLabel,
    Grid,
    Heading,
    Input,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    NumberIncrementStepper,
    NumberDecrementStepper,
    Progress,
    Text,
    VStack,
    useToast,
    Alert,
    AlertIcon,
    Select,
    HStack,
    Divider,
    Switch,
} from '@chakra-ui/react';
import { Simulation } from '../simulation/simulation';
import { BenchmarkResult, BenchmarkConfiguration, DeviceInfo } from '../simulation/helpers/grapher';
import { collectDeviceInfo } from '../simulation/helpers/deviceInfo';
import { InputDefinition, Method, RenderMode } from '../simulation/types';
import { SimulationAppearanceOptions } from '../hooks/useSimulationOptions';

interface BenchmarkViewProps {
    code: string;
    definedInputs: InputDefinition[];
    onComplete: (results: BenchmarkResult[], deviceInfo: DeviceInfo, config: BenchmarkConfiguration) => void;
    options: SimulationAppearanceOptions;
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

export const BenchmarkView: React.FC<BenchmarkViewProps> = ({ code, definedInputs, onComplete, options }) => {
    // Configuration State - Agent Range
    const [agentRangeMode, setAgentRangeMode] = useState<'manual' | 'range'>('manual');
    const [agentCountsInput, setAgentCountsInput] = useState('100, 500, 1000, 2000');
    const [agentStart, setAgentStart] = useState(100);
    const [agentEnd, setAgentEnd] = useState(5000);
    const [agentStep, setAgentStep] = useState(500);

    // Configuration State - Method-specific
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

    // Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
    const cancelledRef = useRef(false);
    const toast = useToast();

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
            // Auto-enable WebWorkers method
            const newSelected = new Set(selectedMethods);
            newSelected.add('methodWebWorkers');
            setSelectedMethods(newSelected);
        }
    };

    const handleWorkgroupVariationsToggle = (enabled: boolean) => {
        setTestWorkgroupVariations(enabled);
        if (enabled) {
            // Auto-enable WebGPU methods
            const newSelected = new Set(selectedMethods);
            newSelected.add('methodWebGPUCpu');
            newSelected.add('methodWebGPUGpu');
            setSelectedMethods(newSelected);
        }
    };

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const runBenchmark = async () => {
        if (!canvasRef.current || !gpuCanvasRef.current) return;

        // Validation
        if (selectedMethods.size === 0) {
            toast({ title: "Error", description: "Please select at least one method to test", status: "error" });
            return;
        }

        // Parse agent counts based on mode
        let agentCounts: number[] = [];
        if (agentRangeMode === 'manual') {
            agentCounts = agentCountsInput
                .split(',')
                .map(s => parseInt(s.trim()))
                .filter(n => !isNaN(n) && n > 0)
                .sort((a, b) => a - b);
        } else {
            // Generate range
            if (agentStart >= agentEnd || agentStep <= 0) {
                toast({ title: "Error", description: "Invalid agent range configuration", status: "error" });
                return;
            }
            for (let n = agentStart; n <= agentEnd; n += agentStep) {
                agentCounts.push(n);
            }
        }

        if (agentCounts.length === 0) {
            toast({ title: "Error", description: "Please enter valid agent counts", status: "error" });
            return;
        }

        setIsRunning(true);
        setShowSuccess(false);
        cancelledRef.current = false;
        setStatusMessage('Collecting device information...');
        setProgress(0);

        // Collect device info
        const deviceInfo = await collectDeviceInfo();

        // Determine worker counts to test
        let workerCounts: number[] | undefined = undefined;
        if (testWorkerVariations) {
            const parsedCounts = workerCountsInput
                .split(',')
                .map(s => s.trim().toLowerCase())
                .map(s => s === 'max' ? deviceInfo.hardwareConcurrency : parseInt(s))
                .filter(n => !isNaN(n) && n >= 1); // Start from 1, not 0

            if (parsedCounts.length === 0) {
                toast({ title: "Error", description: "Please enter valid worker counts (must be >= 1)", status: "error" });
                setIsRunning(false);
                return;
            }
            workerCounts = parsedCounts;
        }

        // Determine workgroup sizes to test (common powers of 2)
        const workgroupSizes = testWorkgroupVariations
            ? [64, 128, 256]
            : undefined;

        const methodsToTest = METHOD_OPTIONS.filter(m => selectedMethods.has(m.id));

        // Calculate total tests accounting for variations
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

        // Prepare default inputs
        const defaultInputs: Record<string, number> = {};
        definedInputs.forEach(def => {
            defaultInputs[def.name] = def.defaultValue;
        });

        // Construct appearance from options
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

                    // Determine variations to test for this method
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

                        // Create simulation
                        const simOptions: any = { agents: agentCount };
                        if (variation.workerCount !== undefined) {
                            simOptions.workers = variation.workerCount;
                        }

                        const sim = new Simulation({
                            canvas: canvasRef.current,
                            gpuCanvas: gpuCanvasRef.current,
                            options: simOptions,
                            agentScript: code as any,
                            appearance
                        });

                        // Initialize GPU if needed
                        if (method === 'WebGPU') {
                            await sim.initGPU();
                        }

                        // Prepare inputs for this run
                        const runInputs = { ...defaultInputs, agentCount };

                        // Warmup
                        if (warmupRun) {
                            await sim.runFrame(method, runInputs, renderMode);
                            await sleep(50);
                        }

                        // Reset performance monitor
                        sim.getPerformanceMonitor().reset();

                        // Run frames
                        for (let i = 0; i < framesPerTest; i++) {
                            if (cancelledRef.current) break;
                            await sim.runFrame(method, runInputs, renderMode);
                            await sleep(10);
                        }

                        if (cancelledRef.current) {
                            sim.destroy();
                            break;
                        }

                        // Collect results
                        const frames = sim.getPerformanceMonitor().frames;
                        if (frames.length > 0) {
                            const executionTimes = frames.map(f => f.totalExecutionTime);
                            const avgTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
                            const minTime = Math.min(...executionTimes);
                            const maxTime = Math.max(...executionTimes);

                            // Calculate averages for detailed metrics
                            const avgSetup = frames.reduce((sum, f) => sum + (f.setupTime || 0), 0) / frames.length;
                            const avgCompute = frames.reduce((sum, f) => sum + (f.computeTime || 0), 0) / frames.length;
                            const avgRender = frames.reduce((sum, f) => sum + (f.renderTime || 0), 0) / frames.length;
                            const avgReadback = frames.reduce((sum, f) => sum + (f.readbackTime || 0), 0) / frames.length;
                            const avgCompile = frames.find(f => f.compileTime)?.compileTime;

                            // Aggregate specific stats if available
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

                // Build configuration object
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

                // Notify parent to save report
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
        <Flex direction="column" h="100%" w="100%" bg="rgba(0,0,0,0.2)">
            {/* Configuration Panel */}
            <Box p={4} borderBottom="1px solid" borderColor="cerulean" maxH="50vh" overflowY="auto">
                <Heading size="md" mb={4} color="tropicalTeal">Benchmark Configuration</Heading>

                {/* Agent Configuration */}
                <Box mb={4} p={3} bg="rgba(0,0,0,0.3)" borderRadius="md">
                    <Heading size="sm" mb={3} color="gray.300">Agent Count Configuration</Heading>
                    <FormControl mb={3}>
                        <FormLabel fontSize="sm">Mode</FormLabel>
                        <Select
                            size="sm"
                            value={agentRangeMode}
                            onChange={(e) => setAgentRangeMode(e.target.value as 'manual' | 'range')}
                            bg="rgba(0,0,0,0.2)"
                        >
                            <option value="manual">Manual (comma separated)</option>
                            <option value="range">Range (start, end, step)</option>
                        </Select>
                    </FormControl>

                    {agentRangeMode === 'manual' ? (
                        <FormControl>
                            <FormLabel fontSize="sm">Agent Counts</FormLabel>
                            <Input
                                size="sm"
                                value={agentCountsInput}
                                onChange={(e) => setAgentCountsInput(e.target.value)}
                                placeholder="e.g. 100, 500, 1000, 2000"
                                bg="rgba(0,0,0,0.2)"
                                borderColor="cerulean"
                            />
                        </FormControl>
                    ) : (
                        <Grid templateColumns="repeat(3, 1fr)" gap={3}>
                            <FormControl>
                                <FormLabel fontSize="xs">Start</FormLabel>
                                <NumberInput size="sm" value={agentStart} onChange={(_, val) => setAgentStart(val)} min={1}>
                                    <NumberInputField />
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                </NumberInput>
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="xs">End</FormLabel>
                                <NumberInput size="sm" value={agentEnd} onChange={(_, val) => setAgentEnd(val)} min={1}>
                                    <NumberInputField />
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                </NumberInput>
                            </FormControl>
                            <FormControl>
                                <FormLabel fontSize="xs">Step</FormLabel>
                                <NumberInput size="sm" value={agentStep} onChange={(_, val) => setAgentStep(val)} min={1}>
                                    <NumberInputField />
                                    <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                                </NumberInput>
                            </FormControl>
                        </Grid>
                    )}
                </Box>

                {/* Method-Specific Variations */}
                <Box mb={4} p={3} bg="rgba(0,0,0,0.3)" borderRadius="md">
                    <Heading size="sm" mb={3} color="gray.300">Method Variations</Heading>
                    <VStack align="stretch" spacing={3}>
                        <Box>
                            <HStack justify="space-between" mb={2}>
                                <Text fontSize="sm">Test WebWorker counts</Text>
                                <Switch
                                    isChecked={testWorkerVariations}
                                    onChange={(e) => handleWorkerVariationsToggle(e.target.checked)}
                                    colorScheme="teal"
                                />
                            </HStack>
                            {testWorkerVariations && (
                                <FormControl>
                                    <FormLabel fontSize="xs" color="gray.400">Worker counts to test (use "max" for hardware max)</FormLabel>
                                    <Input
                                        size="sm"
                                        value={workerCountsInput}
                                        onChange={(e) => setWorkerCountsInput(e.target.value)}
                                        placeholder="e.g. 1, 2, 4, max"
                                        bg="rgba(0,0,0,0.2)"
                                        borderColor="cerulean"
                                    />
                                    <Text fontSize="xs" color="gray.500" mt={1}>
                                        System max: {navigator.hardwareConcurrency} threads
                                    </Text>
                                </FormControl>
                            )}
                        </Box>

                        <Divider />

                        <HStack justify="space-between">
                            <Text fontSize="sm">Test GPU Workgroup sizes</Text>
                            <Switch
                                isChecked={testWorkgroupVariations}
                                onChange={(e) => handleWorkgroupVariationsToggle(e.target.checked)}
                                colorScheme="teal"
                            />
                        </HStack>
                        <Text fontSize="xs" color="gray.500" ml={2}>
                            When enabled, tests WebGPU with workgroup sizes: 64, 128, 256
                        </Text>
                    </VStack>
                </Box>

                {/* Test Parameters */}
                <Box mb={4} p={3} bg="rgba(0,0,0,0.3)" borderRadius="md">
                    <Heading size="sm" mb={3} color="gray.300">Test Parameters</Heading>
                    <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                        <FormControl>
                            <FormLabel fontSize="sm">Frames Per Test</FormLabel>
                            <NumberInput size="sm" value={framesPerTest} onChange={(_, val) => setFramesPerTest(val)} min={10}>
                                <NumberInputField />
                                <NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                            </NumberInput>
                        </FormControl>
                        <FormControl>
                            <FormLabel fontSize="sm">Options</FormLabel>
                            <Checkbox isChecked={warmupRun} onChange={(e) => setWarmupRun(e.target.checked)}>
                                Warmup Run
                            </Checkbox>
                        </FormControl>
                    </Grid>
                </Box>

                {/* Method Selection */}
                <Box mb={4} p={3} bg="rgba(0,0,0,0.3)" borderRadius="md">
                    <Heading size="sm" mb={3} color="gray.300">Methods to Test</Heading>
                    <Grid templateColumns="repeat(2, 1fr)" gap={2}>
                        {METHOD_OPTIONS.map(opt => (
                            <Checkbox
                                key={opt.id}
                                isChecked={selectedMethods.has(opt.id)}
                                onChange={() => handleMethodToggle(opt.id)}
                                size="sm"
                            >
                                {opt.label}
                            </Checkbox>
                        ))}
                    </Grid>
                </Box>

                <Flex gap={4} align="center">
                    <Button
                        colorScheme="teal"
                        onClick={runBenchmark}
                        isLoading={isRunning}
                        loadingText="Running..."
                        isDisabled={isRunning}
                        size="sm"
                    >
                        Run Benchmark
                    </Button>
                    <Button
                        colorScheme="red"
                        variant="outline"
                        onClick={cancelBenchmark}
                        isDisabled={!isRunning}
                        size="sm"
                    >
                        Cancel
                    </Button>
                    <Box flex="1">
                        {isRunning && <Progress value={progress} size="sm" colorScheme="teal" hasStripe isAnimated rounded="md" />}
                    </Box>
                </Flex>
                <Text fontSize="xs" mt={2} color="gray.400">{statusMessage}</Text>

                {showSuccess && (
                    <Alert status="success" mt={4} variant="subtle" flexDirection="column" alignItems="center" justifyContent="center" textAlign="center" height="100px" rounded="md">
                        <AlertIcon boxSize="40px" mr={0} />
                        <Text mt={2} fontSize="sm">
                            Benchmark report has been generated in the Reports tab.
                        </Text>
                    </Alert>
                )}
            </Box>

            {/* Hidden Canvas Area for Running Benchmark */}
            <Box flex="1" bg="black" position="relative" overflow="hidden" display={isRunning ? 'block' : 'none'}>
                {/* CPU rendering canvas */}
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        zIndex: 1,
                    }}
                />
                {/* GPU rendering canvas */}
                <canvas
                    ref={gpuCanvasRef}
                    width={800}
                    height={600}
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        zIndex: 1,
                    }}
                />
            </Box>

            {!isRunning && (
                <Flex flex="1" align="center" justify="center" bg="rgba(0,0,0,0.1)">
                    <Text color="gray.500">Ready to benchmark.</Text>
                </Flex>
            )}
        </Flex>
    );
};
