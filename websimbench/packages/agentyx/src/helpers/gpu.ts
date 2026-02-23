/**
 * @module gpu
 * WebGPU device and canvas context management utility.
 *
 * The {@link GPU} class provides a thin abstraction over the WebGPU API,
 * handling adapter/device acquisition (with a shared singleton), canvas context
 * configuration, and convenience methods for buffer creation.
 */

import Logger from "./logger";

/**
 * Manages WebGPU adapter, device, canvas context, and buffer operations.
 *
 * A shared GPU device is used across all instances to avoid creating
 * multiple devices (which may fail on some platforms).
 *
 * @example
 * ```ts
 * const gpu = new GPU('MyModule');
 * const device = await gpu.getDevice();
 * const buffer = gpu.createBuffer(device, data, GPUBufferUsage.STORAGE);
 * ```
 */
export default class GPU {
  private logger: Logger;
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat | null = null;

  /**
   * Create a new GPU helper instance.
   *
   * @param scope - Logger context name for this instance.
   */
  constructor(scope: string = "GPU") {
    this.logger = new Logger(scope);
  }

  /** @internal Shared GPU device singleton. */
  private static sharedDevice: GPUDevice | null = null;
  /** @internal Shared GPU adapter singleton. */
  private static sharedAdapter: GPUAdapter | null = null;

  /**
   * Obtain a WebGPU device, reusing the shared singleton if available.
   *
   * On first call, requests an adapter and device from the browser's
   * WebGPU API. Subsequent calls return the cached device.
   *
   * @returns The shared GPU device.
   * @throws {Error} If WebGPU is not supported or the adapter cannot be obtained.
   */
  async getDevice(): Promise<GPUDevice> {
    if (this.device) return this.device;
    if (GPU.sharedDevice) {
      this.device = GPU.sharedDevice;
      return this.device;
    }

    if (!navigator.gpu) {
      const message = "WebGPU not supported by this browser.";
      this.logger.error(message);
      throw new Error(message);
    }

    if (!GPU.sharedAdapter) {
      GPU.sharedAdapter = await navigator.gpu.requestAdapter();
    }
    this.adapter = GPU.sharedAdapter;

    if (!this.adapter) {
      const message = "Failed to request WebGPU adapter.";
      this.logger.error(message);
      throw new Error(message);
    }

    GPU.sharedDevice = await this.adapter.requestDevice();
    this.device = GPU.sharedDevice;

    this.device.lost.then((info) => {
      console.error(`WebGPU device was lost: ${info.message}`);
      GPU.sharedDevice = null;
      this.device = null;
    });

    return this.device;
  }

  /**
   * Acquire and cache the WebGPU canvas context for the given canvas element.
   *
   * @param canvas - The HTML canvas element to bind to.
   * @returns The WebGPU canvas context.
   * @throws {Error} If the canvas context cannot be obtained (e.g. already bound to `'2d'`).
   */
  configureCanvas(canvas: HTMLCanvasElement): GPUCanvasContext {
    if (this.context) return this.context;

    const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;

    if (!ctx) {
      this.logger.error(
        "Failed to acquire WebGPU canvas context. " +
          "The canvas may have been used with a different context type (e.g., '2d').",
      );
      throw new Error("Failed to acquire WebGPU canvas context.");
    }

    this.context = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.logger.log("WebGPU canvas context acquired successfully");

    return ctx;
  }

  /**
   * Configure the cached canvas context with a device and alpha mode.
   *
   * Must be called after {@link configureCanvas}.
   *
   * @param device - The GPU device to bind to the context.
   * @param alphaMode - Canvas alpha compositing mode.
   * @throws {Error} If {@link configureCanvas} has not been called.
   */
  setupCanvasConfig(
    device: GPUDevice,
    alphaMode: GPUCanvasAlphaMode = "opaque",
  ): void {
    if (!this.context || !this.format) {
      const message = "GPU canvas not configured before setup.";
      this.logger.error(message);
      throw new Error(message);
    }

    this.context.configure({
      device,
      format: this.format,
      alphaMode,
    });
  }

  /**
   * Create a GPU buffer, optionally initialised with data.
   *
   * Automatically aligns to 4 bytes, and to 256 bytes for uniform buffers.
   *
   * @param device - The GPU device.
   * @param data - Initial data to write, or `null` for an uninitialised buffer.
   * @param usage - GPU buffer usage flags.
   * @param sizeOverride - Optional minimum byte size (overrides data length).
   * @param label - Optional debug label.
   * @returns The created GPU buffer.
   */
  createBuffer(
    device: GPUDevice,
    data: Float32Array | null,
    usage: GPUBufferUsageFlags,
    sizeOverride?: number,
    label?: string,
  ): GPUBuffer {
    const byteLength = data?.byteLength ?? 0;
    let size = Math.max(sizeOverride ?? byteLength, byteLength, 4);

    if (usage & GPUBufferUsage.UNIFORM) {
      size = Math.ceil(size / 256) * 256;
    }

    const buffer = device.createBuffer({
      label,
      size,
      usage,
      mappedAtCreation: !!data,
    });

    if (data) {
      const range = buffer.getMappedRange();
      new Float32Array(range).set(data);
      buffer.unmap();
    }

    return buffer;
  }

  /**
   * Create an empty (unmapped) GPU buffer of a given size.
   *
   * @param device - The GPU device.
   * @param size - Desired byte size (will be aligned to 4 bytes).
   * @param usage - GPU buffer usage flags.
   * @param label - Optional debug label.
   * @returns The created GPU buffer.
   */
  createEmptyBuffer(
    device: GPUDevice,
    size: number,
    usage: GPUBufferUsageFlags,
    label?: string,
  ): GPUBuffer {
    const aligned = Math.ceil(size / 4) * 4;
    return device.createBuffer({
      label,
      size: aligned,
      usage,
    });
  }

  /**
   * Write data to an existing GPU buffer via the device queue.
   *
   * @param device - The GPU device.
   * @param buffer - Target GPU buffer.
   * @param data - Float32Array data to write.
   */
  writeBuffer(device: GPUDevice, buffer: GPUBuffer, data: Float32Array): void {
    if (!data.byteLength) return;
    device.queue.writeBuffer(
      buffer,
      0,
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
  }

  /**
   * Get the preferred texture format for the configured canvas.
   *
   * @returns The GPU texture format, or `null` if not yet configured.
   */
  getFormat(): GPUTextureFormat | null {
    return this.format;
  }

  /**
   * Get the cached WebGPU canvas context.
   *
   * @returns The canvas context, or `null` if not yet configured.
   */
  getContext(): GPUCanvasContext | null {
    return this.context;
  }
}
