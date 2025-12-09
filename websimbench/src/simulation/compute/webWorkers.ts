import type { Agent, InputValues } from "../types";
import type { AgentFunction } from "./compute";
import Logger from "../helpers/logger";

const WorkerScript = `
    self.onmessage = function(event) {
        const { agents, inputValues, agentFunction, trailMapRead } = event.data;
        const func = new Function('return ' + agentFunction)();
        
        // Create a fresh delta buffer for deposits (starts at zero)
        const width = inputValues.width || 0;
        const height = inputValues.height || 0;
        const mapSize = width * height;
        const depositDelta = mapSize > 0 ? new Float32Array(mapSize) : undefined;
        
        // Setup double-buffered inputs for the agent function:
        // - trailMapRead: baseline for sensing (previous frame state)
        // - trailMapWrite: delta buffer for deposits
        if (trailMapRead) {
            inputValues.trailMapRead = trailMapRead;
        }
        if (depositDelta) {
            inputValues.trailMapWrite = depositDelta;
        }
        
        const start = performance.now();
        const updatedAgents = agents.map(agent => func(agent, inputValues));
        const end = performance.now();
        
        // Return agents and deposit delta (not the full map)
        self.postMessage({ 
            agents: updatedAgents, 
            depositDelta,
            executionTime: end - start 
        });
    };
`;

export type WorkerComputeResult = {
    agents: Agent[];
    trailMap?: Float32Array;
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

            // Extract trailMapRead for passing to workers (the baseline for sensing)
            const trailMapRead = inputValues.trailMapRead as Float32Array | undefined;

            const results: { index: number, agents: Agent[], depositDelta?: Float32Array, time: number }[] = [];
            const startTime = performance.now();

            this.workers.forEach((worker, index) => {
                const start = index * agentsPerWorker;
                const end = Math.min(start + agentsPerWorker, agents.length);
                const agentsSlice = agents.slice(start, end);

                worker.onmessage = (event) => {
                    // event.data now returns depositDelta (not full trailMap)
                    const { agents: workerAgents, depositDelta, executionTime } = event.data;

                    results.push({ index, agents: workerAgents, depositDelta, time: executionTime });
                    maxWorkerTime = Math.max(maxWorkerTime, executionTime);
                    completedWorkers++;

                    if (completedWorkers === numWorkers) {
                        const endTime = performance.now();

                        // Reconstruct agents in order
                        results.sort((a, b) => a.index - b.index);
                        const finalAgents = results.flatMap(r => r.agents);

                        // Sum all deposit deltas from workers
                        // This is the correct approach: each worker returns only their deposits,
                        // and we sum them to get total deposits for this frame
                        let finalTrailMap: Float32Array | undefined = undefined;
                        const deltasWithData = results.filter(r => r.depositDelta);

                        if (deltasWithData.length > 0) {
                            const mapLength = deltasWithData[0].depositDelta!.length;
                            finalTrailMap = new Float32Array(mapLength);

                            // Sum all deltas (this is correct for additive deposits)
                            for (const result of deltasWithData) {
                                const delta = result.depositDelta!;
                                for (let i = 0; i < mapLength; i++) {
                                    finalTrailMap[i] += delta[i];
                                }
                            }
                        }

                        const totalTime = endTime - startTime;
                        const overhead = totalTime - maxWorkerTime;

                        resolve({
                            agents: finalAgents,
                            trailMap: finalTrailMap,
                            performance: {
                                serializationTime: overhead / 2,
                                workerTime: maxWorkerTime,
                                deserializationTime: overhead / 2
                            }
                        });
                    }
                };

                worker.onerror = (error) => {
                    this.Logger.error(`Worker ${index} error: ${error.message}`);
                    reject(error);
                };

                // Pass trailMapRead separately so workers can set up double-buffering
                worker.postMessage({
                    agents: agentsSlice,
                    inputValues,
                    agentFunction: this.agentFunction.toString(),
                    trailMapRead
                });
            });
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
