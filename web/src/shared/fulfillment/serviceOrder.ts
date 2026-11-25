import { createFileStore } from "@/shared/lib/store";
import { SERVICES, type DeliveryService } from "@/shared/orders";

// Порядок служб доставки в очереди печати: в каком порядке раскладываются стопки по службам.
// Общий для всех компов: поле serviceOrder файла shop.json на сервере данных. Остальные поля магазина (название,
// откуда наличие, время отправки) кабинет не трогает — переносит как есть. Описание — docs/PICKING.md, раздел 6.

export const DEFAULT_SERVICE_ORDER: DeliveryService[] = ["yandex", "avito", "cdek", "post", "fivepost", "dpd"];

/** Сохранённый порядок + службы, которых в нём нет (добавили новую), в конце. Мусор отбрасывается. */
function normalize(saved: unknown): DeliveryService[] {
  const known = SERVICES.map((s) => s.id);
  const list = Array.isArray(saved) ? saved.filter((s): s is DeliveryService => known.includes(s)) : [];
  const unique = [...new Set(list)];
  return [...unique, ...DEFAULT_SERVICE_ORDER.filter((s) => !unique.includes(s))];
}

export const serviceOrderStore = createFileStore<DeliveryService[]>("shop", 1, () => DEFAULT_SERVICE_ORDER, {
  read: (r) => normalize(r.serviceOrder),
  // Пустое название магазина сервер не примет (validate.mjs: shop.name — непустая строка), а пустой shop.json
  // сервер отдаёт именно с пустым названием. Поэтому у магазина без названия кабинет ставит «Магазин».
  write: (serviceOrder, file) => ({
    serviceOrder,
    ...(typeof file.name === "string" && file.name.trim() ? {} : { name: "Магазин" }),
  }),
});

export const useServiceOrder = serviceOrderStore.use;

export function setServiceOrder(order: DeliveryService[]) {
  serviceOrderStore.set(() => normalize(order));
}
