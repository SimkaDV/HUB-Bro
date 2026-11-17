import { newId } from "@/shared/lib/id";
import { createStore } from "@/shared/lib/store";
import { listingsStore } from "@/shared/listings";
import { ordersStore } from "@/shared/orders";
import { stockStore } from "@/shared/stock";
import { syncProducts } from "./products";
import { syncReserves } from "./reserve";
import type { BatchIssue, PrintBatch } from "./types";

// Партии печати и сверка со складом. Пока нет бэкенда — в браузере (localStorage).

const STORAGE_KEY = "hubbro.batches.v1";

export const batchesStore = createStore<PrintBatch[]>(STORAGE_KEY, () => [], (saved) => saved as PrintBatch[]);

export const useBatches = batchesStore.use;

let syncing = false;

/**
 * Сверяет заказы со складом: сначала товар по привязке объявления, потом резервы, снятие резервов, пометки проблем.
 * Повторный вызов ничего не меняет.
 */
function sync() {
  if (syncing) return;
  syncing = true;
  try {
    const models = stockStore.get().models;
    const withProducts = syncProducts(ordersStore.get(), listingsStore.get().listings, models);
    const orders = withProducts ?? ordersStore.get();
    const result = syncReserves(orders, models);
    if (result) stockStore.set((s) => (s.models === result.models ? s : { ...s, models: result.models }));
    if (result || withProducts) ordersStore.set(() => result?.orders ?? orders);
  } finally {
    syncing = false;
  }
}

/** Запускается один раз при старте: сверка сразу и после каждого изменения заказов, склада или привязок объявлений. */
export function startReserveSync() {
  sync();
  ordersStore.subscribe(sync);
  stockStore.subscribe(sync);
  listingsStore.subscribe(sync);
}

/** Комплектация или быстрая печать на пульте: отправить заказы на пульт одной партией. Возвращает номер. */
export function createBatch(orderIds: string[], note: string): number | undefined {
  if (orderIds.length === 0) return;
  const number = batchesStore.get().reduce((max, b) => Math.max(max, b.number), 0) + 1;
  batchesStore.set((list) => [
    {
      id: newId(),
      number,
      createdAt: new Date().toISOString(),
      orderIds,
      note,
      issues: [],
    },
    ...list,
  ]);
  return number;
}

const patchBatch = (id: string, patch: Partial<PrintBatch>) =>
  batchesStore.set((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));

/** Пульт: принтер принял бирки партии. Вызывать только после успешной отправки. */
export const markPrinted = (id: string) => patchBatch(id, { printedAt: new Date().toISOString() });

/** Пульт: перепечатали всю партию или одну бирку — запись в историю партии. `printedAt` не меняется. */
export function markReprinted(id: string, orderId?: string) {
  batchesStore.set((list) =>
    list.map((b) =>
      b.id === id ? { ...b, reprints: [...(b.reprints ?? []), { at: new Date().toISOString(), ...(orderId ? { orderId } : {}) }] } : b,
    ),
  );
}

/** Пульт: вернуть нерасклеенную партию в очередь. Запись остаётся. */
export const cancelBatch = (id: string) => patchBatch(id, { cancelledAt: new Date().toISOString() });

/**
 * Пульт: «Партия расклеена». Заказы без ошибок становятся «Собран» (правило 9: только с резервом),
 * заказы с ошибкой остаются «Заказан» и возвращаются в очередь.
 */
export function markStuck(id: string, issues: BatchIssue[]) {
  const batch = batchesStore.get().find((b) => b.id === id);
  if (!batch || batch.stuckAt || batch.cancelledAt) return;
  const at = new Date().toISOString();
  const failed = new Set(issues.map((i) => i.orderId));
  const models = stockStore.get().models;
  const reserved = (orderId: string) =>
    models.some((m) => m.sizes.some((s) => s.units.some((u) => u.order === orderId && u.status === "reserve")));

  ordersStore.set((orders) =>
    orders.map((o) =>
      batch.orderIds.includes(o.id) && !failed.has(o.id) && o.status === "ordered" && !o.problem && reserved(o.id)
        ? { ...o, status: "packed", history: [...o.history, { status: "packed", at }] }
        : o,
    ),
  );
  patchBatch(id, { stuckAt: at, printedAt: batch.printedAt ?? at, issues });
}

/**
 * Убирает тестовые заказы (те, что не пришли из Авито — без `syncedAt`) перед первыми живыми: их резервы
 * возвращаются на полку своих поставок, тестовые партии печати удаляются.
 */
export function removeTestOrders() {
  const test = new Set(ordersStore.get().filter((o) => !o.syncedAt).map((o) => o.id));
  if (test.size === 0) return;
  // Сначала заказы: иначе сверка успеет снова зарезервировать под них снятые джинсы.
  ordersStore.set((orders) => orders.filter((o) => !test.has(o.id)));
  stockStore.set((s) => {
    const models = structuredClone(s.models);
    for (const size of models.flatMap((m) => m.sizes)) {
      for (const unit of size.units.filter((u) => test.has(u.order) && u.status === "reserve")) {
        const row = size.stock.find((x) => x.batchId === unit.batchId);
        if (row) row.qty += 1;
        else size.stock.push({ batchId: unit.batchId, qty: 1 });
      }
      size.units = size.units.filter((u) => !(test.has(u.order) && u.status === "reserve"));
    }
    return { ...s, models };
  });
  batchesStore.set(() => []);
}
