// Генератор бирки: рисуем её на холсте в точках принтера и переводим в чёрно-белое.
// Холст после renderLabel — ровно то, что выйдет на бумаге: его же показываем в превью и шлём принтеру.
import qrcode from "qrcode-generator";
import { formatOrderId } from "@/shared/orders";
import { DOTS_PER_MM, type PrinterSettings } from "./settings";

export type LabelData = {
  /** Номер заказа — номер сделки Авито. Он же зашит в QR. */
  orderId: string;
  product: string;
  size: string;
};

/** Пример для превью и пробной печати. */
export const SAMPLE_LABEL: LabelData = { orderId: "4812338871", product: "Джинсы Трубы", size: "31M" };

// Раскладка нарисована под бирку 80×50 мм (640×400 точек) и масштабируется под другие размеры.
const BASE_W = 640;
const BASE_H = 400;
const PAD = 24;
const QR_BOX = 232;
const LOGO = 104;
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

  // Масштаб раскладки под размер бирки, по центру.
  const k = Math.min(width / BASE_W, height / BASE_H);
  const ox = (width - BASE_W * k) / 2;
  const oy = (height - BASE_H * k) / 2;

  // QR справа, рисуем в точках принтера: каждый модуль — целое число точек, иначе сканер спотыкается.
  const qr = qrcode(0, "M");
  qr.addData(data.orderId);
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.max(1, Math.floor((QR_BOX * k) / count));
  const qrSize = cell * count;
  const qrX = Math.round(ox + (BASE_W - PAD) * k - qrSize);
  const qrY = Math.round((height - qrSize) / 2);
  ctx.fillStyle = "#000";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(qrX + c * cell, qrY + r * cell, cell, cell);
    }
  }

  // Левая колонка: логотип, товар, размер, номер.
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(k, k);
  const colW = (qrX - ox) / k - PAD * 2;

  if (logo) ctx.drawImage(logo, PAD, PAD, LOGO, LOGO);

  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  fitFont(ctx, data.product, 500, 40, 22, colW);
  ctx.fillText(data.product, PAD, 176, colW);

  // Размер — крупно, белым на чёрной плашке: при расклейке смотрят прежде всего на него.
  const sizeFont = fitFont(ctx, data.size, 600, 72, 36, colW - 40);
  const plateW = Math.min(colW, ctx.measureText(data.size).width + 40);
  const plateH = sizeFont + 24;
  ctx.beginPath();
  ctx.roundRect(PAD, 200, plateW, plateH, 14);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(data.size, PAD + 20, 200 + plateH / 2 + sizeFont * 0.04);

  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  const number = `№ ${formatOrderId(data.orderId)}`;
  fitFont(ctx, number, 500, 32, 18, colW);
  ctx.fillText(number, PAD, BASE_H - PAD - 4);
  ctx.restore();

  toBlackAndWhite(ctx, width, height);
  return canvas;
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
