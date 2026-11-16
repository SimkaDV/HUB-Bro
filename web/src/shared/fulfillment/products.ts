import { linkedModel, type Listing } from "@/shared/listings";
import type { Order } from "@/shared/orders";
import type { Model } from "@/shared/stock";

// Товар заказа из Авито — по привязке объявления. Описание — docs/ORDERS.md, раздел 7, и docs/LISTINGS.md.
// Чистая функция: идёт перед сверкой со складом, чтобы сверка искала джинсу в правильной модели.

/**
 * У заказа с объявлением (`itemId`) в «Заказан» или «Собран» товар = модель, к которой привязано объявление.
 * Не привязано (или модель удалили) — название объявления, сверка поставит «Товар не выбран».
 * Отправленные и закрытые не трогаем: джинса уже уехала, товар больше не меняется.
 * Привязали объявление позже или перепривязали — заказы подхватят сами при следующей сверке.
 */
export function syncProducts(orders: Order[], listings: Listing[], models: Model[]): Order[] | null {
  let changed = false;
  const next = orders.map((o) => {
    if (!o.itemId || (o.status !== "ordered" && o.status !== "packed")) return o;
    const listing = listings.find((l) => l.id === o.itemId);
    const product = (listing && linkedModel(listing, models)?.name) ?? o.itemTitle ?? o.product;
    if (product === o.product) return o;
    changed = true;
    return { ...o, product };
  });
  return changed ? next : null;
}
