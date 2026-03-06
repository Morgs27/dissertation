# WebSimBench Benchmark + Tracking Report Schema

This document defines the JSON structure exported by benchmark runs (`schemaVersion: "websimbench.benchmark.v1"`) and the nested `trackingReport` payload used for analysis.

All timing values are in **milliseconds** unless otherwise stated.
All epoch timestamps are **Unix ms** (`Date.now()`).

## 1. Report Layers

The exported JSON has two layers:

1. **Benchmark suite layer**: top-level object (`schemaVersion`, `config`, `runs`, etc.).
2. **Tracking layer**: each `runs[i].trackingReport` with frame/runtime telemetry.

## 2. Top-Level Benchmark Suite Object

| Key              | Type                  | Meaning                                                       |
| ---------------- | --------------------- | ------------------------------------------------------------- |
| `schemaVersion`  | string                | Export format version. Current: `"websimbench.benchmark.v1"`. |
| `simulationName` | string                | Human-readable simulation label passed at benchmark start.    |
| `generatedAt`    | string (ISO datetime) | Time the suite JSON was generated.                            |
| `sourceCode`     | string                | Full DSL/source used for all runs in this suite.              |
| `config`         | object                | Benchmark configuration snapshot used to generate runs.       |
| `runCount`       | number                | Number of run entries exported.                               |
| `runs`           | array                 | Per-run benchmark outputs.                                    |

### 2.1 `config` (BenchmarkConfig)

| Key               | Type     | Meaning                                                                                          |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `agentCounts`     | number[] | Agent counts tested.                                                                             |
| `methods`         | string[] | Compute methods swept (`JavaScript`, `WebWorkers`, `WebAssembly`, `WebGPU`, optionally `WebGL`). |
| `renderModes`     | string[] | Render modes swept (`none`, `cpu`, `gpu`).                                                       |
| `runMode`         | string   | Either `frames` or `duration`.                                                                   |
| `frameCount`      | number   | Frames target when `runMode = "frames"`.                                                         |
| `durationSeconds` | number   | Duration target when `runMode = "duration"`.                                                     |
| `warmup`          | boolean  | Whether warmup pass was enabled.                                                                 |
| `warmupFrames`    | number   | Number of warmup frames (discarded).                                                             |
| `tracking`        | object   | Tracking capture toggles used for each run.                                                      |
| `extras`          | object   | Extra sweep/tuning options (workers, WASM modes, sampling interval).                             |

### 2.2 `config.tracking`

