import Logger from "./logger";

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

    /**
     * Creates a GPU buffer optionally initialized with data.
     * Automatically aligns size to 4 bytes and optionally to 256 bytes for uniform buffers.
     */
    createBuffer(
        device: GPUDevice,
        data: Float32Array | null,
        usage: GPUBufferUsageFlags,
        sizeOverride?: number,
        label?: string
    ): GPUBuffer {
        const byteLength = data?.byteLength ?? 0;
        let size = Math.max(sizeOverride ?? byteLength, byteLength, 4);

        // Align to 256 bytes if this is a UNIFORM buffer (best practice)
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
     * Creates an empty (unmapped) GPU buffer of a given size and usage.
     */
    createEmptyBuffer(
        device: GPUDevice,
        size: number,
        usage: GPUBufferUsageFlags,
        label?: string
    ): GPUBuffer {
        const aligned = Math.ceil(size / 4) * 4; // 4-byte alignment
        return device.createBuffer({
            label,
            size: aligned,
            usage,
        });
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
