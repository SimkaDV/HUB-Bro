// Заказы нужны нескольким разделам (заказы, комплектация, пульт, склад), поэтому живут в shared.
// Хранятся в браузере и на сервере данных — файл orders.json (shared/lib/sync.ts); по умолчанию пусто,
// приходят из расширения Авито.
import { createFileStore } from "@/shared/lib/store";
import type { Order } from "./types";

export {
  chatUrl,
  formatDispatch,
  formatOrderId,
  formatShipBy,
  GROUPS,
  PROBLEM_LABEL,
  SERVICE_LABEL,
  SERVICES,
  STATUS_META,
  type OrderGroup,
} from "./statuses";
export { AVITO_SERVICE, AVITO_STATUS, applyAvitoStatus, avitoService, type AvitoStatusEffect } from "./avito";
export { mergeAvitoBatch, parseAvitoBatch, parseShipBy, type AvitoBatch, type AvitoOrder, type ImportReport } from "./avitoImport";
export type { DeliveryService, Order, OrderProblem, OrderStatus, StatusChange } from "./types";

export const ordersStore = createFileStore<Order[]>("orders", 1, () => [], {
  read: (r) => (Array.isArray(r.orders) ? (r.orders as Order[]) : []),
  write: (orders) => ({ orders }),
});

export const useOrders = ordersStore.use;

/**
 * Размер руками, пока нет бота Гришки (ORDERS.md, раздел 6). Только у «Заказан»; заказ в партии на пульте
 * не трогаем — это проверяет экран. Резерв (и снятие старого) дальше делает сверка.
 */
export function setOrderSize(id: string, size: string, product?: { id: string; name: string }) {
  ordersStore.set((orders) =>
    orders.map((o) =>
      o.id === id && o.status === "ordered" && o.size !== size
        ? {
            ...o,
            size,
            manualSize: o.manualSize ?? { original: o.size },
            // Размер выбрали из размеров товара — связь с ним по id (FORMAT.md, Order.productId).
            ...(product ? { productId: product.id, product: product.name } : {}),
          }
        : o,
    ),
  );
}

/** Вернуть размер, который был до первой ручной правки; не было — заказ снова без размера. */
export function resetOrderSize(id: string) {
  ordersStore.set((orders) =>
    orders.map((o) => {
      if (o.id !== id || o.status !== "ordered" || !o.manualSize) return o;
      const { manualSize, size: _, ...rest } = o;
      return manualSize.original ? { ...rest, size: manualSize.original } : rest;
    }),
  );
}
