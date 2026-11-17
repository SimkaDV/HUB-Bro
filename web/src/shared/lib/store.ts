import { useSyncExternalStore } from "react";

// Общее состояние в браузере: одно на всё приложение, переживает обновление страницы (localStorage).
// Нужно, когда данные меняют несколько разделов: склад, заказы, партии печати.
// Когда появится бэкенд, вместо него будут запросы к API.

export type Store<T> = {
  /** Ключ в localStorage — он же ключ на сервере (shared/lib/sync.ts). */
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

export function createStore<T>(key: string, init: () => T, migrate: (saved: Partial<T>) => T = (s) => ({ ...init(), ...s })): Store<T> {
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
      localStorage.setItem(key, JSON.stringify(state));
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
