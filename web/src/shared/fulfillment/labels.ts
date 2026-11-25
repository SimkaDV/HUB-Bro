// Бирки партии: что печатаем по каждому заказу. Раскладка бирки — docs/SETTINGS.md, «Бирка»; печать — docs/PICKING.md.
import { SERVICE_LABEL, type Order } from "@/shared/orders";
import type { LabelData } from "@/shared/printer";
import { orderModel, type Model } from "@/shared/stock";

/** Бирку печатаем только заказам, которые всё ещё наши: «Заказан» или «Собран». Отменённые и пропавшие — нет. */
export const isPrintable = (order: Order | undefined): order is Order =>
  !!order && (order.status === "ordered" || order.status === "packed");

/** Данные бирки заказа: код на бирке — у товара заказа (Order.productId = Model.id). */
export function orderLabel(order: Order, models: Model[]): LabelData {
  const code = orderModel(order, models)?.code;
  return {
    orderId: order.id,
    product: order.product,
    size: order.size ?? "",
    code: code || undefined,
    dispatchNumber: order.dispatchNumber || undefined,
    service: SERVICE_LABEL[order.service],
  };
}

/** Бирки партии в порядке партии — так их и расклеивают. */
export function batchLabels(orderIds: string[], orders: Map<string, Order>, models: Model[]): LabelData[] {
  return orderIds.map((id) => orders.get(id)).filter(isPrintable).map((o) => orderLabel(o, models));
}
