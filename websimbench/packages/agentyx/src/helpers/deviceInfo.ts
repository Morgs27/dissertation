/**
 * @module deviceInfo
 * Runtime environment metrics collection.
 *
 * Collects device, browser, and GPU metrics at simulation startup for
 * inclusion in tracking reports. Works in both browser and Node.js
 * environments.
 */

import GPU from "./gpu";

/**
 * Device-level hardware and platform metrics.
 *
 * @property userAgent - Browser user agent string.
 * @property platform - Operating system platform identifier.
 * @property hardwareConcurrency - Number of logical CPU cores.
 * @property deviceMemoryGb - Estimated device memory in GB (Chrome only).
 * @property language - Browser language preference.
 * @property timezone - IANA timezone identifier.
 * @property nodeVersion - Node.js version string (if running in Node).
 * @property runtime - Detected runtime environment.
 */
export type RuntimeDeviceMetrics = {
  userAgent?: string;
  platform?: string;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  language?: string;
  timezone?: string;
  nodeVersion?: string;
  runtime?: "browser" | "node" | "unknown";
};

/**
 * Browser-specific environment metrics.
 *
 * @property online - Whether the browser reports network connectivity.
 * @property cookieEnabled - Whether cookies are enabled.
 * @property doNotTrack - Do-Not-Track header value.
 * @property url - Current page URL.
 * @property referrer - Document referrer.
 * @property viewport - Viewport dimensions and device pixel ratio.
 * @property performanceMemory - Chrome-specific JS heap memory info.
 */
export type RuntimeBrowserMetrics = {
  online?: boolean;
  cookieEnabled?: boolean;
  doNotTrack?: string | null;
  url?: string;
  referrer?: string;
  viewport?: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  performanceMemory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
};

/**
 * WebGPU adapter and device capability metrics.
 *
 * @property vendor - GPU vendor name.
 * @property architecture - GPU architecture identifier.
 * @property description - Human-readable GPU description.
 * @property maxBufferSize - Maximum buffer size in bytes.
 * @property maxStorageBufferBindingSize - Maximum storage buffer binding size.
 * @property maxComputeWorkgroupsPerDimension - Maximum workgroups per dispatch dimension.
 * @property maxComputeInvocationsPerWorkgroup - Maximum invocations in a single workgroup.
 * @property maxComputeWorkgroupSizeX - Maximum workgroup size in the X dimension.
 * @property maxComputeWorkgroupSizeY - Maximum workgroup size in the Y dimension.
 * @property maxComputeWorkgroupSizeZ - Maximum workgroup size in the Z dimension.
 */
export type RuntimeGPUMetrics = {
  vendor: string;
  architecture: string;
  description: string;
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupsPerDimension: number;
  maxComputeInvocationsPerWorkgroup: number;
  maxComputeWorkgroupSizeX: number;
  maxComputeWorkgroupSizeY: number;
  maxComputeWorkgroupSizeZ: number;
};

/**
 * Combined runtime metrics covering device, browser, and GPU capabilities.
 */
export type RuntimeMetrics = {
  device: RuntimeDeviceMetrics;
  browser: RuntimeBrowserMetrics;
  gpu?: RuntimeGPUMetrics;
};

/**
 * Detect whether we are running in a browser environment.
 *
 * @returns `true` if both `window` and `navigator` globals exist.
 * @internal
 */
const isBrowserRuntime = (): boolean => {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
};

/**
 * Collect device and browser metrics in a browser environment.
 *
 * @returns Object with `device` and `browser` metric fields.
 * @internal
 */
