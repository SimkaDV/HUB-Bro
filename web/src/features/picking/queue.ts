import { orderStage, type PrintBatch } from "@/shared/fulfillment";
import { SERVICE_LABEL, SERVICES, type DeliveryService, type Order } from "@/shared/orders";
import type { Category, Model } from "@/shared/stock";

// Очередь печати: какие заказы в ней, как отсортировать, сгруппировать и отфильтровать.
// Описание — docs/ORDERS.md, «Комплектация и пульт».

export type SortKey = "category" | "model" | "size" | "service";

/** Уровень сортировки: порядок уровней = порядок сортировки, выключенный не участвует. */
export type SortLevel = { key: SortKey; on: boolean };

export type QueueConfig = {
  levels: SortLevel[];
  /** Фильтры. Пусто — все. */
  models: string[];
  sizes: string[];
  services: DeliveryService[];
};

export const SORT_LABEL: Record<SortKey, string> = {
  category: "Категория",
  model: "Модель",
  size: "Размер",
  service: "Служба доставки",
};

const levels = (on: SortKey[]): SortLevel[] => [
  ...on.map((key) => ({ key, on: true })),
  ...(["category", "model", "size", "service"] as SortKey[]).filter((k) => !on.includes(k)).map((key) => ({ key, on: false })),
];

export const PRESETS: { id: string; label: string; levels: SortLevel[] }[] = [
  { id: "sizes", label: "По размерам", levels: levels(["category", "model", "size"]) },
  { id: "pack", label: "Под упаковку по службам", levels: levels(["service", "category", "model", "size"]) },
  { id: "models", label: "По моделям", levels: levels(["category", "model"]) },
];

export const DEFAULT_CONFIG: QueueConfig = { levels: PRESETS[0].levels, models: [], sizes: [], services: [] };

export type QueueItem = {
  order: Order;
  category: string;
  /** Позиции для сортировки: порядок категорий, моделей и размеров — как на складе. */
  rank: Record<SortKey, number>;
};

/** Заказы в очереди к печати: «Заказан», без проблем, не в партии на пульте. */
export function buildQueue(orders: Order[], batches: PrintBatch[], models: Model[], categories: Category[]): QueueItem[] {
  return orders
    .filter((o) => orderStage(o, batches) === "queue")
    .map((order) => {
      const modelIndex = models.findIndex((m) => m.name === order.product);
      const model = models[modelIndex];
      const category = model?.category ?? "Без категории";
      const categoryIndex = categories.findIndex((c) => c.name === category);
      return {
        order,
        category,
        rank: {
          category: categoryIndex < 0 ? Infinity : categoryIndex,
          model: modelIndex < 0 ? Infinity : modelIndex,
          size: model ? model.sizes.findIndex((s) => s.size === order.size) : Infinity,
          service: SERVICES.findIndex((s) => s.id === order.service),
        },
      };
    });
}

export function filterQueue(items: QueueItem[], c: QueueConfig) {
  return items.filter(
    (i) =>
      (c.models.length === 0 || c.models.includes(i.order.product)) &&
      (c.sizes.length === 0 || c.sizes.includes(i.order.size ?? "")) &&
      (c.services.length === 0 || c.services.includes(i.order.service)),
  );
}

/** По включённым уровням по очереди, при равенстве — кто раньше заказал. */
export function sortQueue(items: QueueItem[], levels: SortLevel[]) {
  const on = levels.filter((l) => l.on);
  return [...items].sort((a, b) => {
    for (const l of on) {
      const d = a.rank[l.key] - b.rank[l.key];
      if (d) return d;
    }
    return a.order.createdAt.localeCompare(b.order.createdAt);
  });
}

function levelValue(i: QueueItem, key: SortKey) {
  if (key === "category") return i.category;
  if (key === "model") return i.order.product;
  if (key === "size") return i.order.size ?? "";
  return SERVICE_LABEL[i.order.service];
}

export type QueueGroup = { key: string; title: string; items: QueueItem[] };

/** Группы подряд идущих заказов с одинаковыми значениями всех включённых уровней. */
export function groupQueue(sorted: QueueItem[], levels: SortLevel[]): QueueGroup[] {
  const on = levels.filter((l) => l.on).map((l) => l.key);
  // Категория в заголовке лишняя, если рядом есть модель: «Джинсы · Джинсы Клёш» читается хуже.
  const shown = on.includes("model") ? on.filter((k) => k !== "category") : on;
  const groups: QueueGroup[] = [];
  for (const item of sorted) {
    const key = on.map((k) => levelValue(item, k)).join("|");
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, title: shown.map((k) => levelValue(item, k)).join(" · ") || "Все заказы", items: [item] });
  }
  return groups;
}

/** Подпись партии: как собирали очередь. */
export function describeConfig(c: QueueConfig) {
  const order = c.levels.filter((l) => l.on).map((l) => SORT_LABEL[l.key]).join(" → ") || "по времени заказа";
  const filters = [...c.models, ...c.sizes, ...c.services.map((s) => SERVICE_LABEL[s])];
  return filters.length ? `${order} · только ${filters.join(", ")}` : order;
}

export function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return counts;
}
