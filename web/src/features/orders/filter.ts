import type { Order } from "@/shared/orders";

export type Period = "today" | "week" | "month" | "all" | "custom";

export const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "week", label: "7 дней" },
  { id: "month", label: "30 дней" },
  { id: "all", label: "Всё время" },
  { id: "custom", label: "Период…" },
];

/** Свой период, YYYY-MM-DD включительно. Пустая граница — без ограничения. */
export type DateRange = { from: string; to: string };

/** Локальная дата YYYY-MM-DD: сравниваем дни, а не моменты времени. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
}

export function inPeriod(order: Order, period: Period, range: DateRange): boolean {
  const day = dayKey(order.createdAt);
  switch (period) {
    case "today":
      return day === daysAgoKey(0);
    case "week":
      return day >= daysAgoKey(6);
    case "month":
      return day >= daysAgoKey(29);
    case "all":
      return true;
    case "custom":
      return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  }
}

/** Цифры — ищем по номеру Авито, иначе по товару и названию объявления. */
export function matchesQuery(order: Order, query: string): boolean {
  const digits = query.replace(/\D/g, "");
  if (digits) return order.id.includes(digits);
  const q = query.trim().toLowerCase();
  return order.product.toLowerCase().includes(q) || Boolean(order.itemTitle?.toLowerCase().includes(q));
}

export type DayGroup = { key: string; title: string; orders: Order[] };

/** Новые сверху, по дням: «Сегодня», «Вчера», «12 ноября». */
export function groupByDay(orders: Order[]): DayGroup[] {
  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups: DayGroup[] = [];
  for (const o of sorted) {
    const key = dayKey(o.createdAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.orders.push(o);
    else groups.push({ key, title: dayTitle(o.createdAt), orders: [o] });
  }
  return groups;
}

function dayTitle(iso: string): string {
  const key = dayKey(iso);
  if (key === daysAgoKey(0)) return "Сегодня";
  if (key === daysAgoKey(1)) return "Вчера";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: sameYear ? undefined : "numeric" });
}

/** 4812339102 → «4 812 339 102». */
export function formatOrderId(id: string): string {
  return id.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}, ${formatTime(iso)}`;
}
