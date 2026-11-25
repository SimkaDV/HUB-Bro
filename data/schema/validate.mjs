// Проверка формата данных avito (data/schema/FORMAT.md). Без зависимостей.
// validate(key, value, others?) → { errors: string[], warnings: string[] }
//   errors   — данные не по формату, сервер такую запись не примет (422);
//   warnings — ссылки на другие файлы, которых пока нет (например, остатки товара, которого нет в каталоге):
//              запись принимается, потому что файлы сохраняются по очереди.
// others — { [key]: value } уже сохранённые остальные файлы, для проверки ссылок.

export const VERSION = {
  catalog: 1,
  stock: 1,
  orders: 1,
  listings: 1,
  printBatches: 1,
  shop: 1,
  hub: 1,
  log: 1,
};
export const KEYS = Object.keys(VERSION);

export const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const CODE = /^[0-9A-ZА-ЯЁ]{1,4}$/;
export const FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const UNIT_STATUS = ["reserve", "returnStock", "sent", "delivered", "returnTransit"];
const SERVICES = ["cdek", "avito", "post", "yandex", "fivepost", "dpd"];
const ORDER_STATUS = [
  "ordered", "packed", "sent", "inTransit", "arrived", "completed",
  "cancelled", "returnTransit", "returnCheck", "returnStock", "defect",
];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);
const isIso = (v) => isStr(v) && !Number.isNaN(Date.parse(v));

class Check {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }
  err(path, msg) {
    if (this.errors.length < 200) this.errors.push(`${path}: ${msg}`);
  }
  warn(path, msg) {
    if (this.warnings.length < 200) this.warnings.push(`${path}: ${msg}`);
  }
  need(cond, path, msg) {
    if (!cond) this.err(path, msg);
    return cond;
  }
  obj(v, path) {
    return this.need(isObj(v), path, "нужен объект");
  }
  arr(v, path) {
    return this.need(Array.isArray(v), path, "нужен массив");
  }
  str(v, path, { empty = false } = {}) {
    return this.need(isStr(v) && (empty || v.trim() !== ""), path, empty ? "нужна строка" : "нужна непустая строка");
  }
  optStr(v, path) {
    return v === undefined || v === null || this.str(v, path, { empty: true });
  }
  num(v, path) {
    return this.need(isNum(v), path, "нужно число");
  }
  bool(v, path) {
    return this.need(typeof v === "boolean", path, "нужно true/false");
  }
  iso(v, path) {
    return this.need(isIso(v), path, "нужна дата-время ISO");
  }
  unique(list, path, what, norm = (x) => x) {
    const seen = new Set();
    for (const x of list) {
      const k = norm(x);
      if (seen.has(k)) this.err(path, `${what} повторяется: ${x}`);
      seen.add(k);
    }
  }
}

function header(c, key, v) {
  if (!c.obj(v, key)) return false;
  c.need(v.format === key, `${key}.format`, `должно быть "${key}"`);
  c.need(v.version === VERSION[key], `${key}.version`, `поддерживается только версия ${VERSION[key]}`);
  return true;
}

function thresholds(c, t, path) {
  if (!c.obj(t, path)) return;
  c.need(isInt(t.lowMax) && t.lowMax >= 1, `${path}.lowMax`, "целое ≥ 1");
  c.need(isInt(t.midMax) && t.midMax > t.lowMax, `${path}.midMax`, "целое больше lowMax");
}

function sizeList(c, list, path, scale) {
  if (!c.arr(list, path)) return [];
  list.forEach((s, i) => {
    if (c.need(isStr(s), `${path}[${i}]`, "размер — строка")) {
      if (scale && !scale.has(s)) c.err(`${path}[${i}]`, `размера «${s}» нет в sizeScale`);
    }
  });
  c.unique(list, path, "размер");
  return list;
}

// ---------- catalog ----------

