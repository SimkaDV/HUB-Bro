// Сервер данных avito: единственная дверь к данным магазина для бота и HUB BRO. Без зависимостей, Node 20+.
// Формат — data/schema/FORMAT.md, проверка — data/schema/validate.mjs. Описание — data/server/README.md.
//
//   node data/server/server.mjs
//   PORT=8791  HOST=127.0.0.1  STORE=<папка данных, по умолчанию data/store>
//   ACCESS_KEY=…  или  ACCESS_KEY_FILE=<файл, первая строка — ключ>   (нет ключа — без проверки)
//
//   GET    /api/health                → { ok, version: { catalog: 1, … } }
//   GET    /api/state                 → { revs: { catalog: 3, …, files: 2 } }
//   GET    /api/state?key=catalog     → { value, rev, savedAt }   (файла нет — пустой по формату, rev 0)
//   PUT    /api/state?key=catalog     { value, baseRev } → { rev, savedAt, warnings }
//                                      | 409 { conflict, value, rev, savedAt }  | 422 { errors, warnings }
//   GET    /api/files                 → { files: [{ name, size }] }
//   GET    /api/files/<name>          → байты
//   PUT    /api/files/<name>          тело — байты → { name, size, rev }
//   DELETE /api/files/<name>          → { rev }

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { empty, FILE, KEYS, validate, VERSION } from "../schema/validate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8791);
const HOST = process.env.HOST ?? "127.0.0.1";
const STORE = resolve(process.env.STORE ?? join(HERE, "..", "store"));
const FILES = join(STORE, "files");
const META = join(STORE, "_meta.json");
const BACKUPS = join(STORE, "backups");
const KEEP_BACKUP_DAYS = 30;
const MAX_JSON = 50 * 1024 * 1024;
const MAX_FILE = 15 * 1024 * 1024;

function accessKey() {
  if (process.env.ACCESS_KEY) return process.env.ACCESS_KEY.trim();
  const f = process.env.ACCESS_KEY_FILE;
  if (f && existsSync(f)) return readFileSync(f, "utf8").split(/\r?\n/)[0].trim();
  return "";
}
const ACCESS_KEY = accessKey();

mkdirSync(FILES, { recursive: true });

// ---------- хранилище ----------

/** { [key | "files"]: { rev, savedAt } } */
let meta = existsSync(META) ? JSON.parse(readFileSync(META, "utf8")) : {};
const dataFile = (key) => join(STORE, `${key}.json`);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Через временный файл и переименование: читатель никогда не увидит половину файла. */
function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data);
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (err) {
      // Windows: файл в этот миг открыт другим — пробуем ещё.
      if (i >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(err.code)) throw err;
      sleep(50);
    }
  }
}

function bump(key) {
  const rev = (meta[key]?.rev ?? 0) + 1;
  const savedAt = new Date().toISOString();
  meta = { ...meta, [key]: { rev, savedAt } };
  writeAtomic(META, JSON.stringify(meta, null, 2));
  return { rev, savedAt };
}

function readValue(key) {
  const f = dataFile(key);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : empty(key);
}
const read = (key) => ({ value: readValue(key), rev: meta[key]?.rev ?? 0, savedAt: meta[key]?.savedAt ?? null });

const today = () => new Date().toISOString().slice(0, 10);

/** Перед первым изменением за день: копия всех JSON в backups/ГГГГ-ММ-ДД, старые копии старше 30 дней — долой. */
function backupOnce() {
  const dir = join(BACKUPS, today());
  if (existsSync(dir)) return dir;
  mkdirSync(join(dir, "files"), { recursive: true });
  for (const name of readdirSync(STORE)) if (name.endsWith(".json")) copyFileSync(join(STORE, name), join(dir, name));
  const cutoff = new Date(Date.now() - KEEP_BACKUP_DAYS * 86400_000).toISOString().slice(0, 10);
  for (const name of readdirSync(BACKUPS)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(name) && name < cutoff) rmSync(join(BACKUPS, name), { recursive: true, force: true });
  }
  return dir;
}

// ---------- http ----------

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "cache-control": "no-store", ...headers });
  res.end(body);
}
const json = (res, body, status = 200) =>
  send(res, status, JSON.stringify(body), { "content-type": "application/json; charset=utf-8" });

function readBody(req, limit) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        fail(Object.assign(new Error("Слишком большое тело запроса"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", fail);
  });
}

