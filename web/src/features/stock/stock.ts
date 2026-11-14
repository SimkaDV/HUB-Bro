import type { StatusTone } from "@/shared/ui";
import type { Model, SizeStock, SizeSummary, StockLevel, Thresholds, UnitStatus } from "./types";

// Пороги по умолчанию: ≤ 5 мало, 6–10 норм, больше — много. Настраиваются у категории и модели.
export const DEFAULT_THRESHOLDS: Thresholds = { lowMax: 5, midMax: 10 };

export function stockLevel(qty: number, t: Thresholds = DEFAULT_THRESHOLDS): StockLevel {
  if (qty === 0) return "zero";
  if (qty <= t.lowMax) return "low";
  if (qty <= t.midMax) return "mid";
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
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.qty - b.qty || compareSizes(a.size, b.size);
}

/** Размеры, которые показываем: без скрытых, в порядке модели. */
export const visibleSizes = (model: Model) => model.sizes.filter((s) => !model.hiddenSizes?.includes(s.size));

export function summarize(s: SizeStock, t: Thresholds): SizeSummary {
  const qty = onHand(s);
  return { size: s.size, qty, incoming: incoming(s), level: stockLevel(qty, t) };
}

/** Видимые размеры модели, сначала те, что требуют внимания. */
export function sizesByAttention(model: Model, t: Thresholds): SizeSummary[] {
  return visibleSizes(model)
    .map((s) => summarize(s, t))
    .sort(compareAttention);
}

/** Сверху модели, где больше всего горит. Пороги у каждой модели свои. */
export function modelsByAttention(models: Model[], thresholdsFor: (m: Model) => Thresholds): Model[] {
  const burning = (sizes: SizeSummary[]) => sizes.filter((s) => LEVEL_RANK[s.level] <= 1).length;
  const sizes = new Map(models.map((m) => [m.id, sizesByAttention(m, thresholdsFor(m))]));
  return [...models].sort((a, b) => {
    const as = sizes.get(a.id)!;
    const bs = sizes.get(b.id)!;
    if (!as.length || !bs.length) return bs.length - as.length;
    return compareAttention(as[0], bs[0]) || burning(bs) - burning(as);
  });
}

export const formatRub = (n: number) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
