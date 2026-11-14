// Заказы нужны нескольким разделам (заказы, комплектация, склад), поэтому живут в shared.
// Пока — тестовые данные в памяти; потом здесь будут запросы к API.
import { MOCK_ORDERS } from "./mockOrders";
import type { Order } from "./types";

export { GROUPS, PROBLEM_LABEL, STATUS_META, type OrderGroup } from "./statuses";
export type { Order, OrderProblem, OrderStatus, StatusChange } from "./types";

export function useOrders(): Order[] {
  return MOCK_ORDERS;
}
