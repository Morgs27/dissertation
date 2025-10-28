import Logger from "./logger";
import type { Agent } from "./types";

const BACKGROUND_COLOR = 'blue';
const AGENT_COLOR = 'red';
const AGENT_RADIUS = 5;

export class Renderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    Logger: Logger;

    constructor(canvas: HTMLCanvasElement) {
        this.Logger = new Logger('Renderer');

        this.canvas = canvas;

        const context = canvas.getContext('2d');
    
        if (!context) {
            const message = '2D rendering context not available';
            this.Logger.error(message);
            throw new Error(message);
        }

        this.ctx = context;
    }

    renderBackground() {
        this.Logger.log('Rendering background');

        this.ctx.fillStyle = BACKGROUND_COLOR;

        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderAgents(agents: Agent[]) {
        this.Logger.log('Rendering agents', agents);
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.renderBackground();

        this.ctx.fillStyle = AGENT_COLOR;

        agents.forEach(agent => {
            this.ctx.beginPath();
            this.ctx.arc(agent.x, agent.y, AGENT_RADIUS, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
}

export default Renderer;