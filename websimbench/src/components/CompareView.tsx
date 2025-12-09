import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Flex,
    Box,
    Button,
    HStack,
    Text,
    Checkbox,
    CheckboxGroup,
    Badge,
    useColorModeValue,
} from '@chakra-ui/react';
import { Compiler } from '../simulation/compiler/compiler';
import { ComputeEngine } from '../simulation/compute/compute';
import { PerformanceMonitor } from '../simulation/performance';
import type { Agent, Method, InputDefinition } from '../simulation/types';

interface CompareViewProps {
    code: string;
    definedInputs: InputDefinition[];
}

// Colors for each compute method
const METHOD_COLORS: Record<Method, string> = {
    'JavaScript': '#00ff00',  // Green
    'WebWorkers': '#ffff00',  // Yellow
    'WebAssembly': '#ff00ff', // Magenta
    'WebGPU': '#00ffff',      // Cyan
    'WebGL': '#ff8800',       // Orange (unused but included for completeness)
};

const AVAILABLE_METHODS: Method[] = ['JavaScript', 'WebWorkers', 'WebAssembly', 'WebGPU'];

export const CompareView = ({ code, definedInputs }: CompareViewProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [selectedMethods, setSelectedMethods] = useState<Method[]>(['JavaScript', 'WebAssembly']);
    const [agentsByMethod, setAgentsByMethod] = useState<Record<Method, Agent[]>>({} as Record<Method, Agent[]>);
    const [frame, setFrame] = useState(0);
    const computeEnginesRef = useRef<Record<Method, ComputeEngine>>({} as Record<Method, ComputeEngine>);
    const animationRef = useRef<number | null>(null);

    const bg = useColorModeValue('gray.800', 'gray.900');
    const borderColor = useColorModeValue('gray.600', 'gray.700');

    // Generate random agents deterministically
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

    // Clone agents for each method
    const cloneAgents = (agents: Agent[]): Agent[] => {
        return agents.map(a => ({ ...a }));
    };

    // Build inputs object from definedInputs
    const buildInputs = useCallback((width: number, height: number, agents: Agent[]): Record<string, number | Float32Array | Agent[]> => {
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
        return inputs;
    }, [definedInputs]);

    const handleRun = useCallback(async () => {
        if (!code || selectedMethods.length === 0) return;

        setIsRunning(true);
        setFrame(0);

        const width = canvasRef.current?.width || 800;
        const height = canvasRef.current?.height || 600;
        const numAgents = 500;

        // Compile code
        const compiler = new Compiler();
        const compiled = compiler.compileAgentCode(code);

        // Generate initial agents
        const seedAgents = generateAgents(numAgents, width, height, 12345);

        // Initialize compute engines for each selected method
        const engines: Record<Method, ComputeEngine> = {} as Record<Method, ComputeEngine>;
        const methodAgents: Record<Method, Agent[]> = {} as Record<Method, Agent[]>;
        const perfMonitor = new PerformanceMonitor();

        for (const method of selectedMethods) {
            const engine = new ComputeEngine(compiled, perfMonitor, numAgents);
            engines[method] = engine;
            methodAgents[method] = cloneAgents(seedAgents);
        }

        computeEnginesRef.current = engines;
        setAgentsByMethod(methodAgents);

        // Animation loop
        let currentFrame = 0;
        const animate = async () => {
            const newAgentsByMethod: Record<Method, Agent[]> = {} as Record<Method, Agent[]>;

            for (const method of selectedMethods) {
                const engine = engines[method];
                const agents = methodAgents[method];
                const inputs = buildInputs(width, height, agents);

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
    }, [code, selectedMethods, generateAgents, buildInputs]);

    const handleStop = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }
        setIsRunning(false);
    }, []);

    // Render agents on canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Render each method's agents with their color
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
    }, [agentsByMethod, selectedMethods]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, []);

    return (
        <Flex direction="column" h="100%" bg={bg} p={4}>
            {/* Controls */}
            <HStack mb={4} spacing={4} flexWrap="wrap">
                <Button
                    colorScheme={isRunning ? 'red' : 'teal'}
                    onClick={isRunning ? handleStop : handleRun}
                    size="sm"
                >
                    {isRunning ? 'Stop' : 'Run Compare'}
                </Button>

                <Text fontSize="sm">Frame: {frame}</Text>

                <CheckboxGroup
                    value={selectedMethods}
                    onChange={(values) => setSelectedMethods(values as Method[])}
                >
                    <HStack spacing={4}>
                        {AVAILABLE_METHODS.map(method => (
                            <Checkbox
                                key={method}
                                value={method}
                                isDisabled={isRunning}
                                size="sm"
                            >
                                <Badge
                                    bg={METHOD_COLORS[method]}
                                    color="black"
                                    px={2}
                                    borderRadius="sm"
                                >
                                    {method}
                                </Badge>
                            </Checkbox>
                        ))}
                    </HStack>
                </CheckboxGroup>
            </HStack>

            {/* Legend */}
            <HStack mb={2} spacing={4}>
                {selectedMethods.map(method => (
                    <HStack key={method} spacing={1}>
                        <Box w="12px" h="12px" bg={METHOD_COLORS[method]} borderRadius="full" />
                        <Text fontSize="xs">{method}</Text>
                    </HStack>
                ))}
            </HStack>

            {/* Canvas */}
            <Box
                flex="1"
                border="1px solid"
                borderColor={borderColor}
                borderRadius="md"
                overflow="hidden"
            >
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
            </Box>
        </Flex>
    );
};
