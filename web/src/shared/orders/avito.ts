import type { DeliveryService, Order, OrderStatus } from "./types";

// Как данные кабинета Авито ложатся на наш заказ. Описание — docs/ORDERS.md, раздел 2.
// Значения — из внутреннего JSON страницы заказов (avito.ru/orders): статус заказа и фильтры списка.
// Вживую видели только confirmed и accepted, остальные — по названиям фильтров страницы.

/** Служба Авито (`provider.value`) → наша. Неизвестная — undefined, заказ покажет предупреждение. */
export const AVITO_SERVICE: Record<string, DeliveryService> = {
  "avito-pvz": "avito",
  pochta: "post",
  cdek: "cdek",
  "yandex-market-pvz": "yandex",
  "5post": "fivepost",
  fivepost: "fivepost",
};

/** Что делать со статусом Авито: перевести в наш или только пометить «Спорный». */
export type AvitoStatusEffect = OrderStatus | "disputed";

export const AVITO_STATUS: Record<string, AvitoStatusEffect> = {
  waiting_confirmation: "ordered",
  confirmed: "ordered", // «Отправьте заказ»
  waiting_shipment: "ordered",
  in_transit: "sent",
  delivered_in_pvz: "arrived",
  accepted: "completed", // «Получите оплату»
  payout_wait: "completed",
  finished: "completed",
  canceled: "cancelled",
  on_return: "returnTransit",
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
