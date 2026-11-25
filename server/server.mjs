// Свой сервер HUB BRO: отдаёт собранный кабинет (web/dist), проксирует /avito/* к api.avito.ru и /api/* — к серверу
// данных avito (avito/data/server). Своих данных не хранит: кабинет и бот читают и пишут только через сервер данных
// (формат — avito/data/schema/FORMAT.md). Без зависимостей — только Node 20+.
// Описание — docs/ARCHITECTURE.md, «Сервер».
//
//   node server/server.mjs                     порт 8790, только 127.0.0.1 (снаружи — через `tailscale serve`)
//   PORT=8790 HOST=0.0.0.0 node server/…       слушать и на других адресах
//   DATA_URL=http://127.0.0.1:8791             где сервер данных (по умолчанию этот адрес)
//
// Ключ доступа проверяет сервер данных: заголовок x-hubbro-key уходит к нему как есть.

import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 8790);
const HOST = process.env.HOST ?? "127.0.0.1";
const DATA_URL = (process.env.DATA_URL ?? "http://127.0.0.1:8791").replace(/\/+$/, "");
const DIST = join(ROOT, "web", "dist");
const MAX_BODY = 50 * 1024 * 1024;

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end(body);
}
const json = (res, body, status = 200) =>
  send(res, status, JSON.stringify(body), { "content-type": "application/json; charset=utf-8" });

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(Object.assign(new Error("Слишком большое тело запроса"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

/** Заголовки про одно соединение, а не про запрос: их не пересылаем. */
const HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
  "host", "content-length",
]);

/**
 * /api/* → сервер данных: любой метод, путь и строка запроса, тело, заголовки (в том числе x-hubbro-key) — туда;
 * статус, заголовки и тело ответа — обратно. Сервер данных не отвечает — 502 с понятной ошибкой (JSON).
 */
async function handleData(req, res, url) {
  const target = `${DATA_URL}${url.pathname}${url.search}`;
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k) && v !== undefined) headers[k] = v;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  let r;
  try {
    r = await fetch(target, { method: req.method, headers, body, redirect: "manual" });
  } catch (err) {
    console.error(new Date().toISOString(), "сервер данных не отвечает:", target, err?.cause?.code ?? err);
    return json(res, { error: "Сервер данных не отвечает" }, 502);
  }
  const out = Buffer.from(await r.arrayBuffer());
  const back = {};
  // fetch уже распаковал тело — content-encoding и длину не пересылаем, длину посчитает Node.
  r.headers.forEach((v, k) => {
    if (!HOP.has(k) && k !== "content-encoding") back[k] = v;
  });
  res.writeHead(r.status, back);
  res.end(req.method === "HEAD" ? undefined : out);
}

/** /avito/* → https://api.avito.ru/* — браузер не пускает к Авито напрямую (CORS). Как rewrite в web/vercel.json. */
async function handleAvito(req, res, url) {
  const target = `https://api.avito.ru${url.pathname.replace(/^\/avito/, "")}${url.search}`;
  const headers = {};
  for (const h of ["authorization", "content-type", "accept"]) if (req.headers[h]) headers[h] = req.headers[h];
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
  const r = await fetch(target, { method: req.method, headers, body });
  const out = Buffer.from(await r.arrayBuffer());
  send(res, r.status, out, { "content-type": r.headers.get("content-type") ?? "application/octet-stream" });
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

/** Файлы кабинета из web/dist; всё, чего нет, — index.html (роуты react-router). */
async function handleStatic(req, res, url) {
  let path;
  try {
    path = normalize(join(DIST, decodeURIComponent(url.pathname)));
  } catch {
    return send(res, 400, "bad path");
  }
  if (path !== DIST && !path.startsWith(DIST + sep)) return send(res, 403, "forbidden");
  let file = path;
  const stat = await fs.stat(file).catch(() => null);
  if (!stat || !stat.isFile()) file = join(DIST, "index.html");
  const data = await fs.readFile(file).catch(() => null);
  if (!data) return send(res, 500, "Кабинет не собран: нет web/dist. Соберите: cd web && npm run build");
  // Файлы из assets/ с хешем в имени не меняются — кешируем надолго; index.html — нет, чтобы обновления доходили.
  const cache = file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache";
  send(res, 200, data, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": cache });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return await handleData(req, res, url);
    if (url.pathname.startsWith("/avito/")) return await handleAvito(req, res, url);
    return await handleStatic(req, res, url);
  } catch (err) {
    console.error(new Date().toISOString(), req.method, url.pathname, err);
    if (!res.headersSent) json(res, { error: err instanceof Error ? err.message : String(err) }, err?.status ?? 500);
    else res.end();
  }
}).listen(PORT, HOST, () => {
  console.log(`HUB BRO: http://${HOST}:${PORT}  сервер данных: ${DATA_URL}`);
});
