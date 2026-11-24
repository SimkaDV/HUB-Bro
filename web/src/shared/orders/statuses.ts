import type { StatusTone } from "@/shared/ui";
import type { DeliveryService, Order, OrderProblem, OrderStatus } from "./types";

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
  noModel: "Товар не выбран",
  noSize: "Без размера",
  noStock: "Нет на складе",
};

/** Службы доставки в порядке показа. */
export const SERVICES: { id: DeliveryService; label: string }[] = [
  { id: "cdek", label: "СДЭК" },
  { id: "avito", label: "Авито" },
  { id: "post", label: "Почта" },
  { id: "yandex", label: "Яндекс" },
  { id: "fivepost", label: "5Post" },
  { id: "dpd", label: "DPD" },
];

export const SERVICE_LABEL = Object.fromEntries(SERVICES.map((s) => [s.id, s.label])) as Record<DeliveryService, string>;

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

/** 4812339102 → «4 812 339 102». */
export function formatOrderId(id: string): string {
  return id.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Номер отправления группами, как в кабинете Авито: «805 122 273 33459», «513 347 6411». */
export function formatDispatch(n: string): string {
  const parts: string[] = [];
  let rest = n;
  while (rest.length > 5) {
    parts.push(rest.slice(0, 3));
    rest = rest.slice(3);
  }
  return [...parts, rest].join(" ");
}

/** «2026-11-19» → «19 ноября». */
export function formatShipBy(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

/** Ссылка на чат с покупателем в кабинете Авито. */
export function chatUrl(chatId: string): string {
  return `https://www.avito.ru/profile/messenger/channel/${chatId}`;
}
