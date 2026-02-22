import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: '/dissertation/',
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@websimbench/agentyx": path.resolve(__dirname, "./packages/agentyx/src"),
    },
  },
})
