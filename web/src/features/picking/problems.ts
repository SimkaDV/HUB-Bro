import type { Order } from "@/shared/orders";
import { orderModel, type Model } from "@/shared/stock";

// Подсказка, как решить проблему заказа. Описание — docs/ORDERS.md, раздел 6.

export function problemHint(o: Order, models: Model[]): string {
  const model = orderModel(o, models);
  if (!model && o.itemId) return "Объявление не привязано к товару склада —";
  if (!model) return `Модели «${o.product}» нет на складе — заведите её в настройках склада`;
  if (o.problem === "noSize") return "Выберите размер из чата с покупателем";
  const units = model.sizes.find((s) => s.size === o.size)?.units ?? [];
  const toCheck = units.find((u) => u.status === "returnStock");
  if (toCheck) return `Есть возврат на разбор: заказ №${toCheck.order} — разберите его на полку`;
  const coming = units.find((u) => u.status === "returnTransit");
  if (coming) return `Едет возврат: заказ №${coming.order} — дождитесь или докупите ${o.size}`;
  return `Докупить: ${o.product}, ${o.size}`;
}
