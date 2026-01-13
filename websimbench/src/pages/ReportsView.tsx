import React, { useEffect, useRef, useState } from 'react';
import {
    Button,
    Input,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Badge,
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui';

import { ChartBar, Calendar, Trash, PencilSimple, Check, X, Table as TableIcon, Image as ImageIcon, DownloadSimple } from "@phosphor-icons/react";
import { Grapher, BenchmarkReport, BenchmarkResult } from '../simulation/helpers/grapher';
import html2canvas from 'html2canvas';
import { toast } from "sonner";

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
        <div className="w-full h-[400px] bg-black relative rounded-md overflow-hidden mb-4">
            <canvas
                id={`graph-${chartType}-${id}`}
                ref={canvasRef}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                }}
            />
        </div>
    );
};

export const ReportsView: React.FC<ReportsViewProps> = ({ reports, onClear, onRename }) => {
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [selectedAgentCount, setSelectedAgentCount] = useState<number | undefined>(undefined);
    const tableRef = useRef<HTMLDivElement>(null);

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

    const handleStartEdit = (id: string, name: string) => {
        setEditingId(id);
        setEditName(name);
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
            toast.error("Error downloading table");
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
            r.avgExecutionTime?.toFixed(3) ?? '0.000',
            r.minExecutionTime?.toFixed(3) ?? '0.000',
            r.maxExecutionTime?.toFixed(3) ?? '0.000',
            r.avgSetupTime?.toFixed(3) ?? '0.000',
            r.avgComputeTime?.toFixed(3) ?? '0.000',
            r.avgRenderTime?.toFixed(3) ?? '0.000',
            r.avgReadbackTime?.toFixed(3) ?? '0.000',
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
        <div className="flex h-full w-full bg-[#16262b]">
            {/* Sidebar: Report List */}
            <div className="flex flex-col w-[320px] border-r border-white/10 bg-black/40">
                <div className="h-16 flex px-6 items-center justify-between border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-2">
                        <ChartBar className="text-tropicalTeal" size={20} weight="bold" />
                        <h2 className="text-sm font-bold uppercase tracking-widest text-white">Reports</h2>
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                // size="md"
                                variant="ghost"
                                className="text-gray-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
                                disabled={reports.length === 0}
                                title="Clear All Reports"
                            >
                                <Trash size={16} />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-[#1a2e33] border-white/10 text-white">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete all reports?</AlertDialogTitle>
                                <AlertDialogDescription className="text-gray-400">
                                    This action cannot be undone. This will permanently delete all your benchmark reports.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={onClear} className="bg-red-500 hover:bg-red-600 border-red-500 text-white">Delete All</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                    {reports.length === 0 && (
                        <div className="p-8 text-center space-y-2 opacity-40">
                            <ChartBar className="mx-auto" size={32} weight="thin" />
                            <p className="text-xs font-medium">No reports yet.</p>
                        </div>
                    )}
                    <div className="px-3 space-y-1">
                        {reports.map((report) => (
                            <div
                                key={report.id}
                                className={`group p-3 cursor-pointer rounded-xl transition-all duration-200 border ${selectedReportId === report.id
                                    ? 'bg-tropicalTeal/10 border-tropicalTeal/30 text-white shadow-lg shadow-black/20'
                                    : 'bg-transparent border-transparent hover:bg-white/5 text-gray-400 hover:text-gray-200'
                                    }`}
                                onClick={() => setSelectedReportId(report.id)}
                            >
                                {editingId === report.id ? (
                                    <div className="flex gap-2" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                        <Input
                                            className="h-8 text-xs bg-black/40 border-tropicalTeal/50 focus:ring-1 focus:ring-tropicalTeal/30"
                                            value={editName}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                                            autoFocus
                                        />
                                        <div className="flex gap-1">
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500 hover:bg-green-500/10" onClick={handleSaveEdit}><Check size={14} weight="bold" /></Button>
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-500/10" onClick={handleCancelEdit}><X size={14} weight="bold" /></Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`p-2 rounded-lg transition-colors ${selectedReportId === report.id ? 'bg-tropicalTeal text-jetBlack' : 'bg-black/40 group-hover:bg-black/60'}`}>
                                                <Calendar size={16} weight={selectedReportId === report.id ? 'fill' : 'regular'} />
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className={`text-sm font-bold truncate ${selectedReportId === report.id ? 'text-white' : ''}`}>
                                                    {report.name || `Session ${report.id.slice(0, 4)}`}
                                                </p>
                                                <p className="text-[10px] font-mono opacity-60">
                                                    {new Date(report.timestamp).toLocaleTimeString([], { hour12: false })} • {report.results.length} results
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className={`h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 ${selectedReportId === report.id ? 'text-white' : 'text-gray-500'}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleStartEdit(report.id, report.name || '');
                                            }}
                                        >
                                            <PencilSimple size={14} />
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content: Report Detail */}
            <div className="flex-1 overflow-y-auto bg-black/5">
                {selectedReport ? (
                    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
                        {/* Header */}
                        <div className="p-4 border-b border-cerulean">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="text-lg font-bold text-tropicalTeal">
                                    {selectedReport.name || 'Benchmark Report'}
                                </h2>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" className="h-8" onClick={downloadCSV}>
                                        <DownloadSimple className="mr-2" size={14} /> CSV
                                    </Button>
                                    <Button variant="outline" size="sm" className="h-8" onClick={downloadTableAsImage}>
                                        <TableIcon className="mr-2" size={14} /> Table PNG
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400">
                                Generated on {new Date(selectedReport.timestamp).toLocaleString()}
                            </p>
                        </div>

                        {/* Tabs for different views */}
                        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
                            <TabsList className="bg-black/20 p-2 gap-2 justify-start h-auto rounded-none border-b border-white/5 br-10">
                                <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white">Overview</TabsTrigger>
                                <TabsTrigger value="charts" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white">Charts</TabsTrigger>
                                <TabsTrigger value="data-tables" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white">Data Tables</TabsTrigger>
                                <TabsTrigger value="device-info" className="text-xs data-[state=active]:bg-teal-600 data-[state=active]:text-white">Device Info</TabsTrigger>
                            </TabsList>

                            <div className="flex-1 overflow-y-auto">
                                <TabsContent value="overview" className="p-4 m-0">
                                    <div className="flex flex-col gap-4">
                                        <div className="flex justify-end">
                                            <Button size="sm" variant="outline" className="h-8" onClick={() => downloadGraph('overview')}>
                                                <ImageIcon className="mr-2" size={14} /> Save Chart
                                            </Button>
                                        </div>
                                        <BenchmarkGraph
                                            results={selectedReport.results}
                                            id={selectedReport.id}
                                            chartType="overview"
                                        />

                                        {/* Quick Stats */}
                                        <div className="bg-black/30 p-4 rounded-md">
                                            <h3 className="text-sm font-bold mb-3">Quick Statistics</h3>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Methods Tested</p>
                                                    <p className="text-lg font-bold">
                                                        {new Set(selectedReport.results.map(r => r.method)).size}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Agent Counts</p>
                                                    <p className="text-lg font-bold">
                                                        {new Set(selectedReport.results.map(r => r.agentCount)).size}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total Tests</p>
                                                    <p className="text-lg font-bold">
                                                        {selectedReport.results.length}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="charts" className="p-4 m-0">
                                    <div className="flex flex-col gap-8">
                                        {[
                                            { title: 'Readback Time vs Agent Count', type: 'readback' },
                                            { title: 'Compute Time vs Agent Count', type: 'compute' },
                                            { title: 'Render Time vs Agent Count', type: 'render' },
                                        ].map(chart => (
                                            <div key={chart.type}>
                                                <div className="flex justify-between items-center mb-2">
                                                    <h3 className="text-sm font-bold">{chart.title}</h3>
                                                    <Button size="sm" variant="outline" className="h-7" onClick={() => downloadGraph(chart.type)}>
                                                        <ImageIcon className="mr-2" size={14} /> Save
                                                    </Button>
                                                </div>
                                                <BenchmarkGraph
                                                    results={selectedReport.results}
                                                    id={selectedReport.id}
                                                    chartType={chart.type as ChartType}
                                                />
                                            </div>
                                        ))}

                                        {/* Setup & Overhead Comparison */}
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <h3 className="text-sm font-bold">Setup & Overhead Comparison</h3>
                                                <div className="flex gap-2">
                                                    <Select value={String(selectedAgentCount ?? agentCounts[agentCounts.length - 1])} onValueChange={(v: string) => setSelectedAgentCount(Number(v))}>
                                                        <SelectTrigger className="h-7 w-[160px] text-xs">
                                                            <SelectValue placeholder="Select Agent Count" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {agentCounts.map(count => (
                                                                <SelectItem key={count} value={String(count)}>
                                                                    {count.toLocaleString()} agents
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Button size="sm" variant="outline" className="h-7" onClick={() => downloadGraph('setupOverhead')}>
                                                        <ImageIcon className="mr-2" size={14} /> Save
                                                    </Button>
                                                </div>
                                            </div>
                                            <BenchmarkGraph
                                                results={selectedReport.results}
                                                id={selectedReport.id}
                                                chartType="setupOverhead"
                                                agentCount={selectedAgentCount ?? agentCounts[agentCounts.length - 1]}
                                            />
                                        </div>

                                        {/* Method Comparison */}
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <h3 className="text-sm font-bold">Method Comparison</h3>
                                                <div className="flex gap-2">
                                                    <Select value={String(selectedAgentCount ?? agentCounts[agentCounts.length - 1])} onValueChange={(v: string) => setSelectedAgentCount(Number(v))}>
                                                        <SelectTrigger className="h-7 w-[160px] text-xs">
                                                            <SelectValue placeholder="Select Agent Count" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {agentCounts.map(count => (
                                                                <SelectItem key={count} value={String(count)}>
                                                                    {count.toLocaleString()} agents
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Button size="sm" variant="outline" className="h-7" onClick={() => downloadGraph('comparison')}>
                                                        <ImageIcon className="mr-2" size={14} /> Save
                                                    </Button>
                                                </div>
                                            </div>
                                            <BenchmarkGraph
                                                results={selectedReport.results}
                                                id={selectedReport.id}
                                                chartType="comparison"
                                                agentCount={selectedAgentCount ?? agentCounts[agentCounts.length - 1]}
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="data-tables" className="p-4 m-0">
                                    <div ref={tableRef}>
                                        <h3 className="text-sm font-bold mb-4">Complete Benchmark Results</h3>
                                        <div className="overflow-x-auto bg-black/30 rounded-md border border-white/10">
                                            <Table className="text-xs">
                                                <TableHeader>
                                                    <TableRow className="bg-white/5 hover:bg-white/5 border-white/10">
                                                        <TableHead className="text-gray-300">Method</TableHead>
                                                        <TableHead className="text-gray-300 text-right">Agents</TableHead>
                                                        <TableHead className="text-gray-300 text-right">Workers</TableHead>
                                                        <TableHead className="text-gray-300 text-right">WG Size</TableHead>
                                                        <TableHead className="text-gray-300 text-right font-bold">Avg Exec (ms)</TableHead>
                                                        <TableHead className="text-gray-300 text-right">Setup (ms)</TableHead>
                                                        <TableHead className="text-gray-300 text-right">Compute (ms)</TableHead>
                                                        <TableHead className="text-gray-300 text-right">Render (ms)</TableHead>
                                                        <TableHead className="text-gray-300 text-right">Readback (ms)</TableHead>
                                                        <TableHead className="text-gray-300 text-right">Frames</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {selectedReport.results.map((result, idx) => (
                                                        <TableRow key={idx} className="hover:bg-teal-500/5 border-white/5">
                                                            <TableCell>
                                                                <Badge className="bg-teal-600/80 hover:bg-teal-600 text-[10px] py-0 h-4">
                                                                    {result.method}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right">{result.agentCount.toLocaleString()}</TableCell>
                                                            <TableCell className="text-right">{result.workerCount ?? '-'}</TableCell>
                                                            <TableCell className="text-right">{result.workgroupSize ?? '-'}</TableCell>
                                                            <TableCell className="text-right font-bold">{result.avgExecutionTime?.toFixed(2) ?? '0.00'}</TableCell>
                                                            <TableCell className="text-right text-gray-400">{result.avgSetupTime?.toFixed(2) ?? '0.00'}</TableCell>
                                                            <TableCell className="text-right text-blue-400">{result.avgComputeTime?.toFixed(2) ?? '0.00'}</TableCell>
                                                            <TableCell className="text-right text-green-400">{result.avgRenderTime?.toFixed(2) ?? '0.00'}</TableCell>
                                                            <TableCell className="text-right text-orange-400">{result.avgReadbackTime?.toFixed(2) ?? '0.00'}</TableCell>
                                                            <TableCell className="text-right text-gray-500">{result.frameCount}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>

                                        {/* Detailed Stats Accordion */}
                                        <Accordion type="single" collapsible className="mt-6 space-y-2 border border-white/0">
                                            {selectedReport.results.map((result, idx) => {
                                                const hasSpecificStats = result.specificStats && Object.keys(result.specificStats).length > 0;
                                                if (!hasSpecificStats) return null;

                                                return (
                                                    <AccordionItem key={idx} value={`item-${idx}`} className="border border-white/10 rounded-md px-1 overflow-hidden">
                                                        <AccordionTrigger className="hover:no-underline py-2 px-3 text-xs font-bold text-left hover:bg-teal-500/10 transition-colors">
                                                            <div className="flex-1">
                                                                {result.method} - {result.agentCount.toLocaleString()} agents
                                                                {result.workerCount !== undefined && ` (${result.workerCount} workers)`}
                                                                {result.workgroupSize && ` (WG: ${result.workgroupSize})`}
                                                            </div>
                                                        </AccordionTrigger>
                                                        <AccordionContent className="px-3 pb-3 bg-black/20">
                                                            <div className="flex flex-col gap-1 pt-2">
                                                                {result.specificStats && Object.entries(result.specificStats).map(([key, value]) => (
                                                                    <div key={key} className="flex justify-between text-[11px]">
                                                                        <span className="text-gray-300">{key}</span>
                                                                        <span className="font-bold">{typeof value === 'number' ? value.toFixed(3) : '0.000'} ms</span>
                                                                    </div>
                                                                ))}
                                                                {result.avgCompileTime && (
                                                                    <div className="flex justify-between text-[11px] border-t border-white/5 mt-1 pt-1">
                                                                        <span className="text-gray-300">Compile Time</span>
                                                                        <span className="font-bold">{result.avgCompileTime.toFixed(3)} ms</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </AccordionContent>
                                                    </AccordionItem>
                                                );
                                            })}
                                        </Accordion>
                                    </div>
                                </TabsContent>

                                <TabsContent value="device-info" className="p-4 m-0">
                                    <div className="flex flex-col gap-4">
                                        {selectedReport.deviceInfo ? (
                                            <>
                                                <div className="bg-black/30 p-4 rounded-md">
                                                    <h3 className="text-sm font-bold mb-3 border-b border-white/10 pb-2 text-tropicalTeal">System Information</h3>
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-400">Platform</span>
                                                            <span>{selectedReport.deviceInfo.platform}</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-gray-400">Hardware Concurrency</span>
                                                            <span>{selectedReport.deviceInfo.hardwareConcurrency} threads</span>
                                                        </div>
                                                        {selectedReport.deviceInfo.deviceMemory && (
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-400">Device Memory</span>
                                                                <span>{selectedReport.deviceInfo.deviceMemory} GB</span>
                                                            </div>
                                                        )}
                                                        <div className="pt-2">
                                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">User Agent</p>
                                                            <p className="text-[10px] text-gray-400 leading-relaxed font-mono bg-black/20 p-2 rounded">
                                                                {selectedReport.deviceInfo.userAgent}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {selectedReport.deviceInfo.gpuInfo && (
                                                    <div className="bg-black/30 p-4 rounded-md">
                                                        <h3 className="text-sm font-bold mb-3 border-b border-white/10 pb-2 text-tropicalTeal">GPU Information</h3>
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-400">Vendor</span>
                                                                <span>{selectedReport.deviceInfo.gpuInfo.vendor}</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-400">Architecture</span>
                                                                <span>{selectedReport.deviceInfo.gpuInfo.architecture}</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-400">Description</span>
                                                                <span>{selectedReport.deviceInfo.gpuInfo.description}</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-400">Max Buffer Size</span>
                                                                <span>{(selectedReport.deviceInfo.gpuInfo.maxBufferSize / (1024 * 1024)).toFixed(2)} MB</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-400">Max Workgroups Per Dim</span>
                                                                <span>{selectedReport.deviceInfo.gpuInfo.maxComputeWorkgroupsPerDimension.toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between text-xs">
                                                                <span className="text-gray-400">Max Invocations Per WG</span>
                                                                <span>{selectedReport.deviceInfo.gpuInfo.maxComputeInvocationsPerWorkgroup.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {selectedReport.configuration && (
                                                    <div className="bg-black/30 p-4 rounded-md">
                                                        <h3 className="text-sm font-bold mb-3 border-b border-white/10 pb-2 text-tropicalTeal">Benchmark Configuration</h3>
                                                        <div className="flex flex-col gap-2 text-xs">
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">Frames Per Test</span>
                                                                <span>{selectedReport.configuration.framesPerTest}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">Warmup Run</span>
                                                                <span>{selectedReport.configuration.warmupRun ? 'Yes' : 'No'}</span>
                                                            </div>
                                                            {selectedReport.configuration.workerCounts && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">Worker Counts Tested</span>
                                                                    <span>{selectedReport.configuration.workerCounts.join(', ')}</span>
                                                                </div>
                                                            )}
                                                            {selectedReport.configuration.workgroupSizes && (
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">Workgroup Sizes Tested</span>
                                                                    <span>{selectedReport.configuration.workgroupSizes.join(', ')}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="bg-black/30 p-4 rounded-md text-center py-8">
                                                <span className="text-gray-500 text-sm">Device information not available for this report.</span>
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>
                ) : (
                    <div className="flex-1 mt-10 flex flex-col items-center justify-center">
                        <ChartBar size={48} className="text-gray-600 mb-4" />
                        <span className="text-gray-500">Select a report from the list to view details.</span>
                    </div>
                )}
            </div>
        </div>
    );
};
