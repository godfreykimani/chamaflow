import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        // In dev: proxy /api to local backend (only if VITE_API_URL not set)
        ...(!env.VITE_API_URL ? {
          "/api":     { target: "http://localhost:3001", changeOrigin: true },
          "/uploads": { target: "http://localhost:3001", changeOrigin: true },
        } : {}),
      },
    },
  };
});