async function handleState(req, res, url) {
  const key = url.searchParams.get("key");

  if (req.method === "GET") {
    if (!key) {
      const revs = Object.fromEntries([...KEYS, "files"].filter((k) => meta[k]).map((k) => [k, meta[k].rev]));
      return json(res, { revs });
    }
    if (!KEYS.includes(key)) return json(res, { error: "Неизвестный ключ" }, 400);
    return json(res, read(key));
  }

  if (req.method === "PUT") {
    if (!key || !KEYS.includes(key)) return json(res, { error: "Неизвестный ключ" }, 400);
    let body;
    try {
      body = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8"));
    } catch (err) {
      if (err.status) throw err;
      body = null;
    }
    if (!body || body.value === undefined) return json(res, { error: "Пустое тело" }, 400);
    if (typeof body.baseRev !== "number") return json(res, { conflict: true, ...read(key) }, 409);

    const others = Object.fromEntries(KEYS.filter((k) => k !== key && existsSync(dataFile(k))).map((k) => [k, readValue(k)]));
    const { errors, warnings } = validate(key, body.value, others);
    if (errors.length) return json(res, { error: "Данные не по формату", errors, warnings }, 422);

    // Проверка версии и запись — синхронно: Node однопоточный, другой запрос между ними не вклинится.
    if (body.baseRev !== (meta[key]?.rev ?? 0)) return json(res, { conflict: true, ...read(key) }, 409);
    backupOnce();
    writeAtomic(dataFile(key), JSON.stringify(body.value));
    return json(res, { ...bump(key), warnings });
  }

  return json(res, { error: "Метод не поддерживается" }, 405);
}

const TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic",
  ".gif": "image/gif", ".pdf": "application/pdf",
};

async function handleFiles(req, res, url) {
  const name = decodeURIComponent(url.pathname.slice("/api/files".length).replace(/^\//, ""));
  if (!name) {
    if (req.method !== "GET") return json(res, { error: "Метод не поддерживается" }, 405);
    const files = readdirSync(FILES).filter((n) => FILE.test(n)).map((n) => ({ name: n, size: statSync(join(FILES, n)).size }));
    return json(res, { files });
  }
  if (!FILE.test(name)) return json(res, { error: "Недопустимое имя файла" }, 400);
  const path = join(FILES, name);

  if (req.method === "GET") {
    if (!existsSync(path)) return json(res, { error: "Нет такого файла" }, 404);
    return send(res, 200, readFileSync(path), {
      "content-type": TYPES[extname(name).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
  }
  if (req.method === "PUT") {
    if (!TYPES[extname(name).toLowerCase()]) return json(res, { error: "Можно только картинки и PDF" }, 400);
    const data = await readBody(req, MAX_FILE);
    if (!data.length) return json(res, { error: "Пустой файл" }, 400);
    const dir = backupOnce();
    if (existsSync(path) && !existsSync(join(dir, "files", name))) copyFileSync(path, join(dir, "files", name));
    writeAtomic(path, data);
    return json(res, { name, size: data.length, rev: bump("files").rev });
  }
  if (req.method === "DELETE") {
    if (!existsSync(path)) return json(res, { error: "Нет такого файла" }, 404);
    const dir = backupOnce();
    // Удалённое не пропадает сразу: лежит в копии дня 30 дней.
    if (!existsSync(join(dir, "files", name))) copyFileSync(path, join(dir, "files", name));
    rmSync(path);
    return json(res, { rev: bump("files").rev });
  }
  return json(res, { error: "Метод не поддерживается" }, 405);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  try {
    if (url.pathname === "/api/health") return json(res, { ok: true, version: VERSION });
    if (ACCESS_KEY && req.headers["x-hubbro-key"] !== ACCESS_KEY) return json(res, { error: "Нужен ключ доступа" }, 401);
    if (url.pathname === "/api/state") return await handleState(req, res, url);
    if (url.pathname === "/api/files" || url.pathname.startsWith("/api/files/")) return await handleFiles(req, res, url);
    return json(res, { error: "Нет такого адреса" }, 404);
  } catch (err) {
    console.error(new Date().toISOString(), req.method, url.pathname, err);
    if (!res.headersSent) json(res, { error: err instanceof Error ? err.message : String(err) }, err.status ?? 500);
    else res.end();
  }
}).listen(PORT, HOST, () => {
  console.log(`avito data: http://${HOST}:${PORT}  данные: ${STORE}  ключ доступа: ${ACCESS_KEY ? "да" : "нет"}`);
});
