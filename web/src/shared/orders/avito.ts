import type { DeliveryService, Order, OrderStatus } from "./types";

// Как данные кабинета Авито ложатся на наш заказ. Описание — docs/ORDERS.md, раздел 2.
// Значения — из внутреннего JSON страницы заказов (avito.ru/orders), `status.value` у заказа продавца.
// disputed и waiting_confirmation вживую не видели — по названиям фильтров страницы.

/** Служба Авито (`provider.value`) → наша. Неизвестная — undefined, заказ покажет предупреждение. */
export const AVITO_SERVICE: Record<string, DeliveryService> = {
  "avito-pvz": "avito",
  pochta: "post",
  cdek: "cdek",
  "yandex-market-pvz": "yandex",
  "five-post": "fivepost",
  "5post": "fivepost",
  fivepost: "fivepost",
  dpd: "dpd",
};

/**
 * Служба по данным Авито: сначала точное значение (`provider.value`: у 5Post — `five-post`, у DPD — `dpd`),
 * потом по названию — Авито может назвать службу по-разному. Не узнали — undefined.
 */
export function avitoService(value?: string, label?: string): DeliveryService | undefined {
  if (value && AVITO_SERVICE[value]) return AVITO_SERVICE[value];
  const text = `${value ?? ""} ${label ?? ""}`.toLowerCase();
  if (/5\s*post|five\s*post|пятёрочк|пятерочк/.test(text)) return "fivepost";
  if (/yandex|яндекс/.test(text)) return "yandex";
  if (/cdek|сдэк/.test(text)) return "cdek";
  if (/dpd|дпд/.test(text)) return "dpd";
  if (/pochta|почта/.test(text)) return "post";
  if (/avito|авито/.test(text)) return "avito";
  return undefined;
}

/** Что делать со статусом Авито: перевести в наш или только пометить «Спорный». */
export type AvitoStatusEffect = OrderStatus | "disputed";

export const AVITO_STATUS: Record<string, AvitoStatusEffect> = {
  waiting_confirmation: "ordered",
  confirmed: "ordered", // «Отправьте заказ»
  performed: "inTransit", // «Едет к покупателю»
  provided: "arrived", // «Ждёт выдачи покупателю»
  accepted: "completed", // «Завершён» / «Получите оплату»
  on_delivery_return: "returnTransit", // «Возврат: заберите заказ»
  return_performed: "returnTransit", // «Возврат: едет к вам»
  returned: "returnTransit", // «Закрыт после возврата» — дальше разбор возврата у нас
  canceled: "cancelled",
  canceled_by_buyer: "cancelled",
  voided: "cancelled",
  disputed: "disputed",
};

const CLOSED: OrderStatus[] = ["completed", "cancelled", "returnStock", "defect"];

/** Путь заказа от Авито по порядку: назад по нему не ходим. */
const AVITO_PATH: OrderStatus[] = ["ordered", "packed", "sent", "inTransit", "arrived", "completed"];

/**
 * Применяет статус Авито к заказу (ORDERS.md, правила 6 и 11).
 * Возвращает тот же заказ, если менять нечего: закрытый, статус назад по пути («Собран», а Авито ещё
 * «Отправьте заказ»), повтор, незнакомый статус.
 */
export function applyAvitoStatus(order: Order, avitoStatus: string, at: string): Order {
  const effect = AVITO_STATUS[avitoStatus];
  if (effect === undefined) return order;
  if (effect === "disputed") return order.disputed ? order : { ...order, disputed: true };
  if (CLOSED.includes(order.status) || effect === order.status) return order;

  const from = AVITO_PATH.indexOf(order.status);
  const to = AVITO_PATH.indexOf(effect);
  if (from !== -1 && to !== -1 && to <= from) return order;
  if (effect === "returnTransit" && order.status === "returnCheck") return order;

  return { ...order, status: effect, history: [...order.history, { status: effect, at }] };
}
