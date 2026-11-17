import { orderStage, type PrintBatch } from "@/shared/fulfillment";
import { SERVICE_LABEL, type DeliveryService, type Order } from "@/shared/orders";
import type { Category, Model } from "@/shared/stock";

// Очередь печати: какие заказы в ней, как отсортировать, сгруппировать и отфильтровать.
// Описание — docs/PICKING.md, раздел 6.

export type QueueConfig = {
  /** Фильтры. Пусто — все. */
  models: string[];
  sizes: string[];
  services: DeliveryService[];
};

export const DEFAULT_CONFIG: QueueConfig = { models: [], sizes: [], services: [] };

/** Порядок очереди один и всегда тот же: подошёл к полке товара, расклеил размер по стопкам служб, дальше. */
export const QUEUE_ORDER = "Категория → Товар → Размер → Служба";

type RankKey = "category" | "model" | "size" | "service";

export type QueueItem = {
  order: Order;
  category: string;
  /** Позиции для сортировки: порядок категорий, моделей и размеров — как на складе. */
  rank: Record<RankKey, number>;
};

const rankOf = (index: number) => (index < 0 ? Infinity : index);

/** Заказы в очереди к печати: «Заказан», без проблем, не в партии на пульте. */
export function buildQueue(
  orders: Order[],
  batches: PrintBatch[],
  models: Model[],
  categories: Category[],
  serviceOrder: DeliveryService[],
): QueueItem[] {
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
          size: model ? rankOf(model.sizes.findIndex((s) => s.size === order.size)) : Infinity,
          service: rankOf(serviceOrder.indexOf(order.service)),
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

/** Сравнение без NaN: Infinity − Infinity даёт NaN, а сортировке нужен 0. */
const cmp = (a: number, b: number) => (a === b ? 0 : a - b);

/**
 * Категория → товар → размер → служба (порядок склада и настройки служб). Внутри группы — срочные первыми:
 * по сроку отгрузки, без срока — в конце; при равенстве — кто раньше заказал.
 */
export function sortQueue(items: QueueItem[]) {
  return [...items].sort(
    (a, b) =>
      cmp(a.rank.category, b.rank.category) ||
      cmp(a.rank.model, b.rank.model) ||
      a.order.product.localeCompare(b.order.product) ||
      cmp(a.rank.size, b.rank.size) ||
      (a.order.size ?? "").localeCompare(b.order.size ?? "") ||
      cmp(a.rank.service, b.rank.service) ||
      compareShipBy(a.order.shipBy, b.order.shipBy) ||
      a.order.createdAt.localeCompare(b.order.createdAt),
  );
}

function compareShipBy(a?: string, b?: string) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

/** Срок отгрузки прошёл: YYYY-MM-DD раньше сегодняшнего местного дня. */
export function isOverdue(shipBy: string | undefined, now = new Date()) {
  if (!shipBy) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return shipBy < today;
}

export type QueueGroup = { key: string; title: string; items: QueueItem[] };

/** Группа — товар · размер · служба: одна стопка на расклейке. */
export function groupQueue(sorted: QueueItem[]): QueueGroup[] {
  const groups: QueueGroup[] = [];
  for (const item of sorted) {
    const parts = [item.order.product, item.order.size ?? "", SERVICE_LABEL[item.order.service]];
    const key = parts.join("|");
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, title: parts.filter(Boolean).join(" · "), items: [item] });
  }
  return groups;
}

/** Подпись партии: порядок и фильтры, если были. */
export function describeConfig(c: QueueConfig) {
  const filters = [...c.models, ...c.sizes, ...c.services.map((s) => SERVICE_LABEL[s])];
  return filters.length ? `${QUEUE_ORDER} · только ${filters.join(", ")}` : QUEUE_ORDER;
}

export function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return counts;
}
