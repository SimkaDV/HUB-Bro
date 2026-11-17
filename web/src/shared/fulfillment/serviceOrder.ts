import { createStore } from "@/shared/lib/store";
import { SERVICES, type DeliveryService } from "@/shared/orders";

// Порядок служб доставки в очереди печати: в каком порядке раскладываются стопки по службам.
// Общий для всех компов (синхронизируется с сервером). Описание — docs/PICKING.md, раздел 6.

export const DEFAULT_SERVICE_ORDER: DeliveryService[] = ["yandex", "avito", "cdek", "post", "fivepost"];

/** Сохранённый порядок + службы, которых в нём нет (добавили новую), в конце. Мусор отбрасывается. */
function normalize(saved: unknown): DeliveryService[] {
  const known = SERVICES.map((s) => s.id);
  const list = Array.isArray(saved) ? saved.filter((s): s is DeliveryService => known.includes(s)) : [];
  const unique = [...new Set(list)];
  return [...unique, ...DEFAULT_SERVICE_ORDER.filter((s) => !unique.includes(s))];
}

export const serviceOrderStore = createStore<DeliveryService[]>(
  "hubbro.picking.services.v2",
  () => DEFAULT_SERVICE_ORDER,
  (saved) => normalize(saved),
);

export const useServiceOrder = serviceOrderStore.use;

export function setServiceOrder(order: DeliveryService[]) {
  serviceOrderStore.set(() => normalize(order));
}
