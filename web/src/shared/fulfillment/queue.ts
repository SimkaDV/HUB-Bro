import { orderStage } from "./batches";
import type { PrintBatch } from "./types";
import { SERVICE_LABEL, type DeliveryService, type Order } from "@/shared/orders";
import { orderModel, type Category, type Model } from "@/shared/stock";

// Очередь печати: какие заказы в ней, как отсортировать, сгруппировать и отфильтровать.
// Описание — docs/PICKING.md, раздел 6.

/**
 * Выбор «что печатать» — общий для комплектации и быстрой печати на пульте.
 * `null` — все. У товара `null` — все его размеры. Товар и служба складываются через «и».
 */
export type QueueSelection = {
  products: Record<string, string[] | null> | null;
  services: DeliveryService[] | null;
};

export const ALL_SELECTED: QueueSelection = { products: null, services: null };

export const isAllSelected = (s: QueueSelection) => s.products === null && s.services === null;

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
      const model = orderModel(order, models);
      const modelIndex = model ? models.indexOf(model) : -1;
      const categoryIndex = model ? categories.findIndex((c) => c.id === model.categoryId) : -1;
      const category = categories[categoryIndex]?.name ?? "Без категории";
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

/** Что вообще можно выбрать: товары, размеры товара и службы, которые сейчас есть в очереди. */
export type SelectionOptions = {
  products: string[];
  sizes: (product: string) => string[];
  services: DeliveryService[];
};

const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

const productMap = (s: QueueSelection, o: SelectionOptions) =>
  s.products ?? Object.fromEntries(o.products.map((p) => [p, null as string[] | null]));

/** Отмечены все товары очереди со всеми размерами — снова «все». */
const normalizeProducts = (p: Record<string, string[] | null>, o: SelectionOptions) =>
  o.products.every((name) => name in p && p[name] === null) ? null : p;

export const isProductSelected = (s: QueueSelection, product: string) => !s.products || product in s.products;

export const isSizeSelected = (s: QueueSelection, product: string, size: string) => {
  if (!isProductSelected(s, product)) return false;
  const sizes = s.products?.[product] ?? null;
  return sizes === null || sizes.includes(size);
};

export const isServiceSelected = (s: QueueSelection, service: DeliveryService) => !s.services || s.services.includes(service);

/** Снять / отметить товар. Сняли хоть один из «всех» — включается выбор по товару. */
export function toggleProduct(s: QueueSelection, product: string, o: SelectionOptions): QueueSelection {
  const next = { ...productMap(s, o) };
  if (product in next) delete next[product];
  else next[product] = null;
  return { ...s, products: normalizeProducts(next, o) };
}

/** Снять / отметить размер у товара. Сняли последний размер — снят и товар. */
export function toggleSize(s: QueueSelection, product: string, size: string, o: SelectionOptions): QueueSelection {
  const next = { ...productMap(s, o) };
  const all = o.sizes(product);
  const sizes = toggleIn(next[product] ?? all, size);
  if (sizes.length === 0) delete next[product];
  else next[product] = all.every((x) => sizes.includes(x)) ? null : all.filter((x) => sizes.includes(x));
  return { ...s, products: normalizeProducts(next, o) };
}

/** Снять / отметить службу. Отмечены все — снова «все». */
export function toggleService(s: QueueSelection, service: DeliveryService, o: SelectionOptions): QueueSelection {
  const services = toggleIn(s.services ?? o.services, service);
  return { ...s, services: o.services.every((x) => services.includes(x)) ? null : services };
}

/** Заказ подходит под выбор: его товар отмечен (и размер, если у товара выбраны размеры), служба отмечена. */
export function matchesSelection(order: Order, s: QueueSelection) {
  if (s.services && !s.services.includes(order.service)) return false;
  if (!s.products) return true;
  if (!(order.product in s.products)) return false;
  const sizes = s.products[order.product];
  return sizes === null || sizes.includes(order.size ?? "");
}

export function filterQueue(items: QueueItem[], s: QueueSelection) {
  return items.filter((i) => matchesSelection(i.order, s));
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

/** Подпись партии: порядок и выбор, если не «Все». */
export function describeSelection(s: QueueSelection) {
  const products = Object.entries(s.products ?? {}).map(([name, sizes]) => (sizes ? `${name} (${sizes.join(", ")})` : name));
  const filters = [...products, ...(s.services ?? []).map((x) => SERVICE_LABEL[x])];
  return filters.length ? `${QUEUE_ORDER} · только ${filters.join(", ")}` : QUEUE_ORDER;
}

export function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return counts;
}
