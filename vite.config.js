import { defineConfig } from "vite";
export default defineConfig({
  server: {
    watch: { ignored: ["**/.runtime/**", "**/.reference/**"] },
    proxy: {
      "/api": "http://127.0.0.1:3001",
      "/socket.io": { target: "http://127.0.0.1:3001", ws: true },
    },
  },
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } } },
});
