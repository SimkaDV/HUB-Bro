import type { Order, OrderProblem } from "@/shared/orders";
import type { Model } from "@/shared/stock";

// Сверка заказов со складом. Описание — docs/ORDERS.md, раздел 7, и docs/WAREHOUSE.md, раздел 10.
// Чистая функция: на входе заказы и модели, на выходе новые заказы и модели, если что-то поменялось.

const dayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * - Заказан / Собран с размером и без резерва → резерв из самой старой поставки (−1 на полке).
 *   Нет джинсы → пометка «Нет на складе» (только у «Заказан»).
 * - Заказан без размера → «Без размера».
 * - Отменён с резервом → резерв снят, джинса на полку своей поставки (+1).
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
    list.find((m) => m.name === o.product)?.sizes.find((s) => s.size === o.size);

  const problems = new Map<string, OrderProblem | undefined>();
  const byAge = [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const o of byAge) {
    if (o.status === "cancelled") {
      const size = findSize(nextModels, o);
      const unit = size?.units.find((u) => u.order === o.id && u.status === "reserve");
      if (unit) {
        const s = findSize(editable(), o)!;
        s.units = s.units.filter((u) => u.order !== o.id);
        const row = s.stock.find((x) => x.batchId === unit.batchId);
        if (row) row.qty += 1;
        else s.stock.push({ batchId: unit.batchId, qty: 1 });
      }
      problems.set(o.id, undefined);
      continue;
    }
    if (o.status !== "ordered" && o.status !== "packed") continue;
    if (!o.size) {
      problems.set(o.id, o.status === "ordered" ? "noSize" : undefined);
      continue;
    }

    const size = findSize(nextModels, o);
    if (size?.units.some((u) => u.order === o.id)) {
      problems.set(o.id, undefined);
      continue;
    }

    const model = nextModels.find((m) => m.name === o.product);
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
