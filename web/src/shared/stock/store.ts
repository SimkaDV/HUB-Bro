import { useSyncExternalStore } from "react";
import { slugId } from "@/shared/lib/id";
import { sameData } from "@/shared/lib/same";
import { createFileStore, isObj } from "@/shared/lib/store";
import { compareSizes, isSizeNumber } from "./stock";
import type {
  Batch,
  Category,
  DeliveryDraft,
  DeliveryLine,
  DisplaySettings,
  Model,
  Product,
  SettingsLogEntry,
  SizeLabel,
  SizeStock,
} from "./types";

// Склад нужен нескольким разделам: склад показывает и меняет остатки, комплектация резервирует джинсы под заказы.
// Поэтому само состояние живёт здесь, а действия экрана склада — в features/stock/store.ts.
//
// На сервере данных склад — четыре файла формата avito v1 (avito/data/schema/FORMAT.md):
//   catalog.json — шкала размеров, категории, товары (вместе с полями бота, которые кабинет только переносит);
//   stock.json   — поставки и остатки по товарам и размерам;
//   hub.json     — отображение склада и черновики поставок;
//   log.json     — общая история изменений (кабинет и бот).
// Экранам удобнее «модель» = товар + его поставки и остатки, поэтому stockStore склеивает файлы при чтении
// и разбирает обратно при записи: каталог пишется, только если поменялся товар, категория или шкала.

export type CatalogData = { sizeScale: SizeLabel[]; categories: Category[]; products: Product[] };
export type StockData = { batches: Batch[]; products: Record<string, Record<string, Omit<SizeStock, "size">>> };
export type HubData = { display: DisplaySettings; drafts: DeliveryDraft[] };
export type LogData = { entries: SettingsLogEntry[] };

/** Сколько записей истории хранится (FORMAT.md, log.json). */
export const LOG_LIMIT = 2000;

export const DEFAULT_DISPLAY: DisplaySettings = { showZeroOnTiles: true, showIncoming: true, tileRows: 2 };

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export const catalogStore = createFileStore<CatalogData>(
  "catalog",
  1,
  () => ({ sizeScale: [], categories: [], products: [] }),
  {
    read: (r) => ({ sizeScale: list(r.sizeScale), categories: list(r.categories), products: list(r.products) }),
    write: (s) => ({ ...s }),
  },
);

export const stockFileStore = createFileStore<StockData>("stock", 1, () => ({ batches: [], products: {} }), {
  read: (r) => ({ batches: list(r.batches), products: isObj(r.products) ? (r.products as StockData["products"]) : {} }),
  write: (s) => ({ ...s }),
});

type OldLine = DeliveryLine & { modelId?: string | null; newModel?: { name: string; category: string } };

/** Черновик из старого кабинета (modelId / newModel) — к полям v1. */
function readLine(raw: OldLine): DeliveryLine {
  const { modelId, newModel, ...line } = raw;
  return {
    ...line,
    productId: line.productId ?? modelId ?? null,
    newProduct: line.newProduct ?? { name: newModel?.name ?? "", categoryId: null, categoryName: newModel?.category },
  };
}

export const hubStore = createFileStore<HubData>("hub", 1, () => ({ display: DEFAULT_DISPLAY, drafts: [] }), {
  read: (r) => ({
    display: isObj(r.display) ? { ...DEFAULT_DISPLAY, ...(r.display as Partial<DisplaySettings>) } : DEFAULT_DISPLAY,
    drafts: list<DeliveryDraft>(r.drafts).map((d) => ({ ...d, lines: list<OldLine>(d.lines).map(readLine) })),
  }),
  write: (s) => ({ ...s }),
});

export const logStore = createFileStore<LogData>("log", 1, () => ({ entries: [] }), {
  read: (r) => ({ entries: list(r.entries) }),
  write: (s) => ({ ...s }),
});

// ---------- склейка и разбор ----------

