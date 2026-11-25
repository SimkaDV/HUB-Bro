import { newId } from "@/shared/lib/id";
import { createFileStore } from "@/shared/lib/store";
import { listingsStore } from "@/shared/listings";
import { ordersStore } from "@/shared/orders";
import { stockStore } from "@/shared/stock";
import { syncProducts } from "./products";
import { syncReserves } from "./reserve";
import type { BatchIssue, PrintBatch } from "./types";

// Партии печати и сверка со складом. Партии хранятся в браузере и на сервере данных — файл printBatches.json
// (shared/lib/sync.ts, формат — avito/data/schema/FORMAT.md).

export const batchesStore = createFileStore<PrintBatch[]>("printBatches", 1, () => [], {
  read: (r) => (Array.isArray(r.batches) ? (r.batches as PrintBatch[]) : []),
  write: (batches) => ({ batches }),
});

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
