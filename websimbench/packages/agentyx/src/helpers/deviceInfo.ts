import GPU from './gpu';

export type RuntimeDeviceMetrics = {
  userAgent?: string;
  platform?: string;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  language?: string;
  timezone?: string;
  nodeVersion?: string;
  runtime?: 'browser' | 'node' | 'unknown';
};

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

export type RuntimeMetrics = {
  device: RuntimeDeviceMetrics;
  browser: RuntimeBrowserMetrics;
  gpu?: RuntimeGPUMetrics;
};

const isBrowserRuntime = (): boolean => {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
};

const collectBrowserMetrics = (): { device: RuntimeDeviceMetrics; browser: RuntimeBrowserMetrics } => {
  const nav = navigator;

  const device: RuntimeDeviceMetrics = {
    runtime: 'browser',
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
    url: typeof location !== 'undefined' ? location.href : undefined,
    referrer: typeof document !== 'undefined' ? document.referrer : undefined,
    viewport:
      typeof window !== 'undefined'
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

const collectNodeMetrics = (): { device: RuntimeDeviceMetrics; browser: RuntimeBrowserMetrics } => {
  const processRef = typeof process !== 'undefined' ? process : undefined;

  return {
    device: {
      runtime: processRef?.versions?.node ? 'node' : 'unknown',
      platform: processRef?.platform,
      nodeVersion: processRef?.versions?.node,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    browser: {},
  };
};

const collectGpuMetrics = async (): Promise<RuntimeGPUMetrics | undefined> => {
  if (!isBrowserRuntime() || !navigator.gpu) {
    return undefined;
  }

  try {
    const gpuHelper = new GPU('RuntimeMetrics');
    const device = await gpuHelper.getDevice();
    const adapter = await navigator.gpu.requestAdapter();

    let adapterInfo: {
      vendor?: string;
      architecture?: string;
      description?: string;
    } | null = null;

    if (adapter && 'requestAdapterInfo' in adapter && typeof (adapter as GPUAdapter & { requestAdapterInfo: () => Promise<unknown> }).requestAdapterInfo === 'function') {
      adapterInfo = (await (adapter as GPUAdapter & {
        requestAdapterInfo: () => Promise<{
          vendor?: string;
          architecture?: string;
          description?: string;
        }>;
      }).requestAdapterInfo()) ?? null;
    }

    if (!device) {
      return undefined;
    }

    return {
      vendor: adapterInfo?.vendor ?? 'Unknown',
      architecture: adapterInfo?.architecture ?? 'Unknown',
      description: adapterInfo?.description ?? 'Unknown',
      maxBufferSize: device.limits.maxBufferSize,
      maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
      maxComputeWorkgroupsPerDimension: device.limits.maxComputeWorkgroupsPerDimension,
      maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
      maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: device.limits.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: device.limits.maxComputeWorkgroupSizeZ,
    };
  } catch {
    return undefined;
  }
};

export const collectRuntimeMetrics = async (): Promise<RuntimeMetrics> => {
  const base = isBrowserRuntime() ? collectBrowserMetrics() : collectNodeMetrics();
  const gpu = await collectGpuMetrics();

  return {
    ...base,
    gpu,
  };
};
