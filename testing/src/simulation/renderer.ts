import Logger from "./logger";
import type { Agent } from "./types";

const BACKGROUND_COLOR = 'blue';
const AGENT_COLOR = 'red';
const AGENT_RADIUS = 1;

export class Renderer {
    canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D | null = null;
    Logger: Logger;

    constructor(canvas: HTMLCanvasElement) {
        this.Logger = new Logger('Renderer');

        this.canvas = canvas;
    }

    renderBackground() {
        const ctx = this.ensureContext();

        this.Logger.log('Rendering background');

        ctx.fillStyle = BACKGROUND_COLOR;

        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderAgents(agents: Agent[]) {
        const ctx = this.ensureContext();

        this.Logger.log('Rendering agents', agents);
        
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.renderBackground();

        ctx.fillStyle = AGENT_COLOR;

        agents.forEach(agent => {
            ctx.beginPath();
            ctx.arc(agent.x, agent.y, AGENT_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    private ensureContext(): CanvasRenderingContext2D {
        if (!this.ctx) {
            const context = this.canvas.getContext('2d');

            if (!context) {
                const message = '2D rendering context not available';
                this.Logger.error(message);
                throw new Error(message);
            }

            this.ctx = context;
        }

        return this.ctx;
    }
}

export default Renderer;
