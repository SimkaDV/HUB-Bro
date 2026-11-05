export const STATUS: Record<string, { text: string; tone: "ok" | "warn" | "bad" | "info" | "muted"; icon: string }> = {
  NEW: { text: "Новый", tone: "info", icon: "●" },
  NEEDS_MAPPING: { text: "Нет SKU", tone: "bad", icon: "⚠" },
  WAITING_CONFIRMATION: { text: "Ждёт подтверждения", tone: "warn", icon: "◷" },
  READY_TO_PICK: { text: "Ждёт этикетку", tone: "warn", icon: "◷" },
  OUT_OF_STOCK: { text: "Нет товара", tone: "bad", icon: "⚠" },
  PICKING: { text: "Собирается", tone: "info", icon: "▶" },
  LABEL_READY: { text: "Готов к печати", tone: "ok", icon: "✓" },
  LABEL_PRINTED: { text: "Напечатан", tone: "info", icon: "⎙" },
  PICKED: { text: "Собран", tone: "info", icon: "✓" },
  READY_FOR_DISPATCH: { text: "В зоне отправки", tone: "info", icon: "→" },
  DISPATCHED: { text: "Сдан", tone: "muted", icon: "✓" },
  IN_TRANSIT: { text: "В пути", tone: "muted", icon: "→" },
  DELIVERED: { text: "Доставлен", tone: "muted", icon: "✓" },
  CANCELED: { text: "Отменён", tone: "muted", icon: "✕" },
  RETURN_PENDING: { text: "Ждём возврат", tone: "warn", icon: "↩" },
  RETURN_RECEIVED: { text: "Возврат получен", tone: "muted", icon: "↩" },
  CLOSED: { text: "Закрыт", tone: "muted", icon: "■" },
};

export const BATCH_STATUS: Record<string, string> = {
  draft: "Черновик", printing: "Печатается", printed: "Напечатана", failed: "Есть сбои", closed: "Закрыта", canceled: "Отменена",
};

export const JOB_STATUS: Record<string, string> = { queued: "В очереди", sent: "Отправлено на ПК", done: "Напечатано", failed: "Сбой" };

export function dt(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function deadlineTone(s: string | null): "bad" | "warn" | "" {
  if (!s) return "";
  const h = (new Date(s).getTime() - Date.now()) / 36e5;
  return h < 6 ? "bad" : h < 24 ? "warn" : "";
}
