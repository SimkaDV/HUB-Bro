// Хранилище данных кабинета на Vercel: заказы, склад, партии печати, объявления — по одному JSON на ключ в Redis
// (Upstash из маркетплейса Vercel). Описание — docs/ARCHITECTURE.md, «Сервер».
//
// GET  /api/state            → { revs: { ключ: номер версии } } — кабинет опрашивает, что поменялось
// GET  /api/state?key=…      → { value, rev } (value: null, если на сервере пусто)
// PUT  /api/state?key=…      тело { value } → { rev }
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
const stateKey = (key: string) => `hubbro:state:${key}`;

function redis() {
  // Маркетплейс Vercel кладёт либо KV_REST_API_*, либо UPSTASH_REDIS_REST_* — берём что есть.
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token, automaticDeserialization: false });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function guard(req: Request): Response | null {
  const need = process.env.ACCESS_KEY;
  if (need && req.headers.get("x-hubbro-key") !== need) return json({ error: "Нужен ключ доступа" }, 401);
  return null;
}

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const db = redis();
  if (!db) return json({ error: "База не подключена: добавьте Upstash Redis в проект Vercel" }, 503);

  const key = new URL(req.url).searchParams.get("key");
  if (!key) {
    const raw = (await db.hgetall<Record<string, string>>(REVS)) ?? {};
    return json({ revs: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Number(v)])) });
  }
  if (!KEYS.has(key)) return json({ error: "Неизвестный ключ" }, 400);
  const [value, rev] = await Promise.all([db.get<string>(stateKey(key)), db.hget<string>(REVS, key)]);
  return json({ value: value == null ? null : JSON.parse(value), rev: Number(rev ?? 0) });
}

export async function PUT(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const db = redis();
  if (!db) return json({ error: "База не подключена: добавьте Upstash Redis в проект Vercel" }, 503);

  const key = new URL(req.url).searchParams.get("key");
  if (!key || !KEYS.has(key)) return json({ error: "Неизвестный ключ" }, 400);
  const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
  if (!body || body.value === undefined) return json({ error: "Пустое тело" }, 400);

  const tx = db.multi();
  tx.set(stateKey(key), JSON.stringify(body.value));
  tx.hincrby(REVS, key, 1);
  const [, rev] = (await tx.exec()) as [unknown, number];
  return json({ rev });
}
