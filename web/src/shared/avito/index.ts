import { useSyncExternalStore } from "react";
import { mergeAvitoBatch, ordersStore, parseAvitoBatch, type AvitoBatch, type ImportReport } from "@/shared/orders";

// Связь с расширением «HUB BRO — заказы Авито» (папка extension/) и приём пачек заказов.
// Нужна заказам и настройкам, поэтому в shared. Описание — docs/EXTENSION.md.

export type AvitoLink = {
  /** Версия расширения; нет — расширение не отвечает (не установлено или выключено). */
  version?: string;
  collecting: boolean;
  progress?: string;
  error?: string;
  /** Итог последнего приёма. */
  last?: ImportReport & { at: string };
};

let state: AvitoLink = { collecting: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<AvitoLink>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const useAvitoLink = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

const toExt = (msg: Record<string, unknown>) => window.postMessage({ source: "hubbro-page", ...msg }, location.origin);

/** Принимает пачку и сливает с заказами без дублей. */
export function importAvitoBatch(batch: AvitoBatch): ImportReport {
  let report!: ImportReport;
  ordersStore.set((orders) => {
    const merged = mergeAvitoBatch(orders, batch);
    report = merged.report;
    return merged.orders;
  });
  set({ last: { ...report, at: new Date().toISOString() }, collecting: false, progress: undefined, error: undefined });
  return report;
}

/** Вставка из буфера: текст, который скопировала кнопка «Скопировать» на странице Авито. */
export function importAvitoText(text: string): ImportReport | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return "Это не заказы из расширения — скопируйте ещё раз кнопкой «Скопировать» на странице Авито";
  }
  const batch = parseAvitoBatch(data);
  if (!batch) return "Это не заказы из расширения — скопируйте ещё раз кнопкой «Скопировать» на странице Авито";
  return importAvitoBatch(batch);
}

/** Кнопка «Подтянуть из Авито»: расширение само сходит в кабинет Авито и пришлёт пачку. */
export function collectFromAvito() {
  if (!state.version) {
    set({ error: "Расширение не отвечает — установите его (Настройки → Расширение Авито)" });
    return;
  }
  set({ collecting: true, progress: "Открываю Авито…", error: undefined });
  toExt({ type: "collect" });
}

/** Слушает расширение. Вызывается один раз при старте приложения. */
export function startAvitoBridge() {
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin || e.data?.source !== "hubbro-ext") return;
    const msg = e.data;
    if (msg.type === "ready") set({ version: msg.version }); else if (msg.type === "progress") set({ progress: msg.text });
    else if (msg.type === "error") set({ collecting: false, progress: undefined, error: msg.message });
    else if (msg.type === "batch") {
      const batch = parseAvitoBatch(msg.batch);
      if (batch) importAvitoBatch(batch);
      toExt({ type: "ack", id: msg.id });
    }
  });
  // В ответ расширение скажет «ready» и отдаст пачку, которая ждала, пока кабинет был закрыт.
  toExt({ type: "hello" });
}

/** «BRO x BRO SHOP: 5 новых, 12 обновлено, 3 без изменений». */
export function reportSummary(r: ImportReport): string {
  return `${r.account}: ${r.added} новых, ${r.updated} обновлено, ${r.unchanged} без изменений`;
}

/** Что взяли не так, как обычно, — по строке на случай. */
export function reportWarnings(r: ImportReport): string[] {
  const list = (items: string[]) => (items.length > 3 ? `${items.slice(0, 3).join(", ")} и ещё ${items.length - 3}` : items.join(", "));
  return [
    r.skipped.length ? `Не взяли — служба, которой у нас нет: ${list(r.skipped)}` : "",
    r.unknownStatus.length ? `Незнакомый статус Авито, статус не меняли: ${list(r.unknownStatus)}` : "",
    r.multiItem.length ? `Несколько товаров в заказе (у нас одна джинса): ${list(r.multiItem)}` : "",
    r.missingDetails
      ? `Не дочитали карточки ${r.missingDetails} заказов (Авито не любит частые запросы) — подтяните ещё раз через пару минут`
      : "",
  ].filter(Boolean);
}
