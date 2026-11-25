import { newId } from "@/shared/lib/id";
import { compareSizes, DEFAULT_THRESHOLDS, newCategoryId, newModel } from "@/shared/stock";
import type { Batch, Category, DeliveryInput, DeliveryLine, DeliveryPack, Model, Pack, SizeStock } from "@/shared/stock";

// Логика поставок. Описание — docs/WAREHOUSE.md, раздел «Поставки».

export { newId };

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
export function categorySizes(models: Model[], categoryId: string | null) {
  const all = models.filter((m) => m.categoryId === categoryId).flatMap((m) => m.sizes.map((s) => s.size));
  return [...new Set(all)].sort(compareSizes);
}

/** Категория новой модели в строке поставки: уже заведённая или новая по названию. */
export const lineCategory = (line: DeliveryLine, categories: Category[]) =>
  categories.find((c) => c.id === line.newProduct.categoryId);

/** Что написано в поле «Категория» у новой модели. */
export const lineCategoryText = (line: DeliveryLine, categories: Category[]) =>
  line.newProduct.categoryName ?? lineCategory(line, categories)?.name ?? "";

/** Вписали категорию: совпала с заведённой (без учёта регистра) — ссылка на неё, иначе заведётся новая. */
export function setLineCategory(line: DeliveryLine, text: string, categories: Category[]): DeliveryLine {
  const same = categories.find((c) => c.name.trim().toLowerCase() === text.trim().toLowerCase());
  return { ...line, newProduct: { ...line.newProduct, categoryId: same?.id ?? null, categoryName: text } };
}

export function emptyLine(model?: Model): DeliveryLine {
  return {
    key: newId(),
    productId: model?.id ?? null,
    newProduct: { name: "", categoryId: null },
    total: "",
    step: 1,
    // Размеры модели в её порядке, без скрытых.
    sizes: model ? model.sizes.map((s) => s.size).filter((s) => !model.hiddenSizes?.includes(s)) : [],
    qty: {},
    // Пачки модели сразу в карточке, по нулям.
    packs: (model?.packs ?? []).map((p) => ({ ...p, count: 0 })),
  };
}

// Пачки: по одной штуке каждого размера из состава. В размер приходит «пачки + отдельные штуки».
export const linePacks = (line: DeliveryLine): DeliveryPack[] => line.packs ?? [];
/** Сколько штук размера дают пачки: из пачек их не убрать, это минимум размера. */
export const packQty = (line: DeliveryLine, size: string) =>
  linePacks(line).reduce((sum, p) => sum + (p.sizes.includes(size) ? p.count : 0), 0);
/** Всего штук размера: пачки + отдельные. */
export const sizeQty = (line: DeliveryLine, size: string) => packQty(line, size) + (line.qty[size] ?? 0);

export const lineQty = (line: DeliveryLine) => line.sizes.reduce((sum, s) => sum + sizeQty(line, s), 0);

/** Что мешает собрать пачку; null — можно. */
export function packProblem(line: DeliveryLine, models: Model[], name: string, sizes: string[]): string | null {
  const model = models.find((m) => m.id === line.productId);
  const taken = [...(model?.packs ?? []), ...linePacks(line)].map((p) => p.name.toLowerCase());
  if (!name.trim()) return "Впишите название пачки";
  if (taken.includes(name.trim().toLowerCase())) return "Такая пачка уже есть";
  if (sizes.length < 2) return "Отметьте хотя бы два размера";
  return null;
}

/** Новая пачка в карточке: размеры в порядке карточки. */
export function addPack(line: DeliveryLine, name: string, sizes: string[]): DeliveryLine {
  const pack: DeliveryPack = { id: newId(), name: name.trim(), sizes: line.sizes.filter((s) => sizes.includes(s)), count: 0, fresh: true };
  return { ...line, packs: [...linePacks(line), pack] };
}

/** Пачки, которые надо сохранить у модели: собранные в поставке и которых у неё ещё нет. */
function packsToSave(model: Model, line: DeliveryLine): Pack[] {
  const have = model.packs ?? [];
  const fresh = linePacks(line)
    .filter((p) => p.fresh && !have.some((h) => h.id === p.id || h.name.toLowerCase() === p.name.toLowerCase()))
    .map(({ id, name, sizes }) => ({ id, name, sizes }));
  return [...have, ...fresh];
}
/** Сумма за поставку из поля ввода; NaN, если вписано не число. */
export const lineTotal = (line: DeliveryLine) => Number(line.total.replace(/\s/g, "").replace(",", "."));
/** Цена за штуку = сумма / штук, до копеек; 0, пока нет суммы или штук. */
export function unitPrice(line: DeliveryLine) {
  const total = lineTotal(line);
  const qty = lineQty(line);
  return qty > 0 && total > 0 ? Math.round((total / qty) * 100) / 100 : 0;
}

export function lineModelName(line: DeliveryLine, models: Model[]) {
  return line.productId ? (models.find((m) => m.id === line.productId)?.name ?? "") : line.newProduct.name.trim();
}

