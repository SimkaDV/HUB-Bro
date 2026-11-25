// Перевод старых данных в формат avito v1 (FORMAT.md). Без зависимостей.
//
//   node data/schema/migrate-legacy.mjs --out <store> [--bot <папка бота>] [--hub <папка с hubbro.*.json>] [--shop-name "…"]
//
// --bot  — папка бота: products/<id>/*.txt, size_chart.png, photos/, shop_settings.json, brain/brain.py (шкала размеров)
// --hub  — папка с данными старого сервера HUB BRO: hubbro.stock.v5.json, hubbro.orders.v3.json, hubbro.listings.v2.json,
//          hubbro.batches.v2.json, hubbro.picking.services.v2.json (каких нет — пропускаются)
// --out  — куда положить новые файлы (catalog.json … и files/). Должна быть пустой или не существовать.
//
// Модели хаба сопоставляются с товарами бота по словам match в названии модели; не нашлось — новый товар.
// В конце все файлы проверяются validate.mjs; есть ошибки — выход с кодом 1.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { empty, KEYS, SLUG, validate } from "./validate.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.out) {
  console.error("нужно --out <папка>");
  process.exit(2);
}
if (existsSync(args.out) && readdirSync(args.out).length) {
  console.error(`папка ${args.out} не пустая — не перезаписываю`);
  process.exit(2);
}
mkdirSync(join(args.out, "files"), { recursive: true });

const now = new Date().toISOString();
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const lines = (p) => (existsSync(p) ? readFileSync(p, "utf8").split(/\r?\n/) : []);
const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, "_").replace(/ё/g, "е");

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "",
  ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
