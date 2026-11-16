// Синхронизация общих хранилищ с сервером (Vercel + Redis, web/api/state.ts). Описание — docs/ARCHITECTURE.md, «Сервер».
//
// При старте забираем данные с сервера и подставляем вместо браузерных. На сервере пусто, а в браузере есть свои
// данные (не тестовые) — заливаем их туда: так переезжают данные с localhost. Дальше каждое изменение уходит на
// сервер (через полсекунды тишины), а раз в 15 секунд смотрим, не поменял ли кто-то другой.
// Кто сохранил последним, того и данные: одновременная правка одного и того же с двух компов — последняя победит.
// Сервера нет (локально без прокси) — кабинет работает как раньше, только в браузере.
import { useSyncExternalStore } from "react";
import type { Store } from "./store";

const API = "/api/state";
const ACCESS_KEY = "hubbro.access.v1";
const PUSH_DELAY = 500;
const POLL_EVERY = 15_000;

export type SyncState = "local" | "connecting" | "synced" | "saving" | "error";

let state: SyncState = "local";
let lastError = "";
const listeners = new Set<() => void>();
function setState(next: SyncState, error = "") {
  state = next;
  lastError = error;
  listeners.forEach((l) => l());
}

/** Состояние связи с сервером — для подписи в интерфейсе. */
export function useSyncState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  ) as SyncState;
}
export const syncError = () => lastError;

function headers(): HeadersInit {
  let key = "";
  try {
    key = localStorage.getItem(ACCESS_KEY) ?? "";
  } catch {
    // без localStorage — без ключа
  }
  return { "content-type": "application/json", ...(key ? { "x-hubbro-key": key } : {}) };
}

class NoServer extends Error {}

// Ключ спрашиваем один раз на все параллельные запросы.
let asking: Promise<boolean> | null = null;
function askKey(): Promise<boolean> {
  asking ??= Promise.resolve().then(() => {
    const key = window.prompt("Ключ доступа к кабинету HUB BRO:");
    if (key) {
      try {
        localStorage.setItem(ACCESS_KEY, key.trim());
      } catch {
        // не запомним — спросим снова
      }
    }
    setTimeout(() => (asking = null), 0);
    return Boolean(key);
  });
  return asking;
}

async function call<T>(url: string, init?: RequestInit, retry = true): Promise<T> {
  const res = await fetch(url, { ...init, headers: headers(), cache: "no-store" });
  // Без сервера дев-сервер Vite отвечает index.html — значит, работаем локально.
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) throw new NoServer();
  if (res.status === 401 && retry) {
    if (!(await askKey())) throw new Error("Без ключа доступа данные с сервера не загрузить");
    return call(url, init, false);
  }
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Сервер ответил ${res.status}`);
  return body;
}

type Entry = {
  store: Store<unknown>;
  rev: number;
  /** Сервер уже отдал данные (или принял наши). До этого ничего не отправляем — чтобы не затереть его тестовыми. */
  loaded: boolean;
  timer?: ReturnType<typeof setTimeout>;
  applying: boolean;
};

/**
 * Подключить хранилища к серверу. Ждём первую загрузку (не дольше нескольких секунд), чтобы не показать
 * на новом компе тестовые данные вместо настоящих.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- хранилища разных типов, синхронизации тип не важен
export async function startServerSync(stores: Store<any>[]): Promise<void> {
  const entries = new Map<string, Entry>(
    stores.map((s) => [s.key, { store: s as Store<unknown>, rev: 0, loaded: false, applying: false }]),
  );
  setState("connecting");

  const apply = (e: Entry, value: unknown, rev: number) => {
    e.applying = true;
    try {
      e.store.hydrate(value);
    } finally {
      e.applying = false;
    }
    e.rev = rev;
    e.loaded = true;
  };

  const push = async (e: Entry) => {
    e.timer = undefined;
    setState("saving");
    try {
      const { rev } = await call<{ rev: number }>(`${API}?key=${encodeURIComponent(e.store.key)}`, {
        method: "PUT",
        body: JSON.stringify({ value: e.store.get() }),
      });
      e.rev = rev;
      e.loaded = true;
      if ([...entries.values()].every((x) => !x.timer)) setState("synced");
    } catch (err) {
      setState("error", err instanceof Error ? err.message : String(err));
    }
  };

  const schedule = (e: Entry) => {
    if (e.applying || !e.loaded) return;
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => void push(e), PUSH_DELAY);
  };

  /** Первая загрузка хранилища: данные сервера, а если там пусто — наши (только свои, не тестовые). */
  const load = async (e: Entry) => {
    const { value, rev } = await call<{ value: unknown; rev: number }>(`${API}?key=${encodeURIComponent(e.store.key)}`);
    if (e.loaded) return;
    if (value !== null) apply(e, value, rev);
    else if (e.store.fromStorage) await push(e); // переезд: на сервере пусто, в браузере свои данные
    else e.loaded = true; // пусто и там и тут: дальше правки уходят на сервер
  };

  try {
    await Promise.race([
      Promise.all([...entries.values()].map(load)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Сервер долго не отвечает")), 8000)),
    ]);
    setState("synced");
  } catch (err) {
    if (err instanceof NoServer) return setState("local");
    setState("error", err instanceof Error ? err.message : String(err));
  }

  for (const e of entries.values()) e.store.subscribe(() => schedule(e));

  // Чужие правки: спрашиваем версии, тянем только поменявшиеся и только если у нас ничего не ждёт отправки.
  const poll = async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const { revs } = await call<{ revs: Record<string, number> }>(API);
      for (const e of entries.values()) {
        if (!e.loaded) {
          await load(e);
          continue;
        }
        const rev = revs[e.store.key] ?? 0;
        if (rev <= e.rev || e.timer) continue;
        const fresh = await call<{ value: unknown; rev: number }>(`${API}?key=${encodeURIComponent(e.store.key)}`);
        if (fresh.value !== null && !e.timer) apply(e, fresh.value, fresh.rev);
      }
      if (state === "error" || state === "connecting") setState("synced");
    } catch (err) {
      if (!(err instanceof NoServer)) setState("error", err instanceof Error ? err.message : String(err));
    }
  };
  setInterval(() => void poll(), POLL_EVERY);
  document.addEventListener("visibilitychange", () => void poll());
}