| Key                       | Type    | Meaning                                                                                                                        |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`                 | boolean | Master tracking enable/disable.                                                                                                |
| `captureAgentStates`      | boolean | Clones the internal agent typed arrays (X/Y positions, velocities, species) on every frame. Warning: Massive memory usage.     |
| `captureFrameInputs`      | boolean | Records an exact copy of all runtime input variables passed into Simulation.runFrame() on every frame.                         |
| `captureLogs`             | boolean | Intercepts and records all engine diagnostic warnings and errors as an array.                                                  |
| `captureDeviceMetrics`    | boolean | Collects browser version, OS, hardware concurrency, window sizes, and WebGPU limits at startup.                                |
| `captureRawArrays`        | boolean | Serializes large buffers directly into the report instead of just array metadata summaries. Warning: Massive memory usage.     |
| `captureRuntimeSamples`   | boolean | Enables periodic sampling of the environment (like JS Heap, Battery, and event-loop drift) determined by the interval setting. |
| `captureJsHeapSamples`    | boolean | Collects total JS heap memory constraints over time.                                                                           |
| `captureBatteryStatus`    | boolean | Collects laptop/mobile battery discharging times and charge states.                                                            |
| `captureThermalCanary`    | boolean | Tracks the lag/drift between a setInterval queue and its execution to discover thermal throttling loops.                       |
| `runtimeSampleIntervalMs` | number  | Sampling interval target in ms.                                                                                                |

> **Note on Sampling Frequency vs. Frame Capture:**
>
> The tracking configuration is split into two types of data collection:
>
> **1. Per-Frame Capture**  
> `captureAgentStates`, `captureFrameInputs`, and the engine's built-in performance metrics (timings, GPU memory, bridge transfers) are collected continuously _on every single simulation frame_. These can be memory-intensive.
>
> **2. Interval Sampling**  
> `captureRuntimeSamples`, `captureJsHeapSamples`, `captureBatteryStatus`, and `captureThermalCanary` are collected independently of the frame loop on a separate `setInterval` timer, governed by `runtimeSampleIntervalMs`. We sample these at an interval (default: 1000ms) to avoid degrading benchmark performance limits with expensive browser API calls (like battery probing or `performance.memory`), since these metrics don't change fast enough to warrant per-frame snapshots.

### 2.3 `config.extras`

| Key                    | Type     | Meaning                                                    |
| ---------------------- | -------- | ---------------------------------------------------------- |
| `workerCountsEnabled`  | boolean  | If true, WebWorkers runs sweep over `workerCounts`.        |
| `workerCounts`         | number[] | Candidate worker counts.                                   |
| `wasmSimdSweepEnabled` | boolean  | If true, WebAssembly runs sweep scalar + SIMD modes.       |
| `wasmExecutionMode`    | string   | Default WASM mode when no sweep: `auto`, `scalar`, `simd`. |

## 3. Run Entry (`runs[]`)

| Key                 | Type    | Meaning                                                                               |
| ------------------- | ------- | ------------------------------------------------------------------------------------- |
| `status`            | string  | `completed` or `failed`.                                                              |
| `method`            | string  | Compute backend used in this run.                                                     |
| `renderMode`        | string  | Render mode for this run (`none`, `cpu`, `gpu`).                                      |
| `agentCount`        | number  | Agent count for this run.                                                             |
| `workerCount`       | number? | Present for WebWorkers sweeps.                                                        |
| `wasmExecutionMode` | string? | Present for WebAssembly runs (`auto`, `scalar`, `simd`).                              |
| `executedFrames`    | number  | Frames actually executed (can differ from requested in duration/abort/failure cases). |
| `summary`           | object  | Convenience copy of `trackingReport.summary`.                                         |
| `error`             | string? | Present if run failed.                                                                |
| `trackingReport`    | object  | Full run telemetry payload (defined below).                                           |

## 4. Tracking Report (`runs[i].trackingReport`)

### 4.1 Top-level keys

| Key              | Type    | Meaning                                                           |
| ---------------- | ------- | ----------------------------------------------------------------- |
| `run`            | object  | Run metadata/config snapshot/source.                              |
| `environment`    | object? | Runtime environment/device/browser/GPU/WASM/battery capabilities. |
| `runtimeSamples` | array   | Periodic telemetry samples over run lifetime.                     |
| `frames`         | array   | Per-frame records with performance + optional state snapshots.    |
| `logs`           | array   | Captured logger events (if enabled).                              |
| `errors`         | array   | Captured runtime errors for the run.                              |
| `summary`        | object  | Aggregated statistics for analysis.                               |

### 4.2 `run`

| Key             | Type    | Meaning                                                                       |
| --------------- | ------- | ----------------------------------------------------------------------------- |
| `runId`         | string  | Unique run ID.                                                                |
| `startedAt`     | number  | Run start timestamp (epoch ms).                                               |
| `endedAt`       | number? | Run end timestamp set during finalize.                                        |
| `source`        | object  | Source descriptor (`kind` + code payload).                                    |
| `configuration` | object  | Simulation options + compiler input metadata snapshot.                        |
| `metadata`      | object? | User/app metadata attached to run (e.g. `simulationName`, benchmark details). |

#### `run.source`

| Key    | Type             | Meaning                                                    |
| ------ | ---------------- | ---------------------------------------------------------- |
| `kind` | string           | `dsl` or `custom`.                                         |
| `code` | string or object | DSL text, or custom code object (`js`, `wgsl`, `wasmWat`). |

#### `run.configuration`

| Key                | Type     | Meaning                                                                                             |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------- |
| `options`          | object   | Simulation options used (e.g. `agents`, `workers`, `wasmExecutionMode`, `width`, `height`, `seed`). |
| `requiredInputs`   | string[] | Inputs required by compiled program.                                                                |
| `definedInputs`    | array    | Declared DSL input definitions (`name`, `defaultValue`, optional `min`, `max`).                     |
| `wasmCodeFeatures` | object?  | WAT static feature detection (`simdInstructionsPresent`, `threadsInstructionsPresent`).             |

### 4.3 `environment` (optional)

`environment` is absent if device capture is disabled or collection fails.

#### `environment.device`

| Key                   | Type    | Meaning                                              |
| --------------------- | ------- | ---------------------------------------------------- |
| `runtime`             | string  | `browser`, `node`, or `unknown`.                     |
| `userAgent`           | string? | Browser user agent string.                           |
| `platform`            | string? | OS/platform identifier.                              |
| `hardwareConcurrency` | number? | Logical CPU cores.                                   |
| `deviceMemoryGb`      | number? | Approx. device RAM (browser-provided, if available). |
| `language`            | string? | Browser language.                                    |
| `timezone`            | string? | IANA timezone.                                       |
| `nodeVersion`         | string? | Node version if node runtime.                        |

#### `environment.browser`

| Key                 | Type         | Meaning                                                                               |
| ------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `online`            | boolean?     | Browser-reported network state.                                                       |
| `cookieEnabled`     | boolean?     | Cookie support.                                                                       |
| `doNotTrack`        | string/null? | Browser DNT setting.                                                                  |
| `url`               | string?      | Current document URL at run start.                                                    |
| `referrer`          | string?      | Document referrer.                                                                    |
| `viewport`          | object?      | `{ width, height, devicePixelRatio }` at collection time.                             |
| `performanceMemory` | object?      | Browser memory API snapshot (`jsHeapSizeLimit`, `totalJSHeapSize`, `usedJSHeapSize`). |

#### `environment.gpu` (optional)

| Key                                 | Type   | Meaning                               |
| ----------------------------------- | ------ | ------------------------------------- |
| `vendor`                            | string | GPU vendor info (or `Unknown`).       |
| `architecture`                      | string | GPU architecture info (or `Unknown`). |
| `description`                       | string | GPU description (or `Unknown`).       |
| `maxBufferSize`                     | number | GPU device limit.                     |
| `maxStorageBufferBindingSize`       | number | GPU device limit.                     |
| `maxComputeWorkgroupsPerDimension`  | number | GPU dispatch limit.                   |
| `maxComputeInvocationsPerWorkgroup` | number | GPU workgroup limit.                  |
| `maxComputeWorkgroupSizeX`          | number | GPU workgroup size limit X.           |
| `maxComputeWorkgroupSizeY`          | number | GPU workgroup size limit Y.           |
| `maxComputeWorkgroupSizeZ`          | number | GPU workgroup size limit Z.           |

#### `environment.wasm`

| Key                          | Type    | Meaning                                       |
| ---------------------------- | ------- | --------------------------------------------- |
| `simdSupported`              | boolean | Runtime SIMD capability probe result.         |
| `threadsSupported`           | boolean | Runtime WASM threads capability probe result. |
| `sharedArrayBufferAvailable` | boolean | Whether SAB + Atomics are available.          |

#### `environment.battery` (optional)

| Key               | Type         | Meaning                                                 |
| ----------------- | ------------ | ------------------------------------------------------- |
| `supported`       | boolean      | Whether Battery API is available and query succeeded.   |
| `level`           | number?      | Charge level in `[0,1]`.                                |
| `charging`        | boolean?     | Charging state.                                         |
| `chargingTime`    | number/null? | Seconds until full charge, or null (browser-dependent). |
| `dischargingTime` | number/null? | Seconds until empty, or null (browser-dependent).       |

### 4.4 `runtimeSamples[]`

Each sample records runtime telemetry at a periodic interval.

| Key             | Type    | Meaning                                                                    |
| --------------- | ------- | -------------------------------------------------------------------------- |
| `timestamp`     | number  | Sample wall-clock epoch ms.                                                |
| `elapsedMs`     | number  | Milliseconds since run start.                                              |
| `frameNumber`   | number  | Latest frame number known when sample taken (`-1` if before first frame).  |
| `jsHeap`        | object? | JS heap snapshot (`jsHeapSizeLimit`, `totalJSHeapSize`, `usedJSHeapSize`). |
| `battery`       | object? | Battery sample (`supported`, optional level/charging/times).               |
| `thermalCanary` | object? | Event-loop drift sample.                                                   |

`thermalCanary` fields:

| Key                   | Type   | Meaning                                                                     |
| --------------------- | ------ | --------------------------------------------------------------------------- |
| `intervalMs`          | number | Target sampling interval.                                                   |
| `expectedTimestampMs` | number | Expected `performance.now()` timestamp.                                     |
| `actualTimestampMs`   | number | Actual `performance.now()` when sample executed.                            |
| `driftMs`             | number | `actual - expected`. Higher positive drift indicates scheduling delay/load. |

### 4.5 `frames[]`

| Key              | Type    | Meaning                                                  |
| ---------------- | ------- | -------------------------------------------------------- |
| `frameNumber`    | number  | Zero-based frame index.                                  |
| `timestamp`      | number  | Frame record wall-clock epoch ms.                        |
| `method`         | string  | Compute method used this frame.                          |
| `renderMode`     | string  | Render mode used this frame.                             |
| `inputKeyCount`  | number  | Number of input keys supplied to compute this frame.     |
| `agentPositions` | array?  | Agent state snapshot (if `captureAgentStates=true`).     |
| `inputSnapshot`  | object? | Sanitized input snapshot (if `captureFrameInputs=true`). |
| `performance`    | object? | Per-frame performance/timing/memory details.             |

#### `frames[].agentPositions[]`

| Key       | Type   | Meaning           |
| --------- | ------ | ----------------- |
| `id`      | number | Agent id.         |
| `x`       | number | X position.       |
| `y`       | number | Y position.       |
| `vx`      | number | X velocity.       |
| `vy`      | number | Y velocity.       |
| `species` | number | Species id/index. |

#### `frames[].inputSnapshot` sanitization rules

| Pattern                                      | Stored value                                            |
| -------------------------------------------- | ------------------------------------------------------- |
| Typed arrays with `captureRawArrays=false`   | `{ "type": "Float32Array"/"Uint32Array", "length": N }` |
| `agents` array with `captureRawArrays=false` | `{ "type": "AgentArray", "length": N }`                 |
| Functions                                    | `"[Function]"`                                          |
| Plain primitives/objects                     | JSON-safe copy                                          |

### 4.6 `frames[].performance`

| Key                  | Type    | Meaning                                                                   |
| -------------------- | ------- | ------------------------------------------------------------------------- |
| `method`             | string  | Method that emitted this performance record.                              |
| `agentCount`         | number  | Agents processed this frame.                                              |
| `agentPerformance`   | array   | Per-agent timings (usually empty for current backends).                   |
| `totalExecutionTime` | number  | `setup + compute + readback + render` for frame.                          |
| `frameTimestamp`     | number  | Frame timestamp when performance record was created.                      |
| `setupTime`          | number? | Input/buffer setup/upload time.                                           |
| `computeTime`        | number? | Kernel/compute execution time.                                            |
| `renderTime`         | number? | Rendering time (added by Simulation after compute).                       |
| `readbackTime`       | number? | Time to read results back to host memory.                                 |
| `compileTime`        | number? | One-time compile/init time; usually only first frame per method instance. |
| `specificStats`      | object? | Backend-specific numeric metrics.                                         |
| `bridgeTimings`      | object? | Host/GPU bridge breakdowns (WebGPU path).                                 |
| `memoryStats`        | object? | Memory metrics for the frame.                                             |

#### `performance.bridgeTimings`

| Key                           | Type    | Meaning                                  |
| ----------------------------- | ------- | ---------------------------------------- |
| `hostToGpuTime`               | number? | Total host->GPU API time for frame.      |
| `hostToGpuAgentUploadTime`    | number? | Agent buffer upload portion.             |
| `hostToGpuInputUploadTime`    | number? | Total non-agent input upload portion.    |
| `hostToGpuUniformUploadTime`  | number? | Uniform buffer write portion.            |
| `hostToGpuTrailUploadTime`    | number? | Trail map upload portion.                |
| `hostToGpuRandomUploadTime`   | number? | Random buffer upload portion.            |
| `hostToGpuObstacleUploadTime` | number? | Obstacle buffer upload portion.          |
| `gpuToHostTime`               | number? | Total GPU->host readback API time.       |
| `gpuToHostAgentReadbackTime`  | number? | Agent readback portion.                  |
| `gpuToHostTrailReadbackTime`  | number? | Trail readback portion.                  |
| `gpuToHostLogReadbackTime`    | number? | Log buffer readback portion.             |
| `queueSubmitTime`             | number? | Time spent submitting command buffer(s). |

#### `performance.memoryStats`

| Key                          | Type    | Meaning                                                    |
| ---------------------------- | ------- | ---------------------------------------------------------- |
| `jsHeapSizeLimitBytes`       | number? | Browser JS heap limit snapshot.                            |
| `totalJsHeapSizeBytes`       | number? | Browser total JS heap size snapshot.                       |
| `usedJsHeapSizeBytes`        | number? | Browser used JS heap snapshot.                             |
| `methodMemoryFootprintBytes` | number? | Method memory footprint estimate or exact allocation size. |
| `methodMemoryFootprintType`  | string? | `exact` or `estimate`.                                     |

#### `performance.specificStats` (observed keys)

Key set is method-dependent.

`JavaScript`:

- `JS Execution`
- `Estimated State Footprint (bytes)`

`WebWorkers`:

- `Serialization`
- `Worker Compute`
- `Deserialization`
- `Workers`
- `Estimated Transfer Footprint (bytes)`

`WebAssembly`:

- `Memory Write`
- `WASM Execution`
- `Memory Read`
- `WASM SIMD Memcpy`
- `WASM SIMD Requested` (`0=scalar`, `0.5=auto`, `1=simd`)
- `WASM SIMD Active` (`0` or `1`)
- `WASM SIMD Supported` (`0` or `1`)
- `Linear Memory (bytes)`

`WebGPU`:

- `Buffer Setup`
- `GPU Dispatch`
- `Readback`
- `Host->GPU`
- `GPU->Host`
- `Queue Submit`
- `GPU Memory (bytes)`

### 4.7 `logs[]`

| Key         | Type   | Meaning                                |
| ----------- | ------ | -------------------------------------- |
| `timestamp` | number | Log wall-clock epoch ms.               |
| `level`     | string | `verbose`, `info`, `warning`, `error`. |
| `context`   | string | Logger context name.                   |
| `message`   | string | Formatted log message.                 |

### 4.8 `errors[]`

| Key         | Type    | Meaning                     |
| ----------- | ------- | --------------------------- |
| `timestamp` | number  | Error wall-clock epoch ms.  |
| `message`   | string  | Error message text.         |
| `stack`     | string? | Stack trace when available. |

## 5. `summary` Aggregates

`summary` is present in both:

- `runs[i].summary` (convenience copy), and
- `runs[i].trackingReport.summary` (authoritative source).

| Key                     | Type    | Meaning                                                                     |
| ----------------------- | ------- | --------------------------------------------------------------------------- |
| `frameCount`            | number  | Number of frames included in report/filter.                                 |
| `durationMs`            | number  | `endedAt - startedAt` (non-negative).                                       |
| `totalExecutionMs`      | number  | Sum of `frames[].performance.totalExecutionTime`.                           |
| `averageExecutionMs`    | number  | `totalExecutionMs / frameCount` (or `0` if no frames).                      |
| `errorCount`            | number  | Number of errors recorded for the run.                                      |
| `methodSummaries`       | array   | Per-method aggregates.                                                      |
| `methodRenderSummaries` | array   | Per `(method, renderMode)` aggregates.                                      |
| `frameTimeStats`        | object  | Distribution stats for frame total execution time.                          |
| `inputStats`            | object  | Input key-count and compile input-definition stats.                         |
| `agentStats`            | object  | Agent-count stats across frames.                                            |
| `runtimeSampling`       | object? | Aggregated runtime sample summaries (`jsHeap`, `battery`, `thermalCanary`). |

### 5.1 `methodSummaries[]`

| Key               | Type   | Meaning                                     |
| ----------------- | ------ | ------------------------------------------- |
| `method`          | string | Compute method name.                        |
| `frameCount`      | number | Frames executed with this method.           |
| `avgSetupTime`    | number | Mean `setupTime`.                           |
| `avgComputeTime`  | number | Mean `computeTime`.                         |
| `avgRenderTime`   | number | Mean `renderTime`.                          |
| `avgReadbackTime` | number | Mean `readbackTime`.                        |
| `avgTotalTime`    | number | Mean `totalExecutionTime`.                  |
| `avgCompileTime`  | number | Mean compile time over compile events only. |
| `compileEvents`   | number | Number of frames carrying `compileTime`.    |

### 5.2 `methodRenderSummaries[]`

| Key                             | Type   | Meaning                                                      |
| ------------------------------- | ------ | ------------------------------------------------------------ |
| `method`                        | string | Compute method.                                              |
| `renderMode`                    | string | Render mode.                                                 |
| `frameCount`                    | number | Frames in this method/render bucket.                         |
| `avgSetupTime`                  | number | Mean setup.                                                  |
| `avgComputeTime`                | number | Mean compute.                                                |
| `avgRenderTime`                 | number | Mean render.                                                 |
| `avgReadbackTime`               | number | Mean readback.                                               |
| `avgTotalTime`                  | number | Mean total frame time.                                       |
| `avgHostToGpuBridgeTime`        | number | Mean host->GPU bridge timing.                                |
| `avgGpuToHostBridgeTime`        | number | Mean GPU->host bridge timing.                                |
| `avgMethodMemoryFootprintBytes` | number | Mean method memory footprint across frames with memory data. |

### 5.3 `frameTimeStats`

| Key       | Type   | Meaning                                           |
| --------- | ------ | ------------------------------------------------- |
| `min`     | number | Minimum frame total execution time.               |
| `max`     | number | Maximum frame total execution time.               |
| `average` | number | Mean frame total execution time.                  |
| `stdDev`  | number | Standard deviation of frame total execution time. |
| `p50`     | number | 50th percentile.                                  |
| `p95`     | number | 95th percentile.                                  |
| `p99`     | number | 99th percentile.                                  |

### 5.4 `inputStats`

| Key                   | Type   | Meaning                                                |
| --------------------- | ------ | ------------------------------------------------------ |
| `requiredInputCount`  | number | Count of required runtime inputs from compiler output. |
| `definedInputCount`   | number | Count of declared `input ...` definitions in DSL.      |
| `minKeysPerFrame`     | number | Minimum `inputKeyCount` over frames.                   |
| `maxKeysPerFrame`     | number | Maximum `inputKeyCount` over frames.                   |
| `averageKeysPerFrame` | number | Mean `inputKeyCount`.                                  |

### 5.5 `agentStats`

| Key                     | Type   | Meaning                    |
| ----------------------- | ------ | -------------------------- |
| `minAgentsPerFrame`     | number | Minimum frame agent count. |
| `maxAgentsPerFrame`     | number | Maximum frame agent count. |
| `averageAgentsPerFrame` | number | Mean frame agent count.    |

### 5.6 `runtimeSampling` (optional)

`runtimeSampling` appears when relevant runtime data exists.

#### `runtimeSampling.jsHeap`

| Key            | Type   | Meaning                          |
| -------------- | ------ | -------------------------------- |
| `sampleCount`  | number | Number of heap samples included. |
| `startBytes`   | number | First sample `usedJSHeapSize`.   |
| `endBytes`     | number | Last sample `usedJSHeapSize`.    |
| `deltaBytes`   | number | `endBytes - startBytes`.         |
| `minBytes`     | number | Minimum sampled heap usage.      |
| `maxBytes`     | number | Maximum sampled heap usage.      |
| `averageBytes` | number | Mean sampled heap usage.         |

#### `runtimeSampling.battery`

| Key             | Type     | Meaning                                      |
| --------------- | -------- | -------------------------------------------- |
| `supported`     | boolean  | Whether any sample had battery API support.  |
| `sampleCount`   | number   | Number of battery samples included.          |
| `startLevel`    | number?  | First sampled battery level.                 |
| `endLevel`      | number?  | Last sampled battery level.                  |
| `deltaLevel`    | number?  | `endLevel - startLevel` when both available. |
| `startCharging` | boolean? | Charging state at first battery sample.      |
| `endCharging`   | boolean? | Charging state at last battery sample.       |

#### `runtimeSampling.thermalCanary`

| Key                          | Type   | Meaning                                 |
| ---------------------------- | ------ | --------------------------------------- |
| `sampleCount`                | number | Number of canary drift samples.         |
| `sampleIntervalMs`           | number | Configured sample interval.             |
| `avgDriftMs`                 | number | Mean drift.                             |
| `p95DriftMs`                 | number | 95th percentile drift.                  |
| `maxDriftMs`                 | number | Maximum drift.                          |
| `throttlingEvents`           | number | Count of drift samples above threshold. |
| `throttlingEventThresholdMs` | number | Threshold used for event counting.      |

## 6. Optional/Missing Data Rules

- Any field marked `?` may be absent from JSON.
- `undefined` values are omitted by JSON serialization.
- Some browser APIs return `null` values (`chargingTime`, `dischargingTime`), which are preserved.
- Failed runs still emit a `trackingReport`; these may have empty `frames` and zeroed summary metrics but should include `errors`.

## 7. Interpretation Notes for Data Science

- Use `trackingReport.summary` as the canonical aggregate, and `runs[i].summary` as convenience duplicate.
- For long duration runs, compute trends from `runtimeSamples` + `frames` time series.
- `WASM SIMD Requested/Active/Supported` should be used together to segment scalar-vs-SIMD experiments correctly.
- Browser-level CPU/GPU utilization percentages are not directly exposed; use timing proxies (`computeTime`, bridge timings, canary drift) plus external profilers if needed.
