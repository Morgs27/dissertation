/**
 * @module webWorkers
 * Web Workers compute backend.
 *
 * Spawns a pool of {@link Worker} instances, distributes agent slices
 * across them, and merges results. The compiled agent function is
 * serialised as source and re-compiled inside each worker via
 * `new Function()`.
 */

import type { Agent, InputValues } from "../types";
import type { AgentFunction } from "./compute";
import Logger from "../helpers/logger";

const WorkerScript = `
    let compiledAgentFunction = null;

    self.onmessage = function(event) {
        const data = event.data;

        if (data.type === 'init') {
            try {
                compiledAgentFunction = new Function('return (' + data.agentFunction + ')')();
                self.postMessage({ type: 'init_ack', requestId: data.requestId });
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    requestId: data.requestId,
                    message: error && error.message ? error.message : String(error)
                });
            }
            return;
        }

        if (data.type !== 'compute') {
            return;
        }

        if (!compiledAgentFunction) {
            self.postMessage({
                type: 'error',
                requestId: data.requestId,
                message: 'Worker is not initialized'
            });
            return;
        }

        const { requestId, agents, inputValues, trailMapRead } = data;
        const localInputs = { ...inputValues };

        if (trailMapRead) {
            localInputs.trailMapRead = trailMapRead;
        }

        const width = typeof localInputs.width === 'number' ? localInputs.width : 0;
        const height = typeof localInputs.height === 'number' ? localInputs.height : 0;
        const mapSize = width * height;
        const depositDelta = mapSize > 0 ? new Float32Array(mapSize) : undefined;

        if (depositDelta) {
            localInputs.trailMapWrite = depositDelta;
        }

        localInputs.print = (id, val) => {
            self.postMessage({
                type: 'log',
                requestId,
                level: 'info',
                message: 'AGENT[' + id + '] PRINT: ' + val
            });
        };

        const start = performance.now();
        const updatedAgents = agents.map(agent => compiledAgentFunction(agent, localInputs));
        const end = performance.now();

        self.postMessage({
            type: 'result',
            requestId,
            agents: updatedAgents,
            depositDelta,
            executionTime: end - start
        });
    };
`;

/** @internal Error response from a worker thread. */
type WorkerErrorMessage = {
  type: "error";
  requestId: number;
  message: string;
};

/** @internal Log message forwarded from a worker thread. */
type WorkerLogMessage = {
  type: "log";
  requestId: number;
  level: "info" | "warn" | "error";
  message: string;
};

/** @internal Compute result containing updated agents and timing. */
type WorkerResultMessage = {
  type: "result";
  requestId: number;
  agents: Agent[];
  depositDelta?: Float32Array;
  executionTime: number;
};

/** @internal Acknowledgement that a worker initialised successfully. */
type WorkerInitAckMessage = {
  type: "init_ack";
  requestId: number;
};

type WorkerResponseMessage =
  | WorkerErrorMessage
  | WorkerLogMessage
  | WorkerResultMessage
  | WorkerInitAckMessage;

/** Result of a Web Workers compute dispatch with timing breakdown. */
export type WorkerComputeResult = {
  agents: Agent[];
  trailMap?: Float32Array;
  performance: {
    serializationTime: number;
    workerTime: number;
    deserializationTime: number;
  };
};

/**
 * Web Workers compute backend.
 *
 * Distributes agent update work across a configurable number of worker
 * threads. Each worker receives a serialised copy of the compiled agent
 * function and independently processes its slice of the agent array.
 */
class WebWorkers {
  private readonly logger: Logger;
  private workers: Worker[];
  private readonly workerCount: number;
  private readonly agentFunctionSource: string;
  private readonly workerScriptUrl: string;
  private readonly initPromise: Promise<void>;
  private nextRequestId = 1;

  constructor(agentFunction: AgentFunction, workerCount?: number) {
    this.logger = new Logger("WebWorkersComputeEngine");
    this.workerCount = workerCount ?? navigator.hardwareConcurrency ?? 4;
    this.agentFunctionSource = agentFunction.toString();

    const workerSetup = this.createWorkers(this.workerCount);
    this.workers = workerSetup.workers;
    this.workerScriptUrl = workerSetup.scriptUrl;

    this.initPromise = this.initializeWorkers();
  }

