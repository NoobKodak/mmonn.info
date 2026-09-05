import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so a production build also runs from a subdirectory.
  base: "./",
  plugins: [react()],
  server: {
    port: 4173,
    // Windows can report EBUSY while native watchers traverse large media
    // folders. Polling keeps the local development server reliable.
    watch: { usePolling: true, interval: 1000 },
  },
  preview: { port: 4173 },
});
