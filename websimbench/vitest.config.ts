import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

// https://vitejs.dev/config/
export default defineConfig({
    test: {
        // Use browser mode for all tests
        browser: {
            enabled: true,
            provider: playwright({
                // Enable WebGPU support in headless Chromium
                launchOptions: {
                    args: [
                        '--enable-unsafe-webgpu',
                        '--enable-features=Vulkan,UseSkiaRenderer',
                        '--use-angle=vulkan',
                        '--ignore-gpu-blocklist',
                        '--enable-gpu-rasterization',
                    ]
                }
            }),
            instances: [
                { browser: 'chromium' }
            ],
            headless: true,
        },
        // Increase timeout for compute tests
        testTimeout: 30000,
        // Include test patterns
        include: ['tests/**/*.test.ts'],
    },
})
