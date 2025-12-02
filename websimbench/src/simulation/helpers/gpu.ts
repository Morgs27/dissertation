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

    private static sharedDevice: GPUDevice | null = null;
    private static sharedAdapter: GPUAdapter | null = null;

    async getDevice(): Promise<GPUDevice> {
        if (this.device) return this.device;
        if (GPU.sharedDevice) {
            this.device = GPU.sharedDevice;
            return this.device;
        }

        if (!navigator.gpu) {
            const message = "WebGPU not supported by this browser.";
            this.Logger.error(message);
            throw new Error(message);
        }

        if (!GPU.sharedAdapter) {
            GPU.sharedAdapter = await navigator.gpu.requestAdapter();
        }
        this.adapter = GPU.sharedAdapter;

        if (!this.adapter) {
            const message = "Failed to request WebGPU adapter.";
            this.Logger.error(message);
            throw new Error(message);
        }

        GPU.sharedDevice = await this.adapter.requestDevice();
        this.device = GPU.sharedDevice;

        // Handle device loss
        this.device.lost.then((info) => {
            console.error(`WebGPU device was lost: ${info.message}`);
            GPU.sharedDevice = null;
            this.device = null;
        });

        return this.device;
    }

    configureCanvas(canvas: HTMLCanvasElement): GPUCanvasContext {
        if (this.context) return this.context;

        // Try to get the WebGPU context
        // According to WebGPU spec, calling getContext("webgpu") multiple times
        // on the same canvas should return the same context object
        const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;

        if (!ctx) {
            // This can happen if:
            // 1. The canvas was previously used with a different context type (2d, webgl, etc.)
            // 2. WebGPU is not properly supported
            this.Logger.error(
                "Failed to acquire WebGPU canvas context. " +
                "The canvas may have been used with a different context type (e.g., '2d')."
            );
            throw new Error("Failed to acquire WebGPU canvas context.");
        }

        this.context = ctx;
        this.format = navigator.gpu.getPreferredCanvasFormat();

        this.Logger.log("WebGPU canvas context acquired successfully");

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
