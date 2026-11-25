import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: { manifest: true },
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    // API server (apps/server) runs on 4320 in dev.
    proxy: { "/api": "http://127.0.0.1:4320" },
  },
});
