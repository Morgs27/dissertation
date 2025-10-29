import Simulation from "./simulation";

const main = () => {
    const canvas = document.querySelector('#simulationCanvas');

    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Canvas element not found');
    }

    const options = {
        agents: 1000000
    };

    const AGENT_DSL = `
       moveRight(4)
       moveDown(inputs.gravity)
    `

    const simulation = new Simulation({
        canvas,
        options,
        agentScript: AGENT_DSL
    });

    const FPS = 100;

    const run = setInterval(() => {
        const inputValues = {
            gravity: 9.8,
        };

        void simulation.runFrame("JavaScript", inputValues, "gpu");
    }, 1000 / FPS);

    document.addEventListener('keydown', (event) => {
        if (event.code === 'Space') {
            clearInterval(run);
        }
    });
};

document.addEventListener('DOMContentLoaded', main);
