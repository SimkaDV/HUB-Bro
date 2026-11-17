// Бирки партии: что печатаем по каждому заказу. Раскладка бирки — docs/SETTINGS.md, «Бирка»; печать — docs/PICKING.md.
import { SERVICE_LABEL, type Order } from "@/shared/orders";
import type { LabelData } from "@/shared/printer";
import type { Category, Model } from "@/shared/stock";

/** Бирку печатаем только заказам, которые всё ещё наши: «Заказан» или «Собран». Отменённые и пропавшие — нет. */
export const isPrintable = (order: Order | undefined): order is Order =>
  !!order && (order.status === "ordered" || order.status === "packed");

/** Данные бирки заказа: код категории ищется через модель склада (Order.product = Model.name). */
export function orderLabel(order: Order, models: Model[], categories: Category[]): LabelData {
  const model = models.find((m) => m.name === order.product);
  const code = model ? categories.find((c) => c.name === model.category)?.code : undefined;
  return {
    orderId: order.id,
    product: order.product,
    size: order.size ?? "",
    categoryCode: code || undefined,
    dispatchNumber: order.dispatchNumber || undefined,
    service: SERVICE_LABEL[order.service],
  };
}

/** Бирки партии в порядке партии — так их и расклеивают. */
export function batchLabels(orderIds: string[], orders: Map<string, Order>, models: Model[], categories: Category[]): LabelData[] {
  return orderIds.map((id) => orders.get(id)).filter(isPrintable).map((o) => orderLabel(o, models, categories));
}
