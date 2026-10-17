import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL env vars (including REACT_APP_ prefix)
  const env = loadEnv(mode, process.cwd(), "");

  return {
    define: {
      "process.env": {},
      "import.meta.env.VITE_API_URL": JSON.stringify(
        env.REACT_APP_BACKEND_URL || env.VITE_API_URL || ""
      ),
    },
    plugins: [
      react(),
      nodePolyfills({
        include: ["buffer", "crypto", "stream", "util"],
        globals: { Buffer: true, global: true, process: true },
      }),
    ],

    server: {
      host: "::",
      port: 8080,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/v1": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
        "/health": {
          target: "http://localhost:3001",
          changeOrigin: true,
        },
        "/api": {
          target: "http://localhost:3001",
          changeOrigin: true,
          secure: false,
        },
        "/ws": {
          target: "ws://localhost:3001",
          ws: true,
          changeOrigin: true,
        },
      },
    },
    optimizeDeps: {
      include: ["react-is", "recharts", "react-dom", "@tanstack/react-query"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
        "@radix-ui/react-slot",
      ],
    },
  };
});
