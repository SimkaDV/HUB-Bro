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
  /** Сколько каких пачек было в поставке — для истории. Штуки из них уже лежат в delivered. */
  packs?: { name: string; count: number }[];
};

/** Статусы джинсы, у которой уже есть заказ. «На складе» хранится количеством, см. SizeStock.stock. */
export type UnitStatus = "reserve" | "returnStock" | "sent" | "delivered" | "returnTransit";

/** Джинса, привязанная к заказу: с этого момента она уникальная. */
export type Unit = {
  /** Номер заказа — номер сделки Авито. */
  order: string;
  /** Дата заказа, ДД.ММ. */
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

/** Пороги цвета остатка: ≤ lowMax — мало, ≤ midMax — норм, больше — много. */
export type Thresholds = {
  lowMax: number;
  midMax: number;
};

export type Model = {
  id: string;
  name: string;
  /** Название категории (см. Category.name). */
  category: string;
  batches: Batch[];
  /** Порядок массива = порядок размеров на экране (можно менять в настройках). */
  sizes: SizeStock[];
  /** Свои пороги модели. Нет — берутся пороги категории. */
  thresholds?: Thresholds;
  /** Скрытые размеры: не показываются на складе и в поставке. Скрыть можно только пустой размер. */
  hiddenSizes?: string[];
  /** В архиве: не видна на складе и в поставке, в истории остаётся. */
  archived?: boolean;
  /** Пачки модели: собираются в «+ Поставке», переименовать и удалить — в настройках модели. */
  packs?: Pack[];
};

/** Пачка: готовый набор размеров, всегда по одной штуке каждого. Нужна только для ввода поставки. */
export type Pack = {
  id: string;
  name: string;
  sizes: string[];
};

/** Пачка в карточке поставки: сколько пачек пришло. fresh — собрана в этой поставке, ещё не у модели. */
export type DeliveryPack = Pack & { count: number; fresh?: boolean };

export type Category = {
  id: string;
  name: string;
  /** Код на бирке: 1–4 буквы или цифры, «КЛ». Пишется после номера заказа: N338871-КЛ. Уникален. */
  code?: string;
  /** Шаблон размеров: новая модель категории получает их, окно поставки их подсказывает. */
  sizes: string[];
  thresholds: Thresholds;
};

export type DisplaySettings = {
  /** Показывать на плитках размеры с нулём. */
  showZeroOnTiles: boolean;
  /** Показывать «+N» — возвраты, которые едут к нам. */
  showIncoming: boolean;
  /** Сколько рядов чипов на плитке (по 3 в ряд). */
  tileRows: 2 | 3;
};

/** Запись истории об изменении настроек. */
export type SettingsLogEntry = {
  id: string;
  at: string;
  text: string;
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
  /** Отдельные штуки по размерам — сверх пачек. */
  qty: Record<string, number>;
  /** Пачки в карточке. Нет — старый черновик, пачек нет. */
  packs?: DeliveryPack[];
};

export type DeliveryInput = {
  date: string;
  /** Дату поменяли руками. Нет — черновик откроется с сегодняшней датой. */
  dateSet?: boolean;
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
  level: StockLevel;
};
