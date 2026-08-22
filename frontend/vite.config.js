import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendTarget = process.env.VITE_BACKEND_TARGET || "http://127.0.0.1:5000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: {
      ignored: ["**/dist/**", "**/node_modules/**", "**/.git/**"],
      usePolling: process.platform === "win32",
      interval: 750
    },
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 4173
  }
});
