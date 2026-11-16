// Клиент API Авито (официальный, по ключам из настроек). Описание — docs/LISTINGS.md, раздел «Откуда берём».
// Заказы приходят не отсюда, а через расширение Chrome — это index.ts рядом (docs/EXTENSION.md).
// Браузер напрямую к api.avito.ru не пускает (CORS), поэтому запросы идут через прокси дев-сервера Vite:
// /avito/... → https://api.avito.ru/... (web/vite.config.ts). С бэкендом запросы переедут на сервер.
import { connectionsStore } from "@/shared/connections";

const BASE = "/avito";

export class AvitoError extends Error {}

type Token = { value: string; expiresAt: number; clientId: string };
let token: Token | null = null;

function credentials() {
  const v = connectionsStore.get().avito.values;
  if (!v.clientId || !v.clientSecret) throw new AvitoError("Внесите Client ID и Client secret в «Настройки → Авито»");
  return { clientId: v.clientId, clientSecret: v.clientSecret, userId: v.userId };
}

async function getToken(): Promise<string> {
  const { clientId, clientSecret } = credentials();
  if (token && token.clientId === clientId && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await send(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new AvitoError("Авито не принял ключи — проверьте Client ID и Client secret");
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000, clientId };
  return token.value;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new AvitoError("Нет связи с Авито — проверьте интернет");
  }
  // Без прокси (сайт открыт не через дев-сервер) вместо JSON вернётся наша же страница.
  if (res.status === 404 && !res.headers.get("content-type")?.includes("json")) {
    throw new AvitoError("Запросы к Авито пока работают только на дев-сервере (npm run dev)");
  }
  return res;
}

/** Запрос к API Авито с токеном. Ответ — JSON. */
export async function avitoRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await send(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) {
    token = null;
    throw new AvitoError("Авито не принял ключи — проверьте Client ID и Client secret");
  }
  if (res.status === 403) throw new AvitoError("У ключей нет доступа к этому разделу Авито");
  if (res.status === 429) throw new AvitoError("Авито просит подождать — слишком много запросов, попробуйте через минуту");
  if (!res.ok) throw new AvitoError(`Авито ответил ошибкой ${res.status}`);
  return (await res.json()) as T;
}

let selfId: string | null = null;

/** Номер профиля: из настроек, а если не вписан — спрашиваем у Авито. */
export async function avitoUserId(): Promise<string> {
  const { userId } = credentials();
  if (userId) return userId;
  if (!selfId) selfId = String((await avitoRequest<{ id: number }>("/core/v1/accounts/self")).id);
  return selfId;
}
