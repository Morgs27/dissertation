// src/compute/GPU.ts
import Logger from "./logger";

// export type GPUBufferUsageFlags = GPUBufferUsageFlags;

export default class GPU {
    private Logger: Logger;
    private adapter: GPUAdapter | null = null;
    private device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    private format: GPUTextureFormat | null = null;

    constructor(scope: string = "GPU") {
        this.Logger = new Logger(scope);
    }

    async getDevice(): Promise<GPUDevice> {
        if (this.device) return this.device;

        if (!navigator.gpu) {
            const message = "WebGPU not supported by this browser.";
            this.Logger.error(message);
            throw new Error(message);
        }

        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            const message = "Failed to request WebGPU adapter.";
            this.Logger.error(message);
            throw new Error(message);
        }

        this.device = await this.adapter.requestDevice();
        return this.device;
    }

    configureCanvas(canvas: HTMLCanvasElement): GPUCanvasContext {
        if (this.context) return this.context;

        const ctx = canvas.getContext("webgpu");
        if (!ctx) {
            const message = "Failed to acquire WebGPU canvas context.";
            this.Logger.error(message);
            throw new Error(message);
        }

        this.context = ctx;
        this.format = navigator.gpu.getPreferredCanvasFormat();
        return ctx;
    }

    setupCanvasConfig(device: GPUDevice, alphaMode: GPUCanvasAlphaMode = "opaque") {
        if (!this.context || !this.format) {
            const message = "GPU canvas not configured before setup.";
            this.Logger.error(message);
            throw new Error(message);
        }

        this.context.configure({
            device,
            format: this.format,
            alphaMode,
        });
    }

    createBuffer(
        device: GPUDevice,
        data: Float32Array | null,
        usage: GPUBufferUsageFlags,
        sizeOverride?: number
    ): GPUBuffer {
        const byteLength = data?.byteLength ?? 0;
        const size = Math.max(sizeOverride ?? byteLength, byteLength, 4);
        const buffer = device.createBuffer({
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

    writeBuffer(device: GPUDevice, buffer: GPUBuffer, data: Float32Array) {
        if (!data.byteLength) return;
        device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
    }

    getFormat(): GPUTextureFormat | null {
        return this.format;
    }

    getContext(): GPUCanvasContext | null {
        return this.context;
    }
}
