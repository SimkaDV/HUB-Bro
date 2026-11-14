import { newId } from "@/shared/lib/id";
import { createStore } from "@/shared/lib/store";
import { ordersStore } from "@/shared/orders";
import { stockStore } from "@/shared/stock";
import { syncReserves } from "./reserve";
import type { BatchIssue, PrintBatch } from "./types";

// Партии печати и сверка со складом. Пока нет бэкенда — в браузере (localStorage).

const STORAGE_KEY = "hubbro.batches.v1";

export const batchesStore = createStore<PrintBatch[]>(STORAGE_KEY, () => [], (saved) => saved as PrintBatch[]);

export const useBatches = batchesStore.use;

let syncing = false;

/** Сверяет заказы со складом: резервы, снятие резервов, пометки проблем. Повторный вызов ничего не меняет. */
function sync() {
  if (syncing) return;
  syncing = true;
  try {
    const result = syncReserves(ordersStore.get(), stockStore.get().models);
    if (result) {
      stockStore.set((s) => (s.models === result.models ? s : { ...s, models: result.models }));
      ordersStore.set(() => result.orders);
    }
  } finally {
    syncing = false;
  }
}

/** Запускается один раз при старте: сверка сразу и после каждого изменения заказов или склада. */
export function startReserveSync() {
  sync();
  ordersStore.subscribe(sync);
  stockStore.subscribe(sync);
}

/** Комплектация: отправить заказы на пульт одной партией. */
export function createBatch(orderIds: string[], note: string) {
  if (orderIds.length === 0) return;
  batchesStore.set((list) => [
    {
      id: newId(),
      number: list.reduce((max, b) => Math.max(max, b.number), 0) + 1,
      createdAt: new Date().toISOString(),
      orderIds,
      note,
      issues: [],
    },
    ...list,
  ]);
}

const patchBatch = (id: string, patch: Partial<PrintBatch>) =>
  batchesStore.set((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));

/** Пульт: партия напечатана. Пока без принтера — просто отметка. */
export const markPrinted = (id: string) => patchBatch(id, { printedAt: new Date().toISOString() });

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
