import type { StatusTone } from "@/shared/ui";
import type { Model, SizeStock, SizeSummary, StockLevel, UnitStatus } from "./types";

// Пороги цвета остатка: ≤ 5 мало, 6–10 норм, больше — много.
export const LOW_MAX = 5;
export const MID_MAX = 10;

export function stockLevel(qty: number): StockLevel {
  if (qty === 0) return "zero";
  if (qty <= LOW_MAX) return "low";
  if (qty <= MID_MAX) return "mid";
  return "ok";
}

const LEVEL_RANK: Record<StockLevel, number> = { zero: 0, low: 1, mid: 2, ok: 3 };

export const UNIT_STATUS: Record<UnitStatus, { label: string; tone: StatusTone; hint?: string }> = {
  reserve: { label: "В резерве", tone: "warning" },
  returnStock: { label: "Возврат на складе", tone: "danger", hint: "нужно разобрать" },
  sent: { label: "Отправлена", tone: "warning" },
  delivered: { label: "Доставлена", tone: "success", hint: "лежит в ПВЗ" },
  returnTransit: { label: "Возврат едет", tone: "warning", hint: "едет обратно" },
};

/** Видны сразу, остальное — под «Показать всё». */
export const VISIBLE_STATUSES: UnitStatus[] = ["reserve", "returnStock"];
export const HIDDEN_STATUSES: UnitStatus[] = ["sent", "delivered", "returnTransit"];

export const onHand = (s: SizeStock) => s.stock.reduce((sum, b) => sum + b.qty, 0);
export const incoming = (s: SizeStock) => s.units.filter((u) => u.status === "returnTransit").length;

const LETTERS = ["XS", "S", "M", "L", "XL", "XXL"];

function sizeKey(size: string): [number, number] {
  const m = size.match(/^(\d+)?([A-Z]+)?$/);
  return [m?.[1] ? Number(m[1]) : 0, LETTERS.indexOf(m?.[2] ?? "")];
}

/** Порядок размеров: 30S, 30M, 31S… и S, M, L, XL. */
export function compareSizes(a: string, b: string) {
  const [an, al] = sizeKey(a);
  const [bn, bl] = sizeKey(b);
  return an - bn || al - bl;
}

function compareAttention(a: SizeSummary, b: SizeSummary) {
  return (
    LEVEL_RANK[stockLevel(a.qty)] - LEVEL_RANK[stockLevel(b.qty)] ||
    a.qty - b.qty ||
    compareSizes(a.size, b.size)
  );
}

/** Размеры модели, сначала те, что требуют внимания. */
export function sizesByAttention(model: Model): SizeSummary[] {
  return model.sizes
    .map((s) => ({ size: s.size, qty: onHand(s), incoming: incoming(s) }))
    .sort(compareAttention);
}

/** Сверху модели, где больше всего горит. */
export function modelsByAttention(models: Model[]): Model[] {
  const burning = (sizes: SizeSummary[]) => sizes.filter((s) => LEVEL_RANK[stockLevel(s.qty)] <= 1).length;
  return [...models].sort((a, b) => {
    const as = sizesByAttention(a);
    const bs = sizesByAttention(b);
    return compareAttention(as[0], bs[0]) || burning(bs) - burning(as);
  });
}

export const formatRub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
