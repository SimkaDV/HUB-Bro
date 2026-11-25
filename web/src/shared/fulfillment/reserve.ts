import type { Order, OrderProblem } from "@/shared/orders";
import type { Model } from "@/shared/stock";

// Сверка заказов со складом. Описание — docs/ORDERS.md, раздел 7, и docs/WAREHOUSE.md, раздел 10.
// Заказ связан с моделью только по id товара (Order.productId).
// Чистая функция: на входе заказы и модели, на выходе новые заказы и модели, если что-то поменялось.

const dayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * - Заказан / Собран с размером и без резерва → резерв из самой старой поставки (−1 на полке).
 *   Нет джинсы → пометка «Нет на складе» (только у «Заказан»).
 * - Товара (модели) нет на складе → «Товар не выбран»: у заказа из Авито объявление не привязано.
 * - Заказан без размера → «Без размера».
 * - Отменён с резервом → резерв снят, джинса на полку своей поставки (+1).
 * - Остальные статусы → пометка проблемы снимается (бывает у заказа только в «Заказан»).
 * - Поменяли или убрали размер у заказа с резервом → старый резерв снят (+1), дальше как обычно.
 * - Поменялся товар (перепривязали объявление) → резерв в старой модели снят, дальше как обычно.
 * Заказы обходим от старых к новым: кто раньше заказал, тому и джинса.
 */
export function syncReserves(orders: Order[], models: Model[]): { orders: Order[]; models: Model[] } | null {
  let nextModels = models;
  let modelsChanged = false;
  let ordersChanged = false;

  const editable = () => {
    if (!modelsChanged) {
      nextModels = structuredClone(models);
      modelsChanged = true;
    }
    return nextModels;
  };

  const findSize = (list: Model[], o: Order) =>
    list.find((m) => m.id === o.productId)?.sizes.find((s) => s.size === o.size);

  const problems = new Map<string, OrderProblem | undefined>();
  const byAge = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const reservedFor = (o: Order) => (s: Model["sizes"][number]) => s.units.some((u) => u.order === o.id && u.status === "reserve");

  /**
   * Снимает резерв заказа везде, кроме размера `keep` его товара: джинса на полку своей поставки.
   * Ищем во всех моделях — товар у заказа мог смениться (перепривязали объявление).
   */
  const release = (o: Order, keep?: string) => {
    const isStale = (m: Model, s: Model["sizes"][number]) => !(m.id === o.productId && s.size === keep) && reservedFor(o)(s);
    if (!nextModels.some((m) => m.sizes.some((s) => isStale(m, s)))) return;
    for (const m of editable()) {
      for (const s of m.sizes.filter((x) => isStale(m, x))) {
        for (const unit of s.units.filter((u) => u.order === o.id && u.status === "reserve")) {
          const row = s.stock.find((x) => x.batchId === unit.batchId);
          if (row) row.qty += 1;
          else s.stock.push({ batchId: unit.batchId, qty: 1 });
        }
        s.units = s.units.filter((u) => !(u.order === o.id && u.status === "reserve"));
      }
    }
  };

  for (const o of byAge) {
    if (o.status === "cancelled") {
      release(o);
      problems.set(o.id, undefined);
      continue;
    }
    if (o.status !== "ordered" && o.status !== "packed") {
      // Заказ ушёл дальше (Авито прислал «Едет к покупателю») — пометка проблемы больше не нужна.
      problems.set(o.id, undefined);
      continue;
    }
    release(o, o.size);
    if (!o.productId || !nextModels.some((m) => m.id === o.productId)) {
      // Сначала товар: без модели ни размер выбрать, ни джинсу найти.
      problems.set(o.id, o.status === "ordered" ? "noModel" : undefined);
      continue;
    }
    if (!o.size) {
      problems.set(o.id, o.status === "ordered" ? "noSize" : undefined);
      continue;
    }

    const size = findSize(nextModels, o);
    if (size?.units.some((u) => u.order === o.id)) {
      problems.set(o.id, undefined);
      continue;
    }

    const model = nextModels.find((m) => m.id === o.productId);
    const batchDate = (id: string) => model?.batches.find((b) => b.id === id)?.date ?? "";
    const oldest = size?.stock.filter((x) => x.qty > 0).sort((a, b) => batchDate(a.batchId).localeCompare(batchDate(b.batchId)))[0];
    if (!oldest) {
      problems.set(o.id, o.status === "ordered" ? "noStock" : undefined);
      continue;
    }

    const s = findSize(editable(), o)!;
    s.stock = s.stock
      .map((x) => (x.batchId === oldest.batchId ? { ...x, qty: x.qty - 1 } : x))
      .filter((x) => x.qty > 0);
    s.units.push({ order: o.id, orderDate: dayMonth(o.createdAt), status: "reserve", batchId: oldest.batchId });
    problems.set(o.id, undefined);
  }

  const nextOrders = orders.map((o) => {
    if (!problems.has(o.id) || problems.get(o.id) === o.problem) return o;
    ordersChanged = true;
    const { problem: _, ...rest } = o;
    const problem = problems.get(o.id);
    return problem ? { ...rest, problem } : rest;
  });

  if (!modelsChanged && !ordersChanged) return null;
  return { orders: ordersChanged ? nextOrders : orders, models: nextModels };
}