function catalog(c, v) {
  let scale = null;
  if (c.arr(v.sizeScale, "sizeScale")) {
    v.sizeScale.forEach((s, i) => {
      const p = `sizeScale[${i}]`;
      if (!c.obj(s, p)) return;
      c.need(isStr(s.size) && /^\d+$/.test(s.size), `${p}.size`, "номер размера строкой, «30»");
      c.str(s.label ?? "", `${p}.label`, { empty: true });
    });
    scale = new Set(v.sizeScale.map((s) => s?.size));
    c.unique(v.sizeScale.map((s) => s?.size), "sizeScale", "размер");
  }

  const catIds = new Set();
  if (c.arr(v.categories, "categories")) {
    v.categories.forEach((cat, i) => {
      const p = `categories[${i}]`;
      if (!c.obj(cat, p)) return;
      c.need(isStr(cat.id) && SLUG.test(cat.id), `${p}.id`, "slug: латиница, цифры, _ -, до 40");
      c.str(cat.name, `${p}.name`);
      sizeList(c, cat.sizes, `${p}.sizes`, scale);
      thresholds(c, cat.thresholds, `${p}.thresholds`);
      if (cat.labels !== undefined && c.obj(cat.labels, `${p}.labels`)) {
        for (const [size, label] of Object.entries(cat.labels)) {
          if (scale && !scale.has(size)) c.err(`${p}.labels["${size}"]`, `размера «${size}» нет в sizeScale`);
          c.need(isStr(label) && /^[0-9A-Z]{0,4}$/.test(label), `${p}.labels["${size}"]`, "буквы размера: 0-9 A-Z, до 4 знаков");
        }
      }
      catIds.add(cat.id);
    });
    c.unique(v.categories.map((x) => x?.id), "categories", "id");
    c.unique(v.categories.map((x) => x?.name), "categories", "название", (s) => String(s).toLowerCase());
  }

  if (c.arr(v.products, "products")) {
    const matchOwner = new Map();
    v.products.forEach((pr, i) => {
      const p = `products[${i}]`;
      if (!c.obj(pr, p)) return;
      c.need(isStr(pr.id) && SLUG.test(pr.id), `${p}.id`, "slug: латиница, цифры, _ -, до 40");
      c.str(pr.name, `${p}.name`);
      c.need(catIds.has(pr.categoryId), `${p}.categoryId`, `нет категории «${pr.categoryId}»`);
      if (pr.code !== undefined && pr.code !== null) c.need(isStr(pr.code) && CODE.test(pr.code), `${p}.code`, "1–4 знака 0-9 A-Z А-Я");
      if (pr.archived !== undefined) c.bool(pr.archived, `${p}.archived`);
      const own = new Set(sizeList(c, pr.sizes, `${p}.sizes`, scale));
      if (pr.hiddenSizes !== undefined) {
        sizeList(c, pr.hiddenSizes, `${p}.hiddenSizes`, scale).forEach((s) =>
          c.need(own.has(s), `${p}.hiddenSizes`, `скрыт размер «${s}», которого нет в sizes`));
      }
      if (pr.thresholds !== undefined) thresholds(c, pr.thresholds, `${p}.thresholds`);
      if (pr.packs !== undefined && c.arr(pr.packs, `${p}.packs`)) {
        pr.packs.forEach((pk, j) => {
          const q = `${p}.packs[${j}]`;
          if (!c.obj(pk, q)) return;
          c.str(pk.id, `${q}.id`);
          c.str(pk.name, `${q}.name`);
          sizeList(c, pk.sizes, `${q}.sizes`, scale);
        });
      }
      if (c.arr(pr.match, `${p}.match`)) {
        pr.match.forEach((w, j) => {
          if (!c.need(isStr(w) && w.trim() !== "" && w === w.toLowerCase(), `${p}.match[${j}]`, "слово в нижнем регистре")) return;
          if (matchOwner.has(w)) c.err(`${p}.match[${j}]`, `слово «${w}» уже у товара ${matchOwner.get(w)}`);
          matchOwner.set(w, pr.id);
        });
      }
      c.optStr(pr.botKey, `${p}.botKey`);
      if (c.obj(pr.description, `${p}.description`)) {
        for (const f of ["material", "composition", "density", "legOpening"]) c.optStr(pr.description[f], `${p}.description.${f}`);
        if (isStr(pr.description.material)) c.need(!pr.description.material.includes(":"), `${p}.description.material`, "без двоеточия");
      }
      if (pr.sizeTable !== undefined && pr.sizeTable !== null) sizeTable(c, pr.sizeTable, `${p}.sizeTable`, own);
      if (pr.sizeHW !== undefined && pr.sizeHW !== null) sizeHW(c, pr.sizeHW, `${p}.sizeHW`, scale);
      if (c.arr(pr.photos, `${p}.photos`)) {
        pr.photos.forEach((f, j) => c.need(isStr(f) && FILE.test(f) && !f.includes("size_chart"), `${p}.photos[${j}]`, "имя файла (без «size_chart»)"));
      }
      if (pr.chart !== undefined && pr.chart !== null) c.need(isStr(pr.chart) && FILE.test(pr.chart) && pr.chart.includes("size_chart"), `${p}.chart`, "имя файла с «size_chart»");
      if (c.obj(pr.availability, `${p}.availability`)) {
        c.bool(pr.availability.inStock, `${p}.availability.inStock`);
        sizeList(c, pr.availability.outSizes, `${p}.availability.outSizes`, scale);
      }
    });
    c.unique(v.products.map((x) => x?.id), "products", "id");
    c.unique(v.products.map((x) => x?.name), "products", "название", (s) => String(s).toLowerCase());
    c.unique(v.products.map((x) => x?.code).filter((x) => x), "products", "код на бирке");
  }
}

