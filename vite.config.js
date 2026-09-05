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
      // The admin panel is a second, independent page (its own React root,
      // its own entry script) rather than a route inside the public site, so
      // it needs its own entry here to be part of the build at all. It talks
      // to Supabase directly with no server of its own, so shipping it is
      // just shipping a page — Postgres RLS is what actually gates access.
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
