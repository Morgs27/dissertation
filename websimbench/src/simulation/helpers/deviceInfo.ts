import { DeviceInfo } from './grapher';
import GPU from './gpu';

export async function collectDeviceInfo(): Promise<DeviceInfo> {
    const info: DeviceInfo = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        deviceMemory: (navigator as any).deviceMemory,
    };

    // Try to collect GPU info if WebGPU is available
    try {
        if (navigator.gpu) {
            const gpuHelper = new GPU("DeviceInfo");
            const device = await gpuHelper.getDevice();
            
            const adapter = await navigator.gpu.requestAdapter();
            if (adapter) {
                // Try to get adapter info if available (Chrome 113+)
                let adapterInfo: any = null;
                if ('requestAdapterInfo' in adapter && typeof (adapter as any).requestAdapterInfo === 'function') {
                    adapterInfo = await (adapter as any).requestAdapterInfo();
                }
                
                info.gpuInfo = {
                    vendor: adapterInfo?.vendor || 'Unknown',
                    architecture: adapterInfo?.architecture || 'Unknown',
                    description: adapterInfo?.description || 'Unknown',
                    maxBufferSize: device.limits.maxBufferSize,
                    maxStorageBufferBindingSize: device.limits.maxStorageBufferBindingSize,
                    maxComputeWorkgroupsPerDimension: device.limits.maxComputeWorkgroupsPerDimension,
                    maxComputeInvocationsPerWorkgroup: device.limits.maxComputeInvocationsPerWorkgroup,
                    maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
                    maxComputeWorkgroupSizeY: device.limits.maxComputeWorkgroupSizeY,
                    maxComputeWorkgroupSizeZ: device.limits.maxComputeWorkgroupSizeZ,
                };
            }
        }
    } catch (e) {
        console.warn("Could not collect GPU info:", e);
    }

    return info;
}

export function formatDeviceInfo(info: DeviceInfo): string {
    let result = `Device Information:\n`;
    result += `  Platform: ${info.platform}\n`;
    result += `  Hardware Concurrency: ${info.hardwareConcurrency} threads\n`;
    
    if (info.deviceMemory) {
        result += `  Device Memory: ${info.deviceMemory} GB\n`;
    }
    
    if (info.gpuInfo) {
        result += `\nGPU Information:\n`;
        result += `  Vendor: ${info.gpuInfo.vendor}\n`;
        result += `  Architecture: ${info.gpuInfo.architecture}\n`;
        result += `  Description: ${info.gpuInfo.description}\n`;
        result += `  Max Buffer Size: ${(info.gpuInfo.maxBufferSize / (1024 * 1024)).toFixed(2)} MB\n`;
        result += `  Max Storage Buffer: ${(info.gpuInfo.maxStorageBufferBindingSize / (1024 * 1024)).toFixed(2)} MB\n`;
        result += `  Max Workgroups Per Dim: ${info.gpuInfo.maxComputeWorkgroupsPerDimension}\n`;
        result += `  Max Invocations Per Workgroup: ${info.gpuInfo.maxComputeInvocationsPerWorkgroup}\n`;
        result += `  Max Workgroup Size: ${info.gpuInfo.maxComputeWorkgroupSizeX} x ${info.gpuInfo.maxComputeWorkgroupSizeY} x ${info.gpuInfo.maxComputeWorkgroupSizeZ}\n`;
    }
    
    return result;
}

