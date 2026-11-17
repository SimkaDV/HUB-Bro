// Настройки принтера Xprinter XP-365B. Описание — docs/SETTINGS.md, «Принтер».
// Их читают настройки (форма, пробная печать) и пульт (печать партий), поэтому они в shared.
import { createStore } from "@/shared/lib/store";

export const PRINTER_MODEL = "Xprinter XP-365B";

/** Точек на миллиметр: 203 dpi ≈ 8 точек/мм. Одна точка холста = одна точка на бумаге. */
export const DOTS_PER_MM = 8;

/** Раскладка бирки: «С названием» — лого и название товара рядом; «Без названия» — лого по центру. */
export type LabelLayout = "full" | "compact";

export const LABEL_LAYOUTS: { id: LabelLayout; label: string }[] = [
  { id: "full", label: "С названием" },
  { id: "compact", label: "Без названия" },
];

/**
 * Как бирка ложится на ленту. Сама бирка всегда вертикальная (40×58).
 * vertical — лента идёт широкой стороной поперёк: перед печатью поворачиваем картинку на 90°.
 * horizontal — картинка уходит как нарисована, без поворота.
 */
export type PrintOrientation = "vertical" | "horizontal";

export const ORIENTATIONS: { id: PrintOrientation; label: string }[] = [
  { id: "vertical", label: "Вертикальная" },
  { id: "horizontal", label: "Горизонтальная" },
];

export type PrinterSettings = {
  /** Ориентация печати: поворачивать ли бирку на 90° под ленту. */
  orientation: PrintOrientation;
  /** Какую раскладку печатаем. */
  layout: LabelLayout;
  labelWidth: number;
  labelHeight: number;
  /** Зазор между бирками на ленте. */
  gap: number;
  /** Плотность (нагрев) 0–15: светлая печать — прибавить. */
  density: number;
  /** Скорость, дюймов в секунду. */
  speed: number;
  /** Повернуть бирку на 180°, если выходит вверх ногами. */
  flip: boolean;
  savedAt?: string;
};

export const DEFAULT_PRINTER: PrinterSettings = {
  layout: "full",
  orientation: "vertical",
  labelWidth: 40,
  labelHeight: 58,
  gap: 2,
  density: 8,
  speed: 4,
  flip: false,
};

/** Что умеет XP-365B: ширина бирки 20–80 мм, 203 dpi, до 5 дюймов в секунду. */
export const PRINTER_LIMITS = {
  labelWidth: { min: 20, max: 80 },
  labelHeight: { min: 10, max: 200 },
  gap: { min: 0, max: 10 },
  density: { min: 0, max: 15 },
  speed: { min: 2, max: 5 },
} as const;

export type PrinterNumberKey = keyof typeof PRINTER_LIMITS;

// v3: чистый старт — старые настройки не тянем. v2: бирка 40×58 и раскладка (в v1 было 80×50).
const STORAGE_KEY = "hubbro.printer.v3";

export const printerStore = createStore<PrinterSettings>(STORAGE_KEY, () => DEFAULT_PRINTER);

export const usePrinterSettings = printerStore.use;

export function savePrinter(printer: Omit<PrinterSettings, "savedAt">) {
  printerStore.set(() => ({ ...printer, savedAt: new Date().toISOString() }));
}

export function resetPrinter() {
  printerStore.set(() => DEFAULT_PRINTER);
}

/** Числа вне границ принтера — такие настройки не сохраняем и не печатаем. */
export function outOfRange(s: Pick<PrinterSettings, PrinterNumberKey | "orientation">): PrinterNumberKey[] {
  return (Object.keys(PRINTER_LIMITS) as PrinterNumberKey[]).filter((k) => {
    const { min, max } = PRINTER_LIMITS[k];
    if (!Number.isFinite(s[k]) || s[k] < min || s[k] > max) return true;
    // Повёрнутая бирка идёт высотой поперёк ленты — тогда высота упирается в ширину печати.
    return k === "labelHeight" && s.orientation === "vertical" && s[k] > PRINTER_LIMITS.labelWidth.max;
  });
}

/** Размер бирки на ленте, мм: поперёк и вдоль. Повёрнутая — меняются местами. */
export function paperSize(s: Pick<PrinterSettings, "labelWidth" | "labelHeight" | "orientation">) {
  return s.orientation === "vertical"
    ? { across: s.labelHeight, along: s.labelWidth }
    : { across: s.labelWidth, along: s.labelHeight };
}
