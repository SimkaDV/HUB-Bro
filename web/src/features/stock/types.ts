// Модель данных склада. Описание — docs/WAREHOUSE.md

/** Закупка одной модели в один день, одна цена на всю партию. */
export type Batch = {
  id: string;
  name: string;
  date: string;
  from: string;
  price: number;
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

export type StockLevel = "zero" | "low" | "mid" | "ok";

export type SizeSummary = {
  size: string;
  qty: number;
  incoming: number;
};
