import { PREMADE_SIMULATIONS } from "@/config/premadeSimulations";
import { CURRENT_VERSION } from "@/config/version";
import type { DocsContentBlock, DocsLinkCard, DocsVersion } from "./types";

const CDN_IMPORT_URL = `https://esm.sh/@websimbench/agentyx@${CURRENT_VERSION}?bundle`;

const PRESET_SLIME_MOLD = PREMADE_SIMULATIONS["Slime Mold"].code.trim();
const PRESET_BOIDS = PREMADE_SIMULATIONS["Boids"].code.trim();
const PRESET_FIRE = PREMADE_SIMULATIONS["Fire"].code.trim();
const PRESET_FLUID = PREMADE_SIMULATIONS["Fluid Dispersal"].code.trim();
const PRESET_PREDATOR_PREY = PREMADE_SIMULATIONS["Predator-Prey"].code.trim();
const PRESET_RAIN = PREMADE_SIMULATIONS["Rain"].code.trim();
const PRESET_MULTI_SPECIES =
  PREMADE_SIMULATIONS["Multi-Species Boids"].code.trim();
const PRESET_TRAFFIC = PREMADE_SIMULATIONS["Traffic"].code.trim();
const PRESET_COSMIC_WEB = PREMADE_SIMULATIONS["Cosmic Web"].code.trim();

const DSL_LITERAL = (dsl: string) => JSON.stringify(dsl.trim());

// ---------------------------------------------------------------------------
// Reusable DSL / TS snippets
// ---------------------------------------------------------------------------

const QUICK_START_DSL = `input speed = 2;
input turnAngle = 0.35;

moveForward(inputs.speed);
turn(inputs.turnAngle);
borderWrapping();`;

const INSTALL_SNIPPET = `npm i @websimbench/agentyx`;

const IMPORT_SNIPPET = `import {
  Simulation,
  Compiler,
  PerformanceMonitor,
  SimulationTracker,
  Logger,
} from '@websimbench/agentyx';`;

const HTML_CANVAS_SETUP = `<!-- Single-canvas setup (works for most integrations) -->
<canvas id="sim" width="800" height="600"></canvas>

<!-- Optional: dedicated GPU canvas when frequently switching
     between CPU and GPU rendering in one session -->
<canvas id="sim-gpu" width="800" height="600"></canvas>`;

const QUICK_START_TYPESCRIPT = `import { Simulation } from '@websimbench/agentyx';

const canvas = document.getElementById('sim') as HTMLCanvasElement;

const simulation = new Simulation({
  canvas,
  source: {
    kind: 'dsl',
    code: ${DSL_LITERAL(QUICK_START_DSL)},
  },
  options: {
    agents: 5000,
    width: 800,
    height: 600,
    seed: 7,
  },
  appearance: {
    agentColor: '#00FFFF',
    backgroundColor: '#000000',
    agentSize: 2,
    agentShape: 'circle',
    showTrails: false,
    trailColor: '#50FFFF',
    obstacleColor: '#FF0000',
    obstacleBorderColor: '#FF0000',
    obstacleOpacity: 0.2,
  },
});

async function frame() {
  await simulation.runFrame('JavaScript', { speed: 2, turnAngle: 0.35 }, 'cpu');
  requestAnimationFrame(frame);
}

frame();`;

const GPU_SINGLE_CANVAS = `import { Simulation } from '@websimbench/agentyx';

const canvas = document.getElementById('sim') as HTMLCanvasElement;

const simulation = new Simulation({
  canvas,
  agentScript: 'moveForward(1.6); turn(0.08); borderWrapping();',
  options: { agents: 20000 },
});

await simulation.initGPU();

async function frame() {
  await simulation.runFrame('WebGPU', {}, 'gpu');
  requestAnimationFrame(frame);
}

frame();`;

const GPU_TWO_CANVAS = `const simulation = new Simulation({
  canvas: document.getElementById('sim') as HTMLCanvasElement,
  gpuCanvas: document.getElementById('sim-gpu') as HTMLCanvasElement,
  source: { kind: 'dsl', code: dslCode },
  options: { agents: 120000 },
});

await simulation.initGPU();

// Switch between CPU and GPU rendering without context conflicts:
await simulation.runFrame('WebGPU', runtimeInputs, 'gpu');
await simulation.runFrame('WebAssembly', runtimeInputs, 'cpu');`;

const CONSTRUCTOR_MINIMAL = `const simulation = new Simulation({
  canvas,
  agentScript: 'moveForward(1.2); borderWrapping();',
  options: { agents: 1000 },
});`;

const CONSTRUCTOR_FULL = `const simulation = new Simulation({
  canvas,
  gpuCanvas,
  source: {
    kind: 'dsl',
    code: dslCode,
  },
  options: {
    agents: 50000,
    workers: 4,
    width: 1280,
    height: 720,
    seed: 42,
  },
  appearance: {
    agentColor: '#d8fff8',
    backgroundColor: '#040607',
    agentSize: 1.5,
    agentShape: 'circle',
    showTrails: true,
    trailOpacity: 1,
    trailColor: '#6bffd9',
    speciesColors: ['#00FFFF', '#FF4466', '#44FF66'],
    obstacleColor: '#FF0000',
    obstacleBorderColor: '#FF0000',
    obstacleOpacity: 0.2,
  },
  tracking: {
    enabled: true,
    captureAgentStates: false,
    captureFrameInputs: false,
    captureLogs: true,
    captureDeviceMetrics: true,
  },
  metadata: {
    suite: 'comparison-a',
    commit: 'abc123',
  },
});`;

const RUNFRAME_MATRIX = `// CPU compute methods — all render via 2D canvas:
await simulation.runFrame('JavaScript',  inputs, 'cpu');
await simulation.runFrame('WebWorkers',  inputs, 'cpu');
await simulation.runFrame('WebAssembly', inputs, 'cpu');

// GPU compute — zero-copy render path (fastest visual):
await simulation.runFrame('WebGPU', inputs, 'gpu');

// GPU compute — read agents back to CPU, then 2D render:
await simulation.runFrame('WebGPU', inputs, 'cpu');

// Headless — compute only, no rendering (for benchmarks):
await simulation.runFrame('WebGPU', inputs, 'none');`;

const RUNTIME_UPDATES = `simulation.setInputs({
  speed: 2.5,
  turnAngle: 0.35,
});

simulation.setObstacles([
  { x: 120, y: 120, w: 90, h: 40 },
  { x: 480, y: 320, w: 140, h: 80 },
]);

simulation.setCanvasDimensions(1280, 720);

simulation.updateAppearance({
  agentColor: '#ffffff',
  trailColor: '#4af2e0',
  showTrails: true,
  agentSize: 1.2,
});`;

const CUSTOM_SOURCE_SNIPPET = `const simulation = new Simulation({
  canvas,
  source: {
    kind: 'custom',
    code: {
      js: (agent, inputs) => ({
        ...agent,
        x: agent.x + agent.vx,
        y: agent.y + agent.vy,
      }),
      requiredInputs: ['width', 'height'],
      definedInputs: [],
      numRandomCalls: 0,
    },
  },
  options: { agents: 2000 },
});`;

const TRACKING_SNIPPET = `const simulation = new Simulation({
  canvas,
  source: { kind: 'dsl', code: dslCode },
  options: { agents: 20000 },
  tracking: {
    enabled: true,
    captureAgentStates: true,
    captureFrameInputs: false,
    captureLogs: true,
    captureDeviceMetrics: true,
  },
  metadata: {
    scenario: 'boids-baseline',
    runLabel: 'run-2026-02-22',
  },
});

await simulation.runFrame('WebGPU', runtimeInputs, 'gpu');

const report = simulation.getTrackingReport();
const json   = simulation.exportTrackingReport();

console.log(report.summary);
console.log(json);`;

const PERF_MONITOR_SNIPPET = `const monitor = simulation.getPerformanceMonitor();

// Access raw per-frame timing data
const frames = monitor.frames;

// Print an aggregate summary to the console
monitor.printSummary();`;

const MISSING_INPUTS_SNIPPET = `// DSL references inputs.speed and inputs.turnAngle
const dslCode = 'moveForward(inputs.speed); turn(inputs.turnAngle);';

// Missing 'turnAngle' => runFrame throws a clear error
await simulation.runFrame('JavaScript', { speed: 2 }, 'cpu');
// Error: Missing required input values: turnAngle`;

const DSL_GRAMMAR_SNIPPET = `// Declare inputs with defaults (and optional ranges)
input speed = 2;
input perception = 40 [0, 100];

// Use variables for intermediate computation
var nearby = neighbors(inputs.perception);

// Standard if/else control flow
if (nearby.length > 0) {
  var avgX = mean(nearby.x);
  vx += (avgX - x) * 0.02;
} else {
  turn(0.02);
}

// Iterate over neighbor sets
foreach (nearby as neighbor) {
  var dx = x - neighbor.x;
  var dy = y - neighbor.y;
  var dist2 = dx * dx + dy * dy;
  if (dist2 < 100) {
    vx += dx / dist2;
    vy += dy / dist2;
  }
}`;