/** Модели = товары каталога + их поставки и остатки. Порядок — как в каталоге. */
function joinModels(catalog: CatalogData, stock: StockData): Model[] {
  const batches = new Map<string, Batch[]>();
  for (const b of stock.batches) batches.set(b.productId, [...(batches.get(b.productId) ?? []), b]);
  return catalog.products.map((p) => {
    const { sizes = [], ...rest } = p;
    const own = stock.products[p.id] ?? {};
    // Остатки размера, которого нет в списке товара, не теряем — показываем в конце.
    const extra = Object.keys(own).filter((s) => !sizes.includes(s)).sort(compareSizes);
    return {
      ...rest,
      batches: batches.get(p.id) ?? [],
      sizes: [...sizes, ...extra].map((size) => ({ ...(own[size] ?? { stock: [], units: [] }), size })),
    };
  });
}

/** Поля бота, без которых товар не пройдёт проверку формата. Есть — не трогаем. */
function withBotFields(p: Product): Product {
  if (p.match && p.description && p.photos && p.availability) return p;
  return {
    ...p,
    match: p.match ?? [],
    description: p.description ?? { material: null, composition: null, density: null, legOpening: null },
    photos: p.photos ?? [],
    availability: p.availability ?? { inStock: true, outSizes: [] },
  };
}

/** Новые размеры попадают в шкалу магазина без буквы — на своё место по номеру. */
function extendScale(scale: SizeLabel[], sizes: string[]): SizeLabel[] {
  const have = new Set(scale.map((s) => s.size));
  const missing = [...new Set(sizes)].filter((s) => isSizeNumber(s) && !have.has(s));
  if (missing.length === 0) return scale;
  const next = [...scale];
  for (const size of missing.sort(compareSizes)) {
    const at = next.findIndex((s) => compareSizes(s.size, size) > 0);
    next.splice(at < 0 ? next.length : at, 0, { size, label: "" });
  }
  return next;
}

function toCatalog(state: StockState, prev: CatalogData): CatalogData {
  const before = new Map(prev.products.map((p) => [p.id, p]));
  const products = state.models.map((m) => {
    const { batches: _batches, sizes, ...rest } = m;
    const p = withBotFields({ ...rest, sizes: sizes.map((s) => s.size) });
    const old = before.get(p.id);
    return old && sameData(old, p) ? old : p;
  });
  const used = [
    ...products.flatMap((p) => [...p.sizes, ...(p.hiddenSizes ?? []), ...(p.packs ?? []).flatMap((k) => k.sizes)]),
    ...state.categories.flatMap((c) => c.sizes),
  ];
  const sizeScale = extendScale(state.sizeScale, used);
  const same =
    sizeScale === prev.sizeScale &&
    state.categories === prev.categories &&
    products.length === prev.products.length &&
    products.every((p, i) => p === prev.products[i]);
  return same ? prev : { ...prev, sizeScale, categories: state.categories, products };
}

function toStock(models: Model[], prev: StockData): StockData {
  const ids = new Set(models.map((m) => m.id));
  const products: StockData["products"] = {};
  // Остатки товаров, которых нет среди моделей (убрали из каталога не здесь), не теряем.
  for (const [pid, sizes] of Object.entries(prev.products)) if (!ids.has(pid)) products[pid] = sizes;
  for (const m of models) {
    const own: StockData["products"][string] = {};
    for (const { size, ...rec } of m.sizes) if (rec.stock.length || rec.units.length) own[size] = rec;
    if (Object.keys(own).length === 0) continue;
    products[m.id] = prev.products[m.id] && sameData(prev.products[m.id], own) ? prev.products[m.id] : own;
  }

  const fresh = new Map<string, Batch>();
  for (const m of models) for (const b of m.batches) fresh.set(b.id, b.productId === m.id ? b : { ...b, productId: m.id });
  const prevIds = new Set(prev.batches.map((b) => b.id));
  const batches = [
    // Порядок поставок в файле сохраняем; поставки товаров, которых нет среди моделей, — как были.
    ...prev.batches
      .filter((b) => fresh.has(b.id) || !ids.has(b.productId))
      .map((b) => {
        const next = fresh.get(b.id);
        return !next || sameData(next, b) ? b : next;
      }),
    ...[...fresh.values()].filter((b) => !prevIds.has(b.id)),
  ];

  const sameProducts =
    Object.keys(products).length === Object.keys(prev.products).length &&
    Object.entries(products).every(([pid, v]) => prev.products[pid] === v);
  const sameBatches = batches.length === prev.batches.length && batches.every((b, i) => b === prev.batches[i]);
  if (sameProducts && sameBatches) return prev;
  return { ...prev, batches: sameBatches ? prev.batches : batches, products: sameProducts ? prev.products : products };
}

