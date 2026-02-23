import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          args: [
            "--enable-unsafe-webgpu",
            "--enable-features=Vulkan,UseSkiaRenderer",
            "--use-angle=vulkan",
            "--ignore-gpu-blocklist",
            "--enable-gpu-rasterization",
          ],
        },
      }),
      instances: [{ browser: "chromium" }],
      headless: true,
    },
    testTimeout: 30000,
    include: ["tests/**/*.test.ts"],
  },
});
