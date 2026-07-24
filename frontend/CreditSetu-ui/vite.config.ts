import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    strictPort: false,
    proxy: {
      // Same-origin API in the browser → avoids CORS "Failed to fetch"
      "/api": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/api/, ""),
        // When the backend is down/reloading, return JSON instead of an empty body
        // (empty bodies cause frontend `response.json()` to throw).
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            const r = res as import("http").ServerResponse | undefined;
            if (r && !r.headersSent) {
              r.writeHead(502, { "Content-Type": "application/json" });
              r.end(
                JSON.stringify({
                  success: false,
                  message: "Backend unavailable. Is the API running on port 8001?",
                  detail: "Backend unavailable. Is the API running on port 8001?",
                })
              );
            }
          });
        },
      },
    },
  },
})
