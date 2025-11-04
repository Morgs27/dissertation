import { Chart } from 'chart.js';
import type { FramePerformance } from '../performance.ts';
import Logger from './logger.ts';
import { registerables } from 'chart.js';

Chart.register(...registerables);

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
}
