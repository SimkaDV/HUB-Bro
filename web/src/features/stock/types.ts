// Модель данных склада. Описание — docs/WAREHOUSE.md

/** Поставка (= партия): одна модель за один день, одна сумма на всю поставку. */
export type Batch = {
  id: string;
  name: string;
  /** Дата прихода, YYYY-MM-DD. */
  date: string;
  from: string;
  /** Сколько заплатили за всю поставку, ₽. */
  total: number;
  /** Цена за штуку = total / штук, до копеек. */
  price: number;
  /** Сколько каких размеров пришло — для истории и проверки отмены. */
  delivered: { size: string; qty: number }[];
  /** Когда внесли в систему, ISO. */
  addedAt: string;
  cancelledAt?: string;
};

/** Статусы джинсы, у которой уже есть заказ. «На складе» хранится количеством, см. SizeStock.stock. */
export type UnitStatus = "reserve" | "returnStock" | "sent" | "delivered" | "returnTransit";

/** Джинса, привязанная к заказу: с этого момента она уникальная. */
export type Unit = {
  order: number;
  orderDate: string;
  status: UnitStatus;
  batchId: string;
  pickupPoint?: string;
};

export type SizeStock = {
  size: string;
  /** Безликие джинсы на полке: сколько штук из каждой партии. */
  stock: { batchId: string; qty: number }[];
  units: Unit[];
};

export type Model = {
  id: string;
  name: string;
  category: string;
  batches: Batch[];
  sizes: SizeStock[];
};

/** Одна модель в окне «+ Поставка». Из каждой строки получается отдельная поставка. */
export type DeliveryLine = {
  key: string;
  /** null — новая модель, создаётся прямо из поставки. */
  modelId: string | null;
  newModel: { name: string; category: string };
  /** Сумма за всю поставку, строкой как в поле ввода: пусто — ещё не вписали. */
  total: string;
  /** На сколько штук прибавляют кнопки −/+: 1, 2, 5, 10 или своё. */
  step: number;
  sizes: string[];
  qty: Record<string, number>;
};

export type DeliveryInput = {
  date: string;
  from: string;
  lines: DeliveryLine[];
};

export type DeliveryDraft = DeliveryInput & {
  id: string;
  updatedAt: string;
};

export type StockLevel ="zero" | "low" | "mid" | "ok";

export type SizeSummary = {
  size: string;
  qty: number;
  incoming: number;
};
