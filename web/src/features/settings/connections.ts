// Подключения к внешним сервисам: ключи Авито, Telegram-бот. Описание — docs/SETTINGS.md.
// Пока бэкенда нет, значения лежат в браузере (localStorage). Перед запуском переезжают на сервер.
import { createStore } from "@/shared/lib/store";

export type ConnectionId = "avito" | "telegram";

export type FieldDef = {
  key: string;
  label: string;
  hint: string;
  placeholder?: string;
  /** Секрет: скрыт точками, пока не нажали «Показать». */
  secret?: boolean;
  optional?: boolean;
};

export type ConnectionDef = {
  id: ConnectionId;
  title: string;
  description: string;
  fields: FieldDef[];
};

export const CONNECTIONS: ConnectionDef[] = [
  {
    id: "avito",
    title: "Авито",
    description: "По этим ключам забираем оплаченные сделки и их статусы.",
    fields: [
      {
        key: "clientId",
        label: "Client ID",
        hint: "Авито → Профиль → Для профессионалов → API",
      },
      {
        key: "clientSecret",
        label: "Client secret",
        hint: "Там же, рядом с Client ID",
        secret: true,
      },
      {
        key: "userId",
        label: "Номер профиля",
        hint: "Номер аккаунта продавца, виден в профиле Авито",
        placeholder: "Например, 123456789",
      },
    ],
  },
  {
    id: "telegram",
    title: "Telegram-бот",
    description: "Наш бот: принимает размеры от бота Гришки и передаёт ему команду «спроси размер».",
    fields: [
      {
        key: "botToken",
        label: "Токен нашего бота",
        hint: "Выдаёт @BotFather при создании бота",
        placeholder: "123456:ABC…",
        secret: true,
      },
      {
        key: "sizeBot",
        label: "Бот Гришки",
        hint: "Сообщения от него наш бот принимает как размеры",
        placeholder: "@username или ID",
      },
      {
        key: "chatId",
        label: "Чат обмена",
        hint: "ID группы, где сидят оба бота, — если обмен идёт через группу",
        placeholder: "-100…",
        optional: true,
      },
    ],
  },
];

export type ConnectionValues = Record<string, string>;

export type SavedConnection = {
  values: ConnectionValues;
  savedAt?: string;
};

type ConnectionsState = Record<ConnectionId, SavedConnection>;

const STORAGE_KEY = "hubbro.connections.v1";

const empty = (): ConnectionsState => ({ avito: { values: {} }, telegram: { values: {} } });

export const connectionsStore = createStore<ConnectionsState>(STORAGE_KEY, empty);

export const useConnections = connectionsStore.use;

export function saveConnection(id: ConnectionId, values: ConnectionValues) {
  const trimmed = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  connectionsStore.set((s) => ({ ...s, [id]: { values: trimmed, savedAt: new Date().toISOString() } }));
}

export function clearConnection(id: ConnectionId) {
  connectionsStore.set((s) => ({ ...s, [id]: { values: {} } }));
}

/** Все обязательные поля заполнены. Работает ли ключ на самом деле, без сервера не проверить. */
export function isFilled(def: ConnectionDef, values: ConnectionValues) {
  return def.fields.every((f) => f.optional || values[f.key]?.trim());
}
