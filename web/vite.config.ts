import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

// base MUST stay '/daily-task-manager/' — the served path is fixed by the repo name, and the
// Android APP_URL, the installed iOS PWA, and the iOS widget deep-link all point at it.
export default defineConfig({
  base: "/daily-task-manager/",
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      // sw.js at the base root → /daily-task-manager/sw.js, same scope as the old hand-written SW,
      // so it cleanly replaces the live dtm-v23 registration on existing installs.
      filename: "sw.js",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Daily Task Manager",
        short_name: "Tasks",
        description: "Frictionless capture, auto-prioritized daily list, cross-device sync.",
        start_url: "./index.html",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f9f7f2",
        theme_color: "#f9f7f2",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Never intercept sync / PA traffic — these are cross-origin so they aren't precached,
        // but be explicit that no runtime route should ever swallow them.
        navigateFallbackDenylist: [/^\/api/, /gist\.githubusercontent\.com/, /workers\.dev/],
      },
    }),
  ],
});
