// Синхронизация общих хранилищ с сервером (Vercel + Redis, web/api/state.ts). Описание — docs/ARCHITECTURE.md, «Сервер».
//
// При старте забираем данные с сервера и подставляем вместо браузерных. Сервер главнее: на сервере пусто — и в
// браузере пусто, данные из браузера на сервер сами не переезжают. Дальше каждое изменение уходит на сервер
// (через полсекунды тишины), а раз в 15 секунд смотрим, не поменял ли кто-то другой.
// Старое не затирает новое: отправляем вместе с версией, с которой взяли данные. Кто-то успел сохранить позже —
// сервер отказывает, мы берём его данные, а свою отправку выбрасываем.
// Сервера нет (локально без прокси) — кабинет работает как раньше, только в браузере.
import { useSyncExternalStore } from "react";
import type { Store } from "./store";

const API = "/api/state";
const ACCESS_KEY = "hubbro.access.v1";
const PUSH_DELAY = 500;
const POLL_EVERY = 15_000;

export type SyncState = "local" | "connecting" | "synced" | "saving" | "error";

/** Что показать внизу меню: связь, когда последний раз сохранили на сервере, подтянули ли чужие данные. */
export type SyncInfo = {
  state: SyncState;
  error: string;
  /** Самое позднее сохранение на сервере среди хранилищ (ISO, по часам сервера). */
  savedAt: string | null;
  /** Наша правка не ушла: на сервере были данные новее, их и взяли. Показываем несколько секунд. */
  replaced: boolean;
};

const REPLACED_FOR = 8000;
let info: SyncInfo = { state: "local", error: "", savedAt: null, replaced: false };
let replacedTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
function patch(next: Partial<SyncInfo>) {
  info = { ...info, ...next };
  listeners.forEach((l) => l());
}
function setState(next: SyncState, error = "") {
  patch({ state: next, error });
}
function noteSaved(savedAt: string | null | undefined) {
  if (savedAt && (!info.savedAt || savedAt > info.savedAt)) patch({ savedAt });
}
function noteReplaced() {
  clearTimeout(replacedTimer);
  patch({ replaced: true });
  replacedTimer = setTimeout(() => patch({ replaced: false }), REPLACED_FOR);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Состояние связи с сервером — для подписи в интерфейсе. */
export const useSyncState = () => useSyncExternalStore(subscribe, () => info.state);
/** Связь, время последнего сохранения и «подтянули чужие данные» — для подписи внизу меню. */
export const useSyncInfo = () => useSyncExternalStore(subscribe, () => info);

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

type Remote = { value: unknown; rev: number; savedAt?: string | null };

/** Сервер не принял: у него версия новее нашей. Внутри — его данные. */
class Conflict extends Error {
  constructor(readonly remote: Remote) {
    super("На сервере данные новее");
  }
}

let flush: () => Promise<boolean> = async () => true;

/**
 * Отправить на сервер всё, что ждёт отправки, не дожидаясь паузы. true — сервер всё принял (или сервера нет).
 * Нужно «Очистить все данные»: перед перезагрузкой страницы.
 */
export const flushServerSync = () => flush();

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
  const body = (await res.json()) as T & { error?: string; conflict?: boolean };
  if (res.status === 409 && body.conflict) throw new Conflict(body as unknown as Remote);
  if (!res.ok) throw new Error(body.error ?? `Сервер ответил ${res.status}`);
  return body;
}

type Entry = {
  store: Store<unknown>;
  rev: number;
  /** Сервер уже отдал данные (или принял наши). До этого ничего не отправляем — чтобы не затереть его старыми. */
  loaded: boolean;
  timer?: ReturnType<typeof setTimeout>;
  /** Отправка в пути. Вторую параллельно не шлём: она ушла бы с той же версией и получила отказ. */
  pushing?: Promise<boolean>;
  /** Пока отправка в пути, данные поменялись ещё — отправим снова, когда она вернётся. */
  again: boolean;
  applying: boolean;
};

