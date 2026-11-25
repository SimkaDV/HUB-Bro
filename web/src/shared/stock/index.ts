// Склад нужен нескольким разделам (склад, комплектация), поэтому типы, расчёты и состояние живут в shared.
// Описание — docs/WAREHOUSE.md; формат файлов — avito/data/schema/FORMAT.md
export * from "./types";
export * from "./stock";
export {
  catalogStore,
  DEFAULT_DISPLAY,
  hubLogEntry,
  hubStore,
  LOG_LIMIT,
  logStore,
  newCategoryId,
  newModel,
  stockFileStore,
  stockStore,
  useStock,
  type StockState,
} from "./store";
