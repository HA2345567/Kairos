import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

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
      mdx({
        remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
        rehypePlugins: [
          rehypeHighlight,
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: "append" }],
        ],
      }),
      react(),


      nodePolyfills({
        include: ["buffer", "crypto", "stream", "util"],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
      mode === "development" && componentTagger(),
    ].filter(Boolean),

    server: {
      host: "::",
      port: 8080,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
      proxy: {
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
      ],
    },
  };
});
