import { defineConfig } from "vite";

export default defineConfig({
  base: "/Quran-Generator/",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  // Allows importing epub-gen-memory bundle from node_modules
  optimizeDeps: {
    include: ["epub-gen-memory"],
  },
});