function sizeTable(c, t, path, own) {
  if (!c.obj(t, path)) return;
  const keys = new Set();
  if (c.arr(t.columns, `${path}.columns`)) {
    t.columns.forEach((col, i) => {
      const q = `${path}.columns[${i}]`;
      if (!c.obj(col, q)) return;
      c.need(isStr(col.key) && /^[a-zа-я0-9_]+$/.test(col.key), `${q}.key`, "нижний регистр, _ вместо пробелов, е вместо ё");
      c.str(col.title, `${q}.title`);
      keys.add(col.key);
    });
    c.unique(t.columns.map((x) => x?.key), `${path}.columns`, "колонка");
  }
  if (c.obj(t.rows, `${path}.rows`)) {
    for (const [size, row] of Object.entries(t.rows)) {
      const q = `${path}.rows["${size}"]`;
      c.need(own.has(size), q, "размера нет в sizes товара");
      if (!c.obj(row, q)) continue;
      for (const [k, val] of Object.entries(row)) {
        c.need(keys.has(k), `${q}.${k}`, "нет такой колонки");
        c.num(val, `${q}.${k}`);
      }
    }
  }
}

function sizeHW(c, h, path, scale) {
  if (!c.obj(h, path)) return;
  const asc = (list, p, max) => {
    if (!c.arr(list, p)) return;
    list.forEach((x, i) => c.need(isInt(x) && x >= 0 && x <= max, `${p}[${i}]`, `целое 0–${max}`));
    for (let i = 1; i < list.length; i++) c.need(list[i] > list[i - 1], p, "по возрастанию");
  };
  asc(h.heights, `${path}.heights`, 230);
  asc(h.weights, `${path}.weights`, 250);
  if (c.arr(h.cells, `${path}.cells`)) {
    c.need(h.cells.length === (h.heights?.length ?? -1), `${path}.cells`, "строк столько же, сколько heights");
    h.cells.forEach((row, i) => {
      if (!c.arr(row, `${path}.cells[${i}]`)) return;
      c.need(row.length === (h.weights?.length ?? -1), `${path}.cells[${i}]`, "клеток столько же, сколько weights");
      row.forEach((s, j) => {
        if (s === null) return;
        c.need(isStr(s) && (!scale || scale.has(s)), `${path}.cells[${i}][${j}]`, "размер из sizeScale или null");
      });
    });
  }
}

// ---------- stock ----------