  /**
   * Distribute agents across workers and collect results.
   *
   * @param agents - Current agent array.
   * @param inputValues - Per-frame input values.
   * @returns Merged agent array, optional trail-map deltas, and timing.
   */
  async compute(
    agents: Agent[],
    inputValues: InputValues,
  ): Promise<WorkerComputeResult> {
    await this.initPromise;

    if (agents.length === 0) {
      return {
        agents,
        performance: {
          serializationTime: 0,
          workerTime: 0,
          deserializationTime: 0,
        },
      };
    }

    return new Promise<WorkerComputeResult>((resolve, reject) => {
      const activeWorkers = Math.min(
        this.workers.length,
        Math.max(1, agents.length),
      );
      const agentsPerWorker = Math.ceil(agents.length / activeWorkers);

      const requestId = this.nextRequestId++;
      const sanitizedInputValues = this.sanitizeWorkerInputs(inputValues);
      const trailMapRead = inputValues.trailMapRead as Float32Array | undefined;

      const startTime = performance.now();
      let completedWorkers = 0;
      let maxWorkerTime = 0;
      let settled = false;

      const results: {
        index: number;
        agents: Agent[];
        depositDelta?: Float32Array;
        time: number;
      }[] = [];
      const assignedWorkers: Worker[] = [];

      const cleanup = () => {
        for (const worker of assignedWorkers) {
          worker.onmessage = null;
          worker.onerror = null;
        }
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      for (let index = 0; index < activeWorkers; index++) {
        const start = index * agentsPerWorker;
        const end = Math.min(start + agentsPerWorker, agents.length);

        if (start >= end) {
          continue;
        }

        const worker = this.workers[index];
        assignedWorkers.push(worker);
        const agentsSlice = agents.slice(start, end);

        worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
          const data = event.data;

          if (!data || data.requestId !== requestId) {
            return;
          }

          if (data.type === "log") {
            if (data.level === "info") this.logger.info(data.message);
            else if (data.level === "warn") this.logger.warn(data.message);
            else this.logger.error(data.message);
            return;
          }

          if (data.type === "error") {
            fail(new Error(data.message));
            return;
          }

          if (data.type !== "result") {
            return;
          }

          results.push({
            index,
            agents: data.agents,
            depositDelta: data.depositDelta,
            time: data.executionTime,
          });
          maxWorkerTime = Math.max(maxWorkerTime, data.executionTime);
          completedWorkers++;

          if (completedWorkers !== assignedWorkers.length || settled) {
            return;
          }

          settled = true;
          cleanup();

          const endTime = performance.now();
          results.sort((a, b) => a.index - b.index);
          const finalAgents = results.flatMap((r) => r.agents);

          let finalTrailMap: Float32Array | undefined;
          const deltasWithData = results.filter((r) => r.depositDelta);

          if (deltasWithData.length > 0) {
            const mapLength = deltasWithData[0].depositDelta!.length;
            finalTrailMap = new Float32Array(mapLength);

            for (const result of deltasWithData) {
              const delta = result.depositDelta!;
              for (let i = 0; i < mapLength; i++) {
                finalTrailMap[i] += delta[i];
              }
            }
          }

          const totalTime = endTime - startTime;
          const overhead = Math.max(0, totalTime - maxWorkerTime);

          resolve({
            agents: finalAgents,
            trailMap: finalTrailMap,
            performance: {
              serializationTime: overhead / 2,
              workerTime: maxWorkerTime,
              deserializationTime: overhead / 2,
            },
          });
        };

        worker.onerror = (error: ErrorEvent) => {
          fail(new Error(error.message));
        };

        worker.postMessage({
          type: "compute",
          requestId,
          agents: agentsSlice,
          inputValues: sanitizedInputValues,
          trailMapRead,
        });
      }

      if (assignedWorkers.length === 0) {
        resolve({
          agents,
          performance: {
            serializationTime: 0,
            workerTime: 0,
            deserializationTime: 0,
          },
        });
      }
    });
  }

  /** Terminate all worker threads and free resources. */
  destroy() {
    for (const worker of this.workers) {
      worker.terminate();
    }

    this.workers = [];
    URL.revokeObjectURL(this.workerScriptUrl);
  }

  private sanitizeWorkerInputs(inputValues: InputValues): InputValues {
    const sanitized: InputValues = {};

    for (const [key, value] of Object.entries(inputValues)) {
      if (
        key === "print" ||
        key === "trailMap" ||
        key === "trailMapRead" ||
        key === "trailMapWrite"
      ) {
        continue;
      }
      sanitized[key] = value;
    }

    return sanitized;
  }

  private async initializeWorkers(): Promise<void> {
    const initJobs = this.workers.map((worker, index) => {
      return new Promise<void>((resolve, reject) => {
        const requestId = this.nextRequestId++;

        const onMessage = (event: MessageEvent<WorkerResponseMessage>) => {
          const data = event.data;
          if (!data || data.requestId !== requestId) {
            return;
          }

          cleanup();

          if (data.type === "init_ack") {
            resolve();
            return;
          }

          if (data.type === "error") {
            reject(
              new Error(
                `Worker ${index} failed to initialize: ${data.message}`,
              ),
            );
            return;
          }

          reject(new Error(`Worker ${index} sent unexpected init response.`));
        };

        const onError = (error: ErrorEvent) => {
          cleanup();
          reject(
            new Error(`Worker ${index} initialization error: ${error.message}`),
          );
        };

        const cleanup = () => {
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
        };

        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onError);

        worker.postMessage({
          type: "init",
          requestId,
          agentFunction: this.agentFunctionSource,
        });
      });
    });

    await Promise.all(initJobs);
    this.logger.info(`Initialized ${this.workers.length} web workers.`);
  }

  /** Create worker threads from an inline Blob script. */
  private createWorkers(numWorkers: number): {
    workers: Worker[];
    scriptUrl: string;
  } {
    this.logger.info(`Creating ${numWorkers} web workers.`);

    const scriptUrl = URL.createObjectURL(
      new Blob([WorkerScript], { type: "application/javascript" }),
    );
    const workers: Worker[] = [];

    for (let i = 0; i < numWorkers; i++) {
      workers.push(new Worker(scriptUrl));
    }

    return { workers, scriptUrl };
  }
}

export default WebWorkers;
