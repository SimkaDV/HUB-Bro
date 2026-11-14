import type { StatusTone } from "@/shared/ui";
import type { Order, OrderProblem, OrderStatus } from "./types";

export const STATUS_META: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  ordered: { label: "Заказан", tone: "warning" },
  packed: { label: "Собран", tone: "success" },
  sent: { label: "Отправлен", tone: "warning" },
  inTransit: { label: "В доставке", tone: "warning" },
  arrived: { label: "Приехал", tone: "success" },
  completed: { label: "Завершён", tone: "neutral" },
  cancelled: { label: "Отменён", tone: "neutral" },
  returnTransit: { label: "Возврат", tone: "warning" },
  returnCheck: { label: "Возврат на проверке", tone: "danger" },
  returnStock: { label: "На складе", tone: "success" },
  defect: { label: "Брак", tone: "neutral" },
};

export const PROBLEM_LABEL: Record<OrderProblem, string> = {
  noSize: "Без размера",
  noStock: "Нет на складе",
};

/** Чипы-фильтры над списком: статусы, собранные по этапам. */
export type OrderGroup = "active" | "problems" | "toPack" | "packed" | "onTheWay" | "atPoint" | "returns" | "closed";

const CLOSED: OrderStatus[] = ["completed", "cancelled", "returnStock", "defect"];

export const GROUPS: { id: OrderGroup; label: string; match: (o: Order) => boolean }[] = [
  { id: "active", label: "Активные", match: (o) => !CLOSED.includes(o.status) },
  { id: "problems", label: "Проблемы", match: (o) => o.problem !== undefined },
  { id: "toPack", label: "К сборке", match: (o) => o.status === "ordered" },
  { id: "packed", label: "Собран", match: (o) => o.status === "packed" },
  { id: "onTheWay", label: "В пути", match: (o) => o.status === "sent" || o.status === "inTransit" },
  { id: "atPoint", label: "В ПВЗ", match: (o) => o.status === "arrived" },
  { id: "returns", label: "Возвраты", match: (o) => o.status === "returnTransit" || o.status === "returnCheck" },
  { id: "closed", label: "Закрытые", match: (o) => CLOSED.includes(o.status) },
];
