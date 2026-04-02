import { Chart } from 'chart.js';
import type { FramePerformance } from '../performance.ts';
import Logger from './logger.ts';
import { registerables } from 'chart.js';
import { LineWithErrorBarsController, PointWithErrorBar } from 'chartjs-chart-error-bars';

Chart.register(...registerables, LineWithErrorBarsController, PointWithErrorBar);

export type BenchmarkResult = {
    method: string;
    agentCount: number;
    avgExecutionTime: number;
    minExecutionTime: number;
    maxExecutionTime: number;
    frameCount: number;
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

        if (this.chart) this.chart.destroy();

        // Group results by method
        const methodGroups = new Map<string, BenchmarkResult[]>();
        for (const result of results) {
            if (!methodGroups.has(result.method)) {
                methodGroups.set(result.method, []);
            }
            methodGroups.get(result.method)!.push(result);
        }

        // Sort each method's results by agent count
        for (const [, group] of methodGroups) {
            group.sort((a, b) => a.agentCount - b.agentCount);
        }

        // Get unique agent counts for labels
        const agentCounts = Array.from(new Set(results.map(r => r.agentCount))).sort((a, b) => a - b);

        // Define colors for each method
        const methodColors: { [key: string]: string } = {
            'JavaScript': '#FF6384',
            'WebAssembly': '#36A2EB',
            'WebWorkers': '#FFCE56',
            'WebGPU (CPU render)': '#4BC0C0',
            'WebGPU (GPU render)': '#2ecc71',
            'WebGL': '#9966FF'
        };

        // Create datasets for each method with error bars
        const datasets = Array.from(methodGroups.entries()).map(([method, group]) => ({
            label: method,
            data: group.map(r => ({
                y: r.avgExecutionTime,
                yMin: r.minExecutionTime,
                yMax: r.maxExecutionTime
            })),
            borderColor: methodColors[method] || '#999999',
            backgroundColor: methodColors[method] || '#999999',
            borderWidth: 3,
            fill: false,
            tension: 0.1,
            pointRadius: 5,
            pointHoverRadius: 7,
            errorBarColor: methodColors[method] || '#999999',
            errorBarWhiskerColor: methodColors[method] || '#999999',
            errorBarLineWidth: 2,
            errorBarWhiskerLineWidth: 2,
            errorBarWhiskerSize: 6,
        }));

        this.chart = new Chart(this.ctx, {
            type: 'lineWithErrorBars',
            data: {
                labels: agentCounts.map(count => count.toLocaleString()),
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Average Frame Compute Time by Agent Count',
                        color: '#e0e0e0',
                        font: {
                            size: 18
                        }
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#e0e0e0',
                            font: {
                                size: 14
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const result = results.find(r => 
                                    r.method === context.dataset.label && 
                                    r.agentCount === agentCounts[context.dataIndex]
                                );
                                const yValue = context.parsed.y ?? 0;
                                if (!result) return `${context.dataset.label}: ${yValue.toFixed(2)} ms`;
                                
                                return [
                                    `${context.dataset.label}: ${result.avgExecutionTime.toFixed(2)} ms (avg)`,
                                    `Min: ${result.minExecutionTime.toFixed(2)} ms`,
                                    `Max: ${result.maxExecutionTime.toFixed(2)} ms`,
                                    `Frames: ${result.frameCount}`
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
                            font: {
                                size: 14
                            }
                        },
                        ticks: {
                            color: '#aaa'
                        },
                        grid: {
                            color: '#444'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Average Execution Time (ms)',
                            color: '#e0e0e0',
                            font: {
                                size: 14
                            }
                        },
                        beginAtZero: true,
                        ticks: {
                            color: '#aaa'
                        },
                        grid: {
                            color: '#444'
                        }
                    }
                }
            }
        });
    }
}
