import { defineConfig } from "vite";

export default defineConfig({
  root: "public",
  publicDir: "../static",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    port: 4173,
    strictPort: true,
  },
});