// ---------- состояние склада для экранов ----------

export type StockState = {
  models: Model[];
  categories: Category[];
  /** Шкала размеров магазина: номер → буква. Новые размеры добавляются сами (без буквы). */
  sizeScale: SizeLabel[];
  drafts: DeliveryDraft[];
  display: DisplaySettings;
  /** Общая история, новые сверху. */
  log: SettingsLogEntry[];
};

type Parts = { catalog: CatalogData; stock: StockData; hub: HubData; log: LogData };

const parts = (): Parts => ({
  catalog: catalogStore.get(),
  stock: stockFileStore.get(),
  hub: hubStore.get(),
  log: logStore.get(),
});

let cached: { parts: Parts; state: StockState } | null = null;

function get(): StockState {
  const p = parts();
  const c = cached;
  if (c && c.parts.catalog === p.catalog && c.parts.stock === p.stock && c.parts.hub === p.hub && c.parts.log === p.log) {
    return c.state;
  }
  const sameModels = c !== null && c.parts.catalog === p.catalog && c.parts.stock === p.stock;
  const state: StockState = {
    models: sameModels ? c.state.models : joinModels(p.catalog, p.stock),
    categories: p.catalog.categories,
    sizeScale: p.catalog.sizeScale,
    drafts: p.hub.drafts,
    display: p.hub.display,
    log: p.log.entries,
  };
  cached = { parts: p, state };
  return state;
}

const listeners = new Set<() => void>();
let batching = false;
let wired = false;
const notify = () => listeners.forEach((l) => l());

/** Правка склада: разбирается по файлам. Сначала каталог, потом остатки (сначала то, на что ссылаются). */
function set(update: (s: StockState) => StockState) {
  const cur = get();
  const next = update(cur);
  if (next === cur) return;
  const p = cached!.parts;
  const touchesCatalog = next.models !== cur.models || next.categories !== cur.categories || next.sizeScale !== cur.sizeScale;
  const catalog = touchesCatalog ? toCatalog(next, p.catalog) : p.catalog;
  const stock = next.models !== cur.models ? toStock(next.models, p.stock) : p.stock;
  const hub =
    next.drafts !== cur.drafts || next.display !== cur.display ? { ...p.hub, drafts: next.drafts, display: next.display } : p.hub;
  const log = next.log !== cur.log ? { ...p.log, entries: next.log.slice(0, LOG_LIMIT) } : p.log;
  // Четыре файла меняются одним действием: подписчики склада узнают об этом один раз, когда все на месте.
  batching = true;
  try {
    catalogStore.set(() => catalog);
    stockFileStore.set(() => stock);
    hubStore.set(() => hub);
    logStore.set(() => log);
  } finally {
    batching = false;
  }
  notify();
}

function subscribe(listener: () => void) {
  if (!wired) {
    wired = true;
    for (const s of [catalogStore, stockFileStore, hubStore, logStore]) s.subscribe(() => !batching && notify());
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Склад целиком (склеенный из catalog + stock + hub + log). Синхронизируются сами файлы, не он. */
export const stockStore = { get, set, subscribe };

export const useStock = () => useSyncExternalStore(subscribe, get);

// ---------- новые товары и категории ----------

/** Новый товар каталога (FORMAT.md, Product): id из названия, поля бота пустые. */
export function newModel(name: string, categoryId: string, sizes: string[], taken: { id: string }[]): Model {
  return {
    id: slugId(name, taken.map((m) => m.id)),
    name,
    categoryId,
    batches: [],
    sizes: sizes.map((size) => ({ size, stock: [], units: [] })),
    match: [],
    description: { material: null, composition: null, density: null, legOpening: null },
    photos: [],
    chart: null,
    availability: { inStock: true, outSizes: [] },
  };
}

/** id новой категории — из названия, как у товаров. */
export const newCategoryId = (name: string, categories: Category[]) => slugId(name, categories.map((c) => c.id));

/** Запись в общую историю от кабинета. */
export const hubLogEntry = (id: string, text: string): SettingsLogEntry => ({
  id,
  at: new Date().toISOString(),
  source: "hub",
  text,
});
