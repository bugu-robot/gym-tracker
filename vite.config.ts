import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "/gym-tracker/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Gym Weight Tracker 健身重量紀錄",
        short_name: "重量紀錄",
        lang: "zh-Hant",
        description: "快速記下每個動作的重量，離線也能使用。",
        start_url: "/gym-tracker/",
        scope: "/gym-tracker/",
        display: "standalone",
        background_color: "#101410",
        theme_color: "#101410",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
        navigateFallback: "/gym-tracker/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: { include: ["src/**/*.test.ts"], setupFiles: ["./src/test-setup.ts"] },
});
