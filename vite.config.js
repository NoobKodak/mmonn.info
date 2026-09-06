import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Relative base so a production build also runs from a subdirectory.
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      // The Telegram editor is a second, independent page (its own React
      // root and entry script), so Vite needs it as an explicit build input.
      // It calls only same-origin server routes; those routes verify Telegram
      // WebApp initData and keep Supabase's service key server-side.
      input: {
        main: resolve(__dirname, "index.html"),
        admin: resolve(__dirname, "admin.html"),
      },
    },
  },
  server: {
    port: 4173,
    // Windows can report EBUSY while native watchers traverse large media
    // folders. Polling keeps the local development server reliable.
    watch: { usePolling: true, interval: 1000 },
  },
  preview: { port: 4173 },
});
