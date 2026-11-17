// Как показываем состояние связи с принтером: бейдж в настройках и на пульте.
import type { StatusTone } from "@/shared/ui";
import type { PrinterLinkState } from "./usb";

export const PRINTER_STATUS: Record<PrinterLinkState, { tone: StatusTone; label: string }> = {
  unsupported: { tone: "danger", label: "Нужен Chrome" },
  notPaired: { tone: "neutral", label: "Не подключён" },
  notFound: { tone: "warning", label: "Не найден" },
  ready: { tone: "success", label: "Подключён" },
};