const collectBrowserMetrics = (): {
  device: RuntimeDeviceMetrics;
  browser: RuntimeBrowserMetrics;
} => {
  const nav = navigator;

  const device: RuntimeDeviceMetrics = {
    runtime: "browser",
    userAgent: nav.userAgent,
    platform: nav.platform,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemoryGb: (nav as { deviceMemory?: number }).deviceMemory,
    language: nav.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const browser: RuntimeBrowserMetrics = {
    online: nav.onLine,
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack,
    url: typeof location !== "undefined" ? location.href : undefined,
    referrer: typeof document !== "undefined" ? document.referrer : undefined,
    viewport:
      typeof window !== "undefined"
        ? {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
          }
        : undefined,
  };

  const perf = performance as Performance & {
    memory?: {
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
    };
  };

  if (perf.memory) {
    browser.performanceMemory = {
      jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      totalJSHeapSize: perf.memory.totalJSHeapSize,
      usedJSHeapSize: perf.memory.usedJSHeapSize,
    };
  }

  return { device, browser };
};

/**
 * Collect minimal device metrics in a Node.js environment.
 *
 * @returns Object with `device` and empty `browser` metric fields.
 * @internal
 */
const collectNodeMetrics = (): {
  device: RuntimeDeviceMetrics;
  browser: RuntimeBrowserMetrics;
} => {
  const processRef = typeof process !== "undefined" ? process : undefined;

  return {
    device: {
      runtime: processRef?.versions?.node ? "node" : "unknown",
      platform: processRef?.platform,
      nodeVersion: processRef?.versions?.node,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    browser: {},
  };
};

/**
 * Collect WebGPU adapter and device capability metrics.
 *
 * @returns GPU metrics, or `undefined` if WebGPU is unavailable.
 * @internal
 */
const collectGpuMetrics = async (): Promise<RuntimeGPUMetrics | undefined> => {
  if (!isBrowserRuntime() || !navigator.gpu) {
    return undefined;
  }

  try {
    const gpuHelper = new GPU("RuntimeMetrics");
    const device = await gpuHelper.getDevice();
    const adapter = await navigator.gpu.requestAdapter();

    let adapterInfo: {
      vendor?: string;
      architecture?: string;
      description?: string;
    } | null = null;

    if (
      adapter &&
      "requestAdapterInfo" in adapter &&
      typeof (
        adapter as GPUAdapter & { requestAdapterInfo: () => Promise<unknown> }
      ).requestAdapterInfo === "function"
    ) {
      adapterInfo =
        (await (
          adapter as GPUAdapter & {
            requestAdapterInfo: () => Promise<{
              vendor?: string;
              architecture?: string;
              description?: string;
            }>;
          }
        ).requestAdapterInfo()) ?? null;
    }

    if (!device) {
      return undefined;
    }

    return {
      vendor: adapterInfo?.vendor ?? "Unknown",
      architecture: adapterInfo?.architecture ?? "Unknown",
      description: adapterInfo?.description ?? "Unknown",
      maxBufferSize: device.limits.maxBufferSize,
      maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupsPerDimension:
        device.limits.maxComputeWorkgroupsPerDimension,
      maxComputeInvocationsPerWorkgroup:
        device.limits.maxComputeInvocationsPerWorkgroup,
      maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: device.limits.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: device.limits.maxComputeWorkgroupSizeZ,
    };
  } catch {
    return undefined;
  }
};

/**
 * Collect comprehensive runtime metrics for the current environment.
 *
 * Automatically detects whether we are in a browser or Node.js context
 * and collects device, browser, and GPU metrics accordingly.
 *
 * @returns Combined runtime metrics.
 *
 * @example
 * ```ts
 * import { collectRuntimeMetrics } from '@websimbench/agentyx';
 *
 * const metrics = await collectRuntimeMetrics();
 * console.log(`Cores: ${metrics.device.hardwareConcurrency}`);
 * console.log(`GPU: ${metrics.gpu?.description}`);
 * ```
 */
export const collectRuntimeMetrics = async (): Promise<RuntimeMetrics> => {
  const base = isBrowserRuntime()
    ? collectBrowserMetrics()
    : collectNodeMetrics();
  const gpu = await collectGpuMetrics();

  return {
    ...base,
    gpu,
  };
};
