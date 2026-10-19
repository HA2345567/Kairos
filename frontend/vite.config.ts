import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { readFileSync } from "node:fs";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

/**
 * FE-04: CSP with pinned origins.
 *
 * Only origins the app actually calls are allowlisted — the RPC configured for
 * this build, the API origin if it is absolute, and the three market-data APIs
 * the UI reads directly (Jupiter, Dexscreener, CoinGecko) plus dicebear
 * avatars. `script-src 'self'` is kept strict; the inline React-refresh
 * preamble only exists in dev, so this policy is injected on build (and served
 * as a header by `vite preview`) rather than applied to the dev server.
 */
function buildCsp(env: Record<string, string>): string {
  const origins = new Set<string>([
    "https://api.jup.ag",
    "https://api.dexscreener.com",
    "https://api.coingecko.com",
  ]);
  const rpc = env.VITE_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  try {
    origins.add(new URL(rpc).origin);
  } catch {
    origins.add("https://api.devnet.solana.com");
  }
  const api = (env.REACT_APP_BACKEND_URL || env.VITE_API_URL || "").trim();
  if (api) {
    try {
      origins.add(new URL(api).origin);
    } catch {
      /* relative API base is covered by 'self' */
    }
  }
  const connect = ["'self'", ...origins];
  const ws = [...origins]
    .filter((origin) => origin.startsWith("https://"))
    .map((origin) => origin.replace("https://", "wss://"));

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://api.dicebear.com",
    `connect-src ${[...connect, ...ws].join(" ")}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * The preview server must not serve a stricter policy than the build it is
 * serving: browsers enforce the intersection of the header and the meta tag, so
 * a header built from different env would block the API origin the bundle was
 * compiled against. Prefer the CSP baked into dist/index.html.
 */
function previewCsp(computed: string): string {
  try {
    const html = readFileSync(path.resolve(__dirname, "dist/index.html"), "utf8");
    const match = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i.exec(html);
    if (match) return match[1].replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  } catch {
    /* no build yet — fall back to the computed policy */
  }
  return computed;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL env vars (including REACT_APP_ prefix)
  const env = loadEnv(mode, process.cwd(), "");
  const csp = buildCsp(env);

  return {
    define: {
      "process.env": {},
      global: "globalThis",
      "import.meta.env.VITE_API_URL": JSON.stringify(
        env.REACT_APP_BACKEND_URL || env.VITE_API_URL || ""
      ),
    },
    plugins: [
      react({
        disableOxcRecommendation: true,
      }),
      {
        name: "kairos-clean-rolldown-options",
        enforce: "post",
        config(config) {
          const opt = config.optimizeDeps as any;
          if (opt?.rollupOptions) {
            delete opt.rollupOptions.jsx;
            if (Object.keys(opt.rollupOptions).length === 0) {
              delete opt.rollupOptions;
            }
          }
        },
        configResolved(config) {
          const opt = config.optimizeDeps as any;
          if (opt?.rollupOptions) {
            delete opt.rollupOptions.jsx;
            if (Object.keys(opt.rollupOptions).length === 0) {
              delete opt.rollupOptions;
            }
          }
          if (opt?.rolldownOptions?.jsx) {
            delete opt.rolldownOptions.jsx;
          }
        },
      },
      {
        name: "kairos-csp",
        apply: "build",
        transformIndexHtml(html) {
          return {
            html,
            tags: [
              {
                tag: "meta",
                attrs: { "http-equiv": "Content-Security-Policy", content: csp },
                injectTo: "head-prepend",
              },
            ],
          };
        },
      },
      nodePolyfills({
        include: ["buffer", "crypto", "stream", "util"],
        globals: { Buffer: false, global: false, process: false },
      }),
    ],

    server: {
      host: "::",
      port: 8080,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
      watch: {
        ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
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
    preview: {
      host: "127.0.0.1",
      port: 8080,
      strictPort: true,
      headers: {
        "Content-Security-Policy": previewCsp(csp),
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "X-Frame-Options": "DENY",
      },
      proxy: {
        "/v1": { target: "http://localhost:3001", changeOrigin: true },
        "/health": { target: "http://localhost:3001", changeOrigin: true },
        "/api": { target: "http://localhost:3001", changeOrigin: true, secure: false },
        "/ws": { target: "ws://localhost:3001", ws: true, changeOrigin: true },
      },
    },
    optimizeDeps: {
      // Keep the explicit set small. Listing every adapter and Radix package
      // forces Vite to bundle the entire UI dependency tree before the server
      // can serve the first page; the scanner discovers the rest on demand.
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