/** Что мешает добавить строку; пустой список — всё в порядке. */
export function lineProblems(line: DeliveryLine, models: Model[]): string[] {
  const problems: string[] = [];
  if (!line.productId) {
    const name = line.newProduct.name.trim();
    if (!name) problems.push("Впишите название модели");
    else {
      const same = models.find((m) => m.name.toLowerCase() === name.toLowerCase());
      if (same?.archived) problems.push("Такая модель есть в архиве — верните её в настройках склада");
      else if (same) problems.push("Такая модель уже есть, выберите её из списка");
    }
    if (!line.newProduct.categoryId && !line.newProduct.categoryName?.trim()) problems.push("Укажите категорию");
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
  const ids = input.lines.map((l) => l.productId).filter(Boolean);
  if (new Set(ids).size !== ids.length) problems.push("Одна модель выбрана дважды");
  const newNames = input.lines.filter((l) => !l.productId).map((l) => l.newProduct.name.trim().toLowerCase()).filter(Boolean);
  if (new Set(newNames).size !== newNames.length) problems.push("Две новые модели с одинаковым названием");
  return problems;
}

export const isInputReady = (input: DeliveryInput, models: Model[]) =>
  inputProblems(input).length === 0 && input.lines.every((l) => lineProblems(l, models).length === 0);

/** Поставки той же модели на ту же дату: возможно, это дубль. */
export function findDuplicate(line: DeliveryLine, date: string, models: Model[]) {
  const model = models.find((m) => m.id === line.productId);
  const existing = model?.batches.find((b) => !b.cancelledAt && b.date === date);
  if (!existing) return null;
  const qty = Object.fromEntries(existing.delivered.map((d) => [d.size, d.qty]));
  const sameQty =
    line.sizes.filter((s) => sizeQty(line, s) > 0).every((s) => qty[s] === sizeQty(line, s)) &&
    existing.delivered.every((d) => sizeQty(line, d.size) === d.qty);
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
  const model = models.find((m) => m.id === line.productId);
  const base = `${shortModelName(model?.name ?? line.newProduct.name)} ${formatDay(date)}`;
  return model ? uniqueBatchName(model, base) : base;
}

/**
 * Добавить поставки на склад: из каждой строки — своя поставка своей модели. Новая модель — новый товар каталога
 * (id из названия, поля бота пустые); новая категория по названию — тоже заводится.
 */
export function applyDelivery(
  state: { models: Model[]; categories: Category[] },
  input: DeliveryInput,
  now = new Date().toISOString(),
): { models: Model[]; categories: Category[] } {
  let next = [...state.models];
  let categories = state.categories;
  for (const line of input.lines) {
    let model = next.find((m) => m.id === line.productId);
    if (!model) {
      let category = categories.find((c) => c.id === line.newProduct.categoryId);
      if (!category) {
        const name = line.newProduct.categoryName?.trim() || "Без категории";
        category =
          categories.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
          { id: newCategoryId(name, categories), name, sizes: [], thresholds: DEFAULT_THRESHOLDS };
        if (!categories.includes(category)) categories = [...categories, category];
      }
      model = newModel(line.newProduct.name.trim(), category.id, [], next);
      next = [...next, model];
    }
    const current: Model = model;
    const delivered = line.sizes.filter((s) => sizeQty(line, s) > 0).map((s) => ({ size: s, qty: sizeQty(line, s) }));
    const usedPacks = linePacks(line).filter((p) => p.count > 0).map((p) => ({ name: p.name, count: p.count }));
    const batch: Batch = {
      id: newId(),
      productId: current.id,
      name: uniqueBatchName(current, `${shortModelName(current.name)} ${formatDay(input.date)}`),
      date: input.date,
      from: input.from.trim(),
      total: lineTotal(line),
      price: unitPrice(line),
      delivered,
      addedAt: now,
      ...(usedPacks.length ? { packs: usedPacks } : {}),
    };
    const sizes: SizeStock[] = current.sizes.map((s) => ({ ...s }));
    for (const d of delivered) {
      const existing = sizes.find((s) => s.size === d.size);
      if (existing) existing.stock = [...existing.stock, { batchId: batch.id, qty: d.qty }];
      else sizes.push({ size: d.size, stock: [{ batchId: batch.id, qty: d.qty }], units: [] });
    }
    // Пришли джинсы скрытого размера — размер снова показываем: скрытым может быть только пустой.
    const hiddenSizes = current.hiddenSizes?.filter((s) => !delivered.some((d) => d.size === s));
    const packs = packsToSave(current, line);
    const updated: Model = { ...current, batches: [...current.batches, batch], sizes, hiddenSizes, ...(packs.length ? { packs } : {}) };
    next = next.map((m) => (m.id === updated.id ? updated : m));
  }
  return { models: next, categories };
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

/**
 * Модель в сетке: не в архиве и не «пустышка», у которой все поставки отменены.
 * Новая модель без поставок (заведена в настройках) видна — с нулями.
 */
export const isModelVisible = (m: Model) =>
  !m.archived &&
  (m.batches.length === 0 || m.batches.some((b) => !b.cancelledAt) || m.sizes.some((s) => s.units.length > 0));
