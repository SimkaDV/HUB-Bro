import { newId } from "@/shared/lib/id";
import { createStore } from "@/shared/lib/store";
import { compareSizes, DEFAULT_THRESHOLDS } from "./stock";
import type { Category, DeliveryDraft, DisplaySettings, Model, SettingsLogEntry } from "./types";

// Склад нужен нескольким разделам: склад показывает и меняет остатки, комплектация резервирует джинсы под заказы.
// Поэтому само состояние живёт здесь, а действия экрана склада — в features/stock/store.ts.

// v5: чистый старт — пусто по умолчанию, старые (тестовые) данные не подхватываем.
// v4: номер заказа у джинсы — строка (номер Авито), резервы делает комплектация.
// v3: категории, отображение и журнал настроек. v2: сумма поставки и шаг в черновиках.
const STORAGE_KEY = "hubbro.stock.v5";

export type StockState = {
  models: Model[];
  drafts: DeliveryDraft[];
  categories: Category[];
  display: DisplaySettings;
  log: SettingsLogEntry[];
};

export const DEFAULT_DISPLAY: DisplaySettings = { showZeroOnTiles: true, showIncoming: true, tileRows: 2 };

/** Категории, которых ещё нет в списке, создаются по моделям: размеры — все размеры моделей категории. */
export function ensureCategories(categories: Category[], models: Model[]): Category[] {
  const missing = [...new Set(models.map((m) => m.category))].filter((name) => !categories.some((c) => c.name === name));
  return [
    ...categories,
    ...missing.map((name) => ({
      id: newId(),
      name,
      sizes: [...new Set(models.filter((m) => m.category === name).flatMap((m) => m.sizes.map((s) => s.size)))].sort(
        compareSizes,
      ),
      thresholds: DEFAULT_THRESHOLDS,
    })),
  ];
}

const emptyState = (): StockState => ({
  models: [],
  drafts: [],
  categories: [],
  display: DEFAULT_DISPLAY,
  log: [],
});

export const stockStore = createStore<StockState>(STORAGE_KEY, emptyState);

export const useStock = stockStore.use;
