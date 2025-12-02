import { Chart } from 'chart.js';
import type { FramePerformance } from '../performance.ts';
import Logger from './logger.ts';
import { registerables } from 'chart.js';
import { LineWithErrorBarsController, PointWithErrorBar } from 'chartjs-chart-error-bars';

Chart.register(...registerables, LineWithErrorBarsController, PointWithErrorBar);

export type DeviceInfo = {
    userAgent: string;
    platform: string;
    hardwareConcurrency: number;
    deviceMemory?: number;
    gpuInfo?: {
        vendor: string;
        architecture: string;
        description: string;
        maxBufferSize: number;
        maxStorageBufferBindingSize: number;
        maxComputeWorkgroupsPerDimension: number;
        maxComputeInvocationsPerWorkgroup: number;
        maxComputeWorkgroupSizeX: number;
        maxComputeWorkgroupSizeY: number;
        maxComputeWorkgroupSizeZ: number;
    };
};

export type BenchmarkConfiguration = {
    agentRange: {
        start: number;
        end: number;
        step: number;
    };
    workerCounts?: number[]; // Specific worker counts to test (for WebWorkers method)
    workgroupSizes?: number[]; // Specific workgroup sizes to test (for WebGPU method)
    methods: Array<{
        method: string;
        renderMode?: string;
    }>;
    framesPerTest: number;
    warmupRun: boolean;
};

export type BenchmarkResult = {
    method: string;
    agentCount: number;
    workerCount?: number;
    workgroupSize?: number;
    avgExecutionTime: number;
    minExecutionTime: number;
    maxExecutionTime: number;
    avgSetupTime: number;
    avgComputeTime: number;
    avgRenderTime: number;
    avgReadbackTime: number;
    avgCompileTime?: number;
    frameCount: number;
    specificStats?: Record<string, number>;
}

export type BenchmarkReport = {
    id: string;
    timestamp: number;
    name?: string;
    results: BenchmarkResult[];
    deviceInfo?: DeviceInfo;
    configuration?: BenchmarkConfiguration;
}

