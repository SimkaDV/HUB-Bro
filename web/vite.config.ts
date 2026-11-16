import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Браузер не пускает напрямую к api.avito.ru (CORS) — ходим через дев-сервер. С бэкендом уйдёт на сервер.
    proxy: {
      "/avito": {
        target: "https://api.avito.ru",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/avito/, ""),
      },
    },
  },
});
