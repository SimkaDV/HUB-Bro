// Модель данных склада. Описание — docs/WAREHOUSE.md; формат файлов — avito/data/schema/FORMAT.md
// (catalog.json — товары и категории, stock.json — поставки и остатки, hub.json — отображение и черновики).

/** Поставка (= партия): одна модель за один день, одна сумма на всю поставку. */
export type Batch = {
  id: string;
  /** Товар каталога (Product.id), которому пришла поставка. */
  productId: string;
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

/** Размер модели в памяти кабинета. В stock.json лежит без `size`: products[productId][size] = { stock, units }. */
export type SizeStock = {
  /** Номер размера строкой: «30». Буква — в шкале (catalog.sizeScale). */
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

/** Строка шкалы размеров магазина (catalog.sizeScale): номер и буква, «30» / «M». Буквы может не быть. */
export type SizeLabel = {
  size: string;
  label: string;
};

/** Что бот рассказывает о товаре. Кабинет эти поля не меняет. */
export type ProductDescription = {
  material?: string | null;
  composition?: string | null;
  density?: string | null;
  legOpening?: string | null;
};

/**
 * Товар каталога (catalog.json). Поля бота (match … availability) кабинет не трогает — переносит как есть,
 * новым товарам ставит пустые. Неизвестные поля тоже переносятся (объект просто копируется через `...`).
 */
export type Product = {
  /** slug, не меняется никогда: «klesh». На него ссылаются поставки, заказы, объявления. */
  id: string;
  name: string;
  /** Категория (Category.id). */
  categoryId: string;
  /** Порядок массива = порядок размеров на экране (можно менять в настройках). */
  sizes: string[];
  /** Свои пороги модели. Нет — берутся пороги категории. */
  thresholds?: Thresholds;
  /** Скрытые размеры: не показываются на складе и в поставке. Скрыть можно только пустой размер. */
  hiddenSizes?: string[];
  /** В архиве: не видна на складе и в поставке, в истории остаётся. Бот считает «нет в наличии». */
  archived?: boolean;
  /** Код на бирке: 1–4 буквы или цифры, «КЛ». Пишется после номера заказа: N338871-КЛ. Уникален среди моделей. */
  code?: string;
  /** Пачки модели: собираются в «+ Поставке», переименовать и удалить — в настройках модели. */
  packs?: Pack[];
  // Поля бота — кабинет только переносит.
  match: string[];
  botKey?: string;
  description: ProductDescription;
  sizeTable?: { columns: { key: string; title: string }[]; rows: Record<string, Record<string, number>> } | null;
  sizeHW?: unknown;
  photos: string[];
  chart?: string | null;
  availability: { inStock: boolean; outSizes: string[] };
};

/**
 * Модель склада — так кабинет видит товар: товар каталога + его поставки и остатки из stock.json.
 * Склеивается при чтении и разбирается обратно при записи (shared/stock/store.ts).
 */
export type Model = Omit<Product, "sizes"> & {
  batches: Batch[];
  /** Порядок массива = порядок размеров на экране (= Product.sizes). */
  sizes: SizeStock[];
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
  /** Шаблон размеров: новая модель категории получает их, окно поставки их подсказывает. */
  sizes: string[];
  thresholds: Thresholds;
  /** Буквы размеров этой категории: {"30": "M"} — у каждой категории своё соответствие. Нет — буква из шкалы магазина. */
  labels?: Record<string, string>;
};

export type DisplaySettings = {
  /** Показывать на плитках размеры с нулём. */
  showZeroOnTiles: boolean;
  /** Показывать «+N» — возвраты, которые едут к нам. */
  showIncoming: boolean;
  /** Сколько рядов чипов на плитке (по 3 в ряд). */
  tileRows: 2 | 3;
};

/** Запись общей истории (log.json): изменения настроек склада и каталога. Пишут и кабинет, и бот. */
export type SettingsLogEntry = {
  id: string;
  at: string;
  source: "hub" | "bot";
  text: string;
};

/** Одна модель в окне «+ Поставка». Из каждой строки получается отдельная поставка. */
export type DeliveryLine = {
  key: string;
  /** Товар (Product.id). null — новая модель, создаётся прямо из поставки. */
  productId: string | null;
  /**
   * Новая модель: название и категория. `categoryId` — уже заведённая категория; нет — `categoryName`, такая
   * категория заведётся вместе с поставкой.
   */
  newProduct: { name: string; categoryId: string | null; categoryName?: string };
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
