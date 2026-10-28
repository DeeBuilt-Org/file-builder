import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/file-builder/" : "/",
  server: {
    host: "::",
    port: 8125,
    hmr: {
      overlay: false,
    },
  },
  // MuPDF (Protect / Unlock / unlock prompt) uses top-level await, which the
  // default browser targets reject. Every browser File Builder supports already
  // runs ES2022.
  build: {
    target: "es2022",
  },
  optimizeDeps: {
    // Pre-bundling moves mupdf.js into .vite/deps but leaves its .wasm behind, so
    // the `new URL("mupdf-wasm.wasm", import.meta.url)` lookup 404s in dev. Serve
    // it from node_modules as-is instead.
    exclude: ["mupdf"],
    esbuildOptions: { target: "es2022" },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null, // we handle registration manually with a guard in main.tsx
      devOptions: { enabled: false },
      manifest: false,
      workbox: {
        navigateFallback: "index.html",
        // Never let the SPA navigate-fallback intercept a blob: download. When a
        // programmatic `<a download href="blob:...">` click is treated as a
        // navigation, the fallback would serve index.html and the download would
        // silently fail (ZIP "builds" but never lands). Deny blob:/data: so those
        // navigations pass through untouched. (/~oauth stays denied as before.)
        navigateFallbackDenylist: [/^\/~oauth/, /^blob:/, /^data:/],
        // Include .mjs so the pdf.js worker is precached for offline use.
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,ico,webp}"],
        // The pdf.js worker is ~1 MiB; bump the precache ceiling above the 2 MiB
        // default so the build doesn't reject it.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // og-image.png is only fetched by social scrapers from the live server,
        // never by the app — keep it out of the offline precache (it also
        // exceeds the 2 MiB precache limit and would fail the build).
        globIgnores: ["**/og-image.png"],
        // MuPDF's ~10 MB .wasm is NOT precached (globPatterns leaves out .wasm):
        // someone who only resizes images should never download it. It is cached
        // on first use instead, so Protect / Unlock still work offline after that.
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: "CacheFirst",
            options: { cacheName: "fb-wasm", expiration: { maxEntries: 4 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
