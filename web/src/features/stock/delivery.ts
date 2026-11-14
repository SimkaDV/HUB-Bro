import { compareSizes } from "./stock";
import type { Batch, DeliveryInput, DeliveryLine, Model, SizeStock } from "./types";

// Логика поставок. Описание — docs/WAREHOUSE.md, раздел «Поставки».

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 2026-11-14 → 14.11 */
export const formatDay = (iso: string) => iso.slice(8, 10) + "." + iso.slice(5, 7);

/** «Джинсы Клёш» → «Клёш»: так называем поставки. */
export function shortModelName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : name.trim();
}

/** Размеры, которые уже встречаются в категории: подсказка для новой модели. */
export function categorySizes(models: Model[], category: string) {
  const all = models.filter((m) => m.category === category).flatMap((m) => m.sizes.map((s) => s.size));
  return [...new Set(all)].sort(compareSizes);
}

export function emptyLine(model?: Model): DeliveryLine {
  return {
    key: newId(),
    modelId: model?.id ?? null,
    newModel: { name: "", category: "" },
    total: "",
    step: 1,
    sizes: model ? model.sizes.map((s) => s.size).sort(compareSizes) : [],
    qty: {},
  };
}

export const lineQty = (line: DeliveryLine) => line.sizes.reduce((sum, s) => sum + (line.qty[s] ?? 0), 0);
/** Сумма за поставку из поля ввода; NaN, если вписано не число. */
export const lineTotal = (line: DeliveryLine) => Number(line.total.replace(/\s/g, "").replace(",", "."));
/** Цена за штуку = сумма / штук, до копеек; 0, пока нет суммы или штук. */
export function unitPrice(line: DeliveryLine) {
  const total = lineTotal(line);
  const qty = lineQty(line);
  return qty > 0 && total > 0 ? Math.round((total / qty) * 100) / 100 : 0;
}

export function lineModelName(line: DeliveryLine, models: Model[]) {
  return line.modelId ? (models.find((m) => m.id === line.modelId)?.name ?? "") : line.newModel.name.trim();
}

/** Что мешает добавить строку; пустой список — всё в порядке. */
export function lineProblems(line: DeliveryLine, models: Model[]): string[] {
  const problems: string[] = [];
  if (!line.modelId) {
    const name = line.newModel.name.trim();
    if (!name) problems.push("Впишите название модели");
    else if (models.some((m) => m.name.toLowerCase() === name.toLowerCase())) problems.push("Такая модель уже есть, выберите её из списка");
    if (!line.newModel.category.trim()) problems.push("Укажите категорию");
  }
  const total = lineTotal(line);
  if (!line.total.trim() || !Number.isFinite(total) || total <= 0) problems.push("Впишите сумму поставки");
  if (lineQty(line) === 0) problems.push("Добавьте хотя бы одну штуку");
  return problems;
}

export function inputProblems(input: DeliveryInput): string[] {
  const problems: string[] = [];
  if (!input.date) problems.push("Укажите дату");
  if (!input.from.trim()) problems.push("Укажите, откуда поставка");
  if (input.lines.length === 0) problems.push("Выберите модель");
  const ids = input.lines.map((l) => l.modelId).filter(Boolean);
  if (new Set(ids).size !== ids.length) problems.push("Одна модель выбрана дважды");
  const newNames = input.lines.filter((l) => !l.modelId).map((l) => l.newModel.name.trim().toLowerCase()).filter(Boolean);
  if (new Set(newNames).size !== newNames.length) problems.push("Две новые модели с одинаковым названием");
  return problems;
}

export const isInputReady = (input: DeliveryInput, models: Model[]) =>
  inputProblems(input).length === 0 && input.lines.every((l) => lineProblems(l, models).length === 0);

