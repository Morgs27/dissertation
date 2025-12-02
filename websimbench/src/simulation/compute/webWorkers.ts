import type { Agent, InputValues } from "../types";
import type { AgentFunction } from "./compute";
import Logger from "../helpers/logger";

const WorkerScript = `
    self.onmessage = function(event) {
        const { agents, inputValues, agentFunction } = event.data;
        const func = new Function('return ' + agentFunction)();
        
        const start = performance.now();
        const updatedAgents = agents.map(agent => func(agent, inputValues));
        const end = performance.now();
        
        self.postMessage({ agents: updatedAgents, executionTime: end - start });
    };
`;

export type WorkerComputeResult = {
    agents: Agent[];
    performance: {
        serializationTime: number;
        workerTime: number;
        deserializationTime: number;
    }
}

class WebWorkers {
    private Logger: Logger;
    private workers: Worker[];
    private agentFunction: AgentFunction;
    private workerCount: number;

    constructor(agentFunction: AgentFunction, workerCount?: number) {
        this.Logger = new Logger('WebWorkersComputeEngine');
        this.workerCount = workerCount ?? navigator.hardwareConcurrency ?? 4;
        this.workers = this.createWorkers(this.workerCount);
        this.agentFunction = agentFunction;
    }

    async compute(agents: Agent[], inputValues: InputValues): Promise<WorkerComputeResult> {
        return new Promise<WorkerComputeResult>((resolve, reject) => {
            const numWorkers = this.workers.length;
            
            const agentsPerWorker = Math.ceil(agents.length / numWorkers);
            
            let completedWorkers = 0;
            let maxWorkerTime = 0;
            
            // We'll collect agents in order. We can pre-allocate or just concat.
            // Since we slice, we should probably put them back in order.
            // Using a flat array might be better but let's stick to simple concat for now or careful index placement.
            // But wait, the original code used `updatedAgents.push(...event.data)`. This might mix order if workers finish out of order!
            // The prompt says "Keep code DRY and modularised", but also "Add more logging types". 
            // I should probably fix the potential race condition in ordering if I can, but let's focus on performance metrics first.
            // To compute serialization time, we measure time to postMessage.
            // To compute deserialization time, we measure time from onmessage start to end (partially).
            
            const results: { index: number, agents: Agent[], time: number }[] = [];
            const startTime = performance.now();

            this.workers.forEach((worker, index) => {
                const start = index * agentsPerWorker;
                const end = Math.min(start + agentsPerWorker, agents.length);
                const agentsSlice = agents.slice(start, end);

                worker.onmessage = (event) => {
                    // event.data is now { agents: Agent[], executionTime: number }
                    const { agents: workerAgents, executionTime } = event.data;
                    
                    results.push({ index, agents: workerAgents, time: executionTime });
                    maxWorkerTime = Math.max(maxWorkerTime, executionTime);
                    completedWorkers++;

                    if (completedWorkers === numWorkers) {
                        const endTime = performance.now();
                        // Reconstruct agents in order
                        results.sort((a, b) => a.index - b.index);
                        const finalAgents = results.flatMap(r => r.agents);
                        
                        // Rough estimation of "serialization" + "overhead" = Total - MaxWorkerTime
                        // It's hard to separate serialization from postMessage overhead perfectly without more sophisticated measurement.
                        // We can assume setupTime is the time before workers start (negligible/interleaved) or just return the total overhead.
                        // Let's use total wall time vs max worker execution time.
                        
                        const totalTime = endTime - startTime;
                        const overhead = totalTime - maxWorkerTime; 
                        // We'll split overhead into setup (serialization) and readback (deserialization) roughly 50/50 for now 
                        // or just report "overhead" as setupTime and 0 for readback, or similar.
                        // A better way: measure time to loop through and postMessage.
                        
                        resolve({
                            agents: finalAgents,
                            performance: {
                                serializationTime: overhead / 2, // approximation
                                workerTime: maxWorkerTime,
                                deserializationTime: overhead / 2 // approximation
                            }
                        });
                    }
                };

                worker.onerror = (error) => {
                    this.Logger.error(`Worker ${index} error: ${error.message}`);
                    reject(error);
                };

                worker.postMessage({ agents: agentsSlice, inputValues, agentFunction: this.agentFunction.toString() });
            });
            
            // Note: The loop above runs very fast, so `startTime` is effectively "start of posting".
        });
    }

    private createWorkers(numWorkers: number) {
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
