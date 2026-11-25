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
export type OrderProblem = "noModel" | "noSize" | "noStock";

/** Служба доставки, куда сдаём посылку. Адреса ПВЗ не храним — только службу. */
export type DeliveryService = "cdek" | "avito" | "post" | "yandex" | "fivepost" | "dpd";

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
  /**
   * Товар каталога (Product.id = Model.id) — по нему сверка находит джинсу. У заказа из Авито ставится сам по
   * привязке объявления (`itemId` → «Объявления»). Нет — товар не выбран (проблема «Товар не выбран»).
   */
  productId?: string;
  /**
   * Название товара — снимок для показа и истории. Пока заказ в «Заказан» / «Собран», сверка держит его равным
   * названию товара (переименовали модель — поменяется и тут). Без товара — название объявления.
   */
  product: string;
  /** Размер из чата, номер строкой: «30». Нет — бот ещё не прислал. */
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
  /** Название объявления на Авито, как пришло. */
  itemTitle?: string;
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
