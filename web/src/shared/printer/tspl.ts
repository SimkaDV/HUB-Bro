// Команды TSPL — родной язык XP-365B. Бирку отправляем картинкой (BITMAP), а не текстом принтера:
// встроенные шрифты не знают кириллицу, а так на бумаге ровно то же, что в превью.
import type { PrinterSettings } from "./settings";

/** Чёрно-белый холст → строки бит для BITMAP. В TSPL 1 — белая точка, 0 — чёрная (прожечь). */
function toBitmap(canvas: HTMLCanvasElement) {
  const { width, height } = canvas;
  const widthBytes = Math.ceil(width / 8);
  const bits = new Uint8Array(widthBytes * height).fill(0xff);
  const px = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4] === 0) bits[y * widthBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { widthBytes, height, bits };
}

/** Задание на печать: настройки один раз, дальше каждая бирка — CLS, BITMAP, PRINT. */
export function buildJob(settings: PrinterSettings, labels: HTMLCanvasElement[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [
    enc.encode(
      [
        `SIZE ${settings.labelWidth} mm,${settings.labelHeight} mm`,
        `GAP ${settings.gap} mm,0 mm`,
        `DENSITY ${settings.density}`,
        `SPEED ${settings.speed}`,
        `DIRECTION ${settings.flip ? 0 : 1}`,
        "REFERENCE 0,0",
        "",
      ].join("\r\n"),
    ),
  ];
  for (const canvas of labels) {
    const { widthBytes, height, bits } = toBitmap(canvas);
    parts.push(enc.encode(`CLS\r\nBITMAP 0,0,${widthBytes},${height},0,`), bits, enc.encode("\r\nPRINT 1,1\r\n"));
  }

  const job = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    job.set(p, offset);
    offset += p.length;
  }
  return job;
}
