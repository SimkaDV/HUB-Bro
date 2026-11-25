import { linkedModel, type Listing } from "@/shared/listings";
import type { Order } from "@/shared/orders";
import type { Model } from "@/shared/stock";

// Товар заказа (по id) — по привязке объявления. Описание — docs/ORDERS.md, раздел 7, и docs/LISTINGS.md.
// Чистая функция: идёт перед сверкой со складом, чтобы сверка искала джинсу в правильной модели.

/**
 * Товар заказов в «Заказан» и «Собран» — по id (Order.productId), название в `product` — снимок для показа:
 * - заказ с объявлением (`itemId`): товар = модель, к которой привязано объявление. Не привязано (или модель
 *   удалили) — без товара, в `product` название объявления, сверка поставит «Товар не выбран»;
 * - заказ без объявления: товар остаётся, а старый заказ без `productId` находит модель по точному названию (один раз);
 * - переименовали модель — `product` у таких заказов подтягивается к новому названию.
 * Отправленные и закрытые не трогаем: джинса уже уехала, товар больше не меняется.
 * Привязали объявление позже или перепривязали — заказы подхватят сами при следующей сверке.
 */
export function syncProducts(orders: Order[], listings: Listing[], models: Model[]): Order[] | null {
  let changed = false;
  const next = orders.map((o) => {
    if (o.status !== "ordered" && o.status !== "packed") return o;
    let model: Model | undefined;
    if (o.itemId) {
      const listing = listings.find((l) => l.id === o.itemId);
      model = listing && linkedModel(listing, models);
    } else {
      model = o.productId ? models.find((m) => m.id === o.productId) : models.find((m) => m.name === o.product);
    }
    const productId = model?.id;
    const product = model?.name ?? (o.itemId ? (o.itemTitle ?? o.product) : o.product);
    if (productId === o.productId && product === o.product) return o;
    changed = true;
    const { productId: _, ...rest } = o;
    return productId ? { ...rest, productId, product } : { ...rest, product };
  });
  return changed ? next : null;
}
