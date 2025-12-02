import React, { useEffect, useRef, useState } from 'react';
import {
    Box, Button, Flex, Heading, Text, VStack, HStack, Icon, IconButton,
    Input, useToast, Tabs, TabList, Tab, TabPanels, TabPanel, Table,
    Thead, Tbody, Tr, Th, Td, Badge, Accordion, AccordionItem,
    AccordionButton, AccordionPanel, AccordionIcon, Select, Grid
} from '@chakra-ui/react';
import { FaChartBar, FaCalendarAlt, FaTrash, FaEdit, FaCheck, FaTimes, FaTable, FaImage, FaDownload } from 'react-icons/fa';
import { Grapher, BenchmarkReport, BenchmarkResult } from '../simulation/helpers/grapher';
import html2canvas from 'html2canvas';

interface ReportsViewProps {
    reports: BenchmarkReport[];
    onClear: () => void;
    onRename: (id: string, newName: string) => void;
}

type ChartType = 'overview' | 'readback' | 'compute' | 'render' | 'breakdown' | 'comparison' | 'setupOverhead';

const BenchmarkGraph: React.FC<{ results: BenchmarkResult[], id: string, chartType: ChartType, agentCount?: number }> = ({
    results,
    id,
    chartType,
    agentCount
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const grapherRef = useRef<Grapher | null>(null);

    useEffect(() => {
        if (canvasRef.current && !grapherRef.current) {
            grapherRef.current = new Grapher(canvasRef.current);
        }

        if (grapherRef.current && results.length > 0) {
            switch (chartType) {
                case 'overview':
                    grapherRef.current.renderBenchmark(results);
                    break;
                case 'readback':
                    grapherRef.current.renderReadbackVsAgents(results);
                    break;
                case 'compute':
                    grapherRef.current.renderComputeVsAgents(results);
                    break;
                case 'render':
                    grapherRef.current.renderRenderVsAgents(results);
                    break;
                case 'breakdown':
                    grapherRef.current.renderBreakdown(results);
                    break;
                case 'comparison':
                    grapherRef.current.renderMethodComparison(results, agentCount);
                    break;
                case 'setupOverhead':
                    grapherRef.current.renderSetupOverheadComparison(results, agentCount);
                    break;
            }
        }
    }, [results, chartType, agentCount]);

    return (
        <Box w="100%" h="400px" bg="black" position="relative" borderRadius="md" overflow="hidden" mb={4}>
            <canvas
                id={`graph-${chartType}-${id}`}
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                }}
            />
        </Box>
    );
};

