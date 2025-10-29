import type { Agent, InputValues } from "../types";
import type { AgentFunction } from "./compute";
import Logger from "../helpers/logger";

const WorkerScript = `
    self.onmessage = function(event) {
        const { agents, inputValues, agentFunction } = event.data;
        const func = new Function('return ' + agentFunction)();
        
        const updatedAgents = agents.map(agent => func(agent, inputValues));
        
        self.postMessage(updatedAgents);
    };
`;

class WebWorkers {
    private Logger: Logger;
    private workers: Worker[];
    private agentFunction: AgentFunction;

    constructor(agentFunction: AgentFunction) {
        this.Logger = new Logger('WebWorkersComputeEngine');
        this.workers = this.createWorkers();
        this.agentFunction = agentFunction;
    }

    async compute(agents: Agent[], inputValues: InputValues): Promise<Agent[]> {
        return new Promise<Agent[]>((resolve, reject) => {
            const numWorkers = this.workers.length;
            
            const agentsPerWorker = Math.ceil(agents.length / numWorkers);
            
            let completedWorkers = 0;
            
            const updatedAgents: Agent[] = [];

            this.workers.forEach((worker, index) => {
                
                const start = index * agentsPerWorker;
                const end = Math.min(start + agentsPerWorker, agents.length);
                const agentsSlice = agents.slice(start, end);

                worker.onmessage = (event) => {
                    updatedAgents.push(...event.data);
                    completedWorkers++;

                    if (completedWorkers === numWorkers) {
                        resolve(updatedAgents);
                    }
                };

                worker.onerror = (error) => {
                    this.Logger.error(`Worker ${index} error: ${error.message}`);
                    reject(error);
                };

                worker.postMessage({ agents: agentsSlice, inputValues, agentFunction: this.agentFunction.toString() });
            });
        });
    }

    private createWorkers() {
        const numWorkers = navigator.hardwareConcurrency || 4;

        this.Logger.info(`Creating ${numWorkers} web workers.`);

        const workers: Worker[] = [];

        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker(
                URL.createObjectURL(new Blob([WorkerScript], { type: 'application/javascript' }))
            );
            workers.push(worker);
        }

        return workers;
    }
}

export default WebWorkers;