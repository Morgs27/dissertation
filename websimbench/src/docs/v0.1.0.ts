import { PREMADE_SIMULATIONS } from '@/config/premadeSimulations';
import { CURRENT_VERSION } from '@/config/version';
import type { DocsVersion } from './types';

const CDN_IMPORT_URL = `https://esm.sh/@websimbench/agentyx@${CURRENT_VERSION}?bundle`;

const PRESET_SLIME_MOLD = PREMADE_SIMULATIONS['Slime Mold'].trim();
const PRESET_BOIDS = PREMADE_SIMULATIONS['Boids'].trim();
const PRESET_FIRE = PREMADE_SIMULATIONS['Fire'].trim();
const PRESET_FLUID = PREMADE_SIMULATIONS['Fluid Dispersal'].trim();
const PRESET_PREDATOR_PREY = PREMADE_SIMULATIONS['Predator-Prey'].trim();
const PRESET_RAIN = PREMADE_SIMULATIONS['Rain'].trim();
const PRESET_MULTI_SPECIES = PREMADE_SIMULATIONS['Multi-Species Boids'].trim();
const PRESET_TRAFFIC = PREMADE_SIMULATIONS['Traffic'].trim();
const PRESET_COSMIC_WEB = PREMADE_SIMULATIONS['Cosmic Web'].trim();

const DSL_LITERAL = (dsl: string) => JSON.stringify(dsl.trim());

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

const HTML_CANVAS_SETUP = `<!-- Single-canvas setup (works for many integrations) -->
<canvas id="sim" width="800" height="600"></canvas>

<!-- Optional dedicated GPU canvas when frequently switching
     between CPU render and GPU render in one session -->
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

// Toggle between CPU and GPU rendering without canvas context conflicts:
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

const RUNFRAME_MATRIX = `// Compute + Render combinations you can mix:
await simulation.runFrame('JavaScript', inputs, 'cpu');
await simulation.runFrame('WebWorkers', inputs, 'cpu');
await simulation.runFrame('WebAssembly', inputs, 'cpu');

await simulation.runFrame('WebGPU', inputs, 'gpu'); // zero-copy render path
await simulation.runFrame('WebGPU', inputs, 'cpu'); // GPU compute + CPU readback render

await simulation.runFrame('WebGPU', inputs, 'none'); // headless benchmark`;

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
const json = simulation.exportTrackingReport();

console.log(report.summary);
console.log(json);`;

const PERF_MONITOR_SNIPPET = `const monitor = simulation.getPerformanceMonitor();

// Optional: print per-frame metrics to console while running
monitor.enableLogging?.(true);

// Access raw frame details
const frames = monitor.frames;

// Print aggregate summary
monitor.printSummary();`;

const MISSING_INPUTS_SNIPPET = `// DSL uses inputs.speed and inputs.turnAngle
const dslCode = 'moveForward(inputs.speed); turn(inputs.turnAngle);';

// Missing 'turnAngle' => runFrame throws a missing input error
await simulation.runFrame('JavaScript', { speed: 2 }, 'cpu');`;

const DSL_GRAMMAR_SNIPPET = `// Input declarations
input speed = 2;
input perception = 40 [0, 100];

// Variables
var nearby = neighbors(inputs.perception);

// Conditionals
if (nearby.length > 0) {
  var avgX = mean(nearby.x);
  vx += (avgX - x) * 0.02;
} else {
  turn(0.02);
}

// Loops
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

// Arithmetic and math in expressions:
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

// 2) Avoid repeated expensive calls by caching
var sL = sense(0.4, 15);
var sR = sense(-0.4, 15);

// 3) Prefer simple arithmetic over deep nesting
if (sL > sR) {
  turn(0.2);
}

// 4) Use renderMode='none' for pure compute benchmarks
// await simulation.runFrame('WebGPU', inputs, 'none');`;

