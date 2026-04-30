import { defineConfig } from "vite";

export default defineConfig({
  root: "public",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  // Allows importing epub-gen-memory bundle from node_modules
  optimizeDeps: {
    include: ["epub-gen-memory"],
  },
});
