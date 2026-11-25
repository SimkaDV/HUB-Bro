// Синхронизация файлов с сервером данных avito (avito/data/server, формат — avito/data/schema/FORMAT.md).
// Описание — docs/ARCHITECTURE.md, «Сервер» и «Синхронизация».
//
// Хранилища — файлы сервера данных: catalog, stock, orders, listings, printBatches, shop, hub, log. При старте
// забираем их с сервера и подставляем вместо браузерных. Сервер главнее: файла там ещё нет — он отдаёт пустой по
// формату, и в браузере пусто. Дальше каждое изменение уходит на сервер (через полсекунды тишины), а раз в 15 секунд
// смотрим, не поменял ли кто-то другой (второй комп, бот).
// Старое не затирает новое: отправляем вместе с версией, с которой взяли данные (baseRev). Кто-то успел сохранить
// позже — 409: у файлов, которые пишет и бот (catalog, shop, log), применяем свою правку заново поверх свежих данных
// (FORMAT.md, правило 8), у остальных берём данные сервера, а свою отправку выбрасываем.
// Сервер не принял данные (422 — не по формату) — показываем ошибки внизу меню и сами не повторяем, пока не
// поменяется что-то ещё или сервер не пришлёт новые данные.
// Сначала каталог, потом остальное: остатки, заказы и объявления ссылаются на товары каталога.
// Сервера нет (локально без прокси) — кабинет работает как раньше, только в браузере.
import { useSyncExternalStore } from "react";
import { sameData } from "./same";
import { FormatError, isObj, type FileStore } from "./store";

const API = "/api/state";
const ACCESS_KEY = "hubbro.access.v1";
const PUSH_DELAY = 500;
const POLL_EVERY = 15_000;
/** Этот файл пишется первым: на него ссылаются остальные. */
const FIRST = "catalog";
/** Файлы, которые пишет и бот: при 409 правку кабинета применяем заново поверх свежих данных. */
const REBASE = new Set(["catalog", "shop", "log"]);

export type SyncState = "local" | "connecting" | "synced" | "saving" | "error";

/** Что показать внизу меню: связь, когда последний раз сохранили на сервере, подтянули ли чужие данные. */
export type SyncInfo = {
  state: SyncState;
  error: string;
  /** Самое позднее сохранение на сервере среди хранилищ (ISO, по часам сервера). */
  savedAt: string | null;
  /** Наша правка не ушла: на сервере были данные новее, их и взяли. Показываем несколько секунд. */
  replaced: boolean;
  /** Ошибка — не связь, а данные: сервер их не принял (422) или файл в неизвестном формате. */
  rejected: boolean;
};

const REPLACED_FOR = 8000;
let info: SyncInfo = { state: "local", error: "", savedAt: null, replaced: false, rejected: false };
let replacedTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
function patch(next: Partial<SyncInfo>) {
  info = { ...info, ...next };
  listeners.forEach((l) => l());
}
function setState(next: SyncState, error = "", rejected = false) {
  patch({ state: next, error, rejected });
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

/** Сервер не принял: данные не по формату (422). Внутри — что не так. */
class Invalid extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join("; "));
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
  // Без сервера дев-сервер Vite отвечает index.html или ошибкой прокси — значит, работаем локально.
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) throw new NoServer();
  if (res.status === 401 && retry) {
    if (!(await askKey())) throw new Error("Без ключа доступа данные с сервера не загрузить");
    return call(url, init, false);
  }
  const body = (await res.json()) as T & { error?: string; conflict?: boolean; errors?: string[] };
  if (res.status === 409 && body.conflict) throw new Conflict(body as unknown as Remote);
  if (res.status === 422) {
    throw new Invalid(Array.isArray(body.errors) && body.errors.length ? body.errors : [body.error ?? "данные не по формату"]);
  }
  if (!res.ok) throw new Error(body.error ?? `Сервер ответил ${res.status}`);
  return body;
}

// ---------- своя правка поверх свежих данных (409) ----------

const hasId = (v: unknown): v is { id: string } => isObj(v) && typeof v.id === "string";
const isIdList = (v: unknown): v is { id: string }[] => Array.isArray(v) && v.every(hasId);

type Merge = { value: unknown; kept: boolean };