function stock(c, v, others) {
  const productIds = new Set((others.catalog?.products ?? []).map((p) => p.id));
  const haveCatalog = Boolean(others.catalog);
  const batchIds = new Map();
  if (c.arr(v.batches, "batches")) {
    v.batches.forEach((b, i) => {
      const p = `batches[${i}]`;
      if (!c.obj(b, p)) return;
      c.str(b.id, `${p}.id`);
      c.str(b.productId, `${p}.productId`);
      if (haveCatalog && !productIds.has(b.productId)) c.warn(`${p}.productId`, `товара «${b.productId}» нет в каталоге`);
      c.str(b.name, `${p}.name`);
      c.need(isStr(b.date) && DAY.test(b.date), `${p}.date`, "YYYY-MM-DD");
      c.str(b.from, `${p}.from`, { empty: true });
      c.need(isNum(b.total) && b.total > 0, `${p}.total`, "сумма больше нуля");
      c.num(b.price, `${p}.price`);
      if (c.arr(b.delivered, `${p}.delivered`)) {
        b.delivered.forEach((d, j) => {
          const q = `${p}.delivered[${j}]`;
          if (!c.obj(d, q)) return;
          c.str(d.size, `${q}.size`);
          c.need(isInt(d.qty) && d.qty > 0, `${q}.qty`, "целое больше нуля");
        });
      }
      c.iso(b.addedAt, `${p}.addedAt`);
      if (b.cancelledAt !== undefined) c.iso(b.cancelledAt, `${p}.cancelledAt`);
      batchIds.set(b.id, b.productId);
    });
    c.unique(v.batches.map((b) => b?.id), "batches", "id");
  }
  if (c.obj(v.products, "products")) {
    for (const [pid, sizes] of Object.entries(v.products)) {
      const p = `products["${pid}"]`;
      if (haveCatalog && !productIds.has(pid)) c.warn(p, "товара нет в каталоге");
      if (!c.obj(sizes, p)) continue;
      for (const [size, s] of Object.entries(sizes)) {
        const q = `${p}["${size}"]`;
        if (!c.obj(s, q)) continue;
        if (c.arr(s.stock, `${q}.stock`)) {
          s.stock.forEach((x, j) => {
            const r = `${q}.stock[${j}]`;
            if (!c.obj(x, r)) return;
            c.need(batchIds.get(x.batchId) === pid, `${r}.batchId`, "нет такой поставки у этого товара");
            c.need(isInt(x.qty) && x.qty > 0, `${r}.qty`, "целое больше нуля (на полке не бывает меньше нуля)");
          });
        }
        if (c.arr(s.units, `${q}.units`)) {
          s.units.forEach((u, j) => {
            const r = `${q}.units[${j}]`;
            if (!c.obj(u, r)) return;
            c.str(u.order, `${r}.order`);
            c.str(u.orderDate, `${r}.orderDate`);
            c.need(UNIT_STATUS.includes(u.status), `${r}.status`, UNIT_STATUS.join(" | "));
            c.need(batchIds.get(u.batchId) === pid, `${r}.batchId`, "нет такой поставки у этого товара");
          });
        }
      }
    }
  }
}

// ---------- hub-owned lists ----------

function orders(c, v, others) {
  const productIds = new Set((others.catalog?.products ?? []).map((p) => p.id));
  if (!c.arr(v.orders, "orders")) return;
  v.orders.forEach((o, i) => {
    const p = `orders[${i}]`;
    if (!c.obj(o, p)) return;
    c.str(o.id, `${p}.id`);
    c.iso(o.createdAt, `${p}.createdAt`);
    c.str(o.product ?? "", `${p}.product`, { empty: true });
    if (o.productId !== undefined && o.productId !== null && others.catalog && !productIds.has(o.productId)) {
      c.warn(`${p}.productId`, `товара «${o.productId}» нет в каталоге`);
    }
    if (o.size !== undefined && o.size !== null) c.str(o.size, `${p}.size`);
    c.need(SERVICES.includes(o.service), `${p}.service`, SERVICES.join(" | "));
    c.need(ORDER_STATUS.includes(o.status), `${p}.status`, "неизвестный статус");
    c.arr(o.history, `${p}.history`);
  });
  c.unique(v.orders.map((o) => o?.id), "orders", "id");
}

function listings(c, v, others) {
  const productIds = new Set((others.catalog?.products ?? []).map((p) => p.id));
  if (!c.arr(v.listings, "listings")) return;
  v.listings.forEach((l, i) => {
    const p = `listings[${i}]`;
    if (!c.obj(l, p)) return;
    c.str(l.id, `${p}.id`);
    c.str(l.title, `${p}.title`, { empty: true });
    c.need(l.productId === null || isStr(l.productId), `${p}.productId`, "id товара или null");
    if (isStr(l.productId) && others.catalog && !productIds.has(l.productId)) c.warn(`${p}.productId`, `товара «${l.productId}» нет в каталоге`);
  });
  c.unique(v.listings.map((l) => l?.id), "listings", "id");
  if (v.syncedAt !== undefined) c.iso(v.syncedAt, "syncedAt");
}

