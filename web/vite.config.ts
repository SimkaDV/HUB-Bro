import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Сервер данных на Vercel (web/api/state.ts). Локально: HUBBRO_API=https://<проект>.vercel.app npm run dev —
// дев-сервер прокидывает /api туда, и localhost работает с теми же данными (сервер главнее: свои данные туда не переезжают).
const api = process.env.HUBBRO_API;

export default defineConfig({
  plugins: [
    react(),
    // Без HUBBRO_API сервера данных нет: отвечаем 404, а не отдаём web/api/state.ts как модуль. Кабинет работает локально.
    {
      name: "hubbro-no-api",
      configureServer(server) {
        if (api) return;
        server.middlewares.use("/api/", (_req, res) => {
          res.statusCode = 404;
          res.end("no api");
        });
      },
    },
  ],
  // В main.tsx ждём данные с сервера через await на верхнем уровне.
  build: { target: "es2022" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Браузер не пускает напрямую к api.avito.ru (CORS) — ходим через дев-сервер. С бэкендом уйдёт на сервер.
    proxy: {
      ...(api ? { "/api": { target: api, changeOrigin: true } } : {}),
      "/avito": {
        target: "https://api.avito.ru",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/avito/, ""),
      },
    },
  },
});
