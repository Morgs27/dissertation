import Simulation from "./simulation";

const main = () => {
    const canvas = document.querySelector('#simulationCanvas');

    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Canvas element not found');
    }

    const options = {
        agents: 100000
    };

    const AGENT_DSL = `
       // Variable gravity comes from the input
       // We also get width & height as default inputs
       moveRight(2)
       moveDown(inputs.gravity)
    `
    
    const simulation = new Simulation({
        canvas,
        options,
        agentScript: AGENT_DSL
    });

    const FPS = .5;
    
    const run = setInterval(() => {
        const inputValues = {
            gravity: Math.random() * 30
        };

        void simulation.runFrame("WebWorkers", inputValues);
    }, 1000 / FPS);

    document.addEventListener('keydown', (event) => {
        if (event.code === 'Space') {
            clearInterval(run);
        }
    });
};

document.addEventListener('DOMContentLoaded', main);