function printBatches(c, v) {
  if (!c.arr(v.batches, "batches")) return;
  v.batches.forEach((b, i) => {
    const p = `batches[${i}]`;
    if (!c.obj(b, p)) return;
    c.str(b.id, `${p}.id`);
    c.need(isInt(b.number), `${p}.number`, "целое");
    c.iso(b.createdAt, `${p}.createdAt`);
    c.arr(b.orderIds, `${p}.orderIds`);
    c.arr(b.issues, `${p}.issues`);
  });
  c.unique(v.batches.map((b) => b?.id), "batches", "id");
}

function shop(c, v) {
  c.str(v.name, "name", { empty: true });
  c.need(["warehouse", "manual"].includes(v.stockSource), "stockSource", "warehouse | manual");
  if (c.obj(v.cutoffs, "cutoffs")) {
    c.need(isStr(v.cutoffs.weekday) && HHMM.test(v.cutoffs.weekday), "cutoffs.weekday", "ЧЧ:ММ");
    c.need(isStr(v.cutoffs.weekend) && HHMM.test(v.cutoffs.weekend), "cutoffs.weekend", "ЧЧ:ММ");
  }
  if (c.arr(v.serviceOrder, "serviceOrder")) {
    v.serviceOrder.forEach((s, i) => c.need(SERVICES.includes(s), `serviceOrder[${i}]`, SERVICES.join(" | ")));
    c.unique(v.serviceOrder, "serviceOrder", "служба");
  }
}

function hub(c, v) {
  if (c.obj(v.display, "display")) {
    c.bool(v.display.showZeroOnTiles, "display.showZeroOnTiles");
    c.bool(v.display.showIncoming, "display.showIncoming");
    c.need(v.display.tileRows === 2 || v.display.tileRows === 3, "display.tileRows", "2 или 3");
  }
  c.arr(v.drafts, "drafts");
}

function log(c, v) {
  if (!c.arr(v.entries, "entries")) return;
  c.need(v.entries.length <= 2000, "entries", "не больше 2000 записей");
  v.entries.forEach((e, i) => {
    const p = `entries[${i}]`;
    if (!c.obj(e, p)) return;
    c.str(e.id, `${p}.id`);
    c.iso(e.at, `${p}.at`);
    c.need(e.source === "hub" || e.source === "bot", `${p}.source`, "hub | bot");
    c.str(e.text, `${p}.text`);
  });
}

const BODY = { catalog, stock, orders, listings, printBatches, shop, hub, log };

export function validate(key, value, others = {}) {
  const c = new Check();
  if (!BODY[key]) {
    c.err(key, "неизвестный файл");
    return c;
  }
  if (header(c, key, value)) BODY[key](c, value, others);
  return { errors: c.errors, warnings: c.warnings };
}

/** Пустые файлы по умолчанию — с них начинается новый клиент. */
export function empty(key) {
  const base = { format: key, version: VERSION[key] };
  switch (key) {
    case "catalog":
      return { ...base, sizeScale: [], categories: [], products: [] };
    case "stock":
      return { ...base, batches: [], products: {} };
    case "orders":
      return { ...base, orders: [] };
    case "listings":
      return { ...base, listings: [] };
    case "printBatches":
      return { ...base, batches: [] };
    case "shop":
      return {
        ...base,
        name: "",
        stockSource: "manual",
        cutoffs: { weekday: "19:00", weekend: "18:00" },
        serviceOrder: ["yandex", "avito", "cdek", "post", "fivepost", "dpd"],
      };
    case "hub":
      return { ...base, display: { showZeroOnTiles: true, showIncoming: true, tileRows: 2 }, drafts: [] };
    case "log":
      return { ...base, entries: [] };
    default:
      throw new Error(`неизвестный файл ${key}`);
  }
}
