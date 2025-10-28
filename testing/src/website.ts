import Simulation from "./simulation";

const main = () => {
    const canvas = document.querySelector('#simulationCanvas');

    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Canvas element not found');
    }

    const options = {
        agents: 10
    }

    const inputs = [
        {
            type: "number" as const,
            name: 'gravity',
            label: 'Gravity',
            default: 2,
        }
    ]

    const AGENT_DSL = `
       moveUp(1);
       moveDown(gravity);
    `
    
    const simulation = new Simulation({
        canvas,
        options,
        inputs,
        agentScript: AGENT_DSL
    });
    
    setInterval(() => {
        const inputValues = [
            {
                gravity: 2
            }
        ];

        simulation.runFrame("JavaScript", inputValues);
    }, 1000 / 1); // 1 FPS
};

document.addEventListener('DOMContentLoaded', main);
