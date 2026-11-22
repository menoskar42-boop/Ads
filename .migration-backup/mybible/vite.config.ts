import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import legacy from "@vitejs/plugin-legacy";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { metaImagesPlugin } from "./vite-plugin-meta-images";
import postcss from "postcss";

// Flatten @layer blocks so CSS works in iOS < 15.4 (no @layer support)
function flattenCssLayers(): Plugin {
  const flattenPlugin = {
    postcssPlugin: "flatten-layers",
    AtRule: {
      layer: (rule: any) => {
        rule.replaceWith(rule.nodes || []);
      },
    },
  };
  return {
    name: "vite-flatten-css-layers",
    enforce: "post",
    async generateBundle(_opts: any, bundle: any) {
      for (const fileName of Object.keys(bundle)) {
        if (fileName.endsWith(".css")) {
          const chunk = bundle[fileName];
          if (chunk.type === "asset" && typeof chunk.source === "string") {
            const result = await postcss([flattenPlugin]).process(chunk.source, {
              from: undefined,
            });
            chunk.source = result.css;
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    metaImagesPlugin(),
    legacy({
      targets: ["ios >= 12", "samsung >= 8", "chrome >= 70"],
      renderLegacyChunks: true,
      modernPolyfills: true,
    }),
    flattenCssLayers(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  css: {
    postcss: { plugins: [] },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    target: ["es2015", "ios12"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
