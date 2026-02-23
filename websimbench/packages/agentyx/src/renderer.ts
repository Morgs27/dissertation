/**
 * @module renderer
 * CPU and GPU rendering for agent-based simulations.
 *
 * The {@link Renderer} draws agents and trail maps to either a 2D Canvas
 * (CPU mode) or a WebGPU canvas (GPU mode) using instanced rendering.
 */

import GPU from "./helpers/gpu";
import type { Agent, SimulationAppearance } from "./types";
import type { WebGPURenderResources } from "./compute/webGPU";

/** @internal Size of a single f32 value in bytes. */
const GPU_FLOAT_SIZE = 4;
/** @internal Number of f32 components per agent (id, x, y, vx, vy, species). */
const GPU_AGENT_COMPONENTS = 6;
/** @internal Byte stride between consecutive agents in a GPU buffer. */
const GPU_AGENT_STRIDE = GPU_AGENT_COMPONENTS * GPU_FLOAT_SIZE;
/** @internal Vertex data for a fullscreen quad (two triangles). */
const GPU_QUAD_VERTICES = new Float32Array([
  -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1,
]);

/** @internal Default species colour palette (8 colours). */
const SPECIES_PALETTE = [
  "#00FFFF", // Cyan (species 0 — default)
  "#FF4466", // Red-pink
  "#44FF66", // Green
  "#FFAA22", // Orange
  "#AA66FF", // Purple
  "#FFFF44", // Yellow
  "#FF66AA", // Pink
  "#66AAFF", // Light blue
];

/**
 * Convert a hex colour string to normalised RGB components (0–1).
 *
 * @param hex - Six-digit hex string with leading `#`.
 * @returns Object with `r`, `g`, `b`, and `a` fields.
 * @internal
 */
