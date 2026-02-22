# Agentyx

A high-performance, cross-backend agent-based simulation engine for the web. Agentyx provides a custom Domain Specific Language (DSL) to define agent behaviors, which are automatically compiled to JavaScript, WebWorkers, WebAssembly, and WebGPU compute shaders depending on required performance and scale.

## 1. Setup

Install the library via NPM:

```bash
npm i @websimbench/agentyx
```

## 2. Examples
Agentyx ships with several minimal, dependency-free examples. You can view these live in the browser via WebSimBench:

1. [Basic Setup](https://morgs27.github.io/dissertation/examples/1-basic/index.html) — Minimum code to spawn 5,000 agents.
2. [Handling Inputs](https://morgs27.github.io/dissertation/examples/2-handling-inputs/index.html) — Connect HTML sliders to DSL parameters `speed` and `turnAngle` in real time.
3. [Changing Styles](https://morgs27.github.io/dissertation/examples/3-changing-styles/index.html) — Update themes and geometry without reloading.
4. [Logging Panel](https://morgs27.github.io/dissertation/examples/4-logging-panel/index.html) — Intercept the DSL `print()` pipeline into the HTML DOM.
5. [Benchmarking](https://morgs27.github.io/dissertation/examples/5-benchmarking/index.html) — Print active timings for Compute, Memory Readbacks, and Render.
6. [Multi-Species](https://morgs27.github.io/dissertation/examples/6-species/index.html) — Utilize the built-in `species` variable to drive different behaviours.
7. [Trail Maps](https://morgs27.github.io/dissertation/examples/7-trail-maps/index.html) — 250,000 agents doing classical physarum (slime-mold) simulation.
8. [Random Values](https://morgs27.github.io/dissertation/examples/8-random-values/index.html) — Connecting `Math.random` generated hosts into the DSL random function.

## 3. Quick Start

Agentyx requires an HTML5 Canvas to render the simulation and a custom DSL script to define agent behavior.

```typescript
import { Simulation } from '@websimbench/agentyx';

// 1. Define agent behavior using the custom DSL
const dslScript = \`
  input speed = 2;
  input turnAngle = 0.5;

  moveForward(inputs.speed);
  turn(inputs.turnAngle);
  borderWrapping();
\`;

// 2. Initialize the environment
const canvas = document.getElementById('my-canvas') as HTMLCanvasElement;
const gpuCanvas = document.getElementById('my-gpu-canvas') as HTMLCanvasElement; // For WebGPU rendering only

const simulation = new Simulation({
  canvas,
  gpuCanvas,
  agentScript: dslScript,
  options: { agents: 5000 },
  appearance: {
    agentColor: [255, 100, 100],
    backgroundColor: [0, 0, 0, 1],
    agentSize: 2.0,
    agentShape: "circle",
    showTrails: false
  }
});

// 3. Initialize GPU Context (If rendering or computing via WebGPU)
await simulation.initGPU();

// 4. Run the render/compute loop
async function runLoop() {
  // Method can be: "JavaScript", "WebWorkers", "WebAssembly", or "WebGPU"
  // RenderMode can be: "cpu" or "gpu"
  await simulation.runFrame("WebGPU", { speed: 3, turnAngle: 0.2 }, "gpu");
  
  requestAnimationFrame(runLoop);
}

runLoop();
```

## 3. Simulation Options

When instantiating the `Simulation`, you can customize the domain bounds and initial inputs via the `options` parameter.

```typescript
const options = {
  agents: 10000,      // Number of agents to spawn
  width: 800,         // Domain width (default: canvas width)
  height: 600,        // Domain height (default: canvas height)
  minVelocity: -1.0,  // Setup params for random initialization
  maxVelocity: 1.0 
};
```

You can update variables and parameters for the DSL script on every frame by passing them into `simulation.runFrame(method, inputs, renderMode)`.

## 4. Render Options

You can control appearance dynamically without restarting the simulation.

```typescript
simulation.updateAppearance({
  agentColor: [255, 255, 255],     // Primary agent color
  backgroundColor: [10, 10, 10, 1], // Background color
  agentSize: 1.5,                  // Render scale
  agentShape: "triangle",          // "circle", "square", or "triangle"
  showTrails: true,                // Enable trail/pheromone map rendering
  trailColor: [0, 255, 255],       // Color of the trail map
  speciesColors: [                 // For multi-species simulations
    [255, 0, 0], [0, 255, 0], [0, 0, 255]
  ]
});
```

WebGPU rendering enables zero-copy execution where agents stay on the GPU (`renderMode = "gpu"`). If relying entirely on the CPU or WASM, `renderMode = "cpu"` writes drawn shapes directly to a 2D context.

## 5. Logging & Errors

Agentyx exposes internal logging and tracks simulation performance. The `Logger` class captures startup sequences and errors automatically.

**DSL Console Printing**: Within your simulation script, you can print values out to the console using the built-in `print()` function:
```javascript
var angle = atan2(vy, vx);
print(angle); 
```
*Note: Printing from `WebWorkers` or `WebGPU` methods may have a performance penalty or require CPU readback.*

## 6. Benchmarking / Reporting

The built-in `PerformanceMonitor` records exact timings breakdown for set-up, computation, memory transfers, and rendering.

```typescript
const monitor = simulation.getPerformanceMonitor();

// Log metrics to console automatically during execution
monitor.enableLogging(true);

// Print a cumulative overview when the simulation finishes
monitor.printSummary();

// Get the raw performance dataset
const history = monitor.getHistory();
```

Inside the dataset `history`, you have access to `frameDetails` mapping metrics like `computeTime`, `renderTime`, and `readbackTime` for each backend.

## 7. DSL Language Documentation

Agentyx uses a simple, strongly-typed imperative script language focused on high-performance vector operations and array parallelization.

### Inputs & Constants
Declare external inputs. You can supply limits for the UI (e.g. `[0, 100]`), but they act as defaults:
```js
input speed = 2 [0, 5];
input sensorAngle = 0.6;
```

### Variables & Conditionals
```js
var avgX = mean(nearbyAgents.x);

if (avgX > x) {
  vx += 0.1;
} else if (avgX < x) {
  vx -= 0.1;
} else {
  vx = 0;
}
```

### Loops (for / foreach)
```js
// foreach iterations
foreach(nearbyAgents as neighbor) {
  var dx = x - neighbor.x;
  var dy = y - neighbor.y;
}

// standard loops
for (var i = 0; i < 10; i = i + 1) {
    turn(0.1);
}
```

### Core Built-in Variables
Every agent implicitly has access to:
- `x`, `y` (Position)
- `vx`, `vy` (Velocity)
- `id` (Agent index)
- `species` (Agent species index)

### Core Built-in Commands
- `moveForward(speed)` — Moves the agent along its current velocity vector.
- `turn(angle)` — Rotates the agent's velocity vector by `angle` radians.
- `deposit(amount)` — Leaves a chemical trail on the pheromone map at the current position.
- `enableTrails(depositAmount, decayFactor)` — Initializes the trailing shader logic.
- `limitSpeed(maxSpeed)` — Clamps `vx` and `vy` such that magnitude <= `maxSpeed`.
- `borderWrapping()` — Wraps agent positions around the screen edges.
- `updatePosition(dt)` — Applies velocity to position using a time delta.

### Complex Sensory Functions
- `sense(angleOffset, distance)` — Samples the pheromone trail map at a specific offset from the current heading. Returns a float value.
- `neighbors(radius)` — Returns an array of nearby agents within `radius`. You can map their properties directly: `nearbyAgents.vx`.
- `mean(array)` — Averages a property array, mostly used to compute center of mass.
- Math functions like `sin(val)`, `cos(val)`, `atan2(y, x)`, and `random()` map directly to the corresponding WebGPU/JS instructions.