/**
 * Подключить хранилища к серверу. Ждём первую загрузку (не дольше нескольких секунд), чтобы не показать
 * на новом компе пустой кабинет вместо настоящих данных.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- хранилища разных типов, синхронизации тип не важен
export async function startServerSync(stores: Store<any>[]): Promise<void> {
  const entries = new Map<string, Entry>(
    stores.map((s) => [s.key, { store: s as Store<unknown>, rev: 0, loaded: false, again: false, applying: false }]),
  );
  setState("connecting");

  const apply = (e: Entry, value: unknown, rev: number) => {
    // Данные сервера новее всего, что у нас ждёт отправки, — ждущее выбрасываем.
    if (e.timer) clearTimeout(e.timer);
    e.timer = undefined;
    e.again = false;
    e.applying = true;
    try {
      e.store.hydrate(value);
    } finally {
      e.applying = false;
    }
    e.rev = rev;
    e.loaded = true;
  };

  const settle = () => {
    if ([...entries.values()].every((x) => !x.timer && !x.pushing)) setState("synced");
  };

  const send = async (e: Entry): Promise<boolean> => {
    setState("saving");
    try {
      const saved = await call<{ rev: number; savedAt: string }>(`${API}?key=${encodeURIComponent(e.store.key)}`, {
        method: "PUT",
        body: JSON.stringify({ value: e.store.get(), baseRev: e.rev }),
      });
      e.rev = saved.rev;
      e.loaded = true;
      noteSaved(saved.savedAt);
      return true;
    } catch (err) {
      if (err instanceof Conflict) {
        // Кто-то сохранил позже, чем мы взяли данные: берём его версию, нашу отправку выбрасываем.
        if (err.remote.value !== null) apply(e, err.remote.value, err.remote.rev);
        else e.rev = err.remote.rev;
        noteSaved(err.remote.savedAt);
        noteReplaced();
        return true;
      }
      setState("error", err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const push = (e: Entry): Promise<boolean> => {
    e.timer = undefined;
    if (e.pushing) {
      e.again = true;
      return e.pushing;
    }
    const run = send(e).then((ok) => {
      e.pushing = undefined;
      if (ok && e.again) {
        e.again = false;
        return push(e);
      }
      if (ok) settle();
      return ok;
    });
    e.pushing = run;
    return run;
  };

  flush = async () => {
    const pending = [...entries.values()].filter((e) => e.timer || e.pushing);
    for (const e of pending) clearTimeout(e.timer);
    const results = await Promise.all(pending.map(push));
    return results.every(Boolean);
  };

  const schedule = (e: Entry) => {
    if (e.applying || !e.loaded) return;
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => void push(e), PUSH_DELAY);
  };

  /** Первая загрузка хранилища: данные сервера, а если там пусто — и в браузере пусто (сервер главнее). */
  const load = async (e: Entry) => {
    const { value, rev, savedAt } = await call<Remote>(`${API}?key=${encodeURIComponent(e.store.key)}`);
    if (e.loaded) return;
    noteSaved(savedAt);
    if (value !== null) return apply(e, value, rev);
    e.applying = true;
    try {
      e.store.reset();
    } finally {
      e.applying = false;
    }
    e.rev = rev;
    e.loaded = true; // дальше правки уходят на сервер
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

  // Чужие правки: спрашиваем версии и тянем поменявшиеся. Наша ждущая правка сделана поверх старых данных —
  // сервер её всё равно не примет, поэтому данные сервера берём сразу, а её выбрасываем.
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
        if (rev <= e.rev || e.pushing) continue;
        const fresh = await call<Remote>(`${API}?key=${encodeURIComponent(e.store.key)}`);
        if (fresh.rev <= e.rev || e.pushing) continue;
        if (e.timer) noteReplaced();
        if (fresh.value !== null) apply(e, fresh.value, fresh.rev);
        noteSaved(fresh.savedAt);
      }
      if (info.state === "error" || info.state === "connecting") setState("synced");
    } catch (err) {
      if (!(err instanceof NoServer)) setState("error", err instanceof Error ? err.message : String(err));
    }
  };
  setInterval(() => void poll(), POLL_EVERY);
  document.addEventListener("visibilitychange", () => void poll());
}
