// Печать бирок на Xprinter XP-365B: настройки, генератор бирки, TSPL, WebUSB. Описание — docs/SETTINGS.md, «Принтер».
import { renderLabel, type LabelData } from "./label";
import type { PrinterSettings } from "./settings";
import { buildJob } from "./tspl";
import { sendToPrinter } from "./usb";

export { labelDots, renderLabel, SAMPLE_LABEL, type LabelData } from "./label";
export {
  DEFAULT_PRINTER,
  outOfRange,
  PRINTER_LIMITS,
  PRINTER_MODEL,
  printerStore,
  resetPrinter,
  savePrinter,
  usePrinterSettings,
  type PrinterNumberKey,
  type PrinterSettings,
} from "./settings";
export { pairPrinter, PrinterError, usePrinterLink, type PrinterLink, type PrinterLinkState } from "./usb";

/** Нарисовать бирки и отправить их принтеру одним заданием, в том же порядке. */
export async function printLabels(labels: LabelData[], settings: PrinterSettings): Promise<void> {
  const canvases = await Promise.all(labels.map((l) => renderLabel(l, settings)));
  await sendToPrinter(buildJob(settings, canvases));
}
