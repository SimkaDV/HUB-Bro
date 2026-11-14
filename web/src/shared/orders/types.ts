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

/** Служба доставки. Пока четыре, потом список будет приходить из Авито. */
export type DeliveryService = "cdek" | "avito" | "post" | "fivepost";

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
  /** Служба доставки, куда сдаём посылку. */
  service: DeliveryService;
  /** ПВЗ покупателя: служба и адрес. */
  pickupPoint: string;
  /** Храним, на экране пока не показываем. */
  price: number;
  buyer: string;
  status: OrderStatus;
  problem?: OrderProblem;
  /** Все смены статуса по порядку, первая — «Заказан». */
  history: StatusChange[];
};