function hexToRgb(color: any) {
  if (Array.isArray(color)) {
    return {
      r: Math.max(0, Math.min(1, (color[0] ?? 0) / 255)),
      g: Math.max(0, Math.min(1, (color[1] ?? 0) / 255)),
      b: Math.max(0, Math.min(1, (color[2] ?? 0) / 255)),
      a: Math.max(0, Math.min(1, color[3] ?? 1.0)),
    };
  }

  if (typeof color !== "string") {
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  let hex = color.trim();
  if (hex.startsWith("#")) {
    hex = hex.slice(1);
  }

  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;

    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      return { r, g, b, a };
    }
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

/**
 * Converts any supported color format into a valid CSS `rgba()` string.
 * @internal
 */
function toCssColor(color: any): string {
  const { r, g, b, a } = hexToRgb(color);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

/**
 * Handles rendering of agents and trail maps to either a 2D Canvas (CPU)
 * or a WebGPU canvas (GPU) with instanced draw calls.
 *
 * The renderer is created internally by the {@link Simulation} class when
 * a canvas element is provided in the constructor configuration.
 */
export class Renderer {
  /** The primary 2D canvas element used for CPU rendering. */
  public canvas: HTMLCanvasElement;

  private ctx: CanvasRenderingContext2D | null = null;
  private gpuCanvas: HTMLCanvasElement | null = null;
  private readonly usesSharedGpuCanvas: boolean;
  private appearance: SimulationAppearance;

  private gpuHelper: GPU;
  private gpuDevice: GPUDevice | null = null;
  private gpuPipeline: GPURenderPipeline | null = null;
  private gpuBindGroupLayout: GPUBindGroupLayout | null = null;
  private gpuQuadBuffer: GPUBuffer | null = null;
  private gpuUniformBuffer: GPUBuffer | null = null;
  private gpuUniformBufferSize = 0;
  private gpuAgentBuffer: GPUBuffer | null = null;
  private gpuAgentBufferSize = 0;
  private gpuPipelineDevice: GPUDevice | null = null;

  private gpuManualTrailBuffer: GPUBuffer | null = null;
  private gpuManualTrailBufferSize = 0;

  private gpuTrailPipeline: GPURenderPipeline | null = null;
  private gpuTrailBindGroupLayout: GPUBindGroupLayout | null = null;

  /**
   * Create a new renderer.
   *
   * @param canvas - The primary canvas element for 2D/CPU rendering.
   * @param gpuCanvas - Optional separate canvas element for WebGPU rendering.
   * If omitted, the primary canvas is reused for GPU output.
   * @param appearance - Initial visual appearance configuration.
   */
  constructor(
    canvas: HTMLCanvasElement,
    gpuCanvas: HTMLCanvasElement | null,
    appearance: SimulationAppearance,
  ) {
    this.canvas = canvas;
    this.gpuCanvas = gpuCanvas ?? canvas;
    this.usesSharedGpuCanvas = !gpuCanvas;
    this.appearance = appearance;
    this.gpuHelper = new GPU("RendererGPU");
  }

  /**
   * Provide a GPU device for WebGPU rendering operations.
   *
   * @param device - The WebGPU device obtained via {@link GPU.getDevice}.
   */
  public initGPU(device: GPUDevice): void {
    this.gpuDevice = device;
  }

  /**
   * Get the current appearance configuration.
   *
   * @returns The active {@link SimulationAppearance}.
   */
  public getAppearance(): SimulationAppearance {
    return this.appearance;
  }

  /**
   * Replace the appearance configuration.
   *
   * @param appearance - New appearance settings.
   */
  public setAppearance(appearance: SimulationAppearance): void {
    this.appearance = appearance;
  }

  /**
   * Clear the canvas and fill with the configured background colour.
   */
  public renderBackground(): void {
    const ctx = this.ensureContext();
    ctx.fillStyle = toCssColor(this.appearance.backgroundColor);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render the trail map to the 2D canvas using pixel-level blending.
   *
   * Each pixel is linearly interpolated between the background colour and
   * the trail colour based on the trail intensity at that position.
   *
   * @param trailMap - Trail intensity buffer (width × height).
   * @param width - Canvas width in pixels.
   * @param height - Canvas height in pixels.
   */
  public renderTrails(
    trailMap: Float32Array,
    width: number,
    height: number,
  ): void {
    const ctx = this.ensureContext();
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const { r, g, b } = hexToRgb(this.appearance.trailColor);
    const R = r * 255;
    const G = g * 255;
    const B = b * 255;

    const bgRgb = hexToRgb(this.appearance.backgroundColor);
    const bgR = bgRgb.r * 255;
    const bgG = bgRgb.g * 255;
    const bgB = bgRgb.b * 255;

    for (let i = 0; i < trailMap.length; i++) {
      const intensity = trailMap[i] * (this.appearance.trailOpacity ?? 1.0);
      const inv = 1 - Math.min(1, Math.max(0, intensity));
      const safeInt = 1 - inv;

      data[i * 4] = R * safeInt + bgR * inv;
      data[i * 4 + 1] = G * safeInt + bgG * inv;
      data[i * 4 + 2] = B * safeInt + bgB * inv;
      data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Render agents to the 2D canvas using the configured shape and species colours.
   *
   * @param agents - Array of agent positions to render.
   */
  public renderAgents(agents: Agent[]): void {
    const ctx = this.ensureContext();

    const radius = this.appearance.agentSize;
    const isCircle = this.appearance.agentShape === "circle";

    const palette =
      this.appearance.speciesColors && this.appearance.speciesColors.length > 0
        ? this.appearance.speciesColors
        : SPECIES_PALETTE;

    agents.forEach((agent) => {
      const speciesIdx = agent.species || 0;
      ctx.fillStyle = toCssColor(palette[speciesIdx % palette.length]);
      ctx.beginPath();
      if (isCircle) {
        ctx.arc(agent.x, agent.y, radius, 0, Math.PI * 2);
      } else {
        ctx.rect(agent.x - radius, agent.y - radius, radius * 2, radius * 2);
      }
      ctx.fill();
    });
  }

  /**
   * Render agents using WebGPU instanced draw calls.
   *
   * Falls back to uploading agent data from CPU buffers if GPU-resident
   * render resources are not provided.
   *
   * @param agents - Agent array (used for CPU fallback buffer upload).
   * @param resources - Optional GPU-resident render resources from the compute engine.
   * @param trailMap - Optional CPU-side trail map for manual GPU upload.
   */
  public async renderAgentsGPU(
    agents: Agent[],
    resources?: WebGPURenderResources,
    trailMap?: Float32Array,
  ): Promise<void> {
    if (!this.gpuCanvas || !this.gpuDevice) return;

    try {
      this.gpuHelper.configureCanvas(this.gpuCanvas);
    } catch (error) {
      if (this.usesSharedGpuCanvas) {
        throw new Error(
          "Failed to acquire WebGPU context on the primary canvas. " +
            "Provide a dedicated gpuCanvas when switching between CPU and GPU rendering at runtime.",
        );
      }

      throw error;
    }

    this.gpuHelper.setupCanvasConfig(this.gpuDevice);

    this.configurePipeline(this.gpuDevice);
    this.configureTrailPipeline(this.gpuDevice);

    const renderResources =
      resources ?? this.prepareAgentBuffer(this.gpuDevice, agents);

    let trailBuffer = renderResources.trailMapBuffer;

    if (!trailBuffer && trailMap) {
      trailBuffer = this.prepareManualTrailBuffer(this.gpuDevice, trailMap);
    }

    this.executeRender(this.gpuDevice, renderResources, trailBuffer);
  }

  /**
   * Create or reuse the agent-rendering GPU pipeline (WGSL shaders + layout).
   *
   * @param device - The WebGPU device.
   * @internal
   */
  private configurePipeline(device: GPUDevice): void {
    if (this.gpuPipeline && this.gpuPipelineDevice === device) return;
    if (this.gpuPipeline && this.gpuPipelineDevice !== device) {
      this.resetGPUState();
    }

    this.gpuBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const shaderCode = `
      struct RenderUniforms {
        width: f32,
        height: f32,
        radius: f32,
        shape: f32,
        colorR: f32,
        colorG: f32,
        colorB: f32,
        speciesCount: f32,
      };
      struct SpeciesColors {
        colors: array<vec4<f32>, 8>,
      };
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
        @location(1) @interpolate(flat) speciesIdx: u32
      };
      @group(0) @binding(0) var<uniform> uniforms: RenderUniforms;
      @group(0) @binding(1) var<uniform> speciesColors: SpeciesColors;

      @vertex fn vs_main(@location(0) quadPos: vec2<f32>, @location(1) agentPos: vec2<f32>, @location(2) agentSpecies: f32) -> VertexOutput {
        var out: VertexOutput;
        let scaled = quadPos * uniforms.radius;
        let world = agentPos + scaled;
        let clipX = (world.x / uniforms.width) * 2.0 - 1.0;
        let clipY = 1.0 - (world.y / uniforms.height) * 2.0;
        out.position = vec4<f32>(clipX, clipY, 0.0, 1.0);
        out.uv = quadPos;
        out.speciesIdx = u32(agentSpecies);
        return out;
      }

      @fragment fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
        if (uniforms.shape > 0.5) {
          if (length(input.uv) > 1.0) {
            discard;
          }
        }
        let idx = input.speciesIdx % 8u;
        let col = speciesColors.colors[idx];
        return vec4<f32>(col.r, col.g, col.b, 1.0);
      }
    `;

    const shaderModule = device.createShaderModule({ code: shaderCode });

    this.gpuPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.gpuBindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 2 * GPU_FLOAT_SIZE,
            attributes: [
              {
                shaderLocation: 0,
                format: "float32x2" as GPUVertexFormat,
                offset: 0,
              },
            ],
          },
          {
            arrayStride: GPU_AGENT_STRIDE,
            stepMode: "instance" as GPUVertexStepMode,
            attributes: [
              {
                shaderLocation: 1,
                format: "float32x2" as GPUVertexFormat,
                offset: GPU_FLOAT_SIZE,
              },
              {
                shaderLocation: 2,
                format: "float32" as GPUVertexFormat,
                offset: 5 * GPU_FLOAT_SIZE,
              },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [{ format: this.gpuHelper.getFormat()! }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.gpuQuadBuffer = this.gpuHelper.createBuffer(
      device,
      GPU_QUAD_VERTICES,
      GPUBufferUsage.VERTEX,
    );
    this.gpuPipelineDevice = device;
  }

  /**
   * Create or reuse the trail-map rendering GPU pipeline.
   *
   * @param device - The WebGPU device.
   * @internal
   */
  private configureTrailPipeline(device: GPUDevice): void {
    if (this.gpuTrailPipeline && this.gpuPipelineDevice === device) return;

    this.gpuTrailBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
      ],
    });

    const shaderCode = `
      struct TrailUniforms {
        width: f32,
        height: f32,
        colorR: f32,
        colorG: f32,
        colorB: f32,
        opacity: f32,
      }
      @group(0) @binding(0) var<storage, read> trailMap: array<f32>;
      @group(0) @binding(1) var<uniform> uniforms: TrailUniforms;

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }

      @vertex fn vs_main(@location(0) pos: vec2<f32>) -> VertexOutput {
        var out: VertexOutput;
        out.position = vec4<f32>(pos, 0.0, 1.0);
        out.uv = pos * 0.5 + 0.5;
        return out;
      }

      @fragment fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
        let x = u32(in.uv.x * uniforms.width);
        let y = u32((1.0 - in.uv.y) * uniforms.height);
        let idx = y * u32(uniforms.width) + x;

        let total = u32(uniforms.width * uniforms.height);
        if (idx >= total) { discard; }

        let val = trailMap[idx];
        if (val < 0.01) { discard; }

        return vec4<f32>(uniforms.colorR, uniforms.colorG, uniforms.colorB, val * uniforms.opacity);
      }
    `;

    const shaderModule = device.createShaderModule({ code: shaderCode });

    this.gpuTrailPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [this.gpuTrailBindGroupLayout],
      }),
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 2 * GPU_FLOAT_SIZE,
            attributes: [{ shaderLocation: 0, format: "float32x2", offset: 0 }],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: this.gpuHelper.getFormat()!,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  /**
   * Upload agent data from CPU to a GPU vertex buffer.
   *
   * @param device - The WebGPU device.
   * @param agents - Agent array to upload.
   * @returns Render resources referencing the GPU-side agent buffer.
   * @internal
   */
  private prepareAgentBuffer(
    device: GPUDevice,
    agents: Agent[],
  ): WebGPURenderResources {
    const data = new Float32Array(agents.length * GPU_AGENT_COMPONENTS);
    for (let i = 0; i < agents.length; i++) {
      data.set(
        [
          agents[i].id,
          agents[i].x,
          agents[i].y,
          agents[i].vx,
          agents[i].vy,
          agents[i].species || 0,
        ],
        i * GPU_AGENT_COMPONENTS,
      );
    }

    if (!this.gpuAgentBuffer || this.gpuAgentBufferSize < data.byteLength) {
      this.gpuAgentBuffer = this.gpuHelper.createBuffer(
        device,
        data,
        GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      );
      this.gpuAgentBufferSize = data.byteLength;
    } else {
      this.gpuHelper.writeBuffer(device, this.gpuAgentBuffer, data);
    }

    return {
      device,
      agentVertexBuffer: this.gpuAgentBuffer!,
      agentCount: agents.length,
      agentStride: GPU_AGENT_STRIDE,
    };
  }

  /**
   * Upload a CPU-side trail map to a GPU storage buffer for rendering.
   *
   * Used when the compute engine runs on CPU but rendering is GPU-based.
   *
   * @param device - The WebGPU device.
   * @param trailMap - CPU-side trail intensity buffer.
   * @returns The GPU storage buffer containing the trail data.
   * @internal
   */
  private prepareManualTrailBuffer(
    device: GPUDevice,
    trailMap: Float32Array,
  ): GPUBuffer {
    const byteSize = trailMap.byteLength;
    if (
      !this.gpuManualTrailBuffer ||
      this.gpuManualTrailBufferSize < byteSize
    ) {
      this.gpuManualTrailBuffer = this.gpuHelper.createBuffer(
        device,
        trailMap,
        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      );
      this.gpuManualTrailBufferSize = byteSize;
    } else {
      this.gpuHelper.writeBuffer(device, this.gpuManualTrailBuffer, trailMap);
    }
    return this.gpuManualTrailBuffer;
  }

  /**
   * Execute the actual GPU render pass: trail overlay followed by instanced agents.
   *
   * @param device - The WebGPU device.
   * @param resources - Agent vertex buffer and count.
   * @param trailBuffer - Optional trail-map storage buffer.
   * @internal
   */
  private executeRender(
    device: GPUDevice,
    resources: WebGPURenderResources,
    trailBuffer?: GPUBuffer,
  ): void {
    const ctx = this.gpuHelper.getContext();
    if (!ctx || !this.gpuPipeline || !this.gpuBindGroupLayout) return;

    const { r, g, b } = hexToRgb(this.appearance.agentColor);
    const shape = this.appearance.agentShape === "circle" ? 1 : 0;

    const uniformData = new Float32Array([
      this.canvas.width,
      this.canvas.height,
      this.appearance.agentSize,
      shape,
      r,
      g,
      b,
      0,
    ]);

    if (
      !this.gpuUniformBuffer ||
      this.gpuUniformBufferSize < uniformData.byteLength
    ) {
      this.gpuUniformBuffer = this.gpuHelper.createBuffer(
        device,
        null,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        uniformData.byteLength,
      );
      this.gpuUniformBufferSize = uniformData.byteLength;
    }
    this.gpuHelper.writeBuffer(device, this.gpuUniformBuffer, uniformData);

    const paletteSource =
      this.appearance.speciesColors && this.appearance.speciesColors.length > 0
        ? this.appearance.speciesColors
        : SPECIES_PALETTE;

    const paletteData = new Float32Array(8 * 4);
    for (let i = 0; i < 8; i++) {
      const colorHex = paletteSource[i % paletteSource.length];
      const { r, g, b } = hexToRgb(colorHex);
      paletteData[i * 4] = r;
      paletteData[i * 4 + 1] = g;
      paletteData[i * 4 + 2] = b;
      paletteData[i * 4 + 3] = 1.0;
    }
    const paletteBuffer = this.gpuHelper.createBuffer(
      device,
      paletteData,
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );

    const bindGroup = device.createBindGroup({
      layout: this.gpuBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this.gpuUniformBuffer } },
        { binding: 1, resource: { buffer: paletteBuffer } },
      ],
    });

    const bgRgb = hexToRgb(this.appearance.backgroundColor);
    const clearColor = { r: bgRgb.r, g: bgRgb.g, b: bgRgb.b, a: 1.0 };

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          clearValue: clearColor,
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    // Trail overlay pass
    const activeTrailBuffer =
      trailBuffer || this.gpuManualTrailBuffer || resources.trailMapBuffer;

    if (
      this.appearance.showTrails &&
      activeTrailBuffer &&
      this.gpuTrailPipeline &&
      this.gpuTrailBindGroupLayout
    ) {
      const { r, g, b } = hexToRgb(this.appearance.trailColor);

      const trailUniformData = new Float32Array([
        this.canvas.width,
        this.canvas.height,
        r,
        g,
        b,
        this.appearance.trailOpacity ?? 1.0,
      ]);
      const trailUniformBuffer = this.gpuHelper.createBuffer(
        device,
        trailUniformData,
        GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      );

      const trailBindGroup = device.createBindGroup({
        layout: this.gpuTrailBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: activeTrailBuffer } },
          { binding: 1, resource: { buffer: trailUniformBuffer } },
        ],
      });

      pass.setPipeline(this.gpuTrailPipeline);
      pass.setBindGroup(0, trailBindGroup);
      pass.setVertexBuffer(0, this.gpuQuadBuffer!);
      pass.draw(6);
    }

    // Agent instanced draw pass
    pass.setPipeline(this.gpuPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, this.gpuQuadBuffer!);
    pass.setVertexBuffer(1, resources.agentVertexBuffer);
    if (resources.agentCount > 0) {
      pass.draw(GPU_QUAD_VERTICES.length / 2, resources.agentCount);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  /**
   * Lazily obtain the 2D rendering context for the primary canvas.
   *
   * @returns The 2D canvas rendering context.
   * @internal
   */
  private ensureContext(): CanvasRenderingContext2D {
    if (!this.ctx) {
      const context = this.canvas.getContext("2d");
      if (!context) {
        throw new Error(
          "Failed to acquire a 2D context for CPU rendering. " +
            "Use a dedicated gpuCanvas if this canvas has already been configured for WebGPU rendering.",
        );
      }
      this.ctx = context;
    }
    return this.ctx!;
  }

  /**
   * Reset all cached GPU state. Called when the GPU device changes.
   * @internal
   */
  public resetGPUState(): void {
    this.gpuPipeline = null;
    this.gpuPipelineDevice = null;
    this.gpuBindGroupLayout = null;
    this.gpuTrailPipeline = null;
    this.gpuTrailBindGroupLayout = null;
    this.gpuQuadBuffer = null;
    this.gpuUniformBuffer = null;
    this.gpuUniformBufferSize = 0;
    this.gpuAgentBuffer = null;
    this.gpuAgentBufferSize = 0;
    this.gpuManualTrailBuffer = null;
    this.gpuManualTrailBufferSize = 0;
  }
}

export default Renderer;
