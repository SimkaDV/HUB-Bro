// Заказы нужны нескольким разделам (заказы, комплектация, пульт, склад), поэтому живут в shared.
// Пока — тестовые данные в браузере (localStorage): комплектация ставит пометки, пульт — «Собран».
// Потом здесь будут запросы к API.
import { createStore } from "@/shared/lib/store";
import { MOCK_ORDERS } from "./mockOrders";
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
export { AVITO_SERVICE, AVITO_STATUS, applyAvitoStatus, type AvitoStatusEffect } from "./avito";
export type { DeliveryService, Order, OrderProblem, OrderStatus, StatusChange } from "./types";

const STORAGE_KEY = "hubbro.orders.v2";

export const ordersStore = createStore<Order[]>(STORAGE_KEY, () => MOCK_ORDERS, (saved) => saved as Order[]);

export const useOrders = ordersStore.use;

/**
 * Размер руками, пока нет бота Гришки (ORDERS.md, раздел 6). Только у «Заказан»; заказ в партии на пульте
 * не трогаем — это проверяет экран. Резерв (и снятие старого) дальше делает сверка.
 */
export function setOrderSize(id: string, size: string) {
  ordersStore.set((orders) =>
    orders.map((o) =>
      o.id === id && o.status === "ordered" && o.size !== size ? { ...o, size, manualSize: o.manualSize ?? { original: o.size } } : o,
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