const COMMAND_REFERENCE = `moveUp(amount)
moveDown(amount)
moveLeft(amount)
moveRight(amount)

addVelocityX(amount)
addVelocityY(amount)
setVelocityX(value)
setVelocityY(value)

updatePosition(dt)
moveForward(distance)
turn(angle)
limitSpeed(maxSpeed)

borderWrapping()
borderBounce()

enableTrails(depositAmount, decayFactor)
deposit(amount)
sense(angleOffset, distance)

species(count)
avoidObstacles(strength)
print(value)`;

const FUNCTION_REFERENCE = `neighbors(radius)
mean(collection.property)
sense(angleOffset, distance)
random()
random(max)
random(min, max)

// Math built-ins available in expressions:
sqrt(x), sin(x), cos(x), atan2(y, x)
+, -, *, /, %, ^2, <, >, <=, >=, ==, !=, &&, ||`;

const OBSTACLE_DSL_SNIPPET = `input speed = 2;
input obstacleStrength = 1.2;

avoidObstacles(inputs.obstacleStrength);
moveForward(inputs.speed);
borderWrapping();`;

const TRAIL_DSL_SNIPPET = `input sensorAngle = 0.6;
input sensorDist = 15;
input turnAngle = 0.5;
input speed = 2.0;
input depositAmount = 1.5;
input decayFactor = 0.05;

enableTrails(inputs.depositAmount, inputs.decayFactor);

var sL = sense(inputs.sensorAngle, inputs.sensorDist);
var sF = sense(0, inputs.sensorDist);
var sR = sense(-inputs.sensorAngle, inputs.sensorDist);

if (sF < sL && sF < sR) {
  if (random() < 0.5) {
    turn(inputs.turnAngle);
  } else {
    turn(-inputs.turnAngle);
  }
}

if (sL > sR) { turn(inputs.turnAngle); }
if (sR > sL) { turn(-inputs.turnAngle); }

moveForward(inputs.speed);
borderWrapping();
deposit(inputs.depositAmount);`;

const MULTI_SPECIES_DSL_SNIPPET = `species(3);
input maxSpeed = 2;

if (species == 0) {
  turn(0.04);
} else if (species == 1) {
  turn(-0.04);
} else {
  if (random() < 0.5) {
    turn(0.02);
  } else {
    turn(-0.02);
  }
}

moveForward(1.5);
limitSpeed(inputs.maxSpeed);
borderWrapping();`;

const DSL_PERFORMANCE_TIPS_SNIPPET = `// 1) Keep perception radius minimal for neighbors()
input perception = 30;
var nearby = neighbors(inputs.perception);

// 2) Cache expensive sub-expressions in variables
var sL = sense(0.4, 15);
var sR = sense(-0.4, 15);

// 3) Prefer simple arithmetic over deep nesting
if (sL > sR) {
  turn(0.2);
}

// 4) Use renderMode='none' for pure compute benchmarks
// await simulation.runFrame('WebGPU', inputs, 'none');`;

// ---------------------------------------------------------------------------
// Runnable example code
// ---------------------------------------------------------------------------

const EXAMPLE_HTML_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      button {
        border: 0;
        border-radius: 8px;
        padding: 8px 12px;
        background: #25b8a8;
        color: #07211f;
        font-weight: 700;
        cursor: pointer;
        margin-bottom: 10px;
      }
    </style>
  </head>
  <body>
      <div class="row">
        <button id="toggle">Start</button>
      </div>
      <canvas id="sim" width="600" height="400"></canvas>
  </body>
</html>`;

const EXAMPLE_BASIC_JS = `import { Simulation } from '${CDN_IMPORT_URL}';

const canvas = document.getElementById('sim');
const toggle = document.getElementById('toggle');

const simulation = new Simulation({
  canvas,
  source: { kind: 'dsl', code: ${DSL_LITERAL(QUICK_START_DSL)} },
  options: { agents: 5000 },
});

let running = false;

async function tick() {
  if (!running) return;
  await simulation.runFrame('JavaScript', { speed: 2, turnAngle: 0.35 }, 'cpu');
  requestAnimationFrame(tick);
}

