// Модель данных заказа. Описание — docs/ORDERS.md

export type OrderStatus =
  | "ordered"
  | "packed"
  | "sent"
  | "inTransit"
  | "arrived"
  | "completed"
  | "cancelled"
  | "returnTransit"
  | "returnCheck"
  | "returnStock"
  | "defect";

/** Пометка на заказе в «Заказан». Не статус. */
export type OrderProblem = "noSize" | "noStock";

/** Служба доставки, куда сдаём посылку. Адреса ПВЗ не храним — только службу. */
export type DeliveryService = "cdek" | "avito" | "post" | "yandex" | "fivepost";

export type StatusChange = {
  status: OrderStatus;
  /** Когда сменился, ISO. */
  at: string;
};

/** Один заказ = одна джинса. */
export type Order = {
  /** Номер сделки Авито — он же наш номер заказа. */
  id: string;
  /** Когда пришла оплаченная сделка, ISO. */
  createdAt: string;
  /** Название модели склада, к которой привязано объявление. */
  product: string;
  /** Размер из чата. Нет — бот ещё не прислал. */
  size?: string;
  /** Размер правили руками: какой был до первой правки (нет `original` — размера не было). */
  manualSize?: { original?: string };
  /** Служба доставки, куда сдаём посылку. */
  service: DeliveryService;
  /** Номер отправления: его штрихкод пикают в ПВЗ, он же на бирке. Появляется после оформления. */
  dispatchNumber?: string;
  /** Отгрузить до, YYYY-MM-DD. */
  shipBy?: string;
  /** Id объявления Авито. */
  itemId?: string;
  /** Id чата с покупателем (u2i-…). */
  chatId?: string;
  /** Когда последний раз сверяли с Авито, ISO. */
  syncedAt?: string;
  /** Авито пометил заказ спорным. Статус не меняем, только пометка. */
  disputed?: boolean;
  /** Сколько получим за заказ — «Вы получите» у Авито. Видно в строке заказа. */
  payout?: number;
  /** За сколько продан товар (после скидок Авито), ₽. Из карточки заказа. */
  price?: number;
  /** Цена объявления до скидок, ₽. Из карточки заказа. */
  listPrice?: number;
  buyer: string;
  status: OrderStatus;
  problem?: OrderProblem;
  /** Все смены статуса по порядку, первая — «Заказан». */
  history: StatusChange[];
};