export const ReportsView: React.FC<ReportsViewProps> = ({ reports, onClear, onRename }) => {
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [selectedAgentCount, setSelectedAgentCount] = useState<number | undefined>(undefined);
    const tableRef = useRef<HTMLDivElement>(null);
    const toast = useToast();

    useEffect(() => {
        if (!selectedReportId && reports.length > 0) {
            setSelectedReportId(reports[0].id);
        }
    }, [reports, selectedReportId]);

    const selectedReport = reports.find(r => r.id === selectedReportId);

    // Get unique agent counts for comparison selector
    const agentCounts = selectedReport
        ? Array.from(new Set(selectedReport.results.map(r => r.agentCount))).sort((a, b) => a - b)
        : [];

    const handleStartEdit = (report: BenchmarkReport, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(report.id);
        setEditName(report.name || new Date(report.timestamp).toLocaleString());
    };

    const handleSaveEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (editingId) {
            onRename(editingId, editName);
            setEditingId(null);
        }
    };

    const handleCancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(null);
    };

    const downloadGraph = (chartType: string) => {
        if (!selectedReport) return;
        const element = document.getElementById(`graph-${chartType}-${selectedReport.id}`);
        if (!element) return;

        const canvas = element as HTMLCanvasElement;
        const link = document.createElement('a');
        link.download = `benchmark-${chartType}-${selectedReport.name || selectedReport.id}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const downloadTableAsImage = async () => {
        if (!selectedReport || !tableRef.current) return;

        try {
            const canvas = await html2canvas(tableRef.current, {
                backgroundColor: '#1a202c',
                scale: 2
            });
            const link = document.createElement('a');
            link.download = `benchmark-table-${selectedReport.name || selectedReport.id}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (e) {
            console.error(e);
            toast({ title: "Error downloading table", status: "error" });
        }
    };

    const downloadCSV = () => {
        if (!selectedReport) return;

        // Build CSV content
        const headers = [
            'Method', 'Agent Count', 'Worker Count', 'Workgroup Size',
            'Avg Execution (ms)', 'Min Execution (ms)', 'Max Execution (ms)',
            'Avg Setup (ms)', 'Avg Compute (ms)', 'Avg Render (ms)', 'Avg Readback (ms)',
            'Avg Compile (ms)', 'Frame Count'
        ];

        const rows = selectedReport.results.map(r => [
            r.method,
            r.agentCount,
            r.workerCount ?? 'N/A',
            r.workgroupSize ?? 'N/A',
            r.avgExecutionTime.toFixed(3),
            r.minExecutionTime.toFixed(3),
            r.maxExecutionTime.toFixed(3),
            r.avgSetupTime.toFixed(3),
            r.avgComputeTime.toFixed(3),
            r.avgRenderTime.toFixed(3),
            r.avgReadbackTime.toFixed(3),
            r.avgCompileTime?.toFixed(3) ?? 'N/A',
            r.frameCount
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `benchmark-data-${selectedReport.name || selectedReport.id}.csv`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Flex h="100%" w="100%" bg="rgba(0,0,0,0.2)">
            {/* Sidebar: Report List */}
            <Flex direction="column" w="300px" borderRight="1px solid" borderColor="cerulean" bg="rgba(0,0,0,0.1)">
                <Box p={4} borderBottom="1px solid" borderColor="cerulean">
                    <Flex justify="space-between" align="center">
                        <Heading size="sm" color="tropicalTeal">Reports</Heading>
                        <Button
                            size="xs"
                            colorScheme="red"
                            variant="ghost"
                            onClick={onClear}
                            isDisabled={reports.length === 0}
                            title="Clear All Reports"
                        >
                            <Icon as={FaTrash} />
                        </Button>
                    </Flex>
                </Box>
                <VStack align="stretch" spacing={0} overflowY="auto" flex="1">
                    {reports.length === 0 && (
                        <Box p={4}>
                            <Text fontSize="sm" color="gray.500">No reports available.</Text>
                        </Box>
                    )}
                    {reports.map((report) => (
                        <Box
                            key={report.id}
                            p={3}
                            cursor="pointer"
                            bg={selectedReportId === report.id ? 'rgba(0, 200, 200, 0.1)' : 'transparent'}
                            _hover={{ bg: 'rgba(0, 200, 200, 0.05)' }}
                            onClick={() => setSelectedReportId(report.id)}
                            borderBottom="1px solid"
                            borderColor="rgba(255,255,255,0.05)"
                        >
                            {editingId === report.id ? (
                                <HStack onClick={(e) => e.stopPropagation()}>
                                    <Input
                                        size="xs"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        autoFocus
                                    />
                                    <IconButton aria-label="Save" icon={<FaCheck />} size="xs" colorScheme="green" onClick={handleSaveEdit} />
                                    <IconButton aria-label="Cancel" icon={<FaTimes />} size="xs" onClick={handleCancelEdit} />
                                </HStack>
                            ) : (
                                <Flex justify="space-between" align="center">
                                    <HStack spacing={3} overflow="hidden">
                                        <Icon as={FaCalendarAlt} color="gray.400" minW="14px" />
                                        <Box overflow="hidden">
                                            <Text fontSize="sm" fontWeight="bold" noOfLines={1}>
                                                {report.name || new Date(report.timestamp).toLocaleString()}
                                            </Text>
                                            <Text fontSize="xs" color="gray.400">
                                                {new Date(report.timestamp).toLocaleTimeString()}
                                            </Text>
                                        </Box>
                                    </HStack>
                                    <IconButton
                                        aria-label="Rename"
                                        icon={<FaEdit />}
                                        size="xs"
                                        variant="ghost"
                                        opacity={0.5}
                                        _hover={{ opacity: 1 }}
                                        onClick={(e) => handleStartEdit(report, e)}
                                    />
                                </Flex>
                            )}
                        </Box>
                    ))}
                </VStack>
            </Flex>

            {/* Main Content: Selected Report Details */}
            <Flex direction="column" flex="1" overflow="hidden">
                {selectedReport ? (
                    <Box h="100%" display="flex" flexDirection="column">
                        {/* Header */}
                        <Box p={4} borderBottom="1px solid" borderColor="cerulean">
                            <Flex justify="space-between" align="center" mb={2}>
                                <Heading size="md" color="tropicalTeal">
                                    {selectedReport.name || 'Benchmark Report'}
                                </Heading>
                                <HStack>
                                    <Button leftIcon={<FaDownload />} size="sm" onClick={downloadCSV} variant="outline">
                                        CSV
                                    </Button>
                                    <Button leftIcon={<FaTable />} size="sm" onClick={downloadTableAsImage} variant="outline">
                                        Table PNG
                                    </Button>
                                </HStack>
                            </Flex>
                            <Text fontSize="sm" color="gray.400">
                                Generated on {new Date(selectedReport.timestamp).toLocaleString()}
                            </Text>
                        </Box>

                        {/* Tabs for different views */}
                        <Tabs flex="1" display="flex" flexDirection="column" overflow="hidden" colorScheme="teal">
                            <TabList px={4} bg="rgba(0,0,0,0.2)">
                                <Tab fontSize="sm">Overview</Tab>
                                <Tab fontSize="sm">Charts</Tab>
                                <Tab fontSize="sm">Data Tables</Tab>
                                <Tab fontSize="sm">Device Info</Tab>
                            </TabList>

                            <TabPanels flex="1" overflowY="auto">
                                {/* Overview Tab */}
                                <TabPanel>
                                    <VStack align="stretch" spacing={4}>
                                        <HStack justify="flex-end">
                                            <Button size="sm" leftIcon={<FaImage />} onClick={() => downloadGraph('overview')}>
                                                Save Chart
                                            </Button>
                                        </HStack>
                                        <BenchmarkGraph
                                            results={selectedReport.results}
                                            id={selectedReport.id}
                                            chartType="overview"
                                        />

                                        {/* Quick Stats */}
                                        <Box bg="rgba(0,0,0,0.3)" p={4} borderRadius="md">
                                            <Heading size="sm" mb={3}>Quick Statistics</Heading>
                                            <Grid templateColumns="repeat(3, 1fr)" gap={4}>
                                                <Box>
                                                    <Text fontSize="xs" color="gray.400">Methods Tested</Text>
                                                    <Text fontSize="lg" fontWeight="bold">
                                                        {new Set(selectedReport.results.map(r => r.method)).size}
                                                    </Text>
                                                </Box>
                                                <Box>
                                                    <Text fontSize="xs" color="gray.400">Agent Counts</Text>
                                                    <Text fontSize="lg" fontWeight="bold">
                                                        {new Set(selectedReport.results.map(r => r.agentCount)).size}
                                                    </Text>
                                                </Box>
                                                <Box>
                                                    <Text fontSize="xs" color="gray.400">Total Tests</Text>
                                                    <Text fontSize="lg" fontWeight="bold">
                                                        {selectedReport.results.length}
                                                    </Text>
                                                </Box>
                                            </Grid>
                                        </Box>
                                    </VStack>
                                </TabPanel>

                                {/* Charts Tab */}
                                <TabPanel>
                                    <VStack align="stretch" spacing={6}>
                                        {/* Readback vs Agents */}
                                        <Box>
                                            <HStack justify="space-between" mb={2}>
                                                <Heading size="sm">Readback Time vs Agent Count</Heading>
                                                <Button size="sm" leftIcon={<FaImage />} onClick={() => downloadGraph('readback')}>
                                                    Save
                                                </Button>
                                            </HStack>
                                            <BenchmarkGraph
                                                results={selectedReport.results}
                                                id={selectedReport.id}
                                                chartType="readback"
                                            />
                                        </Box>

                                        {/* Compute vs Agents */}
                                        <Box>
                                            <HStack justify="space-between" mb={2}>
                                                <Heading size="sm">Compute Time vs Agent Count</Heading>
                                                <Button size="sm" leftIcon={<FaImage />} onClick={() => downloadGraph('compute')}>
                                                    Save
                                                </Button>
                                            </HStack>
                                            <BenchmarkGraph
                                                results={selectedReport.results}
                                                id={selectedReport.id}
                                                chartType="compute"
                                            />
                                        </Box>

                                        {/* Render vs Agents */}
                                        <Box>
                                            <HStack justify="space-between" mb={2}>
                                                <Heading size="sm">Render Time vs Agent Count</Heading>
                                                <Button size="sm" leftIcon={<FaImage />} onClick={() => downloadGraph('render')}>
                                                    Save
                                                </Button>
                                            </HStack>
                                            <BenchmarkGraph
                                                results={selectedReport.results}
                                                id={selectedReport.id}
                                                chartType="render"
                                            />
                                        </Box>

                                        {/* Setup & Overhead Comparison */}
                                        <Box>
                                            <HStack justify="space-between" mb={2}>
                                                <Heading size="sm">Setup & Overhead Comparison</Heading>
                                                <HStack>
                                                    <Select
                                                        size="sm"
                                                        w="200px"
                                                        value={selectedAgentCount ?? agentCounts[agentCounts.length - 1]}
                                                        onChange={(e) => setSelectedAgentCount(Number(e.target.value))}
                                                    >
                                                        {agentCounts.map(count => (
                                                            <option key={count} value={count}>
                                                                {count.toLocaleString()} agents
                                                            </option>
                                                        ))}
                                                    </Select>
                                                    <Button size="sm" leftIcon={<FaImage />} onClick={() => downloadGraph('setupOverhead')}>
                                                        Save
                                                    </Button>
                                                </HStack>
                                            </HStack>
                                            <BenchmarkGraph
                                                results={selectedReport.results}
                                                id={selectedReport.id}
                                                chartType="setupOverhead"
                                                agentCount={selectedAgentCount ?? agentCounts[agentCounts.length - 1]}
                                            />
                                        </Box>

                                        {/* Method Comparison */}
                                        <Box>
                                            <HStack justify="space-between" mb={2}>
                                                <Heading size="sm">Method Comparison</Heading>
                                                <HStack>
                                                    <Select
                                                        size="sm"
                                                        w="200px"
                                                        value={selectedAgentCount ?? agentCounts[agentCounts.length - 1]}
                                                        onChange={(e) => setSelectedAgentCount(Number(e.target.value))}
                                                    >
                                                        {agentCounts.map(count => (
                                                            <option key={count} value={count}>
                                                                {count.toLocaleString()} agents
                                                            </option>
                                                        ))}
                                                    </Select>
                                                    <Button size="sm" leftIcon={<FaImage />} onClick={() => downloadGraph('comparison')}>
                                                        Save
                                                    </Button>
                                                </HStack>
                                            </HStack>
                                            <BenchmarkGraph
                                                results={selectedReport.results}
                                                id={selectedReport.id}
                                                chartType="comparison"
                                                agentCount={selectedAgentCount ?? agentCounts[agentCounts.length - 1]}
                                            />
                                        </Box>
                                    </VStack>
                                </TabPanel>

                                {/* Data Tables Tab */}
                                <TabPanel>
                                    <Box ref={tableRef}>
                                        <Heading size="sm" mb={4}>Complete Benchmark Results</Heading>
                                        <Box overflowX="auto" bg="rgba(0,0,0,0.3)" borderRadius="md">
                                            <Table size="sm" variant="simple">
                                                <Thead>
                                                    <Tr>
                                                        <Th color="gray.300">Method</Th>
                                                        <Th color="gray.300" isNumeric>Agents</Th>
                                                        <Th color="gray.300" isNumeric>Workers</Th>
                                                        <Th color="gray.300" isNumeric>WG Size</Th>
                                                        <Th color="gray.300" isNumeric>Avg Exec (ms)</Th>
                                                        <Th color="gray.300" isNumeric>Setup (ms)</Th>
                                                        <Th color="gray.300" isNumeric>Compute (ms)</Th>
                                                        <Th color="gray.300" isNumeric>Render (ms)</Th>
                                                        <Th color="gray.300" isNumeric>Readback (ms)</Th>
                                                        <Th color="gray.300" isNumeric>Frames</Th>
                                                    </Tr>
                                                </Thead>
                                                <Tbody>
                                                    {selectedReport.results.map((result, idx) => (
                                                        <Tr key={idx} _hover={{ bg: 'rgba(0,200,200,0.05)' }}>
                                                            <Td>
                                                                <Badge colorScheme="teal" fontSize="xs">
                                                                    {result.method}
                                                                </Badge>
                                                            </Td>
                                                            <Td isNumeric>{result.agentCount.toLocaleString()}</Td>
                                                            <Td isNumeric>{result.workerCount ?? '-'}</Td>
                                                            <Td isNumeric>{result.workgroupSize ?? '-'}</Td>
                                                            <Td isNumeric fontWeight="bold">
                                                                {result.avgExecutionTime.toFixed(2)}
                                                            </Td>
                                                            <Td isNumeric color="gray.400">
                                                                {result.avgSetupTime.toFixed(2)}
                                                            </Td>
                                                            <Td isNumeric color="blue.300">
                                                                {result.avgComputeTime.toFixed(2)}
                                                            </Td>
                                                            <Td isNumeric color="green.300">
                                                                {result.avgRenderTime.toFixed(2)}
                                                            </Td>
                                                            <Td isNumeric color="orange.300">
                                                                {result.avgReadbackTime.toFixed(2)}
                                                            </Td>
                                                            <Td isNumeric color="gray.500">{result.frameCount}</Td>
                                                        </Tr>
                                                    ))}
                                                </Tbody>
                                            </Table>
                                        </Box>

                                        {/* Detailed Stats Accordion */}
                                        <Accordion allowToggle mt={6}>
                                            {selectedReport.results.map((result, idx) => {
                                                const hasSpecificStats = result.specificStats && Object.keys(result.specificStats).length > 0;
                                                if (!hasSpecificStats) return null;

                                                return (
                                                    <AccordionItem key={idx} border="1px solid" borderColor="whiteAlpha.200" mb={2} borderRadius="md">
                                                        <AccordionButton _hover={{ bg: 'rgba(0,200,200,0.1)' }}>
                                                            <Box flex="1" textAlign="left">
                                                                <Text fontWeight="bold">
                                                                    {result.method} - {result.agentCount.toLocaleString()} agents
                                                                    {result.workerCount !== undefined && ` (${result.workerCount} workers)`}
                                                                    {result.workgroupSize && ` (WG: ${result.workgroupSize})`}
                                                                </Text>
                                                            </Box>
                                                            <AccordionIcon />
                                                        </AccordionButton>
                                                        <AccordionPanel pb={4} bg="rgba(0,0,0,0.2)">
                                                            <VStack align="stretch" spacing={2}>
                                                                {result.specificStats && Object.entries(result.specificStats).map(([key, value]) => (
                                                                    <HStack key={key} justify="space-between">
                                                                        <Text fontSize="sm" color="gray.300">{key}</Text>
                                                                        <Text fontSize="sm" fontWeight="bold">{value.toFixed(3)} ms</Text>
                                                                    </HStack>
                                                                ))}
                                                                {result.avgCompileTime && (
                                                                    <HStack justify="space-between">
                                                                        <Text fontSize="sm" color="gray.300">Compile Time</Text>
                                                                        <Text fontSize="sm" fontWeight="bold">{result.avgCompileTime.toFixed(3)} ms</Text>
                                                                    </HStack>
                                                                )}
                                                            </VStack>
                                                        </AccordionPanel>
                                                    </AccordionItem>
                                                );
                                            })}
                                        </Accordion>
                                    </Box>
                                </TabPanel>

                                {/* Device Info Tab */}
                                <TabPanel>
                                    <VStack align="stretch" spacing={4}>
                                        {selectedReport.deviceInfo ? (
                                            <>
                                                <Box bg="rgba(0,0,0,0.3)" p={4} borderRadius="md">
                                                    <Heading size="sm" mb={3}>System Information</Heading>
                                                    <VStack align="stretch" spacing={2}>
                                                        <HStack justify="space-between">
                                                            <Text fontSize="sm" color="gray.400">Platform</Text>
                                                            <Text fontSize="sm">{selectedReport.deviceInfo.platform}</Text>
                                                        </HStack>
                                                        <HStack justify="space-between">
                                                            <Text fontSize="sm" color="gray.400">Hardware Concurrency</Text>
                                                            <Text fontSize="sm">{selectedReport.deviceInfo.hardwareConcurrency} threads</Text>
                                                        </HStack>
                                                        {selectedReport.deviceInfo.deviceMemory && (
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Device Memory</Text>
                                                                <Text fontSize="sm">{selectedReport.deviceInfo.deviceMemory} GB</Text>
                                                            </HStack>
                                                        )}
                                                        <Box pt={2}>
                                                            <Text fontSize="xs" color="gray.500">User Agent</Text>
                                                            <Text fontSize="xs" color="gray.400" mt={1}>
                                                                {selectedReport.deviceInfo.userAgent}
                                                            </Text>
                                                        </Box>
                                                    </VStack>
                                                </Box>

                                                {selectedReport.deviceInfo.gpuInfo && (
                                                    <Box bg="rgba(0,0,0,0.3)" p={4} borderRadius="md">
                                                        <Heading size="sm" mb={3}>GPU Information</Heading>
                                                        <VStack align="stretch" spacing={2}>
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Vendor</Text>
                                                                <Text fontSize="sm">{selectedReport.deviceInfo.gpuInfo.vendor}</Text>
                                                            </HStack>
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Architecture</Text>
                                                                <Text fontSize="sm">{selectedReport.deviceInfo.gpuInfo.architecture}</Text>
                                                            </HStack>
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Description</Text>
                                                                <Text fontSize="sm">{selectedReport.deviceInfo.gpuInfo.description}</Text>
                                                            </HStack>
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Max Buffer Size</Text>
                                                                <Text fontSize="sm">
                                                                    {(selectedReport.deviceInfo.gpuInfo.maxBufferSize / (1024 * 1024)).toFixed(2)} MB
                                                                </Text>
                                                            </HStack>
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Max Workgroups Per Dim</Text>
                                                                <Text fontSize="sm">
                                                                    {selectedReport.deviceInfo.gpuInfo.maxComputeWorkgroupsPerDimension.toLocaleString()}
                                                                </Text>
                                                            </HStack>
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Max Invocations Per WG</Text>
                                                                <Text fontSize="sm">
                                                                    {selectedReport.deviceInfo.gpuInfo.maxComputeInvocationsPerWorkgroup.toLocaleString()}
                                                                </Text>
                                                            </HStack>
                                                        </VStack>
                                                    </Box>
                                                )}

                                                {selectedReport.configuration && (
                                                    <Box bg="rgba(0,0,0,0.3)" p={4} borderRadius="md">
                                                        <Heading size="sm" mb={3}>Benchmark Configuration</Heading>
                                                        <VStack align="stretch" spacing={2}>
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Frames Per Test</Text>
                                                                <Text fontSize="sm">{selectedReport.configuration.framesPerTest}</Text>
                                                            </HStack>
                                                            <HStack justify="space-between">
                                                                <Text fontSize="sm" color="gray.400">Warmup Run</Text>
                                                                <Text fontSize="sm">{selectedReport.configuration.warmupRun ? 'Yes' : 'No'}</Text>
                                                            </HStack>
                                                            {selectedReport.configuration.workerCounts && (
                                                                <HStack justify="space-between">
                                                                    <Text fontSize="sm" color="gray.400">Worker Counts Tested</Text>
                                                                    <Text fontSize="sm">
                                                                        {selectedReport.configuration.workerCounts.join(', ')}
                                                                    </Text>
                                                                </HStack>
                                                            )}
                                                            {selectedReport.configuration.workgroupSizes && (
                                                                <HStack justify="space-between">
                                                                    <Text fontSize="sm" color="gray.400">Workgroup Sizes Tested</Text>
                                                                    <Text fontSize="sm">
                                                                        {selectedReport.configuration.workgroupSizes.join(', ')}
                                                                    </Text>
                                                                </HStack>
                                                            )}
                                                        </VStack>
                                                    </Box>
                                                )}
                                            </>
                                        ) : (
                                            <Box bg="rgba(0,0,0,0.3)" p={4} borderRadius="md">
                                                <Text color="gray.500">Device information not available for this report.</Text>
                                            </Box>
                                        )}
                                    </VStack>
                                </TabPanel>
                            </TabPanels>
                        </Tabs>
                    </Box>
                ) : (
                    <Flex flex="1" align="center" justify="center" direction="column">
                        <Icon as={FaChartBar} boxSize={12} color="gray.600" mb={4} />
                        <Text color="gray.500">Select a report from the list to view details.</Text>
                    </Flex>
                )}
            </Flex>
        </Flex>
    );
};