toggle.addEventListener('click', () => {
  running = !running;
  toggle.textContent = running ? 'Stop' : 'Start';
  if (running) tick();
});`;

// ---------------------------------------------------------------------------
// Helper to build a code content block concisely
// ---------------------------------------------------------------------------
const p = (text: string): DocsContentBlock => ({ kind: "paragraph", text });
const tip = (text: string, title?: string): DocsContentBlock => ({
  kind: "callout",
  variant: "tip",
  title,
  text,
});
const note = (text: string, title?: string): DocsContentBlock => ({
  kind: "callout",
  variant: "note",
  title,
  text,
});
const warn = (text: string, title?: string): DocsContentBlock => ({
  kind: "callout",
  variant: "warning",
  title,
  text,
});
const info = (text: string, title?: string): DocsContentBlock => ({
  kind: "callout",
  variant: "info",
  title,
  text,
});
const bullets = (items: string[]): DocsContentBlock => ({
  kind: "bullets",
  items,
});
const ordered = (items: string[]): DocsContentBlock => ({
  kind: "ordered-list",
  items,
});
const table = (headers: string[], rows: string[][]): DocsContentBlock => ({
  kind: "table",
  headers,
  rows,
});
const heading = (text: string): DocsContentBlock => ({ kind: "heading", text });
const linkCards = (cards: DocsLinkCard[]): DocsContentBlock => ({
  kind: "link-cards",
  cards,
});
const codeBlock = (
  title: string,
  lang: "bash" | "ts" | "js" | "html" | "dsl" | "json",
  codeStr: string,
): DocsContentBlock => ({
  kind: "code",
  snippet: { title, language: lang, code: codeStr },
});

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export const docsV010: DocsVersion = {
  id: `v${CURRENT_VERSION}`,
  packageVersion: CURRENT_VERSION,
  releaseDate: "2026-02-22",

  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      pages: [
        { id: "overview", title: "Overview" },
        { id: "installation", title: "Installation" },
        { id: "quick-start", title: "Quick Start" },
        { id: "integration-guide", title: "Integration Guide" },
      ],
    },
    {
      id: "core-api",
      title: "Core API",
      pages: [
        { id: "simulation-api", title: "Simulation API" },
        { id: "constructor-reference", title: "Constructor Reference" },
        { id: "run-frame-reference", title: "runFrame Reference" },
        { id: "runtime-updates", title: "Runtime Updates" },
        { id: "backends-rendering", title: "Backends & Rendering" },
        { id: "tracking-benchmarking", title: "Tracking & Benchmarking" },
        { id: "custom-source", title: "Custom Source API" },
        { id: "troubleshooting", title: "Troubleshooting" },
      ],
    },
    {
      id: "dsl-guide",
      title: "DSL Guide",
      pages: [
        { id: "dsl-basics", title: "DSL Basics" },
        { id: "dsl-commands", title: "Commands Reference" },
        { id: "dsl-functions", title: "Functions Reference" },
        { id: "dsl-patterns", title: "Patterns & Recipes" },
        { id: "preset-gallery", title: "Preset Gallery" },
        { id: "dsl-performance", title: "Performance Guidance" },
      ],
    },
    // {
    //   id: 'examples',
    //   title: 'Examples',
    //   pages: [
    //     { id: 'examples-overview', title: 'Examples Overview' },
    //     { id: 'basic-cpu', title: 'Basic CPU Loop' },
    //   ],
    // },
  ],

  pages: [
    // =====================================================================
    //  OVERVIEW
    // =====================================================================
    {
      id: "overview",
      title: "Overview",
      description:
        "Agentyx is a browser-native simulation engine that compiles a simple DSL into JavaScript, WebAssembly, and WebGPU.  Letting you run massive agent populations without leaving the browser.",
      sections: [
        {
          id: "what-is-agentyx",
          title: "What is Agentyx?",
          content: [
            p(
              "Traditional agent-based modeling tools often require native installations, specialized languages, or server infrastructure. Agentyx eliminates all of that. You write agent behavior in a concise DSL designed for 2D spatial agent logic, and the engine compiles it to three targets simultaneously: JavaScript, WebAssembly Text (WAT), and WGSL (WebGPU Shading Language).",
            ),
            p(
              "This means you can run the exact same behavior script on any compute backend \u2014 switching between JavaScript, WebWorkers, WebAssembly, and WebGPU at runtime \u2014 without changing a single line of your simulation code. Everything runs client-side: compilation, execution, rendering, and performance tracking.",
            ),
            tip(
              "Agentyx is distributed as an NPM package (`@websimbench/agentyx`) and works with any JavaScript framework or vanilla HTML/JS setup.",
            ),
            linkCards([
              {
                page: "quick-start",
                title: "Quick Start",
                description: "Get a simulation running in under two minutes.",
                icon: "quick-start",
              },
              {
                page: "simulation-api",
                title: "Simulation API",
                description:
                  "Constructor, frame loop, and lifecycle reference.",
                icon: "simulation-api",
              },
              {
                page: "dsl-basics",
                title: "DSL Basics",
                description: "Learn the per-agent behavior scripting language.",
                icon: "dsl-basics",
              },
            ]),
          ],
        },
        {
          id: "the-pipeline",
          title: "The Pipeline",
          content: [
            p(
              "Every simulation follows a four-stage pipeline from authoring to visual output:",
            ),
            ordered([
              "**Author** \u2014 Write agent behavior using the Agentyx DSL, a purpose-built language for spatial agent logic with built-in support for movement, neighbor queries, trails, species, and obstacles.",
              "**Compile** \u2014 The compiler parses your DSL and generates optimized code for three targets: JavaScript (for main-thread and WebWorker execution), WAT (for WebAssembly), and WGSL (for WebGPU compute shaders).",
              "**Compute** \u2014 Choose a backend and the engine executes your compiled code against the entire agent population each frame. Switch backends at any time.",
              "**Render** \u2014 Agents are drawn to a `<canvas>` using CPU-based 2D rendering, GPU-accelerated instanced drawing, or no rendering at all for pure benchmark runs.",
            ]),
            table(
              ["Stage", "What happens", "Output"],
              [
                ["Author", "Write DSL behavior script", "DSL source code"],
                [
                  "Compile",
                  "Parse and generate target code",
                  "JS + WAT + WGSL",
                ],
                [
                  "Compute",
                  "Execute agent update kernels",
                  "Updated agent states",
                ],
                ["Render", "Draw agents to canvas", "Visual frame"],
              ],
            ),
          ],
        },
        {
          id: "key-features",
          title: "Key Features",
          content: [
            bullets([
              "**Multi-target compiler** \u2014 One DSL source compiles to JavaScript, WebAssembly, and WebGPU shader code in a single pass.",
              "**Four compute backends** \u2014 JavaScript (main thread), WebWorkers (parallel CPU), WebAssembly (compiled CPU), and WebGPU (GPU compute). Switch between them per-frame.",
              "**Flexible rendering** \u2014 CPU 2D canvas, GPU instanced rendering, or headless mode. Mix and match with any compute backend.",
              "**Built-in tracking** \u2014 Per-frame performance metrics (setup, compute, readback, render times), agent state capture, environment profiling, and structured JSON report export.",
              "**Deterministic seeds** \u2014 Reproducible initial placement and randomness for repeatable experiments.",
              "**Trail and pheromone system** \u2014 First-class support for deposit/sense/decay trail maps across all backends.",
              "**Multi-species** \u2014 Declare species count and branch behavior per species, all within the same script.",
            ]),
          ],
        },
        {
          id: "cross-backend-parity",
          title: "Cross-Backend Parity",
          content: [
            p(
              "A defining feature of Agentyx is that the same DSL script produces functionally equivalent behavior across all four compute backends. This is invaluable for parity testing, device comparisons, and scaling studies \u2014 you can benchmark identical logic on JavaScript vs. WebGPU without rewriting anything.",
            ),
            note(
              "Minor floating-point differences between backends are expected due to hardware and precision differences between CPU and GPU arithmetic. These are typically negligible for simulation behavior.",
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  INSTALLATION
    // =====================================================================
    {
      id: "installation",
      title: "Installation",
      description:
        "Install the package, set up your imports, and prepare a canvas for rendering.",
      sections: [
        {
          id: "npm-install",
          title: "Install via NPM",
          content: [
            p(
              "Agentyx is published to NPM as `@websimbench/agentyx`. Install it with your preferred package manager:",
            ),
            codeBlock("Install", "bash", INSTALL_SNIPPET),
          ],
        },
        {
          id: "imports",
          title: "Imports",
          content: [
            p(
              "The package exports the core `Simulation` class alongside utilities for compilation, performance monitoring, tracking, and logging:",
            ),
            codeBlock("Available exports", "ts", IMPORT_SNIPPET),
            p(
              "For most use cases you only need `Simulation`. The other exports are useful when you want to compile DSL independently, access detailed performance data, or integrate custom logging.",
            ),
          ],
        },
        {
          id: "canvas-setup",
          title: "Canvas Setup",
          content: [
            p(
              "Agentyx renders to an HTML `<canvas>` element. A single canvas works for the majority of integrations. If your app frequently alternates between CPU and GPU rendering in the same session, add a dedicated GPU canvas to avoid browser context conflicts:",
            ),
            codeBlock("HTML canvas elements", "html", HTML_CANVAS_SETUP),
            info(
              "If you omit `gpuCanvas`, Agentyx reuses the primary `canvas` for GPU output. This is fine unless you switch render modes back and forth frequently.",
            ),
          ],
        },
        {
          id: "browser-requirements",
          title: "Browser Requirements",
          content: [
            p(
              "All four compute backends work in modern browsers. WebGPU requires a Chromium-based browser (Chrome, Edge) with hardware acceleration enabled. WebAssembly and WebWorkers are supported across all modern browsers.",
            ),
            table(
              ["Backend", "Browser Support", "Notes"],
              [
                [
                  "JavaScript",
                  "All modern browsers",
                  "Main-thread execution, simplest debugging",
                ],
                [
                  "WebWorkers",
                  "All modern browsers",
                  "Parallel CPU, uses `navigator.hardwareConcurrency`",
                ],
                [
                  "WebAssembly",
                  "All modern browsers",
                  "Compiled CPU path via WAT",
                ],
                [
                  "WebGPU",
                  "Chrome 113+, Edge 113+",
                  "Requires `navigator.gpu` and hardware acceleration",
                ],
              ],
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  QUICK START
    // =====================================================================
    {
      id: "quick-start",
      title: "Quick Start",
      description:
        "Go from zero to a running simulation in under two minutes. This guide walks you through creating 5,000 agents that move, turn, and wrap at canvas edges.",
      sections: [
        {
          id: "the-dsl",
          title: "Write a Behavior Script",
          content: [
            p(
              "Every agent executes the same script once per frame. Here is a minimal behavior: move forward, turn, and wrap at the edges.",
            ),
            codeBlock("Agent behavior (DSL)", "dsl", QUICK_START_DSL),
            p(
              "The `input` declarations define named parameters with default values. At runtime these are accessible through `inputs.speed` and `inputs.turnAngle`, and can be overridden from your host code each frame.",
            ),
          ],
        },
        {
          id: "full-setup",
          title: "Full TypeScript Setup",
          content: [
            p(
              "Create a `Simulation` instance, point it at your canvas, pass the DSL source, and start a `requestAnimationFrame` loop. That is the entire integration:",
            ),
            codeBlock("Complete quick start", "ts", QUICK_START_TYPESCRIPT),
            tip(
              "Pass `seed` in options for deterministic initial agent placement. This makes simulations reproducible across runs \u2014 useful for testing and comparisons.",
            ),
          ],
        },
        {
          id: "gpu-path",
          title: "WebGPU Path",
          content: [
            p(
              "For higher throughput, switch to the WebGPU compute and render path. The only extra step is calling `initGPU()` before your first frame:",
            ),
            codeBlock("WebGPU with single canvas", "ts", GPU_SINGLE_CANVAS),
            p(
              "If your app switches between CPU and GPU rendering during a session, use a dedicated `gpuCanvas` to avoid browser canvas context conflicts:",
            ),
            codeBlock(
              "Dedicated gpuCanvas for mixed pipelines",
              "ts",
              GPU_TWO_CANVAS,
            ),
            warn(
              "Always call `initGPU()` before dispatching any `WebGPU` frames. Forgetting this step will throw a runtime error.",
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  INTEGRATION GUIDE
    // =====================================================================
    {
      id: "integration-guide",
      title: "Integration Guide",
      description:
        "Best practices for embedding Agentyx into real applications \u2014 lifecycle management, state handling, and framework integration.",
      sections: [
        {
          id: "lifecycle",
          title: "Lifecycle Management",
          content: [
            p(
              "A `Simulation` instance is designed to be long-lived. Construct it once per scenario, run frames in a loop, and call `destroy()` when you are done. Avoid recreating instances on every parameter change.",
            ),
            bullets([
              "Construct `Simulation` once when your component mounts or your scenario starts.",
              "Use `requestAnimationFrame` for visual loops. For headless benchmark sweeps, use `setTimeout` or a custom fixed-step timer.",
              "Call `simulation.destroy()` on teardown or unmount \u2014 this finalizes tracking, releases compute resources, and terminates web workers.",
            ]),
            warn(
              "Forgetting `destroy()` will leak workers, GPU buffers, and memory. Always clean up when ending a simulation run.",
            ),
          ],
        },
        {
          id: "state-management",
          title: "State and Input Handling",
          content: [
            p(
              "Agentyx separates sticky defaults from per-frame overrides. Use `setInputs()` for values that rarely change (like a base speed), and pass per-frame overrides directly to `runFrame()` for values driven by UI controls.",
            ),
            p(
              "When integrating with React, Vue, or similar frameworks, keep simulation parameters in your framework state and pass a compact input object each frame. There is no need to re-instantiate `Simulation` when only parameter values change.",
            ),
            tip(
              "Keep your `runFrame` input object flat and small. Agentyx merges it with sticky inputs and engine-provided defaults (width, height, agents, trail buffers) automatically.",
            ),
          ],
        },
        {
          id: "react-pattern",
          title: "React Integration Pattern",
          content: [
            p(
              "In a React app, create the simulation in a `useEffect` or `useRef` hook, drive it with `requestAnimationFrame`, and clean up on unmount:",
            ),
            bullets([
              "Store the `Simulation` instance in a `useRef` \u2014 it should not trigger re-renders.",
              "Start/stop the animation loop based on component state.",
              "Pass UI slider values as frame inputs inside the `requestAnimationFrame` callback.",
              "Call `simulation.destroy()` in the effect cleanup function.",
            ]),
          ],
        },
      ],
    },

    // =====================================================================
    //  SIMULATION API
    // =====================================================================
    {
      id: "simulation-api",
      title: "Simulation API",
      description:
        "The Simulation class is the primary entry point. It ties together the compiler, compute engine, renderer, and tracker into a single cohesive API.",
      sections: [
        {
          id: "constructor-overview",
          title: "Creating a Simulation",
          content: [
            p(
              "The constructor accepts a configuration object with your source code, agent count, canvas reference, and optional appearance/tracking settings. It immediately compiles the DSL (or accepts custom code), initializes agents with random or seeded positions, and prepares the compute engine.",
            ),
            codeBlock("Minimal constructor", "ts", CONSTRUCTOR_MINIMAL),
            p(
              "The `agentScript` shorthand is equivalent to `source: { kind: 'dsl', code: ... }`. Both forms are supported, though the explicit `source` form is recommended for clarity.",
            ),
            table(
              ["Source mode", "Description", "Use case"],
              [
                [
                  '`source.kind = "dsl"`',
                  "Compiles Agentyx DSL to all backends",
                  "Most use cases \u2014 write DSL, run anywhere",
                ],
                [
                  '`source.kind = "custom"`',
                  "Bypass compiler, supply pre-written JS/WGSL/WAT",
                  "Advanced \u2014 hand-tuned kernels or external code",
                ],
                [
                  "`agentScript` (shorthand)",
                  'Equivalent to `source.kind = "dsl"`',
                  "Quick prototyping",
                ],
              ],
            ),
          ],
        },
        {
          id: "frame-execution",
          title: "Frame Execution",
          content: [
            p(
              "Call `runFrame()` each tick to advance the simulation by one step. It accepts a compute method, optional per-frame input overrides, and a render mode:",
            ),
            codeBlock(
              "runFrame signature",
              "ts",
              `await simulation.runFrame(method, inputValues, renderMode);