const EXAMPLE_HTML_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #0c1216;
        color: #dff9f4;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .shell {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto auto 1fr;
        gap: 10px;
        padding: 14px;
        box-sizing: border-box;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
      .row button {
        border: 0;
        border-radius: 8px;
        padding: 8px 12px;
        background: #25b8a8;
        color: #07211f;
        font-weight: 700;
        cursor: pointer;
      }
      .row label {
        font-size: 12px;
      }
      .row input[type='range'] {
        width: 160px;
      }
      #sim {
        width: min(100%, 980px);
        aspect-ratio: 4 / 3;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 10px;
        background: #000;
      }
      .hint {
        font-size: 12px;
        opacity: 0.75;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="row">
        <button id="toggle">Start</button>
        <span class="hint">Loaded from docs runner</span>
      </div>
      <div class="row" id="controls"></div>
      <canvas id="sim" width="800" height="600"></canvas>
    </div>
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

const EXAMPLE_BOIDS_CONTROLS_JS = `import { Simulation } from '${CDN_IMPORT_URL}';

const canvas = document.getElementById('sim');
const toggle = document.getElementById('toggle');
const controls = document.getElementById('controls');

controls.innerHTML = [
  '<label>perception <input id="p" type="range" min="10" max="80" step="1" value="40"></label>',
  '<label>alignment <input id="a" type="range" min="0" max="0.08" step="0.001" value="0.01"></label>',
  '<label>cohesion <input id="c" type="range" min="0" max="0.08" step="0.001" value="0.01"></label>',
  '<label>separation <input id="s" type="range" min="0" max="0.2" step="0.001" value="0.06"></label>'
].join('');

const simulation = new Simulation({
  canvas,
  source: { kind: 'dsl', code: ${DSL_LITERAL(PRESET_BOIDS)} },
  options: { agents: 7000 },
});

let running = false;

const inputs = {
  get perceptionRadius() { return Number(document.getElementById('p').value); },
  get alignmentFactor() { return Number(document.getElementById('a').value); },
  get cohesionFactor() { return Number(document.getElementById('c').value); },
  get separationFactor() { return Number(document.getElementById('s').value); },
  separationDist: 40,
  maxSpeed: 1,
  dt: 1,
};

async function tick() {
  if (!running) return;
  await simulation.runFrame('JavaScript', {
    perceptionRadius: inputs.perceptionRadius,
    alignmentFactor: inputs.alignmentFactor,
    cohesionFactor: inputs.cohesionFactor,
    separationFactor: inputs.separationFactor,
    separationDist: inputs.separationDist,
    maxSpeed: inputs.maxSpeed,
    dt: inputs.dt,
  }, 'cpu');
  requestAnimationFrame(tick);
}

toggle.addEventListener('click', () => {
  running = !running;
  toggle.textContent = running ? 'Stop' : 'Start';
  if (running) tick();
});`;

const EXAMPLE_GPU_TRAILS_JS = `import { Simulation } from '${CDN_IMPORT_URL}';

const canvas = document.getElementById('sim');
const toggle = document.getElementById('toggle');

const simulation = new Simulation({
  canvas,
  source: { kind: 'dsl', code: ${DSL_LITERAL(PRESET_SLIME_MOLD)} },
  options: { agents: 24000 },
  appearance: {
    showTrails: true,
    trailColor: '#6bffd9',
    trailOpacity: 1,
    backgroundColor: '#000000',
    agentColor: '#d9fff8',
    agentSize: 1.1,
    agentShape: 'circle',
    obstacleColor: '#FF0000',
    obstacleBorderColor: '#FF0000',
    obstacleOpacity: 0.2,
  },
});

await simulation.initGPU();

let running = false;

async function tick() {
  if (!running) return;
  await simulation.runFrame('WebGPU', {}, 'gpu');
  requestAnimationFrame(tick);
}

toggle.addEventListener('click', () => {
  running = !running;
  toggle.textContent = running ? 'Stop' : 'Start';
  if (running) tick();
});`;

const EXAMPLE_PREDATOR_PREY_JS = `import { Simulation } from '${CDN_IMPORT_URL}';

const canvas = document.getElementById('sim');
const toggle = document.getElementById('toggle');

const simulation = new Simulation({
  canvas,
  source: { kind: 'dsl', code: ${DSL_LITERAL(PRESET_PREDATOR_PREY)} },
  options: { agents: 9000 },
});

let running = false;

async function tick() {
  if (!running) return;
  await simulation.runFrame('WebAssembly', {}, 'cpu');
  requestAnimationFrame(tick);
}

toggle.addEventListener('click', () => {
  running = !running;
  toggle.textContent = running ? 'Stop' : 'Start';
  if (running) tick();
});`;

const EXAMPLE_HEADLESS_BENCH_JS = `import { Simulation } from '${CDN_IMPORT_URL}';

const canvas = document.getElementById('sim');
const toggle = document.getElementById('toggle');

const simulation = new Simulation({
  canvas,
  source: { kind: 'dsl', code: ${DSL_LITERAL(PRESET_TRAFFIC)} },
  options: { agents: 25000 },
  tracking: {
    enabled: true,
    captureAgentStates: false,
    captureFrameInputs: false,
    captureLogs: true,
    captureDeviceMetrics: true,
  },
});

await simulation.initGPU();

let running = false;
let frames = 0;

async function tick() {
  if (!running) return;

  await simulation.runFrame('WebGPU', {}, 'none');
  frames += 1;

  if (frames % 120 === 0) {
    const report = simulation.getTrackingReport({ includeAgentPositions: false });
    console.log('frames:', report.summary.frameCount, 'avg(ms):', report.summary.averageExecutionMs);
  }

  requestAnimationFrame(tick);
}

toggle.addEventListener('click', () => {
  running = !running;
  toggle.textContent = running ? 'Stop' : 'Start';
  if (running) tick();
});`;

export const docsV010: DocsVersion = {
  id: `v${CURRENT_VERSION}`,
  packageVersion: CURRENT_VERSION,
  releaseDate: '2026-02-22',
  sections: [
    {
      id: 'getting-started',
      title: 'Getting Started',
      pages: [
        { id: 'overview', title: 'Overview' },
        { id: 'installation', title: 'Installation' },
        { id: 'quick-start', title: 'Quick Start' },
        { id: 'integration-guide', title: 'Integration Guide' },
      ],
    },
    {
      id: 'core-api',
      title: 'Core API',
      pages: [
        { id: 'simulation-api', title: 'Simulation API' },
        { id: 'constructor-reference', title: 'Constructor Reference' },
        { id: 'run-frame-reference', title: 'runFrame Reference' },
        { id: 'runtime-updates', title: 'Runtime Updates' },
        { id: 'backends-rendering', title: 'Backends and Rendering' },
        { id: 'tracking-benchmarking', title: 'Tracking and Benchmarking' },
        { id: 'custom-source', title: 'Custom Source API' },
        { id: 'troubleshooting', title: 'Troubleshooting' },
      ],
    },
    {
      id: 'dsl-guide',
      title: 'DSL Guide',
      pages: [
        { id: 'dsl-basics', title: 'DSL Basics' },
        { id: 'dsl-commands', title: 'Commands Reference' },
        { id: 'dsl-functions', title: 'Functions Reference' },
        { id: 'dsl-patterns', title: 'Patterns and Recipes' },
        { id: 'preset-gallery', title: 'Preset Gallery' },
        { id: 'dsl-performance', title: 'Performance Guidance' },
      ],
    },
    {
      id: 'examples',
      title: 'Examples',
      pages: [{ id: 'examples', title: 'Runnable Examples' }],
    },
  ],
  pages: [
    {
      id: 'overview',
      title: 'Overview',
      description:
        'Agentyx is a browser-native agent simulation engine with a DSL compiler and multi-backend execution pipeline.',
      sections: [
        {
          id: 'core-capabilities',
          title: 'Core Capabilities',
          bullets: [
            'DSL-to-multi-target compiler: JavaScript, WGSL, and WAT outputs from one source.',
            'Compute backends: JavaScript, WebWorkers, WebAssembly, WebGPU.',
            'Render modes: cpu, gpu, and none for headless execution.',
            'Deterministic-friendly setup options, including seeded agent initialization.',
            'Built-in performance monitoring and structured tracking reports.',
          ],
        },
        {
          id: 'architecture-notes',
          title: 'Execution Architecture',
          paragraphs: [
            'A Simulation instance normalizes source, compiles once, initializes agent state, and then runs per-frame through a compute engine and renderer. Input values are merged each frame with engine-provided defaults such as width, height, agents, trail buffers, random buffers, and obstacles.',
            'The exact same DSL script can be benchmarked across compute methods without rewriting host logic. This is useful for parity testing, device comparisons, and scaling studies.',
          ],
        },
      ],
    },
    {
      id: 'installation',
      title: 'Installation',
      description: 'Install the package and prepare your host application canvas and runtime loop.',
      sections: [
        {
          id: 'npm',
          title: 'NPM',
          snippets: [
            {
              title: 'Install package',
              language: 'bash',
              code: INSTALL_SNIPPET,
            },
          ],
        },
        {
          id: 'imports',
          title: 'Imports',
          snippets: [
            {
              title: 'Common imports',
              language: 'ts',
              code: IMPORT_SNIPPET,
            },
          ],
        },
        {
          id: 'dom-setup',
          title: 'Canvas Setup',
          paragraphs: [
            'Single canvas is supported by default. Add a dedicated GPU canvas when your app frequently alternates between CPU and GPU rendering in the same session.',
          ],
          snippets: [
            {
              title: 'Canvas elements',
              language: 'html',
              code: HTML_CANVAS_SETUP,
            },
          ],
        },
      ],
    },
    {
      id: 'quick-start',
      title: 'Quick Start',
      description: 'Minimal end-to-end setup: constructor, frame loop, and dynamic inputs.',
      sections: [
        {
          id: 'minimal-ts',
          title: 'Minimal TypeScript Integration',
          snippets: [
            {
              title: 'Single-canvas quick start',
              language: 'ts',
              code: QUICK_START_TYPESCRIPT,
            },
          ],
        },
        {
          id: 'gpu-mode',
          title: 'WebGPU Path',
          paragraphs: [
            'Call initGPU before WebGPU compute or GPU render mode. If the browser lacks WebGPU support, switch to JavaScript, WebWorkers, or WebAssembly compute methods.',
          ],
          snippets: [
            {
              title: 'WebGPU on one canvas',
              language: 'ts',
              code: GPU_SINGLE_CANVAS,
            },
            {
              title: 'Dedicated gpuCanvas for mixed render pipelines',
              language: 'ts',
              code: GPU_TWO_CANVAS,
            },
          ],
        },
      ],
    },
    {
      id: 'integration-guide',
      title: 'Integration Guide',
      description: 'Recommended host-application integration patterns for real products.',
      sections: [
        {
          id: 'lifecycle',
          title: 'Lifecycle Pattern',
          bullets: [
            'Construct Simulation once per scenario instead of every frame.',
            'Use requestAnimationFrame for visual loops and a custom timer for fixed-step headless sweeps.',
            'Call destroy on teardown/unmount to release compute resources and finalize tracking.',
          ],
        },
        {
          id: 'state-management',
          title: 'State and Inputs',
          paragraphs: [
            'Use setInputs for sticky defaults and pass per-frame overrides to runFrame for frequently-changing values.',
            'For UI controls, keep host-side state in your framework and pass a compact input object each frame. Avoid re-instantiating Simulation when only parameter values change.',
          ],
        },
      ],
    },
    {
      id: 'simulation-api',
      title: 'Simulation API',
      description: 'Main class surface area and runtime behavior guarantees.',
      sections: [
        {
          id: 'constructor-overview',
          title: 'Constructor Basics',
          paragraphs: [
            'Simulation accepts either source.kind="dsl" or source.kind="custom". The legacy agentScript shorthand is equivalent to source.kind="dsl".',
            'Agent count must be a positive finite integer and cannot exceed the package MAX_AGENTS safety ceiling.',
          ],
          snippets: [
            {
              title: 'Minimal constructor',
              language: 'ts',
              code: CONSTRUCTOR_MINIMAL,
            },
          ],
        },
        {
          id: 'frame-runner',
          title: 'Frame Execution Contract',
          paragraphs: [
            'runFrame returns frameNumber, agents, and skipped. If a previous frame is still in progress, the call returns quickly with skipped=true and no new compute dispatch.',
            'Method availability is validated against compiled output. For example, WebGPU requires generated WGSL; WebAssembly requires generated WAT.',
          ],
          snippets: [
            {
              title: 'Compute/render combinations',
              language: 'ts',
              code: RUNFRAME_MATRIX,
            },
          ],
        },
      ],
    },
    {
      id: 'constructor-reference',
      title: 'Constructor Reference',
      description: 'Detailed constructor fields and production-ready setup patterns.',
      sections: [
        {
          id: 'full-reference',
          title: 'Full Constructor Example',
          snippets: [
            {
              title: 'All key fields',
              language: 'ts',
              code: CONSTRUCTOR_FULL,
            },
          ],
        },
        {
          id: 'field-notes',
          title: 'Field Notes',
          bullets: [
            'canvas: required for cpu and gpu rendering modes.',
            'gpuCanvas: optional but recommended for frequent cpu/gpu mode switching.',
            'options.seed: deterministic initial placement helper for repeatable scenarios.',
            'options.workers: only applies to WebWorkers method.',
            'tracking metadata: attach benchmark labels, commit identifiers, and scenario tags.',
          ],
        },
      ],
    },
    {
      id: 'run-frame-reference',
      title: 'runFrame Reference',
      description: 'Method semantics, render modes, and practical dispatch strategies.',
      sections: [
        {
          id: 'signature',
          title: 'Signature',
          snippets: [
            {
              title: 'Type shape',
              language: 'ts',
              code: `runFrame(method: Method, inputValues?: InputValues, renderMode?: RenderMode)
  => Promise<{ frameNumber: number; agents: Agent[]; skipped: boolean }>`
            },
          ],
        },
        {
          id: 'dispatch-guidance',
          title: 'Dispatch Guidance',
          bullets: [
            'Use renderMode="none" when collecting compute-only benchmarks.',
            'Use WebGPU + renderMode="gpu" for highest-throughput visual workloads.',
            'Use WebAssembly for robust CPU fallback with predictable performance profile.',
            'Treat skipped=true as backpressure signal and avoid stacking additional async frame calls.',
          ],
        },
      ],
    },
    {
      id: 'runtime-updates',
      title: 'Runtime Updates',
      description: 'How to mutate inputs, appearance, obstacles, and dimensions without recreation.',
      sections: [
        {
          id: 'mutations',
          title: 'Runtime Mutation APIs',
          snippets: [
            {
              title: 'setInputs, setObstacles, setCanvasDimensions, updateAppearance',
              language: 'ts',
              code: RUNTIME_UPDATES,
            },
          ],
        },
        {
          id: 'best-practices',
          title: 'Best Practices',
          bullets: [
            'Prefer updating appearance and inputs over rebuilding Simulation instances.',
            'Pass only changed frame inputs for reduced host overhead.',
            'When using obstacle avoidance in DSL, always keep obstacle arrays synchronized with setObstacles or per-frame inputs.',
          ],
        },
      ],
    },
    {
      id: 'backends-rendering',
      title: 'Backends and Rendering',
      description: 'Compute backend comparison and render mode decision framework.',
      sections: [
        {
          id: 'compute-methods',
          title: 'Compute Methods',
          bullets: [
            'JavaScript: lowest setup cost and simplest debugging path.',
            'WebWorkers: parallel CPU execution, useful for larger populations on multi-core hosts.',
            'WebAssembly: compiled CPU path with explicit memory transfer costs.',
            'WebGPU: GPU compute path with optional zero-copy rendering.',
          ],
        },
        {
          id: 'rendering-modes',
          title: 'Render Modes',
          bullets: [
            'cpu: 2D canvas raster rendering.',
            'gpu: WebGPU rendering pipeline (instanced draws, trail overlays).',
            'none: no rendering; use for repeatable throughput studies.',
          ],
        },
        {
          id: 'canvas-guidance',
          title: 'Canvas Guidance',
          paragraphs: [
            'Single-canvas setup is ergonomic for many apps. If you encounter browser context acquisition issues while switching render modes, configure a dedicated gpuCanvas.',
            'This pattern avoids conflicts between 2D and WebGPU contexts and keeps mode transitions predictable.',
          ],
        },
      ],
    },
    {
      id: 'tracking-benchmarking',
      title: 'Tracking and Benchmarking',
      description: 'PerformanceMonitor and SimulationTracker deep reference.',
      sections: [
        {
          id: 'performance-monitor',
          title: 'PerformanceMonitor',
          paragraphs: [
            'PerformanceMonitor stores per-frame timing snapshots such as setup, compute, render, readback, and total execution time.',
          ],
          snippets: [
            {
              title: 'Performance monitor usage',
              language: 'ts',
              code: PERF_MONITOR_SNIPPET,
            },
          ],
        },
        {
          id: 'tracking-report',
          title: 'SimulationTracker Report Flow',
          snippets: [
            {
              title: 'Tracking lifecycle',
              language: 'ts',
              code: TRACKING_SNIPPET,
            },
          ],
          bullets: [
            'captureAgentStates can significantly increase memory footprint on long runs.',
            'captureFrameInputs sanitizes arrays/typed arrays/functions into serializable forms.',
            'environment metrics include browser, device, and GPU capability data when available.',
          ],
        },
      ],
    },
    {
      id: 'custom-source',
      title: 'Custom Source API',
      description: 'Bypass the DSL compiler and supply pre-compiled or host-defined kernels.',
      sections: [
        {
          id: 'custom-source-example',
          title: 'Custom Source Example',
          snippets: [
            {
              title: 'source.kind = custom',
              language: 'ts',
              code: CUSTOM_SOURCE_SNIPPET,
            },
          ],
        },
        {
          id: 'custom-source-notes',
          title: 'Requirements',
          bullets: [
            'Provide code for each method you plan to execute.',
            'requiredInputs should list all host-supplied runtime dependencies.',
            'Set numRandomCalls when your custom kernels consume randomValues buffers.',
          ],
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      description: 'Common failures, diagnostics, and corrective actions.',
      sections: [
        {
          id: 'missing-inputs',
          title: 'Missing Input Errors',
          paragraphs: [
            'If runFrame throws missing required input values, inspect your DSL for inputs.<name> references and ensure each value is present either as input declaration defaults or host-provided runtime values.',
          ],
          snippets: [
            {
              title: 'Typical missing input scenario',
              language: 'ts',
              code: MISSING_INPUTS_SNIPPET,
            },
          ],
        },
        {
          id: 'gpu-issues',
          title: 'WebGPU and Canvas Issues',
          bullets: [
            'Call initGPU before WebGPU method dispatches.',
            'Use dedicated gpuCanvas when mixing CPU and GPU rendering frequently.',
            'Fallback to JavaScript/WebWorkers/WebAssembly on unsupported environments.',
          ],
        },
        {
          id: 'resource-cleanup',
          title: 'Cleanup',
          paragraphs: [
            'Always call simulation.destroy when ending a run or unmounting an app view. This finalizes tracking and releases internal compute resources.',
          ],
        },
      ],
    },
    {
      id: 'dsl-basics',
      title: 'DSL Basics',
      description: 'Language model, flow control, and agent field semantics.',
      sections: [
        {
          id: 'grammar',
          title: 'Core Grammar',
          snippets: [
            {
              title: 'Input, variables, loops, conditionals',
              language: 'dsl',
              code: DSL_GRAMMAR_SNIPPET,
            },
          ],
        },
        {
          id: 'built-ins',
          title: 'Built-in Agent Fields',
          bullets: [
            'id: stable agent identifier.',
            'x, y: world-space position.',
            'vx, vy: velocity components.',
            'species: per-agent species index.',
          ],
        },
        {
          id: 'special-environments',
          title: 'Special Environments',
          snippets: [
            {
              title: 'Trails and sensing',
              language: 'dsl',
              code: TRAIL_DSL_SNIPPET,
            },
            {
              title: 'Obstacle avoidance',
              language: 'dsl',
              code: OBSTACLE_DSL_SNIPPET,
            },
            {
              title: 'Multi-species control',
              language: 'dsl',
              code: MULTI_SPECIES_DSL_SNIPPET,
            },
          ],
        },
      ],
    },
    {
      id: 'dsl-commands',
      title: 'Commands Reference',
      description: 'Command surface parsed by the DSL parser and emitted by command registry targets.',
      sections: [
        {
          id: 'command-list',
          title: 'Available Commands',
          snippets: [
            {
              title: 'Command registry list',
              language: 'dsl',
              code: COMMAND_REFERENCE,
            },
          ],
        },
        {
          id: 'command-notes',
          title: 'Operational Notes',
          bullets: [
            'enableTrails and species are configuration-oriented and influence compilation/runtime setup.',
            'deposit and sense require trail-map-related inputs and dimensions.',
            'avoidObstacles expects obstacle buffers/arrays from host inputs.',
            'borderWrapping and borderBounce require width and height context.',
          ],
        },
      ],
    },
    {
      id: 'dsl-functions',
      title: 'Functions Reference',
      description: 'Built-in functions and expression semantics recognized by the compiler pipeline.',
      sections: [
        {
          id: 'function-list',
          title: 'Built-in Functions',
          snippets: [
            {
              title: 'Function signatures and operators',
              language: 'dsl',
              code: FUNCTION_REFERENCE,
            },
          ],
        },
        {
          id: 'function-semantics',
          title: 'Semantics and Parity',
          bullets: [
            'neighbors(radius) builds neighbor context for aggregate and foreach patterns.',
            'mean(collection.property) computes aggregation values from tracked neighbor sets.',
            'random() calls are indexed at compile-time for consistent buffer-driven behavior across backends.',
            'Expressions are transformed per target to preserve expected arithmetic behavior.',
          ],
        },
      ],
    },
    {
      id: 'dsl-patterns',
      title: 'Patterns and Recipes',
      description: 'Reusable behavior motifs from real simulation classes.',
      sections: [
        {
          id: 'boids-recipe',
          title: 'Boids Pattern (Alignment + Cohesion + Separation)',
          paragraphs: [
            'Use neighbors for local context, mean for aggregate steering targets, and separation forces for collision avoidance. This pattern balances global flow and local stability.',
          ],
          snippets: [
            {
              title: 'Boids preset',
              language: 'dsl',
              code: PRESET_BOIDS,
            },
          ],
        },
        {
          id: 'predator-prey-recipe',
          title: 'Predator-Prey Pattern',
          paragraphs: [
            'Species-based branching lets you run multiple behavior classes in one script. Predators can pursue, prey can flock and evade, and both share world constraints.',
          ],
          snippets: [
            {
              title: 'Predator-Prey preset',
              language: 'dsl',
              code: PRESET_PREDATOR_PREY,
            },
          ],
        },
        {
          id: 'trail-swarm-recipe',
          title: 'Trail Following Pattern',
          snippets: [
            {
              title: 'Slime Mold preset',
              language: 'dsl',
              code: PRESET_SLIME_MOLD,
            },
          ],
        },
      ],
    },
    {
      id: 'preset-gallery',
      title: 'Preset Gallery',
      description: 'Reference implementations from the built-in WebSimBench presets.',
      sections: [
        {
          id: 'preset-listing',
          title: 'Included Presets',
          bullets: [
            'Slime Mold',
            'Boids',
            'Fire',
            'Fluid Dispersal',
            'Predator-Prey',
            'Rain',
            'Multi-Species Boids',
            'Traffic',
            'Cosmic Web',
          ],
        },
        {
          id: 'fire-preset',
          title: 'Fire Preset',
          snippets: [
            {
              title: 'Fire',
              language: 'dsl',
              code: PRESET_FIRE,
            },
          ],
        },
        {
          id: 'fluid-preset',
          title: 'Fluid Dispersal Preset',
          snippets: [
            {
              title: 'Fluid Dispersal',
              language: 'dsl',
              code: PRESET_FLUID,
            },
          ],
        },
        {
          id: 'multi-species-preset',
          title: 'Multi-Species Boids Preset',
          snippets: [
            {
              title: 'Multi-Species Boids',
              language: 'dsl',
              code: PRESET_MULTI_SPECIES,
            },
          ],
        },
        {
          id: 'traffic-and-cosmic',
          title: 'Traffic and Cosmic Web Presets',
          snippets: [
            {
              title: 'Traffic',
              language: 'dsl',
              code: PRESET_TRAFFIC,
            },
            {
              title: 'Cosmic Web',
              language: 'dsl',
              code: PRESET_COSMIC_WEB,
            },
            {
              title: 'Rain',
              language: 'dsl',
              code: PRESET_RAIN,
            },
          ],
        },
      ],
    },
    {
      id: 'dsl-performance',
      title: 'Performance Guidance',
      description: 'Practical optimization guidelines for larger-scale workloads.',
      sections: [
        {
          id: 'tips',
          title: 'Compiler and Runtime Tips',
          snippets: [
            {
              title: 'Performance-oriented DSL style',
              language: 'dsl',
              code: DSL_PERFORMANCE_TIPS_SNIPPET,
            },
          ],
          bullets: [
            'Bound neighbor radii to the smallest value that preserves behavior quality.',
            'Cache repeated subexpressions in var declarations instead of recomputing.',
            'Profile with renderMode="none" to isolate compute costs from rendering costs.',
            'Use tracking reports to compare method-level setup/compute/readback breakdowns.',
          ],
        },
      ],
    },
    {
      id: 'examples',
      title: 'Runnable Examples',
      description:
        'Edit HTML and JavaScript snippets, then execute them in an isolated iframe preview.',
      sections: [
        {
          id: 'runner-notes',
          title: 'Runner Notes',
          paragraphs: [
            'Examples load @websimbench/agentyx from esm.sh using the current package version. This keeps examples runnable without a local bundler setup.',
            'The preview uses iframe srcdoc. Click Run after changes to recompile and execute the updated script.',
          ],
        },
      ],
    },
  ],
  runnableExamples: [
    {
      id: 'basic-cpu',
      title: 'Basic CPU Loop',
      description: 'Minimal JavaScript compute + cpu render integration.',
      html: EXAMPLE_HTML_TEMPLATE,
      javascript: EXAMPLE_BASIC_JS,
    },
    {
      id: 'boids-controls',
      title: 'Boids with Host Controls',
      description: 'Preset boids script with UI sliders mapped to runtime inputs.',
      html: EXAMPLE_HTML_TEMPLATE,
      javascript: EXAMPLE_BOIDS_CONTROLS_JS,
    },
    {
      id: 'gpu-trails',
      title: 'GPU Trails (Slime Mold)',
      description: 'Trail/sense simulation using WebGPU compute and gpu render mode.',
      html: EXAMPLE_HTML_TEMPLATE,
      javascript: EXAMPLE_GPU_TRAILS_JS,
    },
    {
      id: 'predator-prey',
      title: 'Predator-Prey (WASM CPU)',
      description: 'Species behavior with WebAssembly compute backend and cpu rendering.',
      html: EXAMPLE_HTML_TEMPLATE,
      javascript: EXAMPLE_PREDATOR_PREY_JS,
    },
    {
      id: 'headless-benchmark',
      title: 'Headless Benchmark Style',
      description: 'WebGPU compute in renderMode=none with periodic report logging.',
      html: EXAMPLE_HTML_TEMPLATE,
      javascript: EXAMPLE_HEADLESS_BENCH_JS,
    },
  ],
};
