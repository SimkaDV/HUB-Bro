import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Данные — на сервере данных avito (avito/data/server, по умолчанию http://127.0.0.1:8791). `npm run dev` прокидывает
// /api туда; другой адрес — DATA_URL=http://… npm run dev. Сервер данных не запущен — прокси отвечает ошибкой без
// JSON, и кабинет работает локально, только в браузере (shared/lib/sync.ts).
const dataUrl = process.env.DATA_URL ?? "http://127.0.0.1:8791";

export default defineConfig({
  plugins: [react()],
  // В main.tsx ждём данные с сервера через await на верхнем уровне.
  build: { target: "es2022" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Браузер не пускает напрямую к api.avito.ru (CORS) — ходим через дев-сервер (на проде — server/server.mjs).
    proxy: {
      "/api": { target: dataUrl, changeOrigin: true },
      "/avito": {
        target: "https://api.avito.ru",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/avito/, ""),
      },
    },
  },
});
