// Генератор бирки: рисуем её на холсте в точках принтера и переводим в чёрно-белое.
// Холст после renderLabel — ровно то, что выйдет на бумаге: его же показываем в превью и шлём принтеру.
// Раскладка — docs/SETTINGS.md, «Бирка».
import { formatDispatch } from "@/shared/orders";
import { code128Bars, code128Width } from "./code128";
import { DOTS_PER_MM, type LabelLayout, type PrinterSettings } from "./settings";

export type LabelData = {
  /** Номер заказа — номер сделки Авито. На бирке — «N» и последние 6 цифр. */
  orderId: string;
  /** Модель склада. Печатается только в раскладке «С названием». */
  product: string;
  size: string;
  /** Код модели на бирке («КЛ»). Нет — номер без приписки. */
  code?: string;
  /** Номер отправления — в штрихкоде, его пикают в ПВЗ. Нет — вместо штрихкода пометка. */
  dispatchNumber?: string;
  /** Служба доставки, подписью: «Авито», «Почта». */
  service: string;
};

/** Пример для превью и пробной печати. */
export const SAMPLE_LABEL: LabelData = {
  orderId: "70000000566033529",
  product: "Джинсы Клёш",
  size: "33L",
  code: "КЛ",
  dispatchNumber: "8051222733459",
  service: "Авито",
};

/** «70000000566033529» + «КЛ» → «N033529-КЛ». */
export function shortNumber(orderId: string, code?: string) {
  const digits = orderId.replace(/\D/g, "");
  return `N${digits.slice(-6).padStart(6, "0")}${code ? `-${code}` : ""}`;
}

// Раскладка нарисована под бирку 40×58 мм (320×464 точки) и масштабируется под другие размеры.
const BASE_W = 320;
const BASE_H = 464;
const PAD = 14;
const LOGO = 112; // 14 мм
const BARCODE_TOP = 268;
const BARCODE_H = 112;
/** Белые поля штрихкода по бокам, в точках принтера: 2,5 мм — меньше сканер может не взять. */
const QUIET = Math.ceil(2.5 * DOTS_PER_MM);
/** Модуль штрихкода не шире 3 точек: шире не нужно, а 1 точка — уже на грани читаемости. */
const MAX_MODULE = 3;
const FONT = "Onest, system-ui, sans-serif";
/** Светлее — белое, темнее — чёрное. Принтер не умеет серый: точка либо прожжена, либо нет. */
const THRESHOLD = 140;

let logoPromise: Promise<HTMLImageElement | null> | null = null;

function loadLogo() {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/logo.png";
  });
  return logoPromise;
}

async function loadFonts() {
  try {
    await Promise.all([document.fonts.load(`500 40px Onest`), document.fonts.load(`600 64px Onest`)]);
  } catch {
    // Шрифт не загрузился — нарисуем системным, бирка всё равно читается.
  }
}

/** Размер холста в точках принтера. */
export function labelDots(s: Pick<PrinterSettings, "labelWidth" | "labelHeight">) {
  return { width: Math.round(s.labelWidth * DOTS_PER_MM), height: Math.round(s.labelHeight * DOTS_PER_MM) };
}

/** Самый крупный шрифт до max, при котором текст влезает в ширину. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number) {
  let size = max;
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= width) break;
  }
  ctx.font = `${weight} ${size}px ${FONT}`;
  return size;
}

/** Текст по словам в строки шириной width. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last && ctx.measureText(`${last} ${word}`).width <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** Название товара в прямоугольник: самый крупный шрифт, при котором влезает в 3 строки. */
function drawName(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, height: number) {
  let size = 44;
  let lines: string[] = [];
  for (; size >= 16; size -= 2) {
    ctx.font = `500 ${size}px ${FONT}`;
    lines = wrap(ctx, text, width);
    const fits = lines.length <= 3 && lines.length * size * 1.1 <= height && lines.every((l) => ctx.measureText(l).width <= width);
    if (fits) break;
  }
  ctx.textBaseline = "top";
  lines.slice(0, 3).forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.1, width));
}

