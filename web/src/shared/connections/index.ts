// Ключи внешних сервисов: Авито и Telegram-бот. Вносятся в «Настройках», читаются и другими разделами
// (объявления и позже заказы ходят в Авито). Описание — docs/SETTINGS.md.
// Значения лежат только в браузере (localStorage), на сервер не уходят. v2 — чистый старт: старые ключи не берём.
import { createStore } from "@/shared/lib/store";

export type ConnectionId = "avito" | "telegram";

export type ConnectionValues = Record<string, string>;

export type SavedConnection = {
  values: ConnectionValues;
  savedAt?: string;
};

type ConnectionsState = Record<ConnectionId, SavedConnection>;

const STORAGE_KEY = "hubbro.connections.v2";

const empty = (): ConnectionsState => ({ avito: { values: {} }, telegram: { values: {} } });

export const connectionsStore = createStore<ConnectionsState>(STORAGE_KEY, empty);

export const useConnections = connectionsStore.use;
