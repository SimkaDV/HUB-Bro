// Чистый старт (18.11.2026): ключи хранилищ подняли, старые версии — тестовые и прежние данные — больше не читаем.
// Чтобы они не лежали в браузере мусором, при запуске удаляем их. Ключ доступа к серверу не трогаем.
const OLD_KEYS = [
  "hubbro.orders.v1",
  "hubbro.orders.v2",
  "hubbro.stock.v1",
  "hubbro.stock.v2",
  "hubbro.stock.v3",
  "hubbro.stock.v4",
  "hubbro.batches.v1",
  "hubbro.listings.v1",
  "hubbro.picking.services.v1",
  "hubbro.picking.queue.v1",
  "hubbro.picking.queue.v2",
  "hubbro.picking.queue.v3",
  "hubbro.connections.v1",
  "hubbro.printer.v1",
  "hubbro.printer.v2",
  "hubbro.printer.device.v1",
];

export function dropOldKeys() {
  try {
    OLD_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // без localStorage — нечего удалять
  }
}
