# Agentyx

A high-performance, cross-backend agent-based simulation engine for the web.

Agentyx provides a custom DSL for agent behavior, then compiles it for JavaScript, WebWorkers, WebAssembly, and WebGPU execution.

## Install

```bash
npm i @websimbench/agentyx
```

## Versioned Documentation

The documentation is hosted in WebSimBench.

- Latest docs: [https://morgs27.github.io/dissertation/#/docs/latest/overview](https://morgs27.github.io/dissertation/#/docs/latest/overview)

### Direct links

- Installation: [latest/installation](https://morgs27.github.io/dissertation/#/docs/latest/installation)
- Quick Start: [latest/quick-start](https://morgs27.github.io/dissertation/#/docs/latest/quick-start)
- Simulation API: [latest/simulation-api](https://morgs27.github.io/dissertation/#/docs/latest/simulation-api)
- Backends and Rendering: [latest/backends-rendering](https://morgs27.github.io/dissertation/#/docs/latest/backends-rendering)
- Tracking and Benchmarking: [latest/tracking-benchmarking](https://morgs27.github.io/dissertation/#/docs/latest/tracking-benchmarking)
- DSL Basics: [latest/dsl-basics](https://morgs27.github.io/dissertation/#/docs/latest/dsl-basics)
- DSL Commands: [latest/dsl-commands](https://morgs27.github.io/dissertation/#/docs/latest/dsl-commands)
- DSL Functions: [latest/dsl-functions](https://morgs27.github.io/dissertation/#/docs/latest/dsl-functions)
- Runnable Examples: [latest/examples](https://morgs27.github.io/dissertation/#/docs/latest/examples)

## Quick Start

```ts
import { Simulation } from "@websimbench/agentyx";

const canvas = document.getElementById("my-canvas") as HTMLCanvasElement;

const simulation = new Simulation({
  canvas,
  // Optional dedicated GPU canvas for apps that switch between
  // CPU and GPU render modes at runtime:
  // gpuCanvas: document.getElementById('my-gpu-canvas') as HTMLCanvasElement,
  source: {
    kind: "dsl",
    code: `
      input speed = 2;
      input turnAngle = 0.5;

      moveForward(inputs.speed);
      turn(inputs.turnAngle);
      borderWrapping();
    `,
  },
  options: { agents: 5000 },
  appearance: {
    agentColor: "#00FFFF",
    backgroundColor: "#000000",
    agentSize: 2,
    agentShape: "circle",
    showTrails: false,
    trailColor: "#50FFFF",
    obstacleColor: "#FF0000",
    obstacleBorderColor: "#FF0000",
    obstacleOpacity: 0.2,
  },
});

await simulation.initGPU();

async function runLoop() {
  await simulation.runFrame("WebGPU", { speed: 3, turnAngle: 0.2 }, "gpu");
  requestAnimationFrame(runLoop);
}

runLoop();
```

## Core API

Use the docs pages for complete detail:

- Constructor options, source modes, lifecycle methods:
  [Simulation API](https://morgs27.github.io/dissertation/#/docs/latest/simulation-api)
- Compute methods and render modes:
  [Backends and Rendering](https://morgs27.github.io/dissertation/#/docs/latest/backends-rendering)
- Performance + tracking reports:
  [Tracking and Benchmarking](https://morgs27.github.io/dissertation/#/docs/latest/tracking-benchmarking)
- DSL grammar, commands, and functions:
  [DSL Basics](https://morgs27.github.io/dissertation/#/docs/latest/dsl-basics)

## Notes

- `gpuCanvas` is optional. If omitted, Agentyx reuses `canvas` for GPU output.
- If your app frequently switches between CPU and GPU rendering in one session, use a dedicated `gpuCanvas` to avoid browser canvas context conflicts.