/**
 * Трёхсторонняя склейка: base — с чего мы начали, mine — наше, theirs — сервер. Поле поменяли только мы — берём
 * наше, только они — их. Поменяли оба: списки с id (товары, категории, записи истории) склеиваются по элементам,
 * объекты — по полям, иначе побеждает сервер. kept — что-то наше уцелело, и это надо отправить снова.
 */
function merge3(base: unknown, mine: unknown, theirs: unknown): Merge {
  if (sameData(mine, base)) return { value: theirs, kept: false };
  if (sameData(theirs, base) || sameData(theirs, mine)) return { value: mine, kept: !sameData(theirs, mine) };
  if (isIdList(mine) && isIdList(theirs)) return mergeList(isIdList(base) ? base : [], mine, theirs);
  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, unknown> = {};
    let kept = false;
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      const m = merge3(b[k], mine[k], theirs[k]);
      if (m.value !== undefined) out[k] = m.value;
      kept ||= m.kept;
    }
    return { value: out, kept };
  }
  return { value: theirs, kept: false };
}

function mergeList(base: { id: string }[], mine: { id: string }[], theirs: { id: string }[]): Merge {
  const b = new Map(base.map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const t = new Set(theirs.map((x) => x.id));
  let kept = false;
  const out: unknown[] = [];
  for (const item of theirs) {
    const old = b.get(item.id);
    const our = m.get(item.id);
    if (!our) {
      // Мы удалили, а они не меняли — удаляем; они поменяли (или это их новый) — оставляем.
      if (old && sameData(item, old)) kept = true;
      else out.push(item);
      continue;
    }
    if (!old) {
      out.push(item);
      continue;
    }
    const r = merge3(old, our, item);
    out.push(r.value);
    kept ||= r.kept;
  }
  // Наши новые элементы (их не было ни в base, ни на сервере) — в конец. Удалённые сервером — не возвращаем.
  for (const item of mine) {
    if (!t.has(item.id) && !b.has(item.id)) {
      out.push(item);
      kept = true;
    }
  }
  return { value: out, kept };
}

/** Своя правка поверх свежих данных сервера; null — нашего ничего не осталось, берём данные сервера. */
export function rebase(key: string, base: unknown, mine: unknown, theirs: unknown): Record<string, unknown> | null {
  if (!REBASE.has(key) || !isObj(base) || !isObj(mine) || !isObj(theirs)) return null;
  const r = merge3(base, mine, theirs);
  if (!r.kept || !isObj(r.value)) return null;
  if (key === "log" && Array.isArray(r.value.entries)) {
    // История: новые сверху, не больше 2000 записей.
    const entries = [...(r.value.entries as { at: string }[])].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { ...r.value, entries: entries.slice(0, 2000) };
  }
  return r.value;
}

// ---------- синхронизация ----------

type Entry = {
  store: FileStore<unknown>;
  rev: number;
  /** Файл, как он сейчас на сервере (последний принятый или полученный) — база для правки поверх свежих данных. */
  base: unknown;
  /** Сервер уже отдал данные (или принял наши). До этого ничего не отправляем — чтобы не затереть его старыми. */
  loaded: boolean;
  timer?: ReturnType<typeof setTimeout>;
  /** Отправка в пути. Вторую параллельно не шлём: она ушла бы с той же версией и получила отказ. */
  pushing?: Promise<boolean>;
  /** Пока отправка в пути, данные поменялись ещё — отправим снова, когда она вернётся. */
  again: boolean;
  applying: boolean;
  /** Сервер не принял наши данные (422): что не так. Пока есть — внизу меню ошибка. */
  invalid: string[] | null;
  /** Файл на сервере в неизвестном формате: не читаем и не пишем (FORMAT.md, правило 1). */
  blocked: string | null;
};

/**
 * Подключить хранилища-файлы к серверу данных. Ждём первую загрузку (не дольше нескольких секунд), чтобы не
 * показать на новом компе пустой кабинет вместо настоящих данных.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- хранилища разных типов, синхронизации тип не важен
export async function startServerSync(stores: FileStore<any>[]): Promise<void> {
  const entries = new Map<string, Entry>(
    stores.map((s) => [
      s.key,
      {
        store: s as FileStore<unknown>,
        rev: 0,
        base: null,
        loaded: false,
        again: false,
        applying: false,
        invalid: null,
        blocked: null,
      },
    ]),
  );
  setState("connecting");

  /** Ошибка, которую нельзя прятать, пока её не исправят: файл не по формату или в неизвестной версии. */
  const stickyError = () => {
    for (const e of entries.values()) {
      if (e.blocked) return `Сервер данных: ${e.blocked}`;
      if (e.invalid) return `Сервер данных не принял «${e.store.key}»: ${e.invalid.slice(0, 3).join("; ")}`;
    }
    return null;
  };
  const showSticky = () => {
    const sticky = stickyError();
    if (sticky) setState("error", sticky, true);
    return Boolean(sticky);
  };

  const apply = (e: Entry, value: unknown, rev: number) => {
    // Данные сервера новее всего, что у нас ждёт отправки, — ждущее выбрасываем.
    if (e.timer) clearTimeout(e.timer);
    e.timer = undefined;
    e.again = false;
    e.applying = true;
    try {
      e.store.hydrate(value);
      e.blocked = null;
    } catch (err) {
      if (!(err instanceof FormatError)) throw err;
      e.blocked = err.message;
    } finally {
      e.applying = false;
    }
    e.rev = rev;
    e.base = value;
    e.invalid = null;
    e.loaded = true;
  };

  const settle = () => {
    if (showSticky()) return;
    if ([...entries.values()].every((x) => !x.timer && !x.pushing)) setState("synced");
  };

  const send = async (e: Entry): Promise<boolean> => {
    // Каталог — первым: остатки и заказы ссылаются на его товары.
    const first = entries.get(FIRST);
    if (first && first !== e) {
      if (first.timer) {
        clearTimeout(first.timer);
        void push(first);
      }
      if (first.pushing) await first.pushing;
    }
    if (e.blocked) return false;
    setState("saving");
    const value = e.store.serialize();
    try {
      const saved = await call<{ rev: number; savedAt: string }>(`${API}?key=${encodeURIComponent(e.store.key)}`, {
        method: "PUT",
        body: JSON.stringify({ value, baseRev: e.rev }),
      });
      e.rev = saved.rev;
      e.base = value;
      e.loaded = true;
      e.invalid = null;
      noteSaved(saved.savedAt);
      return true;
    } catch (err) {
      if (err instanceof Conflict) {
        // Кто-то сохранил позже, чем мы взяли данные. Свою правку — заново поверх его данных (если файл это
        // позволяет и от неё что-то осталось), иначе берём его версию, а нашу отправку выбрасываем.
        const merged = rebase(e.store.key, e.base, e.store.serialize(), err.remote.value);
        apply(e, err.remote.value, err.remote.rev);
        noteSaved(err.remote.savedAt);
        if (merged && !e.blocked) e.store.hydrate(merged); // подписка отправит снова через полсекунды
        else noteReplaced();
        return true;
      }
      if (err instanceof Invalid) {
        // Не по формату: сами не повторяем — ошибка висит внизу меню, пока не исправят.
        e.invalid = err.errors;
        console.error(`Сервер данных не принял «${e.store.key}»:`, err.errors);
        showSticky();
        return false;
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
    // Каталог уходит первым (send остальных его ждёт), дальше — параллельно.
    const results = await Promise.all(pending.map(push));
    return results.every(Boolean);
  };

  const schedule = (e: Entry) => {
    if (e.applying || !e.loaded || e.blocked) return;
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => void push(e), PUSH_DELAY);
  };

  /** Первая загрузка файла: данные сервера (файла ещё нет — сервер отдаёт пустой по формату, rev 0). */
  const load = async (e: Entry) => {
    const { value, rev, savedAt } = await call<Remote>(`${API}?key=${encodeURIComponent(e.store.key)}`);
    if (e.loaded) return;
    noteSaved(savedAt);
    apply(e, value, rev);
  };

  try {
    await Promise.race([
      Promise.all([...entries.values()].map(load)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Сервер долго не отвечает")), 8000)),
    ]);
    if (!showSticky()) setState("synced");
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
        if (e.timer || e.invalid) noteReplaced();
        apply(e, fresh.value, fresh.rev);
        noteSaved(fresh.savedAt);
      }
      if ((info.state === "error" || info.state === "connecting") && !showSticky()) setState("synced");
    } catch (err) {
      if (!(err instanceof NoServer)) setState("error", err instanceof Error ? err.message : String(err));
    }
  };
  setInterval(() => void poll(), POLL_EVERY);
  document.addEventListener("visibilitychange", () => void poll());
}
