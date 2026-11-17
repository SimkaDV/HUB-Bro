// «Очистить все данные»: кабинет как при первом запуске. Описание — docs/SETTINGS.md, «Данные».
import { connectionsStore } from "@/shared/connections";
import { batchesStore, serviceOrderStore } from "@/shared/fulfillment";
import { flushServerSync } from "@/shared/lib/sync";
import { listingsStore } from "@/shared/listings";
import { ordersStore } from "@/shared/orders";
import { forgetPrinter, printerStore } from "@/shared/printer";
import { stockStore } from "@/shared/stock";

/** Ключ доступа к серверу — не данные: без него кабинет просто спросит его снова. */
const KEEP = new Set(["hubbro.access.v1"]);

/**
 * Сбрасывает всё: склад, заказы, партии, объявления, порядок служб (и на сервере — у всех), ключи Авито и
 * Telegram, принтер, выбор «Что печатать». Потом перезагружает страницу. Сервер не принял — бросает ошибку,
 * браузер при этом не трогаем дальше.
 */
export async function clearAllData() {
  // Заказы первыми: сверка не должна успеть зарезервировать под них джинсы со старого склада.
  for (const store of [ordersStore, batchesStore, listingsStore, stockStore, serviceOrderStore]) store.reset();
  if (!(await flushServerSync())) throw new Error("Сервер не принял очистку — проверьте связь и попробуйте ещё раз");
  connectionsStore.reset();
  printerStore.reset();
  await forgetPrinter();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("hubbro.") && !KEEP.has(k))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // без localStorage — и так пусто
  }
  window.location.reload();
}
