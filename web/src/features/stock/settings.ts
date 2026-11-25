import { createContext, useContext } from "react";
import { DEFAULT_DISPLAY, DEFAULT_THRESHOLDS, hasBotData, onHand } from "@/shared/stock";

export { hasBotData } from "@/shared/stock";
import type { Category, DisplaySettings, Model, Thresholds } from "@/shared/stock";

// Настройки склада: пороги, архив, скрытые размеры, категории. Описание — docs/WAREHOUSE.md, «Настройки».

export { DEFAULT_DISPLAY } from "@/shared/stock";

/** Пороги модели: свои, если заданы, иначе категории, иначе по умолчанию. */
export function resolveThresholds(model: Model, categories: Category[]): Thresholds {
  return model.thresholds ?? categories.find((c) => c.id === model.categoryId)?.thresholds ?? DEFAULT_THRESHOLDS;
}

export const formatThresholds = (t: Thresholds) => `${t.lowMax} / ${t.midMax}`;

export function thresholdsProblem(t: Thresholds): string | null {
  if (!Number.isInteger(t.lowMax) || !Number.isInteger(t.midMax) || t.lowMax < 1) return "Впишите целые числа от 1";
  if (t.midMax <= t.lowMax) return "«Норм до» должно быть больше, чем «Мало до»";
  return null;
}

/** Скрыть размер можно, только когда на нём ничего нет: ни на полке, ни в заказах. */
export function canHideSize(model: Model, size: string) {
  const s = model.sizes.find((x) => x.size === size);
  return !s || (onHand(s) === 0 && s.units.length === 0);
}

/**
 * Удалить размер можно, только если джинс этого размера никогда не было и бот не держит на нём размерную сетку
 * (строка сетки ссылается на размер товара). Иначе — скрыть.
 */
export function canDeleteSize(model: Model, size: string) {
  const s = model.sizes.find((x) => x.size === size);
  const everDelivered = model.batches.some((b) => b.delivered.some((d) => d.size === size));
  const inBotTable = Boolean(model.sizeTable?.rows && size in model.sizeTable.rows);
  return !everDelivered && !inBotTable && (!s || (s.stock.length === 0 && s.units.length === 0));
}


/** Удалить модель можно, только если у неё не было ни одной поставки и заказа и нет данных бота. Иначе — в архив. */
export const canDeleteModel = (m: Model) =>
  m.batches.length === 0 && m.sizes.every((s) => s.units.length === 0) && !hasBotData(m);

/** Удалить категорию можно, только если в ней нет моделей (в том числе в архиве). */
export const canDeleteCategory = (c: Category, models: Model[]) => !models.some((m) => m.categoryId === c.id);

/** Название категории модели (для подписей). */
export const categoryName = (m: Model, categories: Category[]) =>
  categories.find((c) => c.id === m.categoryId)?.name ?? "Без категории";

export const nameTaken = (name: string, names: string[]) =>
  names.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());

/** Пороги и отображение для компонентов склада — без проброса через все пропсы. */
export type StockSettings = {
  thresholdsFor: (m: Model) => Thresholds;
  display: DisplaySettings;
};

export const StockSettingsContext = createContext<StockSettings>({
  thresholdsFor: () => DEFAULT_THRESHOLDS,
  display: DEFAULT_DISPLAY,
});

export const useStockSettings = () => useContext(StockSettingsContext);

/** Код модели на бирке: заглавные буквы и цифры, до 4 знаков. */
export const normalizeCode = (v: string) => v.toUpperCase().replace(/[^0-9A-ZА-ЯЁ]/g, "").slice(0, 4);
