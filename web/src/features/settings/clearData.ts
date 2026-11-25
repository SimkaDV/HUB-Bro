// «Очистить все данные»: кабинет как при первом запуске. Описание — docs/SETTINGS.md, «Данные».
import { connectionsStore } from "@/shared/connections";
import { batchesStore, DEFAULT_SERVICE_ORDER, serviceOrderStore } from "@/shared/fulfillment";
import { newId } from "@/shared/lib/id";
import { flushServerSync } from "@/shared/lib/sync";
import { listingsStore } from "@/shared/listings";
import { ordersStore } from "@/shared/orders";
import { forgetPrinter, printerStore } from "@/shared/printer";
import { DEFAULT_DISPLAY, hasBotData, hubLogEntry, LOG_LIMIT, stockStore, type Model } from "@/shared/stock";

/** Ключ доступа к серверу — не данные: без него кабинет просто спросит его снова. */
const KEEP = new Set(["hubbro.access.v1"]);

/** Товар с данными бота остаётся в каталоге (бот без него не ответит), но без всего, что вносил кабинет. */
function botOnly(m: Model): Model {
  const { code: _c, archived: _a, hiddenSizes: _h, thresholds: _t, packs: _p, ...rest } = m;
  return { ...rest, batches: [], sizes: m.sizes.map((s) => ({ size: s.size, stock: [], units: [] })) };
}

/**
 * Сбрасывает всё, что ведёт кабинет: склад, заказы, партии, объявления, порядок служб (и на сервере — у всех), ключи
 * Авито и Telegram, принтер, выбор «Что печатать». Каталог общий с ботом: товары с данными бота (описание, сетка,
 * фото) остаются — без полей кабинета, остальные товары и пустые категории удаляются. Общая история остаётся
 * (с записью об очистке), остальные поля магазина (название, наличие, время отправки) — тоже.
 * Потом перезагружает страницу. Сервер не принял — бросает ошибку, браузер при этом не трогаем дальше.
 */
export async function clearAllData() {
  // Заказы первыми: сверка не должна успеть зарезервировать под них джинсы со старого склада.
  for (const store of [ordersStore, batchesStore, listingsStore]) store.reset();
  serviceOrderStore.set(() => DEFAULT_SERVICE_ORDER);
  stockStore.set((s) => {
    const models = s.models.filter(hasBotData).map(botOnly);
    return {
      ...s,
      models,
      categories: s.categories.filter((c) => models.some((m) => m.categoryId === c.id)),
      drafts: [],
      display: DEFAULT_DISPLAY,
      log: [hubLogEntry(newId(), "Кабинет очищен: склад, заказы, партии и объявления удалены"), ...s.log].slice(0, LOG_LIMIT),
    };
  });
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
