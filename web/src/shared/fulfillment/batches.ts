import type { StatusTone } from "@/shared/ui";
import type { Order } from "@/shared/orders";
import type { BatchState, IssueReason, PrintBatch, Stage } from "./types";

// Партии и этапы — чистые функции. Описание — docs/ORDERS.md, «Комплектация и пульт».

export function batchState(b: PrintBatch): BatchState {
  if (b.cancelledAt) return "cancelled";
  if (b.stuckAt) return "stuck";
  if (b.printedAt) return "printed";
  return "queued";
}

export const BATCH_STATE: Record<BatchState, { label: string; tone: StatusTone }> = {
  queued: { label: "Ждёт печати", tone: "warning" },
  printed: { label: "Напечатана", tone: "warning" },
  stuck: { label: "Расклеена", tone: "success" },
  cancelled: { label: "Возвращена в очередь", tone: "neutral" },
};

export const ISSUE_REASONS: { id: IssueReason; label: string }[] = [
  { id: "notPrinted", label: "Бирка не напечаталась" },
  { id: "badCode", label: "Штрихкод не читается" },
  { id: "damaged", label: "Бирка испорчена" },
  { id: "other", label: "Другое" },
];

export const ISSUE_LABEL = Object.fromEntries(ISSUE_REASONS.map((r) => [r.id, r.label])) as Record<IssueReason, string>;

/** Партия ещё на пульте: ждёт печати или расклейки. Её заказы не показываются в очереди. */
export const isActive = (b: PrintBatch) => !b.cancelledAt && !b.stuckAt;

/** Этап заказа в комплектации. null — заказ уже не наш (отправлен, отменён и дальше). */
export function orderStage(o: Order, batches: PrintBatch[]): Stage | null {
  if (o.status === "packed") return "packed";
  if (o.status !== "ordered") return null;
  if (o.problem) return "problem";
  const batch = batches.find((b) => isActive(b) && b.orderIds.includes(o.id));
  if (!batch) return "queue";
  return batch.printedAt ? "printed" : "inBatch";
}

export const STAGE_META: Record<Stage, { label: string; tone: StatusTone }> = {
  problem: { label: "Проблема", tone: "danger" },
  queue: { label: "К печати", tone: "warning" },
  inBatch: { label: "В партии", tone: "warning" },
  printed: { label: "Напечатан", tone: "warning" },
  packed: { label: "Собран", tone: "success" },
};

/** Тот же местный день, что и сегодня. */
export function isToday(iso: string | undefined, now = new Date()) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