/** Штрихкод в точках принтера: модуль — целое число точек, иначе сканер спотыкается. */
function drawBarcode(ctx: CanvasRenderingContext2D, text: string | undefined, width: number, top: number, height: number, k: number) {
  if (!text) {
    // Номер отправления ещё не пришёл: место штрихкода с пометкой, чтобы бирку не наклеили как готовую.
    ctx.lineWidth = 3;
    ctx.strokeRect(QUIET, top, width - QUIET * 2, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, "Нет номера отправления", 600, Math.round(24 * k), 12, width - QUIET * 2 - 16);
    ctx.fillText("Нет номера отправления", width / 2, top + height / 2);
    ctx.textAlign = "left";
    return;
  }
  const bars = code128Bars(text);
  const modules = code128Width(bars);
  const module = Math.max(1, Math.min(MAX_MODULE, Math.floor((width - QUIET * 2) / modules)));
  let x = Math.round((width - modules * module) / 2);
  bars.forEach((w, i) => {
    if (i % 2 === 0) ctx.fillRect(x, top, w * module, height);
    x += w * module;
  });
}

/** Рисует бирку и возвращает чёрно-белый холст в точках принтера. */
export async function renderLabel(data: LabelData, settings: PrinterSettings): Promise<HTMLCanvasElement> {
  const [logo] = await Promise.all([loadLogo(), loadFonts()]);
  const { width, height } = labelDots(settings);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";

  // Масштаб раскладки под размер бирки, по центру.
  const k = Math.min(width / BASE_W, height / BASE_H);
  const ox = (width - BASE_W * k) / 2;
  const oy = (height - BASE_H * k) / 2;
  const layout: LabelLayout = settings.layout;
  const inner = BASE_W - PAD * 2;
  const number = shortNumber(data.orderId, data.code);

  // Штрихкод рисуем в точках принтера, без масштаба раскладки.
  drawBarcode(ctx, data.dispatchNumber, width, Math.round(oy + BARCODE_TOP * k), Math.round(BARCODE_H * k), k);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);

  if (layout === "full") {
    // Лого слева, рядом название товара, под лого номер.
    if (logo) ctx.drawImage(logo, PAD, PAD, LOGO, LOGO);
    const nameX = PAD + LOGO + 12;
    drawName(ctx, data.product, nameX, PAD, BASE_W - nameX - PAD, LOGO);
    ctx.textBaseline = "alphabetic";
    fitFont(ctx, number, 600, 26, 14, inner);
    ctx.fillText(number, PAD, PAD + LOGO + 26);
    drawSize(ctx, data.size, 216, 108, inner);
  } else {
    // Без названия: лого по центру, размер, под ним номер.
    if (logo) ctx.drawImage(logo, (BASE_W - LOGO) / 2, PAD, LOGO, LOGO);
    drawSize(ctx, data.size, 184, 92, inner);
    ctx.textBaseline = "alphabetic";
    fitFont(ctx, number, 600, 26, 14, inner);
    ctx.fillText(number, PAD, BARCODE_TOP - 10);
  }

  // Под штрихкодом — номер отправления группами (для глаз, если сканер не взял) и служба: куда нести.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (data.dispatchNumber) {
    const dispatch = formatDispatch(data.dispatchNumber);
    fitFont(ctx, dispatch, 600, 34, 16, inner);
    ctx.fillText(dispatch, BASE_W / 2, BARCODE_TOP + BARCODE_H + 34);
  }
  fitFont(ctx, data.service, 600, 26, 14, inner);
  ctx.fillText(data.service, BASE_W / 2, BASE_H - PAD - 2);
  ctx.restore();

  toBlackAndWhite(ctx, width, height);
  return canvas;
}

/** Размер — самое крупное на бирке: при расклейке смотрят прежде всего на него. */
function drawSize(ctx: CanvasRenderingContext2D, size: string, middle: number, max: number, width: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, size, 600, max, 40, width);
  ctx.fillText(size, BASE_W / 2, middle);
  ctx.textAlign = "left";
}

function toBlackAndWhite(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const img = ctx.getImageData(0, 0, width, height);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    // Прозрачное считаем белым (бумага).
    const lum = px[i + 3] < 128 ? 255 : 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = lum < THRESHOLD ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
