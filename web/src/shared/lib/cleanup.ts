// Старые версии хранилищ больше не читаем. Чтобы они не лежали в браузере мусором, при запуске удаляем их.
// 25.11.2026: данные переехали в файлы сервера данных avito (catalog, stock, …) — в браузере они лежат под
// hubbro.data.<файл>, поэтому все старые hubbro.<что-то>.vN удаляются. Остаются ключ доступа к серверу,
// настройки принтера, подключения (ключи Авито/Telegram) и выбор «Что печатать» — они свои у каждого браузера.
const KEEP = new Set([
  "hubbro.access.v1",
  "hubbro.printer.v3",
  "hubbro.printer.device.v2",
  "hubbro.connections.v2",
  "hubbro.picking.queue.v4",
]);

const OLD = /^hubbro\.[a-z.-]+\.v\d+$/i;

export function dropOldKeys() {
  try {
    Object.keys(localStorage)
      .filter((k) => OLD.test(k) && !KEEP.has(k))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // без localStorage — нечего удалять
  }
}
