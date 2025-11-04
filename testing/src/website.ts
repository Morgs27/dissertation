import Simulation from "./simulation";

var simulationInterval: any = null;

const options = {
    agents: 100000
};

const AGENT_DSL = `
       moveDown(inputs.gravity)
    `

const FPS = 1;

const simulation = new Simulation({
    canvas: document.querySelector('#simulationCanvas') as HTMLCanvasElement,
    options,
    agentScript: AGENT_DSL
});

document.getElementById('startButton')?.addEventListener('click', () => {
    if (simulationInterval) return;

    simulationInterval = setInterval(() => {
        const inputValues = {
            gravity: 9.8,
        };

        void simulation.runFrame("JavaScript", inputValues, "cpu");
    }, 1000 / FPS);
});

document.getElementById('stopButton')?.addEventListener('click', () => {
    clearInterval(simulationInterval!);

    simulation.renderFrameGraph();
});