export class Grapher {
    private Logger = new Logger('Grapher', 'Teal');
    private ctx: CanvasRenderingContext2D;
    private chart: Chart | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext('2d')!;
    }

    render(frames: FramePerformance[]) {
        this.Logger.log(`Rendering graph for ${frames.length} frames`);

        const labels = frames.map(f => new Date(f.frameTimestamp).toLocaleTimeString());
        const data = frames.map(f => f.totalExecutionTime);
        const method = frames[0]?.method ?? 'Unknown';

        if (this.chart) this.chart.destroy();

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: `${method} total execution time (ms)`,
                    data,
                    borderWidth: 2,
                    fill: false,
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

    renderBenchmark(results: BenchmarkResult[]) {
        this.Logger.log(`Rendering benchmark graph for ${results.length} results`);

        // Clear the canvas first
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.chart) this.chart.destroy();

        // Group results by method (and worker count if applicable)
        const methodGroups = new Map<string, BenchmarkResult[]>();
        for (const result of results) {
            let key = result.method;
            if (result.workerCount && result.workerCount > 0) {
                key += ` (${result.workerCount} workers)`;
            }

            if (!methodGroups.has(key)) {
                methodGroups.set(key, []);
            }
            methodGroups.get(key)!.push(result);
        }

        // Sort each method's results by agent count
        for (const [, group] of methodGroups) {
            group.sort((a, b) => a.agentCount - b.agentCount);
        }

        // Get unique agent counts for labels
        const agentCounts = Array.from(new Set(results.map(r => r.agentCount))).sort((a, b) => a - b);

        // Expanded color palette for variations
        const colors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#2ecc71', '#9966FF',
            '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40', '#E7E9ED',
            '#36A2EB', '#FFCE56', '#9966FF', '#FF6384', '#4BC0C0', '#FF9F40'
        ];

        // Base method colors
        const methodColors: { [key: string]: string } = {
            'JavaScript': '#FF6384',
            'WebAssembly': '#36A2EB',
            'WebGPU (CPU render)': '#4BC0C0',
            'WebGPU (GPU render)': '#2ecc71',
            'WebGL': '#9966FF'
        };

        const getColor = (key: string, index: number) => {
            // Check for exact base method match
            if (methodColors[key]) return methodColors[key];

            // For variations (workers/workgroups), use indexed colors
            if (key.includes('workers') || key.includes('WG:')) {
                return colors[index % colors.length];
            }

            return '#999999';
        };

        // Create datasets for each method with error bars
        const datasets = Array.from(methodGroups.entries()).map(([method, group], index) => {
            const color = getColor(method, index);
            return {
                label: method,
                data: group.map(r => ({
                    y: r.avgExecutionTime,
                    yMin: r.minExecutionTime,
                    yMax: r.maxExecutionTime
                })),
                borderColor: color,
                backgroundColor: color,
                borderWidth: 3,
                fill: false,
                tension: 0.1,
                pointRadius: 5,
                pointHoverRadius: 7,
                errorBarColor: color,
                errorBarWhiskerColor: color,
                errorBarLineWidth: 2,
                errorBarWhiskerLineWidth: 2,
                errorBarWhiskerSize: 6,
            };
        });

        this.chart = new Chart(this.ctx, {
            type: 'lineWithErrorBars',
            data: {
                labels: agentCounts.map(count => count.toLocaleString()),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                backgroundColor: '#1a1a1a',
                plugins: {
                    title: {
                        display: true,
                        text: 'Frame Execution Time by Agent Count (excl. setup)',
                        color: '#e0e0e0',
                        font: { size: 18 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#e0e0e0', font: { size: 14 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            label: (context) => {
                                const datasetLabel = context.dataset.label || '';
                                // Find result safely
                                const group = methodGroups.get(datasetLabel);
                                const result = group?.find(r => r.agentCount === agentCounts[context.dataIndex]);

                                const yValue = context.parsed.y ?? 0;
                                if (!result) return `${datasetLabel}: ${yValue.toFixed(2)} ms`;

                                return [
                                    `${datasetLabel}: ${result.avgExecutionTime.toFixed(2)} ms (total, excl. setup)`,
                                    `Min: ${result.minExecutionTime.toFixed(2)} ms`,
                                    `Max: ${result.maxExecutionTime.toFixed(2)} ms`,
                                    `---`,
                                    `Setup/Overhead: ${result.avgSetupTime.toFixed(2)} ms`,
                                    `Compute: ${result.avgComputeTime.toFixed(2)} ms`,
                                    `Render: ${result.avgRenderTime.toFixed(2)} ms`,
                                    `Readback: ${result.avgReadbackTime.toFixed(2)} ms`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Number of Agents',
                            color: '#e0e0e0',
                            font: { size: 14 }
                        },
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Average Execution Time (ms)',
                            color: '#e0e0e0',
                            font: { size: 14 }
                        },
                        beginAtZero: true,
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }

    renderBreakdown(results: BenchmarkResult[]) {
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this.chart) this.chart.destroy();

        // Use the largest agent count for the breakdown if multiple exist, 
        // or let user filter? For now, let's group by Method + Agent Count
        // To keep it readable, let's just show the breakdown for the LARGEST agent count tested
        // or aggregate. A grouped stacked bar chart is complex.

        // Let's filter for the max agent count
        const maxAgents = Math.max(...results.map(r => r.agentCount));
        const filteredResults = results.filter(r => r.agentCount === maxAgents);

        // Sort by total time descending
        filteredResults.sort((a, b) => b.avgExecutionTime - a.avgExecutionTime);

        const labels = filteredResults.map(r => {
            let label = r.method;
            if (r.workerCount) label += ` (${r.workerCount} workers)`;
            return label;
        });

        this.chart = new Chart(this.ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Compute',
                        data: filteredResults.map(r => r.avgComputeTime),
                        backgroundColor: '#36A2EB',
                    },
                    {
                        label: 'Render',
                        data: filteredResults.map(r => r.avgRenderTime),
                        backgroundColor: '#2ecc71',
                    },
                    {
                        label: 'Readback',
                        data: filteredResults.map(r => r.avgReadbackTime),
                        backgroundColor: '#FF6384',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                backgroundColor: '#1a1a1a',
                plugins: {
                    title: {
                        display: true,
                        text: `Time Breakdown (${maxAgents.toLocaleString()} Agents)`,
                        color: '#e0e0e0',
                        font: { size: 18 }
                    },
                    legend: {
                        labels: { color: '#e0e0e0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            footer: (items) => {
                                const index = items[0].dataIndex;
                                const result = filteredResults[index];
                                const total = result.avgComputeTime + result.avgRenderTime + result.avgReadbackTime;
                                return `Total (excl. setup): ${total.toFixed(2)} ms`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Time (ms)',
                            color: '#e0e0e0'
                        },
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }

    renderReadbackComparison(results: BenchmarkResult[]) {
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this.chart) this.chart.destroy();

        // Filter for max agents to compare "worst case" readback
        const maxAgents = Math.max(...results.map(r => r.agentCount));
        const filteredResults = results.filter(r => r.agentCount === maxAgents);

        filteredResults.sort((a, b) => a.avgReadbackTime - b.avgReadbackTime); // Ascending (best first)

        const labels = filteredResults.map(r => {
            let label = r.method;
            if (r.workerCount !== undefined) label += ` (${r.workerCount}w)`;
            if (r.workgroupSize) label += ` (WG:${r.workgroupSize})`;
            return label;
        });

        this.chart = new Chart(this.ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Average Readback Time (ms)',
                    data: filteredResults.map(r => r.avgReadbackTime),
                    backgroundColor: filteredResults.map(r => r.avgReadbackTime > 10 ? '#FF6384' : '#4BC0C0'),
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                backgroundColor: '#1a1a1a',
                indexAxis: 'y', // Horizontal bar chart
                plugins: {
                    title: {
                        display: true,
                        text: `Readback Time Comparison (${maxAgents.toLocaleString()} Agents)`,
                        color: '#e0e0e0',
                        font: { size: 18 }
                    },
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Readback Time (ms)',
                            color: '#e0e0e0'
                        },
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    },
                    y: {
                        ticks: { color: '#aaa', font: { size: 10 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    /**
     * Renders readback time vs agent count for each method
     */
    renderReadbackVsAgents(results: BenchmarkResult[]) {
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this.chart) this.chart.destroy();

        // Group by method + variations
        const methodGroups = new Map<string, BenchmarkResult[]>();
        for (const result of results) {
            let key = result.method;
            if (result.workerCount !== undefined) key += ` (${result.workerCount}w)`;
            if (result.workgroupSize) key += ` (WG:${result.workgroupSize})`;

            if (!methodGroups.has(key)) {
                methodGroups.set(key, []);
            }
            methodGroups.get(key)!.push(result);
        }

        // Sort each group by agent count
        for (const [, group] of methodGroups) {
            group.sort((a, b) => a.agentCount - b.agentCount);
        }

        const agentCounts = Array.from(new Set(results.map(r => r.agentCount))).sort((a, b) => a - b);

        const colors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#2ecc71', '#9966FF',
            '#FF9F40', '#C9CBCF', '#E7E9ED', '#FF6384', '#4BC0C0', '#FF9F40'
        ];

        const datasets = Array.from(methodGroups.entries()).map(([method, group], index) => {
            const color = colors[index % colors.length];

            return {
                label: method,
                data: group.map(r => r.avgReadbackTime),
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                fill: false,
                tension: 0.1,
            };
        });

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: agentCounts.map(c => c.toLocaleString()),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                backgroundColor: '#1a1a1a',
                plugins: {
                    title: {
                        display: true,
                        text: 'Readback Time vs Agent Count',
                        color: '#e0e0e0',
                        font: { size: 18 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#e0e0e0', font: { size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Number of Agents',
                            color: '#e0e0e0',
                            font: { size: 14 }
                        },
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Readback Time (ms)',
                            color: '#e0e0e0',
                            font: { size: 14 }
                        },
                        beginAtZero: true,
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }

    /**
     * Renders compute time vs agent count for each method
     */
    renderComputeVsAgents(results: BenchmarkResult[]) {
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this.chart) this.chart.destroy();

        // Group by method + variations
        const methodGroups = new Map<string, BenchmarkResult[]>();
        for (const result of results) {
            let key = result.method;
            if (result.workerCount !== undefined) key += ` (${result.workerCount}w)`;
            if (result.workgroupSize) key += ` (WG:${result.workgroupSize})`;

            if (!methodGroups.has(key)) {
                methodGroups.set(key, []);
            }
            methodGroups.get(key)!.push(result);
        }

        // Sort each group by agent count
        for (const [, group] of methodGroups) {
            group.sort((a, b) => a.agentCount - b.agentCount);
        }

        const agentCounts = Array.from(new Set(results.map(r => r.agentCount))).sort((a, b) => a - b);

        const colors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#2ecc71', '#9966FF',
            '#FF9F40', '#C9CBCF', '#E7E9ED', '#FF6384', '#4BC0C0', '#FF9F40'
        ];

        const datasets = Array.from(methodGroups.entries()).map(([method, group], index) => {
            const color = colors[index % colors.length];

            return {
                label: method,
                data: group.map(r => r.avgComputeTime),
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                fill: false,
                tension: 0.1,
            };
        });

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: agentCounts.map(c => c.toLocaleString()),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                backgroundColor: '#1a1a1a',
                plugins: {
                    title: {
                        display: true,
                        text: 'Compute Time vs Agent Count',
                        color: '#e0e0e0',
                        font: { size: 18 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#e0e0e0', font: { size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Number of Agents',
                            color: '#e0e0e0',
                            font: { size: 14 }
                        },
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Compute Time (ms)',
                            color: '#e0e0e0',
                            font: { size: 14 }
                        },
                        beginAtZero: true,
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }

    /**
     * Renders render time vs agent count for each method
     */
    renderRenderVsAgents(results: BenchmarkResult[]) {
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this.chart) this.chart.destroy();

        // Group by method + variations
        const methodGroups = new Map<string, BenchmarkResult[]>();
        for (const result of results) {
            let key = result.method;
            if (result.workerCount !== undefined) key += ` (${result.workerCount}w)`;
            if (result.workgroupSize) key += ` (WG:${result.workgroupSize})`;

            if (!methodGroups.has(key)) {
                methodGroups.set(key, []);
            }
            methodGroups.get(key)!.push(result);
        }

        // Sort each group by agent count
        for (const [, group] of methodGroups) {
            group.sort((a, b) => a.agentCount - b.agentCount);
        }

        const agentCounts = Array.from(new Set(results.map(r => r.agentCount))).sort((a, b) => a - b);

        const colors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#2ecc71', '#9966FF',
            '#FF9F40', '#C9CBCF', '#E7E9ED', '#FF6384', '#4BC0C0', '#FF9F40'
        ];

        const datasets = Array.from(methodGroups.entries()).map(([method, group], index) => {
            const color = colors[index % colors.length];

            return {
                label: method,
                data: group.map(r => r.avgRenderTime),
                borderColor: color,
                backgroundColor: color,
                borderWidth: 2,
                fill: false,
                tension: 0.1,
            };
        });

        this.chart = new Chart(this.ctx, {
            type: 'line',
            data: {
                labels: agentCounts.map(c => c.toLocaleString()),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                backgroundColor: '#1a1a1a',
                plugins: {
                    title: {
                        display: true,
                        text: 'Render Time vs Agent Count',
                        color: '#e0e0e0',
                        font: { size: 18 }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#e0e0e0', font: { size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)'
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Number of Agents',
                            color: '#e0e0e0',
                            font: { size: 14 }
                        },
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Render Time (ms)',
                            color: '#e0e0e0',
                            font: { size: 14 }
                        },
                        beginAtZero: true,
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }

    /**
     * Renders setup and overhead time comparison across methods
     */
    renderSetupOverheadComparison(results: BenchmarkResult[], agentCount?: number) {
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this.chart) this.chart.destroy();

        // Use provided agent count or max
        const targetAgentCount = agentCount ?? Math.max(...results.map(r => r.agentCount));
        const filteredResults = results.filter(r => r.agentCount === targetAgentCount);

        filteredResults.sort((a, b) => b.avgSetupTime - a.avgSetupTime);

        const labels = filteredResults.map(r => {
            let label = r.method;
            if (r.workerCount !== undefined) label += ` (${r.workerCount}w)`;
            if (r.workgroupSize) label += ` (WG:${r.workgroupSize})`;
            return label;
        });

        this.chart = new Chart(this.ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Setup / Overhead',
                        data: filteredResults.map(r => r.avgSetupTime),
                        backgroundColor: '#FFCE56',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                backgroundColor: '#1a1a1a',
                plugins: {
                    title: {
                        display: true,
                        text: `Setup & Overhead Comparison (${targetAgentCount.toLocaleString()} Agents)`,
                        color: '#e0e0e0',
                        font: { size: 18 }
                    },
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            label: (context) => {
                                const index = context.dataIndex;
                                const result = filteredResults[index];
                                return `Setup/Overhead: ${result.avgSetupTime.toFixed(2)} ms`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#aaa', font: { size: 10 } },
                        grid: { color: '#444' }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Time (ms)',
                            color: '#e0e0e0'
                        },
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }

    /**
     * Renders a stacked bar chart comparing methods for the same agent count
     */
    renderMethodComparison(results: BenchmarkResult[], agentCount?: number) {
        const canvas = this.ctx.canvas;
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (this.chart) this.chart.destroy();

        // Use provided agent count or max
        const targetAgentCount = agentCount ?? Math.max(...results.map(r => r.agentCount));
        const filteredResults = results.filter(r => r.agentCount === targetAgentCount);

        filteredResults.sort((a, b) => b.avgExecutionTime - a.avgExecutionTime);

        const labels = filteredResults.map(r => {
            let label = r.method;
            if (r.workerCount !== undefined) label += ` (${r.workerCount}w)`;
            if (r.workgroupSize) label += ` (WG:${r.workgroupSize})`;
            return label;
        });

        this.chart = new Chart(this.ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Compute',
                        data: filteredResults.map(r => r.avgComputeTime),
                        backgroundColor: '#36A2EB',
                    },
                    {
                        label: 'Render',
                        data: filteredResults.map(r => r.avgRenderTime),
                        backgroundColor: '#2ecc71',
                    },
                    {
                        label: 'Readback',
                        data: filteredResults.map(r => r.avgReadbackTime),
                        backgroundColor: '#FF6384',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                backgroundColor: '#1a1a1a',
                plugins: {
                    title: {
                        display: true,
                        text: `Method Comparison - Time Breakdown (${targetAgentCount.toLocaleString()} Agents)`,
                        color: '#e0e0e0',
                        font: { size: 18 }
                    },
                    legend: {
                        labels: { color: '#e0e0e0' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        callbacks: {
                            footer: (items) => {
                                const index = items[0].dataIndex;
                                const result = filteredResults[index];
                                const total = result.avgComputeTime + result.avgRenderTime + result.avgReadbackTime;
                                return `Total (excl. setup): ${total.toFixed(2)} ms`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: '#aaa', font: { size: 10 } },
                        grid: { color: '#444' }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Time (ms)',
                            color: '#e0e0e0'
                        },
                        ticks: { color: '#aaa' },
                        grid: { color: '#444' }
                    }
                }
            }
        });
    }
}
