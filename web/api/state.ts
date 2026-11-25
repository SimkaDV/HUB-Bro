// УСТАРЕЛО (25.11.2026): кабинет больше не ходит сюда. Данные живут на сервере данных avito (avito/data/server,
// формат avito/data/schema/FORMAT.md), /api проксирует server/server.mjs или дев-сервер Vite. Файл оставлен только
// как история старого прода на Vercel; ключи ниже — старые, нового формата он не знает. Не развивать.
//
// Хранилище данных кабинета на Vercel: заказы, склад, партии печати, объявления — по одному JSON на ключ в Redis
// (Upstash из маркетплейса Vercel). Описание — docs/ARCHITECTURE.md, «Сервер».
//
// GET  /api/state            → { revs: { ключ: номер версии } } — кабинет опрашивает, что поменялось
// GET  /api/state?key=…      → { value, rev, savedAt } (value: null, если на сервере пусто)
// PUT  /api/state?key=…      тело { value, baseRev } → { rev, savedAt }
//                            baseRev — версия, с которой кабинет взял данные. На сервере уже новее (кто-то сохранил
//                            позже) — ничего не пишем, 409 { conflict: true, value, rev, savedAt }: старое не затрёт новое.
//
// Если задан ACCESS_KEY — каждый запрос должен прийти с заголовком x-hubbro-key с этим значением.
import { Redis } from "@upstash/redis";

/** Только эти ключи живут на сервере. Ключи Авито/Telegram и настройки принтера остаются в браузере. */
const KEYS = new Set([
  "hubbro.orders.v3",
  "hubbro.stock.v5",
  "hubbro.batches.v2",
  "hubbro.listings.v2",
  "hubbro.picking.services.v2",
]);
const REVS = "hubbro:revs";
/** Когда сохранили каждый ключ (ISO, по часам сервера — у компов часы могут расходиться). */
const SAVED = "hubbro:saved";
const stateKey = (key: string) => `hubbro:state:${key}`;

function redis() {
  // Маркетплейс Vercel кладёт либо KV_REST_API_*, либо UPSTASH_REDIS_REST_* — берём что есть.
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, automaticDeserialization: false });
}

/**
 * Версии из хеша hubbro:revs. С automaticDeserialization: false Upstash отдаёт HGETALL плоским массивом
 * [ключ, значение, ключ, значение…], а не объектом — разбираем оба вида.
 */
function toRevs(raw: unknown): Record<string, number> {
  const pairs: [string, unknown][] = Array.isArray(raw)
    ? Array.from({ length: Math.floor(raw.length / 2) }, (_, i) => [String(raw[2 * i]), raw[2 * i + 1]])
    : Object.entries((raw as Record<string, unknown> | null) ?? {});
  return Object.fromEntries(pairs.filter(([k]) => KEYS.has(k)).map(([k, v]) => [k, Number(v)]));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function guard(req: Request): Response | null {
  const need = process.env.ACCESS_KEY;
  if (need && req.headers.get("x-hubbro-key") !== need) return json({ error: "Нужен ключ доступа" }, 401);
  return null;
}

/**
 * Проверка версии и запись — одной операцией внутри Redis, чтобы два компа не проскочили между проверкой и записью.
 * → [1, новая версия] или [0, текущая версия на сервере].
 */
const SAVE_IF_FRESH = `
local cur = tonumber(redis.call("HGET", KEYS[2], ARGV[1]) or "0")
if tonumber(ARGV[2]) ~= cur then return {0, cur} end
redis.call("SET", KEYS[1], ARGV[3])
redis.call("HSET", KEYS[3], ARGV[1], ARGV[4])
return {1, redis.call("HINCRBY", KEYS[2], ARGV[1], 1)}
`;

async function read(db: Redis, key: string) {
  const [value, rev, savedAt] = await Promise.all([
    db.get<string>(stateKey(key)),
    db.hget<string>(REVS, key),
    db.hget<string>(SAVED, key),
  ]);
  return { value: value == null ? null : JSON.parse(value), rev: Number(rev ?? 0), savedAt: savedAt ?? null };
}

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const db = redis();
  if (!db) return json({ error: "База не подключена: добавьте Upstash Redis в проект Vercel" }, 503);

  const key = new URL(req.url).searchParams.get("key");
  if (!key) {
    return json({ revs: toRevs(await db.hgetall(REVS)) });
  }
  if (!KEYS.has(key)) return json({ error: "Неизвестный ключ" }, 400);
  return json(await read(db, key));
}

export async function PUT(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const db = redis();
  if (!db) return json({ error: "База не подключена: добавьте Upstash Redis в проект Vercel" }, 503);

  const key = new URL(req.url).searchParams.get("key");
  if (!key || !KEYS.has(key)) return json({ error: "Неизвестный ключ" }, 400);
  const body = (await req.json().catch(() => null)) as { value?: unknown; baseRev?: unknown } | null;
  if (!body || body.value === undefined) return json({ error: "Пустое тело" }, 400);
  // Без baseRev (старая вкладка до обновления кабинета) не пишем: не знаем, не затрём ли более новые данные.
  if (typeof body.baseRev !== "number") return json({ conflict: true, ...(await read(db, key)) }, 409);

  const savedAt = new Date().toISOString();
  const [ok, rev] = (await db.eval(
    SAVE_IF_FRESH,
    [stateKey(key), REVS, SAVED],
    [key, String(body.baseRev), JSON.stringify(body.value), savedAt],
  )) as [unknown, unknown];
  if (Number(ok) !== 1) return json({ conflict: true, ...(await read(db, key)) }, 409);
  return json({ rev: Number(rev), savedAt });
}