function slugify(name, taken) {
  let base = [...name.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  base = (base || "item").slice(0, 32);
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** «31M» → «31»; «30» → «30». Размеры без номера в формате v1 не бывают. */
function sizeNum(s) {
  const m = String(s).trim().toUpperCase().match(/^(\d+)[A-Z]*$/);
  if (!m) throw new Error(`размер «${s}» без номера — переведите руками`);
  return m[1];
}

const COLUMN_TITLE = {
  полуобхват_талии: "Полуобхват талии", полуталия: "Полуобхват талии", полуобхват_бедер: "Полуобхват бёдер",
  длина_по_внеш_шву: "Длина по внешнему шву", длина_по_внутр_шву: "Длина по внутреннему шву",
  полуобхват_одного_бедра: "Полуобхват одного бедра", полувыход: "Полувыход", колено: "Колено", выход: "Выход",
};

// ---------- бот ----------

const scale = new Map(); // size → label
const products = [];
let shopCutoffs = { weekday: "19:00", weekend: "18:00" };
const bot = args.bot;

if (bot) {
  // Шкала размеров — из SIZE_LABEL в brain.py: {25: "25 (2XS)", …}
  const brain = existsSync(join(bot, "brain", "brain.py")) ? readFileSync(join(bot, "brain", "brain.py"), "utf8") : "";
  for (const m of brain.matchAll(/(\d+):\s*"\d+\s*\(([^)]*)\)"/g)) scale.set(m[1], m[2]);

  const settings = readJson(join(bot, "shop_settings.json"));
  if (settings) shopCutoffs = { weekday: settings.weekday_cutoff ?? "19:00", weekend: settings.weekend_cutoff ?? "18:00" };

  const dir = join(bot, "products");
  for (const pid of existsSync(dir) ? readdirSync(dir).sort() : []) {
    const pdir = join(dir, pid);
    if (!existsSync(join(pdir, "product.txt"))) continue;
    if (!SLUG.test(pid)) throw new Error(`папка товара «${pid}» — не slug`);

    const f = {};
    for (const l of lines(join(pdir, "product.txt"))) {
      if (l.includes(":") && !l.trimStart().startsWith("#")) {
        const i = l.indexOf(":");
        f[l.slice(0, i).trim()] = l.slice(i + 1).trim();
      }
    }
    const NO = new Set(["нет", "no", "false", "0", "-"]);
    const outSizes = (f.out_sizes ?? "").replace(/;/g, ",").split(",").map((x) => x.trim()).filter((x) => /^\d+$/.test(x));

    // material.txt: первая строка без «:» — material; «состав:», «плотность:»
    const mat = lines(join(pdir, "material.txt")).map((l) => l.trim()).filter(Boolean);
    const field = (name) => mat.find((l) => l.toLowerCase().startsWith(`${name}:`))?.split(":").slice(1).join(":").trim() ?? null;
    const composition = field("состав");
    const material = mat.find((l) => !l.includes(":")) ?? composition;
    const leg = lines(join(pdir, "leg_opening.txt")).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).join(" ") || null;

    // size_table.txt
    let sizeTable = null;
    const sizes = [];
    const tl = lines(join(pdir, "size_table.txt")).filter((l) => l.trim() && !l.trimStart().startsWith("#"));
    if (tl.length) {
      const head = tl[0].split("\t").map((x) => norm(x));
      const cols = head.slice(2);
      const rows = {};
      for (const l of tl.slice(1)) {
        const cells = l.split("\t").map((x) => x.trim());
        if (!/^\d+$/.test(cells[0])) continue;
        const size = cells[0];
        sizes.push(size);
        if (!scale.has(size)) scale.set(size, cells[1] ?? "");
        const row = {};
        cols.forEach((k, i) => {
          const v = Number(String(cells[i + 2] ?? "").replace(",", "."));
          if (cells[i + 2] !== undefined && cells[i + 2] !== "" && Number.isFinite(v)) row[k] = v;
        });
        rows[size] = row;
      }
      sizeTable = { columns: cols.map((k) => ({ key: k, title: COLUMN_TITLE[k] ?? k.replace(/_/g, " ") })), rows };
    }

    // size_hw.txt
    let sizeHW = null;
    const hl = lines(join(pdir, "size_hw.txt")).filter((l) => l.trim() && !l.trimStart().startsWith("#"));
    if (hl.length > 1) {
      const weights = hl[0].split("\t").slice(1).map((x) => x.trim()).filter(Boolean).map(Number);
      const heights = [];
      const cells = [];
      for (const l of hl.slice(1)) {
        const parts = l.split("\t").map((x) => x.trim());
        heights.push(Number(parts[0]));
        const row = parts.slice(1, 1 + weights.length).map((x) => (/^\d+$/.test(x) ? x : null));
        while (row.length < weights.length) row.push(null);
        cells.push(row);
      }
      sizeHW = { heights, weights, cells };
    }

    // Фото и сетка → files/
    const photos = [];
    const pdirPhotos = join(pdir, "photos");
    for (const name of existsSync(pdirPhotos) ? readdirSync(pdirPhotos).sort() : []) {
      if (![".jpg", ".jpeg", ".png", ".heic", ".webp"].includes(extname(name).toLowerCase())) continue;
      let target = name.startsWith(`${pid}_`) ? name : `${pid}_${photos.length + 1}${extname(name).toLowerCase()}`;
      target = target.replace(/size_chart/g, "chart");
      copyFileSync(join(pdirPhotos, name), join(args.out, "files", target));
      photos.push(target);
    }
    let chart = null;
    if (existsSync(join(pdir, "size_chart.png"))) {
      chart = `${pid}_size_chart.png`;
      copyFileSync(join(pdir, "size_chart.png"), join(args.out, "files", chart));
    }

    products.push({
      id: pid,
      name: f.name || pid,
      categoryId: null, // ниже
      sizes: sizes.length ? sizes : [...scale.keys()],
      match: (f.match ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean),
      botKey: f.key || pid,
      description: { material: material ?? null, composition, density: field("плотность"), legOpening: leg },
      sizeTable,
      sizeHW,
      photos,
      chart,
      availability: { inStock: !NO.has((f.in_stock ?? "да").toLowerCase()), outSizes },
    });
  }
}

// ---------- хаб ----------

const hubDir = args.hub;
const hubStock = hubDir ? readJson(join(hubDir, "hubbro.stock.v5.json")) : null;
const categories = [];
const catIds = new Set();
const catByName = new Map();
const productByModel = new Map(); // model.id → product
const takenIds = new Set(products.map((p) => p.id));
const stock = empty("stock");

function category(name, sizes = [], thresholds = { lowMax: 5, midMax: 10 }) {
  const key = name.toLowerCase();
  if (!catByName.has(key)) {
    const cat = { id: name === "Джинсы" ? "jeans" : slugify(name, catIds), name, sizes, thresholds };
    catIds.add(cat.id);
    categories.push(cat);
    catByName.set(key, cat);
  }
  return catByName.get(key);
}

if (hubStock) {
  for (const c of hubStock.categories ?? []) category(c.name, (c.sizes ?? []).map(sizeNum), c.thresholds ?? { lowMax: 5, midMax: 10 });
  for (const m of hubStock.models ?? []) {
    const cat = category(m.category || "Без категории");
    const lname = m.name.toLowerCase();
    let p = products.find((x) => !productByModel.has(x.id) && x.match.some((w) => lname.includes(w)));
    if (!p) {
      p = {
        id: slugify(m.name, takenIds), name: m.name, categoryId: null, sizes: [], match: [],
        description: { material: null, composition: null, density: null, legOpening: null },
        photos: [], chart: null, availability: { inStock: true, outSizes: [] },
      };
      products.push(p);
    }
    productByModel.set(m.id, p);
    productByModel.set(p.id, p);
    p.hubModelId = m.id;
    p.name = m.name;
    p.categoryId = cat.id;
    const hubSizes = (m.sizes ?? []).map((s) => sizeNum(s.size));
    p.sizes = [...new Set([...hubSizes, ...p.sizes])];
    for (const s of p.sizes) if (!scale.has(s)) scale.set(s, "");
    if (m.code) p.code = m.code;
    if (m.archived) p.archived = true;
    if (m.hiddenSizes?.length) p.hiddenSizes = m.hiddenSizes.map(sizeNum);
    if (m.thresholds) p.thresholds = m.thresholds;
    if (m.packs?.length) p.packs = m.packs.map((pk) => ({ id: pk.id, name: pk.name, sizes: pk.sizes.map(sizeNum) }));

    for (const b of m.batches ?? []) {
      stock.batches.push({ ...b, productId: p.id, delivered: b.delivered.map((d) => ({ ...d, size: sizeNum(d.size) })) });
    }
    for (const s of m.sizes ?? []) {
      if (!s.stock?.length && !s.units?.length) continue;
      (stock.products[p.id] ??= {})[sizeNum(s.size)] = { stock: s.stock ?? [], units: s.units ?? [] };
    }
  }
}

const defaultCat = () => category("Джинсы");
for (const p of products) if (!p.categoryId) p.categoryId = defaultCat().id;
for (const c of categories) if (!c.sizes.length) {
  c.sizes = [...new Set(products.filter((p) => p.categoryId === c.id).flatMap((p) => p.sizes))].sort((a, b) => a - b);
}

const sizeScale = [...scale.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([size, label]) => ({ size, label }));
const catalog = {
  ...empty("catalog"),
  sizeScale,
  categories,
  products: products.map(({ hubModelId, ...p }) => p),
};

// Заказы, объявления, партии, порядок служб, отображение, черновики, журнал
const modelToProduct = (id) => productByModel.get(id)?.id ?? null;
const productByName = (name) => products.find((p) => p.name === name)?.id;

const rawOrders = hubDir ? readJson(join(hubDir, "hubbro.orders.v3.json")) : null;
const orders = {
  ...empty("orders"),
  orders: (rawOrders ?? []).map((o) => {
    const productId = productByName(o.product);
    return { ...o, ...(productId ? { productId } : {}), ...(o.size ? { size: sizeNum(o.size) } : {}) };
  }),
};

const rawListings = hubDir ? readJson(join(hubDir, "hubbro.listings.v2.json")) : null;
const listings = {
  ...empty("listings"),
  listings: (rawListings?.listings ?? []).map(({ modelId, ...l }) => ({ ...l, productId: modelId ? modelToProduct(modelId) : null })),
  ...(rawListings?.syncedAt ? { syncedAt: rawListings.syncedAt } : {}),
};

const rawBatches = hubDir ? readJson(join(hubDir, "hubbro.batches.v2.json")) : null;
const printBatches = { ...empty("printBatches"), batches: rawBatches ?? [] };

const rawServices = hubDir ? readJson(join(hubDir, "hubbro.picking.services.v2.json")) : null;
const shop = {
  ...empty("shop"),
  name: args["shop-name"] ?? "BRO x BRO SHOP",
  stockSource: hubDir ? "warehouse" : "manual",
  cutoffs: shopCutoffs,
  ...(Array.isArray(rawServices) && rawServices.length ? { serviceOrder: rawServices } : {}),
};

const hub = {
  ...empty("hub"),
  ...(hubStock?.display ? { display: hubStock.display } : {}),
  drafts: (hubStock?.drafts ?? []).map((d) => ({
    ...d,
    lines: d.lines.map(({ modelId, newModel, ...l }) => ({
      ...l,
      productId: modelId ? modelToProduct(modelId) : null,
      newProduct: newModel ? { name: newModel.name, categoryId: newModel.category ? category(newModel.category).id : null } : undefined,
      sizes: (l.sizes ?? []).map(sizeNum),
      qty: Object.fromEntries(Object.entries(l.qty ?? {}).map(([k, v]) => [sizeNum(k), v])),
    })),
  })),
};

const log = {
  ...empty("log"),
  entries: [
    { id: newId(), at: now, source: "hub", text: "Данные переведены в формат avito v1 (migrate-legacy)" },
    ...(hubStock?.log ?? []).map((e) => ({ ...e, source: "hub" })),
  ].slice(0, 2000),
};

// ---------- запись и проверка ----------

const out = { catalog, stock, orders, listings, printBatches, shop, hub, log };
let bad = false;
for (const key of KEYS) {
  writeFileSync(join(args.out, `${key}.json`), JSON.stringify(out[key], null, 1));
  const { errors, warnings } = validate(key, out[key], out);
  for (const w of warnings) console.warn(`! ${key}: ${w}`);
  for (const e of errors) console.error(`✗ ${key}: ${e}`);
  if (errors.length) bad = true;
}
console.log(
  `товаров ${catalog.products.length}, категорий ${categories.length}, размеров в шкале ${sizeScale.length}, ` +
    `поставок ${stock.batches.length}, заказов ${orders.orders.length}, объявлений ${listings.listings.length}`,
);
for (const p of catalog.products) {
  console.log(`  ${p.id}: «${p.name}» ${p.code ?? ""} размеры ${p.sizes.join(" ")} фото ${p.photos.length}${p.chart ? " +сетка" : ""}`);
}
process.exit(bad ? 1 : 0);
