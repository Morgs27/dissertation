import Logger from "./logger";
import type { Agent } from "./types";

export class Renderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    Logger: Logger;

    constructor(canvas: HTMLCanvasElement) {
        this.Logger = new Logger('Renderer');

        this.canvas = canvas;

        const context = canvas.getContext('2d');
    
        if (!context) {
            throw new Error('Failed to get 2D context');
        }

        this.ctx = context;
    }

    renderBackground() {
        this.Logger.log('render background');
        this.ctx.fillStyle = 'blue';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    renderAgents(agents: Agent[]) {
        this.Logger.log('render agents', agents);
        this.ctx.fillStyle = 'red';

        agents.forEach(agent => {
            this.ctx.beginPath();
            this.ctx.arc(agent.x, agent.y, 5, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
}

export default Renderer;