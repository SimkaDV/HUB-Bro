// Склад нужен нескольким разделам (склад, комплектация), поэтому типы, расчёты и состояние живут в shared.
// Описание — docs/WAREHOUSE.md
export * from "./types";
export * from "./stock";
export { DEFAULT_DISPLAY, ensureCategories, stockStore, useStock, type StockState } from "./store";
