import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    // Avoid EPERM on Windows when an external indexer holds a file in dist/.
    // Output filenames are content-hashed, so leaving stale files is harmless.
    emptyOutDir: false,
  },
});