// Returns: { frameNumber: number; agents: Agent[]; skipped: boolean }`,
            ),
            p(
              "If the previous frame is still being computed (common with GPU dispatches), `runFrame` returns immediately with `skipped: true` and does not dispatch new work. Treat this as a backpressure signal \u2014 do not stack additional async calls.",
            ),
            note(
              "The returned `agents` array is the canonical state. After each successful frame, `simulation.agents` is also updated.",
            ),
          ],
        },
        {
          id: "public-properties",
          title: "Public Properties",
          content: [
            table(
              ["Property", "Type", "Description"],
              [
                [
                  "`agents`",
                  "`Agent[]`",
                  "Current agent state array. Updated after each frame.",
                ],
                [
                  "`compilationResult`",
                  "`CompilationResult | null`",
                  "Output from the DSL compiler (JS, WGSL, WAT code, inputs, species count).",
                ],
                [
                  "`trailMap`",
                  "`Float32Array | null`",
                  "Trail intensity buffer (width x height), or `null` if trails are not active.",
                ],
                [
                  "`randomValues`",
                  "`Float32Array | null`",
                  "Pre-generated random buffer for the current frame, or `null` if not needed.",
                ],
              ],
            ),
          ],
        },
        {
          id: "lifecycle-methods",
          title: "Lifecycle Methods",
          content: [
            table(
              ["Method", "Description"],
              [
                [
                  "`initGPU()`",
                  "Initialize WebGPU device for compute and rendering. Required before any WebGPU frames.",
                ],
                [
                  "`runFrame(method, inputs?, renderMode?)`",
                  "Execute one simulation step: compute, render, and record tracking data.",
                ],
                [
                  "`destroy()`",
                  "Release all resources: workers, GPU buffers, tracking session. Always call on teardown.",
                ],
              ],
            ),
            table(
              ["Method", "Description"],
              [
                [
                  "`setInputs(values)`",
                  "Merge sticky input values that persist across frames.",
                ],
                [
                  "`setObstacles(obstacles)`",
                  "Replace the obstacle array for `avoidObstacles` commands.",
                ],
                [
                  "`setCanvasDimensions(w, h)`",
                  "Update world dimensions when no canvas is attached.",
                ],
                [
                  "`updateAppearance(partial)`",
                  "Change visual properties at runtime (colors, sizes, trails).",
                ],
                [
                  "`getPerformanceMonitor()`",
                  "Access frame-level timing metrics.",
                ],
                [
                  "`getTrackingReport(filter?)`",
                  "Generate a structured tracking report.",
                ],
                [
                  "`exportTrackingReport(filter?)`",
                  "Export tracking report as formatted JSON string.",
                ],
              ],
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  CONSTRUCTOR REFERENCE
    // =====================================================================
    {
      id: "constructor-reference",
      title: "Constructor Reference",
      description:
        "Every field available in the Simulation constructor, with types and defaults.",
      sections: [
        {
          id: "full-example",
          title: "Full Constructor Example",
          content: [
            p(
              "Here is a constructor call showing every major field. Most fields are optional \u2014 only `options.agents` and a source are required.",
            ),
            codeBlock("All configuration fields", "ts", CONSTRUCTOR_FULL),
          ],
        },
        {
          id: "options-fields",
          title: "Options Fields",
          content: [
            table(
              ["Field", "Type", "Default", "Description"],
              [
                [
                  "`agents`",
                  "`number`",
                  "\u2014 (required)",
                  "Number of agents. Must be a positive integer, max 10,000,000.",
                ],
                [
                  "`workers`",
                  "`number`",
                  "auto",
                  "Web worker count for the WebWorkers backend.",
                ],
                [
                  "`width`",
                  "`number`",
                  "`canvas.width` or 600",
                  "World width in pixels.",
                ],
                [
                  "`height`",
                  "`number`",
                  "`canvas.height` or 600",
                  "World height in pixels.",
                ],
                [
                  "`seed`",
                  "`number`",
                  "`undefined`",
                  "PRNG seed for deterministic initial placement.",
                ],
              ],
            ),
          ],
        },
        {
          id: "appearance-fields",
          title: "Appearance Fields",
          content: [
            table(
              ["Field", "Type", "Default", "Description"],
              [
                [
                  "`agentColor`",
                  "`string`",
                  '`"#00FFFF"`',
                  "Default agent fill color (CSS hex).",
                ],
                [
                  "`backgroundColor`",
                  "`string`",
                  '`"#000000"`',
                  "Canvas clear color.",
                ],
                ["`agentSize`", "`number`", "`3`", "Agent radius in pixels."],
                [
                  "`agentShape`",
                  "`string`",
                  '`"circle"`',
                  'Agent shape: `"circle"` or `"square"`.',
                ],
                [
                  "`showTrails`",
                  "`boolean`",
                  "`true`",
                  "Whether to render the trail map overlay.",
                ],
                [
                  "`trailOpacity`",
                  "`number`",
                  "`1`",
                  "Trail layer opacity (0\u20131).",
                ],
                [
                  "`trailColor`",
                  "`string`",
                  '`"#50FFFF"`',
                  "Trail tint color.",
                ],
                [
                  "`speciesColors`",
                  "`string[]`",
                  '`["#00FFFF"]`',
                  "Per-species color palette.",
                ],
                [
                  "`obstacleColor`",
                  "`string`",
                  '`"#FF0000"`',
                  "Obstacle fill color.",
                ],
                [
                  "`obstacleBorderColor`",
                  "`string`",
                  '`"#FF0000"`',
                  "Obstacle border color.",
                ],
                [
                  "`obstacleOpacity`",
                  "`number`",
                  "`0.2`",
                  "Obstacle fill opacity.",
                ],
              ],
            ),
          ],
        },
        {
          id: "tracking-fields",
          title: "Tracking Fields",
          content: [
            p(
              "The `tracking` object controls what data is recorded during a simulation run. All fields default to `false` when tracking is not explicitly configured.",
            ),
            table(
              ["Field", "Type", "Description"],
              [
                [
                  "`enabled`",
                  "`boolean`",
                  "Master switch for the tracking system.",
                ],
                [
                  "`captureAgentStates`",
                  "`boolean`",
                  "Snapshot agent positions every frame. High memory cost on long runs.",
                ],
                [
                  "`captureFrameInputs`",
                  "`boolean`",
                  "Record merged input values per frame.",
                ],
                ["`captureLogs`", "`boolean`", "Capture internal log output."],
                [
                  "`captureDeviceMetrics`",
                  "`boolean`",
                  "Collect browser, device, and GPU capability info.",
                ],
              ],
            ),
            p(
              "The `metadata` field accepts an arbitrary key-value object for tagging runs with benchmark suite names, commit hashes, scenario labels, and other identifiers.",
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  RUNFRAME REFERENCE
    // =====================================================================
    {
      id: "run-frame-reference",
      title: "runFrame Reference",
      description:
        "Method signatures, compute/render mode combinations, and dispatch strategies.",
      sections: [
        {
          id: "signature",
          title: "Signature",
          content: [
            codeBlock(
              "Type shape",
              "ts",
              `runFrame(
  method: 'JavaScript' | 'WebWorkers' | 'WebAssembly' | 'WebGPU',
  inputValues?: InputValues,
  renderMode?: 'cpu' | 'gpu' | 'none'
): Promise<{
  frameNumber: number;
  agents: Agent[];
  skipped: boolean;
}>`,
            ),
          ],
        },
        {
          id: "method-render-matrix",
          title: "Compute + Render Combinations",
          content: [
            p(
              "You can freely combine compute methods with render modes. Here are the most common patterns:",
            ),
            codeBlock("All valid combinations", "ts", RUNFRAME_MATRIX),
            table(
              ["Compute", "Render", "Best for"],
              [
                [
                  "`JavaScript`",
                  "`cpu`",
                  "Debugging, small populations, widest browser support",
                ],
                [
                  "`WebWorkers`",
                  "`cpu`",
                  "CPU parallelism on multi-core machines",
                ],
                [
                  "`WebAssembly`",
                  "`cpu`",
                  "Predictable CPU performance, medium-large populations",
                ],
                [
                  "`WebGPU`",
                  "`gpu`",
                  "Maximum throughput \u2014 zero-copy GPU compute + render",
                ],
                [
                  "`WebGPU`",
                  "`cpu`",
                  "GPU compute with CPU readback for agent inspection",
                ],
                [
                  "`WebGPU`",
                  "`none`",
                  "Pure compute benchmarks, no rendering overhead",
                ],
              ],
            ),
          ],
        },
        {
          id: "dispatch-tips",
          title: "Dispatch Guidance",
          content: [
            bullets([
              'Use `renderMode="none"` when collecting compute-only benchmarks \u2014 it eliminates rendering overhead entirely.',
              'Use `WebGPU` + `"gpu"` for the highest-throughput visual workloads. The render path is zero-copy from the compute output buffer.',
              "Use `WebAssembly` for a robust CPU fallback with consistent performance characteristics.",
              "If `runFrame` returns `skipped: true`, the previous frame is still in progress. Treat this as backpressure and avoid stacking additional calls.",
            ]),
            tip(
              'During development, start with `JavaScript` + `"cpu"` for the easiest debugging experience. Switch to WebGPU for production-scale populations.',
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  RUNTIME UPDATES
    // =====================================================================
    {
      id: "runtime-updates",
      title: "Runtime Updates",
      description:
        "Mutate inputs, appearance, obstacles, and dimensions without recreating the Simulation instance.",
      sections: [
        {
          id: "mutation-apis",
          title: "Mutation APIs",
          content: [
            p(
              "Agentyx is designed so you never need to rebuild a `Simulation` just because a parameter changed. Four methods cover all runtime mutations:",
            ),
            codeBlock("Runtime update methods", "ts", RUNTIME_UPDATES),
          ],
        },
        {
          id: "method-details",
          title: "Method Reference",
          content: [
            table(
              ["Method", "What it does", "When to use"],
              [
                [
                  "`setInputs(values)`",
                  "Merges key-value pairs into sticky frame inputs",
                  "For values that persist across frames (base speed, perception radius)",
                ],
                [
                  "`setObstacles(obstacles)`",
                  "Replaces the obstacle array",
                  "When obstacles are added/removed by the user",
                ],
                [
                  "`setCanvasDimensions(w, h)`",
                  "Updates internal world dimensions",
                  "Headless mode or when resizing a canvas programmatically",
                ],
                [
                  "`updateAppearance(partial)`",
                  "Patches visual properties (colors, sizes, trail toggles)",
                  "When the user adjusts visual settings via UI controls",
                ],
              ],
            ),
          ],
        },
        {
          id: "best-practices",
          title: "Best Practices",
          content: [
            bullets([
              "Prefer updating inputs and appearance over rebuilding `Simulation` instances. Construction involves compilation and agent initialization.",
              "Pass only changed frame inputs to `runFrame()` \u2014 unchanged values carry over from `setInputs()` and DSL defaults.",
              "When using `avoidObstacles` in DSL, keep obstacle arrays synchronized via `setObstacles()` or per-frame inputs.",
            ]),
          ],
        },
      ],
    },

    // =====================================================================
    //  BACKENDS & RENDERING
    // =====================================================================
    {
      id: "backends-rendering",
      title: "Backends & Rendering",
      description:
        "Understand the four compute backends, three render modes, and how to choose the right combination for your workload.",
      sections: [
        {
          id: "compute-backends",
          title: "Compute Backends",
          content: [
            p(
              "Agentyx compiles your DSL to three code targets and exposes four execution strategies. Each backend has distinct performance characteristics:",
            ),
            table(
              ["Backend", "Code Target", "Execution Model", "Strengths"],
              [
                [
                  "JavaScript",
                  "JS function",
                  "Main thread, sequential",
                  "Lowest latency, easiest to debug, zero setup cost",
                ],
                [
                  "WebWorkers",
                  "JS function",
                  "Multi-thread, parallel chunks",
                  "Scales with CPU core count, good for 10k\u2013100k agents",
                ],
                [
                  "WebAssembly",
                  "WAT \u2192 WASM",
                  "Main thread, compiled",
                  "Predictable performance, explicit memory layout",
                ],
                [
                  "WebGPU",
                  "WGSL shader",
                  "GPU compute dispatch",
                  "Massive parallelism, zero-copy render path, best for 50k+ agents",
                ],
              ],
            ),
            p(
              "The compute engine lazily initializes each backend on first use. There is no upfront cost for backends you never invoke.",
            ),
            info(
              "WebGPU requires a one-time `initGPU()` call before dispatching frames. All other backends are ready immediately after construction.",
            ),
          ],
        },
        {
          id: "render-modes",
          title: "Render Modes",
          content: [
            p(
              "The `renderMode` parameter on `runFrame()` controls how (or whether) agents are drawn each frame:",
            ),
            table(
              ["Mode", "Method", "Description"],
              [
                [
                  '`"cpu"`',
                  "2D Canvas API",
                  "Raster rendering via `CanvasRenderingContext2D`. Works with any compute backend.",
                ],
                [
                  '`"gpu"`',
                  "WebGPU render pipeline",
                  "Instanced draws directly from the GPU compute output buffer. Only available when using `WebGPU` compute.",
                ],
                [
                  '`"none"`',
                  "No rendering",
                  "Compute-only execution. Use for headless benchmarks and throughput studies.",
                ],
              ],
            ),
            tip(
              'For visual workloads at scale, `WebGPU` compute + `"gpu"` render is the fastest path because it avoids reading agent data back to the CPU entirely.',
            ),
          ],
        },
        {
          id: "canvas-guidance",
          title: "Canvas Configuration",
          content: [
            p(
              'A single `<canvas>` element works for most applications. However, browsers can only associate one rendering context type with a canvas. If your app frequently alternates between `"cpu"` (2D context) and `"gpu"` (WebGPU context) rendering within a single session, configure a dedicated `gpuCanvas`:',
            ),
            bullets([
              "Single canvas \u2014 works when you pick one render mode and stick with it, or only switch occasionally.",
              "Dedicated `gpuCanvas` \u2014 recommended when toggling between CPU and GPU rendering at runtime. Each canvas gets its own context, avoiding conflicts.",
            ]),
          ],
        },
        {
          id: "choosing-a-backend",
          title: "Choosing a Backend",
          content: [
            p(
              'There is no single "best" backend \u2014 the right choice depends on your agent count, target hardware, and whether you need visual output:',
            ),
            bullets([
              "**Under 5,000 agents**: JavaScript is fast enough and simplest to debug.",
              "**5,000\u201350,000 agents**: WebWorkers or WebAssembly give good CPU scaling.",
              "**50,000+ agents**: WebGPU with GPU rendering is the clear winner for throughput.",
              '**Benchmarking**: Use `renderMode="none"` with any backend to isolate compute costs.',
            ]),
          ],
        },
      ],
    },

    // =====================================================================
    //  TRACKING & BENCHMARKING
    // =====================================================================
    {
      id: "tracking-benchmarking",
      title: "Tracking & Benchmarking",
      description:
        "Capture per-frame performance data, agent state snapshots, and structured reports for analysis.",
      sections: [
        {
          id: "perf-monitor",
          title: "PerformanceMonitor",
          content: [
            p(
              "Every `Simulation` instance has an internal `PerformanceMonitor` that records timing data for each frame: setup time, compute time, readback time, render time, and total execution time. Access it via `getPerformanceMonitor()`:",
            ),
            codeBlock("Performance monitor", "ts", PERF_MONITOR_SNIPPET),
            p(
              "Frame timing breakdowns are stored per compute method, so you can compare JavaScript vs. WebGPU performance on the same simulation run.",
            ),
          ],
        },
        {
          id: "tracking-reports",
          title: "Tracking Reports",
          content: [
            p(
              "For more comprehensive data, enable the tracking system in the constructor. It records a structured report covering source code, configuration, environment details, per-frame metrics, and optionally agent positions:",
            ),
            codeBlock("Tracking lifecycle", "ts", TRACKING_SNIPPET),
            warn(
              "Enabling `captureAgentStates` records a full copy of the agent array every frame. For long runs with large populations, this can consume significant memory. Use it selectively for short-run analysis.",
              "Memory",
            ),
          ],
        },
        {
          id: "report-structure",
          title: "Report Structure",
          content: [
            p("A tracking report contains the following top-level sections:"),
            table(
              ["Section", "Contents"],
              [
                [
                  "`summary`",
                  "Frame count, average execution time, method used, agent count",
                ],
                [
                  "`config`",
                  "Source code, options, appearance, tracking settings",
                ],
                [
                  "`environment`",
                  "Browser, device, GPU capabilities (when `captureDeviceMetrics` is on)",
                ],
                [
                  "`frames`",
                  "Per-frame timing breakdowns and optional agent snapshots",
                ],
                [
                  "`metadata`",
                  "User-supplied labels (suite, commit, scenario tags)",
                ],
                [
                  "`logs`",
                  "Captured internal log output (when `captureLogs` is on)",
                ],
                ["`errors`", "Any runtime errors encountered during the run"],
              ],
            ),
            p(
              "Use `exportTrackingReport()` to get a pretty-printed JSON string suitable for file export or transmission to analysis tools.",
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  CUSTOM SOURCE API
    // =====================================================================
    {
      id: "custom-source",
      title: "Custom Source API",
      description:
        "Bypass the DSL compiler and supply your own JavaScript, WGSL, or WAT kernels directly.",
      sections: [
        {
          id: "when-to-use",
          title: "When to Use Custom Source",
          content: [
            p(
              "The DSL covers the most common agent behavior patterns, but sometimes you need full control. Custom source mode lets you supply pre-written agent update functions for each backend you plan to use:",
            ),
            bullets([
              "Hand-tuned kernels for performance-critical workloads.",
              "Integrating externally generated compute code.",
              "Behaviors that go beyond what the DSL grammar supports.",
            ]),
          ],
        },
        {
          id: "custom-example",
          title: "Example",
          content: [
            codeBlock(
              "Custom source configuration",
              "ts",
              CUSTOM_SOURCE_SNIPPET,
            ),
            p(
              "The `js` field can be either a function or a string. If it is a function, Agentyx calls `.toString()` and reconstructs it internally. The function receives an agent and the merged input values, and must return the updated agent.",
            ),
          ],
        },
        {
          id: "custom-requirements",
          title: "Requirements",
          content: [
            bullets([
              "Provide code for each compute method you plan to use. If you only supply `js`, you cannot dispatch WebGPU frames.",
              "`requiredInputs` must list all runtime dependencies your kernel expects beyond the standard agent fields.",
              "Set `numRandomCalls` if your kernel consumes values from the `randomValues` buffer.",
              "`definedInputs` should mirror any parameter defaults your kernel relies on.",
            ]),
            note(
              "Custom source skips the compiler entirely. There is no DSL parsing, no multi-target compilation, and no automatic input extraction. You are responsible for consistency across backends.",
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  TROUBLESHOOTING
    // =====================================================================
    {
      id: "troubleshooting",
      title: "Troubleshooting",
      description: "Common errors, their causes, and how to resolve them.",
      sections: [
        {
          id: "missing-inputs",
          title: "Missing Input Errors",
          content: [
            p(
              'If `runFrame` throws "Missing required input values", one or more `inputs.<name>` references in your DSL do not have corresponding values at runtime. Check two things:',
            ),
            ordered([
              "Does your DSL declare the input with a default? (e.g., `input speed = 2;`). If so, the default is used automatically.",
              "Are you passing the value in `runFrame(method, { speed: 2 })` or via `setInputs({ speed: 2 })`?",
            ]),
            codeBlock(
              "Typical missing input scenario",
              "ts",
              MISSING_INPUTS_SNIPPET,
            ),
          ],
        },
        {
          id: "gpu-issues",
          title: "WebGPU Issues",
          content: [
            p("WebGPU-related errors usually fall into a few categories:"),
            table(
              ["Symptom", "Cause", "Fix"],
              [
                [
                  "`initGPU()` throws",
                  "Browser lacks WebGPU support",
                  "Use Chrome 113+ with hardware acceleration enabled. Check `navigator.gpu`.",
                ],
                [
                  "Black canvas with GPU render",
                  "`initGPU()` not called before first frame",
                  'Always `await simulation.initGPU()` before `runFrame("WebGPU", ...)`.',
                ],
                [
                  "Canvas context lost",
                  "Switching between 2D and WebGPU contexts on same canvas",
                  "Use a dedicated `gpuCanvas` for GPU rendering.",
                ],
              ],
            ),
            tip(
              "For environments without WebGPU, fall back to `WebAssembly` or `WebWorkers`. The same DSL works on all backends.",
            ),
          ],
        },
        {
          id: "cleanup",
          title: "Resource Cleanup",
          content: [
            p(
              "Always call `simulation.destroy()` when ending a run or unmounting a component. This:",
            ),
            bullets([
              "Finalizes the tracking session and freezes the report.",
              "Terminates web workers spawned by the WebWorkers backend.",
              "Releases GPU buffers and compute pipeline state.",
              "Clears internal agent, trail, and random value buffers.",
            ]),
          ],
        },
        {
          id: "compilation-errors",
          title: "DSL Compilation Errors",
          content: [
            p(
              "If your DSL contains syntax errors or unsupported constructs, the compiler logs detailed error messages with line numbers to the browser console. The `compilationResult.errors` array on the Simulation instance also contains structured error objects.",
            ),
            p(
              "Common issues include missing semicolons after input declarations, unbalanced parentheses in expressions, and referencing undefined variables.",
            ),
          ],
        },
      ],
    },

    // =====================================================================
    //  DSL BASICS
    // =====================================================================
    {
      id: "dsl-basics",
      title: "DSL Basics",
      description:
        "The Agentyx DSL is a purpose-built language for describing per-agent behavior. Every agent executes the same script once per frame \u2014 think of it as a behavior blueprint.",
      sections: [
        {
          id: "mental-model",
          title: "The Mental Model",
          content: [
            p(
              "Each agent in your simulation has its own state: a position (`x`, `y`), a velocity (`vx`, `vy`), an integer `species` index, and a unique `id`. Every frame, the engine runs your DSL script once for every agent. Inside the script, these fields are available as mutable variables \u2014 the changes you make become the agent's new state.",
            ),
            p(
              "You do not need to write loops over agents or manage state arrays. Just describe what one agent should do, and the engine handles the rest \u2014 whether there are 100 agents or 100,000.",
            ),
            info(
              "This per-agent-per-frame model is what makes cross-backend parity possible. The same script logic is compiled to JS, WASM, and GPU shaders that all operate on the same data layout.",
            ),
          ],
        },
        {
          id: "grammar",
          title: "Core Grammar",
          content: [
            p(
              "The DSL supports input declarations, variables, conditionals, loops, commands, and expressions. Here is a comprehensive example showing all major constructs:",
            ),
            codeBlock("Grammar overview", "dsl", DSL_GRAMMAR_SNIPPET),
          ],
        },
        {
          id: "inputs",
          title: "Inputs",
          content: [
            p(
              "Inputs are named parameters declared at the top of your script. They define default values and optional range constraints:",
            ),
            codeBlock(
              "Input declarations",
              "dsl",
              `input speed = 2;
input perception = 40 [0, 100];
input r = random();`,
            ),
            table(
              ["Syntax", "Meaning"],
              [
                [
                  "`input name = value;`",
                  "Declare an input with a numeric default",
                ],
                [
                  "`input name = value [min, max];`",
                  "Declare with default, min, and max (used for UI sliders)",
                ],
                [
                  "`input name = random();`",
                  "Declare a per-agent random value, regenerated each frame",
                ],
              ],
            ),
            p(
              "At runtime, reference inputs with the `inputs.` prefix: `inputs.speed`, `inputs.perception`. Host code can override any input per-frame via `runFrame()` or `setInputs()`.",
            ),
          ],
        },
        {
          id: "agent-fields",
          title: "Built-in Agent Fields",
          content: [
            p(
              "These fields are available as mutable variables inside every DSL script:",
            ),
            table(
              ["Field", "Type", "Description"],
              [
                [
                  "`id`",
                  "`number`",
                  "Stable agent identifier (read-only, assigned at creation)",
                ],
                ["`x`", "`number`", "Horizontal position in world space"],
                ["`y`", "`number`", "Vertical position in world space"],
                ["`vx`", "`number`", "Horizontal velocity component"],
                ["`vy`", "`number`", "Vertical velocity component"],
                [
                  "`species`",
                  "`number`",
                  "Species index (0-based, writable for species transitions)",
                ],
              ],
            ),
            p(
              "Additionally, `inputs.width` and `inputs.height` provide the canvas dimensions. These are injected automatically by the engine.",
            ),
          ],
        },
        {
          id: "special-environments",
          title: "Special Environments",
          content: [
            heading("Trail Maps"),
            p(
              "Enable pheromone-style trail maps with `enableTrails()`. Agents can `deposit()` values and `sense()` the trail intensity at offset angles. The engine handles diffusion and decay automatically across all backends.",
            ),
            codeBlock("Trail map example", "dsl", TRAIL_DSL_SNIPPET),

            heading("Obstacles"),
            p(
              "Use `avoidObstacles(strength)` to make agents steer away from rectangular obstacles defined in host code. Obstacles are passed via `setObstacles()` or frame inputs.",
            ),
            codeBlock("Obstacle avoidance", "dsl", OBSTACLE_DSL_SNIPPET),

            heading("Multi-Species"),
            p(
              "Declare the number of species with `species(count)`. Agents are assigned species in round-robin order at initialization. Use the `species` field in conditionals to branch behavior:",
            ),
            codeBlock("Species branching", "dsl", MULTI_SPECIES_DSL_SNIPPET),
          ],
        },
      ],
    },

    // =====================================================================
    //  COMMANDS REFERENCE
    // =====================================================================
    {
      id: "dsl-commands",
      title: "Commands Reference",
      description:
        "Complete list of DSL commands \u2014 the built-in operations you call to move, steer, and configure agents.",
      sections: [
        {
          id: "movement-commands",
          title: "Movement",
          content: [
            table(
              ["Command", "Description"],
              [
                [
                  "`moveForward(distance)`",
                  "Move the agent forward by `distance` in the direction of its current velocity vector.",
                ],
                [
                  "`moveUp(amount)`",
                  "Decrease `y` by `amount` (moves agent upward in screen space).",
                ],
                ["`moveDown(amount)`", "Increase `y` by `amount`."],
                ["`moveLeft(amount)`", "Decrease `x` by `amount`."],
                ["`moveRight(amount)`", "Increase `x` by `amount`."],
                [
                  "`updatePosition(dt)`",
                  "Apply velocity to position: `x += vx * dt`, `y += vy * dt`.",
                ],
              ],
            ),
          ],
        },
        {
          id: "velocity-commands",
          title: "Velocity",
          content: [
            table(
              ["Command", "Description"],
              [
                ["`addVelocityX(amount)`", "Add `amount` to `vx`."],
                ["`addVelocityY(amount)`", "Add `amount` to `vy`."],
                ["`setVelocityX(value)`", "Set `vx` to `value`."],
                ["`setVelocityY(value)`", "Set `vy` to `value`."],
                [
                  "`turn(angle)`",
                  "Rotate the velocity vector by `angle` radians.",
                ],
                [
                  "`limitSpeed(maxSpeed)`",
                  "Clamp velocity magnitude to `maxSpeed`.",
                ],
              ],
            ),
          ],
        },
        {
          id: "boundary-commands",
          title: "Boundaries",
          content: [
            table(
              ["Command", "Description"],
              [
                [
                  "`borderWrapping()`",
                  "Wrap agent position toroidally. Requires `width` and `height` inputs (auto-injected).",
                ],
                [
                  "`borderBounce()`",
                  "Reflect velocity when hitting canvas edges.",
                ],
              ],
            ),
            note(
              "Both boundary commands require `width` and `height`, which the engine injects automatically from the canvas or constructor options.",
            ),
          ],
        },
        {
          id: "environment-commands",
          title: "Environment",
          content: [
            table(
              ["Command", "Description"],
              [
                [
                  "`enableTrails(depositAmount, decayFactor)`",
                  "Activate the trail map system. Must appear before `deposit()` or `sense()` calls.",
                ],
                [
                  "`deposit(amount)`",
                  "Write a pheromone value at the agent's current position on the trail map.",
                ],
                [
                  "`sense(angleOffset, distance)`",
                  "Sample trail intensity at an offset angle and distance from the agent. Returns a numeric value.",
                ],
                [
                  "`species(count)`",
                  "Declare the number of species. Agents are assigned species indices 0 through count-1 in round-robin.",
                ],
                [
                  "`avoidObstacles(strength)`",
                  "Steer away from rectangular obstacles with the given force strength.",
                ],
                [
                  "`print(value)`",
                  "Log a value to the console for debugging (agent ID is included automatically).",
                ],
              ],
            ),
          ],
        },
        {
          id: "full-command-listing",
          title: "Full Command Listing",
          content: [codeBlock("All commands", "dsl", COMMAND_REFERENCE)],
        },
      ],
    },

    // =====================================================================
    //  FUNCTIONS REFERENCE
    // =====================================================================
    {
      id: "dsl-functions",
      title: "Functions Reference",
      description:
        "Built-in functions and expression operators available within the DSL.",
      sections: [
        {
          id: "neighbor-functions",
          title: "Neighbor Queries",
          content: [
            table(
              ["Function", "Returns", "Description"],
              [
                [
                  "`neighbors(radius)`",
                  "Neighbor set",
                  "Find all agents within `radius` distance. Returns a set with `.length`, `.x`, `.y`, `.vx`, `.vy`, `.species` properties.",
                ],
                [
                  "`mean(collection.property)`",
                  "`number`",
                  "Compute the average of a property across a neighbor set (e.g., `mean(nearby.x)`).",
                ],
              ],
            ),
            p(
              "Neighbor sets are the foundation of flocking, swarming, and interaction behaviors. Use `foreach` to iterate over individual neighbors, or `mean()` for aggregate steering.",
            ),
          ],
        },
        {
          id: "sensing-functions",
          title: "Sensing",
          content: [
            table(
              ["Function", "Returns", "Description"],
              [
                [
                  "`sense(angleOffset, distance)`",
                  "`number`",
                  "Sample trail map intensity at a point offset from the agent by `angleOffset` radians and `distance` pixels.",
                ],
              ],
            ),
            p(
              "Sensing is used in chemotaxis and slime mold simulations. Agents sample the trail map at multiple angles to decide which direction has the highest concentration, then turn toward it.",
            ),
          ],
        },
        {
          id: "random-functions",
          title: "Randomness",
          content: [
            table(
              ["Function", "Returns", "Description"],
              [
                [
                  "`random()`",
                  "`number` in [0, 1)",
                  "Generate a pseudo-random value. Each call site is indexed at compile time for consistent cross-backend behavior.",
                ],
                [
                  "`random(max)`",
                  "`number` in [0, max)",
                  "Random value scaled to `max`.",
                ],
                [
                  "`random(min, max)`",
                  "`number` in [min, max)",
                  "Random value in the given range.",
                ],
              ],
            ),
            note(
              "Random calls are backed by a pre-generated `Float32Array` buffer. The compiler counts call sites at compile time and the engine allocates the correct buffer size each frame. This ensures identical random sequences across JavaScript, WebAssembly, and WebGPU.",
            ),
          ],
        },
        {
          id: "math-operators",
          title: "Math and Operators",
          content: [
            p(
              "Standard math functions and operators are available in expressions:",
            ),
            table(
              ["Category", "Available"],
              [
                [
                  "Math functions",
                  "`sqrt(x)`, `sin(x)`, `cos(x)`, `atan2(y, x)`",
                ],
                ["Arithmetic", "`+`, `-`, `*`, `/`, `%`, `^2` (square)"],
                ["Comparison", "`<`, `>`, `<=`, `>=`, `==`, `!=`"],
                ["Logical", "`&&`, `||`"],
              ],
            ),
            codeBlock("Full function reference", "dsl", FUNCTION_REFERENCE),
          ],
        },
      ],
    },

    // =====================================================================
    //  PATTERNS & RECIPES
    // =====================================================================
    {
      id: "dsl-patterns",
      title: "Patterns & Recipes",
      description:
        "Reusable behavior patterns drawn from classic agent-based models. Each recipe is a complete, runnable DSL script.",
      sections: [
        {
          id: "boids-pattern",
          title: "Boids (Flocking)",
          content: [
            p(
              "The boids pattern implements Craig Reynolds' three rules of flocking: alignment (steer toward average neighbor velocity), cohesion (steer toward average neighbor position), and separation (avoid crowding). This is the foundation of most flocking and swarming behaviors.",
            ),
            p(
              "The recipe below uses `neighbors()` to find nearby agents, `mean()` for aggregate values, and `foreach` for per-neighbor separation forces:",
            ),
            codeBlock("Boids", "dsl", PRESET_BOIDS),
            tip(
              "Tune `perceptionRadius` carefully. Larger values create more cohesive flocks but increase computation cost, especially on CPU backends.",
            ),
          ],
        },
        {
          id: "predator-prey-pattern",
          title: "Predator-Prey",
          content: [
            p(
              "Species-based branching lets you run multiple behavior classes in a single script. In this pattern, prey agents flock and flee from predators, while predators chase the nearest prey. Both share the same world constraints.",
            ),
            p(
              "The `species` field determines which behavior branch an agent follows. Species are assigned round-robin at initialization \u2014 with `species(2)`, roughly half the population becomes prey (species 0) and half becomes predators (species 1).",
            ),
            codeBlock("Predator-Prey", "dsl", PRESET_PREDATOR_PREY),
          ],
        },
        {
          id: "trail-pattern",
          title: "Trail Following (Slime Mold)",
          content: [
            p(
              "Slime mold simulations use the trail map system. Each agent deposits a pheromone value and senses the trail at three angles (left, forward, right). The agent turns toward the direction with the highest concentration, creating emergent network patterns.",
            ),
            p(
              "The engine handles trail diffusion and decay automatically. You only need to call `enableTrails()`, `deposit()`, and `sense()`.",
            ),
            codeBlock("Slime Mold", "dsl", PRESET_SLIME_MOLD),
          ],
        },
      ],
    },

    // =====================================================================
    //  PRESET GALLERY
    // =====================================================================
    {
      id: "preset-gallery",
      title: "Preset Gallery",
      description:
        "A collection of complete DSL scripts from the WebSimBench playground. Each preset demonstrates different DSL features and modeling techniques.",
      sections: [
        {
          id: "gallery-overview",
          title: "Available Presets",
          content: [
            p(
              "These presets are included in the WebSimBench playground and can be loaded directly. Each one is a self-contained DSL script that compiles and runs on all backends.",
            ),
            table(
              ["Preset", "Agents", "Key Features Used"],
              [
                [
                  "Slime Mold",
                  "24,000+",
                  "`enableTrails`, `sense`, `deposit`, `random()`",
                ],
                [
                  "Boids",
                  "7,000+",
                  "`neighbors`, `mean`, `foreach`, `limitSpeed`",
                ],
                [
                  "Fire",
                  "5,000+",
                  "`species(3)`, `random()`, `deposit`, `moveUp`",
                ],
                [
                  "Fluid Dispersal",
                  "10,000+",
                  "`neighbors`, `foreach`, gravity, bounce physics",
                ],
                [
                  "Predator-Prey",
                  "9,000+",
                  "`species(2)`, `neighbors`, `foreach`, flee/chase",
                ],
                [
                  "Rain",
                  "10,000+",
                  "Gravity, wind, `limitSpeed`, `borderWrapping`",
                ],
                [
                  "Multi-Species Boids",
                  "7,000+",
                  "`species(3)`, inter-species avoidance, `foreach`",
                ],
                [
                  "Traffic",
                  "5,000+",
                  "`neighbors`, `foreach`, car-following model",
                ],
                [
                  "Cosmic Web",
                  "10,000+",
                  "`species(5)`, cyclic pursuit, `sqrt`, `foreach`",
                ],
              ],
            ),
          ],
        },
        {
          id: "fire-preset",
          title: "Fire",
          content: [
            p(
              "A three-species fire simulation. Species 0 is fuel (slow-rising), species 1 is active fire (fast, turbulent), and species 2 is smoke (drifting, fading). Agents transition between species using `random()` probability checks.",
            ),
            codeBlock("Fire", "dsl", PRESET_FIRE),
          ],
        },
        {
          id: "fluid-preset",
          title: "Fluid Dispersal",
          content: [
            p(
              "A simplified SPH (Smoothed Particle Hydrodynamics) model. Agents experience gravity, repel nearby neighbors to simulate pressure, and bounce off boundaries. The `damping` factor acts as viscosity.",
            ),
            codeBlock("Fluid Dispersal", "dsl", PRESET_FLUID),
          ],
        },
        {
          id: "rain-preset",
          title: "Rain",
          content: [
            p(
              "Raindrops falling under gravity with lateral wind. Simple but effective for testing basic physics and `borderWrapping` behavior with large populations.",
            ),
            codeBlock("Rain", "dsl", PRESET_RAIN),
          ],
        },
        {
          id: "multi-species-preset",
          title: "Multi-Species Boids",
          content: [
            p(
              "Three species of boids that flock within their own kind but avoid other species. Species 0 is fast and aggressive, species 1 is balanced and social, and species 2 is slow and solitary.",
            ),
            codeBlock("Multi-Species Boids", "dsl", PRESET_MULTI_SPECIES),
          ],
        },
        {
          id: "traffic-preset",
          title: "Traffic",
          content: [
            p(
              "A Nagel-Schreckenberg-inspired traffic model. Agents look ahead for other cars, brake when too close, and occasionally brake randomly (modeling human error). Lane discipline is simulated by dampening vertical velocity.",
            ),
            codeBlock("Traffic", "dsl", PRESET_TRAFFIC),
          ],
        },
        {
          id: "cosmic-web-preset",
          title: "Cosmic Web",
          content: [
            p(
              "Five species in a cyclic pursuit loop: species 0 chases 1, 1 chases 2, and so on in a ring. The result is swirling, galaxy-like structures emerging from simple chase-and-repel rules.",
            ),
            codeBlock("Cosmic Web", "dsl", PRESET_COSMIC_WEB),
          ],
        },
      ],
    },

    // =====================================================================
    //  PERFORMANCE GUIDANCE
    // =====================================================================
    {
      id: "dsl-performance",
      title: "Performance Guidance",
      description:
        "Practical optimization techniques for scaling simulations to hundreds of thousands of agents.",
      sections: [
        {
          id: "dsl-optimization",
          title: "DSL Optimization",
          content: [
            p(
              "The biggest performance lever in your DSL code is the `neighbors()` radius. Neighbor queries are O(n) against the agent population on CPU backends and are the dominant cost in most simulations. Keep the radius as small as possible while preserving the behavior you need.",
            ),
            codeBlock(
              "Performance-oriented DSL",
              "dsl",
              DSL_PERFORMANCE_TIPS_SNIPPET,
            ),
            ordered([
              "**Minimize perception radius** \u2014 A radius of 30 vs. 60 can cut neighbor query time dramatically.",
              "**Cache expensive expressions** \u2014 Store `sense()` or `neighbors()` results in `var` declarations instead of calling them multiple times.",
              "**Prefer simple arithmetic** \u2014 Avoid deeply nested expressions. Flat arithmetic compiles to more efficient GPU shaders.",
              '**Use `renderMode="none"` for benchmarks** \u2014 Isolate compute costs from rendering to get accurate performance data.',
            ]),
          ],
        },
        {
          id: "backend-optimization",
          title: "Backend Selection",
          content: [
            p(
              "Beyond DSL tweaks, choosing the right backend and render mode has the largest impact on throughput:",
            ),
            bullets([
              '**WebGPU + `"gpu"` render** is the fastest path for large populations (50k+). It avoids CPU readback entirely.',
              '**WebGPU + `"none"` render** is ideal for headless benchmark sweeps where you only care about compute time.',
              "**WebWorkers** scales with CPU core count. Use it when WebGPU is unavailable and agent counts exceed 10k.",
              "**WebAssembly** provides more predictable per-frame timing than JavaScript for medium populations.",
            ]),
            tip(
              "Use tracking reports to compare method-level setup/compute/readback breakdowns. This data-driven approach is more reliable than intuition for backend selection.",
            ),
          ],
        },
        {
          id: "general-tips",
          title: "General Tips",
          content: [
            bullets([
              "Construct `Simulation` once and reuse it. Construction involves compilation, agent initialization, and compute engine setup.",
              "For fixed-step benchmarks, use a `setTimeout` or `for` loop instead of `requestAnimationFrame` to avoid being capped at display refresh rate.",
              "Monitor the `skipped` return from `runFrame()`. Frequent skips indicate that your frame budget is exceeded.",
              "On WebGPU, the first frame may be slower due to shader compilation and pipeline creation. Warm up with one or two frames before starting measurements.",
            ]),
          ],
        },
      ],
    },

    // =====================================================================
    //  RUNNABLE EXAMPLES
    {
      id: "examples-overview",
      title: "Examples Overview",
      description:
        "Edit HTML and JavaScript snippets, then execute them in an isolated preview. Examples load Agentyx from a CDN \u2014 no bundler required.",
      sections: [
        {
          id: "how-it-works",
          title: "How the Runner Works",
          content: [
            p(
              "Each example consists of an HTML template and a JavaScript module that imports Agentyx from `esm.sh`. The runner creates an isolated `<iframe>` with your code, so changes are safe to experiment with.",
            ),

            tip(
              'The examples use the JavaScript compute backend by default for maximum compatibility. Try changing `"JavaScript"` to `"WebGPU"` (and adding `await simulation.initGPU()`) to see the GPU path in action.',
            ),
            linkCards([
              {
                page: "basic-cpu",
                title: "Basic CPU Loop",
                description:
                  "Minimal JavaScript compute + cpu render integration.",
                icon: "examples",
              },
            ]),
          ],
        },
      ],
    },
    {
      id: "basic-cpu",
      title: "Basic CPU Loop",
      description: "Minimal JavaScript compute + cpu render integration.",
      sections: [
        {
          id: "runner",
          title: "Example",
          content: [{ kind: "example-runner", exampleId: "basic-cpu" }],
        },
      ],
    },
  ],

  runnableExamples: [
    {
      id: "basic-cpu",
      title: "Basic CPU Loop",
      description: "Minimal JavaScript compute + cpu render integration.",
      html: EXAMPLE_HTML_TEMPLATE,
      javascript: EXAMPLE_BASIC_JS,
    },
  ],
};
