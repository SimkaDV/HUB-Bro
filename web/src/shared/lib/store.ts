import { useSyncExternalStore } from "react";

// Общее состояние в браузере: одно на всё приложение, переживает обновление страницы (localStorage).
// createStore — просто состояние браузера (ключи Авито, принтер). createFileStore — файл сервера данных avito
// (catalog, stock, orders, … — формат avito/data/schema/FORMAT.md), его синхронизирует shared/lib/sync.ts.

export type Store<T> = {
  /** Ключ в localStorage (у файлового хранилища — имя файла на сервере данных: catalog, stock, …). */
  key: string;
  /** Подставить данные с сервера: через ту же миграцию, что и при загрузке. */
  hydrate: (raw: unknown) => void;
  get: () => T;
  set: (update: (state: T) => T) => void;
  subscribe: (listener: () => void) => () => void;
  use: () => T;
  /** Вернуть к значению по умолчанию (пусто). */
  reset: () => void;
};

export function createStore<T>(
  key: string,
  init: () => T,
  migrate: (saved: Partial<T>) => T = (s) => ({ ...init(), ...s }),
  /** Что класть в localStorage. По умолчанию — само состояние. */
  toSaved: (state: T) => unknown = (s) => s,
): Store<T> {
  let state = load();
  const listeners = new Set<() => void>();

  function load(): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return migrate(JSON.parse(raw) as Partial<T>);
      }
    } catch {
      // Повреждённые данные — начинаем с пустого.
    }
    return init();
  }

  function set(update: (s: T) => T) {
    const next = update(state);
    if (next === state) return;
    state = next;
    try {
      localStorage.setItem(key, JSON.stringify(toSaved(state)));
    } catch {
      // Хранилище недоступно — работаем без сохранения.
    }
    listeners.forEach((l) => l());
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const get = () => state;

  return {
    key,
    hydrate: (raw) => set(() => migrate(raw as Partial<T>)),
    get,
    set,
    subscribe,
    use: () => useSyncExternalStore(subscribe, get),
    reset: () => set(init),
  };
}

/** Файл сервера данных: формат и версия не те — читать нельзя (FORMAT.md, правило 1). */
export class FormatError extends Error {}

/** Хранилище одного файла сервера данных avito. Описание — docs/ARCHITECTURE.md, «Данные». */
export type FileStore<T> = Store<T> & {
  /** Значение файла для сервера: формат, версия и неизвестные кабинету поля — как пришли (FORMAT.md, правило 7). */
  serialize: () => Record<string, unknown>;
};

export const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Файл сервера данных: в памяти — удобное кабинету состояние `T`, на сервере и в localStorage — файл формата v1.
 * `read` достаёт `T` из файла (недостающее — по умолчанию), `write` кладёт `T` обратно поверх файла: поля, которых
 * кабинет не знает, переносятся как есть. hydrate бросает FormatError, если формат или версия не те.
 */
export function createFileStore<T>(
  file: string,
  version: number,
  init: () => T,
  codec: {
    read: (raw: Record<string, unknown>) => T;
    /** Поля кабинета поверх файла; `file` — файл, как пришёл (только для чтения). */
    write: (state: T, file: Record<string, unknown>) => Record<string, unknown>;
  },
): FileStore<T> {
  /** Последний файл, как пришёл: из него берутся поля, которых кабинет не знает. */
  let extra: Record<string, unknown> = {};

  const check = (raw: unknown): Record<string, unknown> => {
    if (!isObj(raw) || raw.format !== file || raw.version !== version) {
      const v = isObj(raw) ? `${String(raw.format)} v${String(raw.version)}` : "не объект";
      throw new FormatError(`файл «${file}» в неизвестном формате (${v}), кабинет понимает только ${file} v${version}`);
    }
    return raw;
  };

  const serialize = (s: T) => ({ ...extra, ...codec.write(s, extra), format: file, version });

  // В localStorage лежит файл целиком (с чужими полями) под ключом hubbro.data.<файл>.
  const inner = createStore<T>(
    `hubbro.data.${file}`,
    init,
    (saved) => {
      // Чужой формат в браузере — начинаем с пустого, сервер пришлёт своё.
      try {
        const raw = check(saved);
        extra = raw;
        return codec.read(raw);
      } catch {
        return init();
      }
    },
    serialize,
  );

  return {
    ...inner,
    key: file,
    hydrate: (raw) => {
      const checked = check(raw);
      extra = checked;
      const next = codec.read(checked);
      inner.set(() => next);
    },
    reset: () => {
      extra = {};
      inner.reset();
    },
    serialize: () => serialize(inner.get()),
  };
}