/** Поставки той же модели на ту же дату: возможно, это дубль. */
export function findDuplicate(line: DeliveryLine, date: string, models: Model[]) {
  const model = models.find((m) => m.id === line.modelId);
  const existing = model?.batches.find((b) => !b.cancelledAt && b.date === date);
  if (!existing) return null;
  const qty = Object.fromEntries(existing.delivered.map((d) => [d.size, d.qty]));
  const sameQty =
    line.sizes.filter((s) => (line.qty[s] ?? 0) > 0).every((s) => qty[s] === line.qty[s]) &&
    existing.delivered.every((d) => line.qty[d.size] === d.qty);
  return { batch: existing, sameQty };
}

export function uniqueBatchName(model: Model, base: string) {
  const names = new Set(model.batches.map((b) => b.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

/** Как будет называться поставка этой строки: «Клёш 14.11», при повторе — «Клёш 14.11 (2)». */
export function batchNameFor(line: DeliveryLine, date: string, models: Model[]) {
  const model = models.find((m) => m.id === line.modelId);
  const base = `${shortModelName(model?.name ?? line.newModel.name)} ${formatDay(date)}`;
  return model ? uniqueBatchName(model, base) : base;
}

/** Добавить поставки на склад: из каждой строки — своя поставка своей модели. */
export function applyDelivery(models: Model[], input: DeliveryInput, now = new Date().toISOString()): Model[] {
  let next = [...models];
  for (const line of input.lines) {
    let model = next.find((m) => m.id === line.modelId);
    if (!model) {
      model = { id: newId(), name: line.newModel.name.trim(), category: line.newModel.category.trim(), batches: [], sizes: [] };
      next = [...next, model];
    }
    const delivered = line.sizes.filter((s) => (line.qty[s] ?? 0) > 0).map((s) => ({ size: s, qty: line.qty[s] }));
    const batch: Batch = {
      id: newId(),
      name: uniqueBatchName(model, `${shortModelName(model.name)} ${formatDay(input.date)}`),
      date: input.date,
      from: input.from.trim(),
      total: lineTotal(line),
      price: unitPrice(line),
      delivered,
      addedAt: now,
    };
    const sizes: SizeStock[] = model.sizes.map((s) => ({ ...s }));
    for (const d of delivered) {
      const existing = sizes.find((s) => s.size === d.size);
      if (existing) existing.stock = [...existing.stock, { batchId: batch.id, qty: d.qty }];
      else sizes.push({ size: d.size, stock: [{ batchId: batch.id, qty: d.qty }], units: [] });
    }
    const updated = { ...model, batches: [...model.batches, batch], sizes };
    next = next.map((m) => (m.id === updated.id ? updated : m));
  }
  return next;
}

/** Отменить можно, пока из поставки ничего не ушло: всё на полке, ни одного заказа. */
export function canCancel(model: Model, batch: Batch) {
  if (batch.cancelledAt) return false;
  const onShelf = (size: string) =>
    model.sizes.find((s) => s.size === size)?.stock.find((x) => x.batchId === batch.id)?.qty ?? 0;
  const used = model.sizes.some((s) => s.units.some((u) => u.batchId === batch.id));
  return !used && batch.delivered.every((d) => onShelf(d.size) === d.qty);
}

export function cancelDelivery(models: Model[], modelId: string, batchId: string, now = new Date().toISOString()) {
  return models.map((m) => {
    if (m.id !== modelId) return m;
    const batch = m.batches.find((b) => b.id === batchId);
    if (!batch || !canCancel(m, batch)) return m;
    const deliveredSizes = new Set(batch.delivered.map((d) => d.size));
    const sizes = m.sizes
      .map((s) => ({ ...s, stock: s.stock.filter((x) => x.batchId !== batchId) }))
      // Размер, который появился только с этой поставкой, убираем вместе с ней.
      .filter((s) => !deliveredSizes.has(s.size) || s.stock.length > 0 || s.units.length > 0);
    return {
      ...m,
      sizes,
      batches: m.batches.map((b) => (b.id === batchId ? { ...b, cancelledAt: now } : b)),
    };
  });
}

/** Модель без живых поставок и заказов (например, все поставки отменены) в сетке не показываем. */
export const isModelVisible = (m: Model) =>
  m.batches.some((b) => !b.cancelledAt) || m.sizes.some((s) => s.units.length > 0);
