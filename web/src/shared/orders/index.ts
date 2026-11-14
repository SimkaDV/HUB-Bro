// Заказы нужны нескольким разделам (заказы, комплектация, пульт, склад), поэтому живут в shared.
// Пока — тестовые данные в браузере (localStorage): комплектация ставит пометки, пульт — «Собран».
// Потом здесь будут запросы к API.
import { createStore } from "@/shared/lib/store";
import { MOCK_ORDERS } from "./mockOrders";
import type { Order } from "./types";

export { formatOrderId, GROUPS, PROBLEM_LABEL, SERVICE_LABEL, SERVICES, STATUS_META, type OrderGroup } from "./statuses";
export type { DeliveryService, Order, OrderProblem, OrderStatus, StatusChange } from "./types";

const STORAGE_KEY = "hubbro.orders.v1";

export const ordersStore = createStore<Order[]>(STORAGE_KEY, () => MOCK_ORDERS, (saved) => saved as Order[]);

export const useOrders = ordersStore.use;
