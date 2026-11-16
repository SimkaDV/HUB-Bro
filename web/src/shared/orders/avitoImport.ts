import { AVITO_STATUS, applyAvitoStatus, avitoService } from "./avito";
import type { Order } from "./types";

// Приём пачки заказов из расширения (кабинет Авито). Описание — docs/ORDERS.md, раздел 2, и docs/EXTENSION.md.

/** Заказ, как его собирает расширение (`extension/avito/collect.js`). */
export type AvitoOrder = {
  orderId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  statusLabel?: string;
  provider?: string;
  providerLabel?: string;
  trackingNumber?: string;
  info?: string;
  payout?: number;
  chatId?: string;
  itemsCount?: number;
  /** Название из списка заказов — пока карточку не дочитали. */
  title?: string;
  /** `oldPrice` — цена объявления до скидок. */
  items?: { itemId: string; title: string; price: number; oldPrice?: number; quantity: number }[];
  dispatchNumber?: string;
  /** Как пишет Авито: «19 ноября». */
  shipBy?: string;
};

export type AvitoBatch = {
  kind: "hubbro.avito-orders";
  version: 1;
  collectedAt: string;
  account: { id: string; name: string };
  /** Какие группы плашки собрали: ship, transit, pvz, returns, finished, canceled. */
  groups?: string[];
  orders: AvitoOrder[];
  /** Скольким заказам не дочитали карточку (лимит за раз или 429) — дочитаются в следующий сбор. */
  missingDetails?: number;
  /** Почему остановились раньше: «Авито просит паузу…». */
  stopped?: string;
};

export type ImportReport = {
  account: string;
  added: number;
  updated: number;
  unchanged: number;
  /** Не взяли: служба, которой у нас нет. */
  skipped: string[];
  /** Статус Авито, которого нет в таблице: заказ взяли, статус не трогали. */
  unknownStatus: string[];
  /** Несколько товаров в заказе — у нас «один заказ = одна джинса». */
  multiItem: string[];
  /** Скольким заказам не дочитали карточку: нет номера отправления у «Авито» и id объявления. */
  missingDetails: number;
};

/** Проверяет, что текст / объект — пачка из расширения. */
export function parseAvitoBatch(data: unknown): AvitoBatch | null {
  const b = data as AvitoBatch;
  if (!b || b.kind !== "hubbro.avito-orders" || b.version !== 1 || !Array.isArray(b.orders) || !b.account) return null;
  return b;
}

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** «19 ноября» → «2026-11-19». Год — от даты заказа, через Новый год — следующий. */
export function parseShipBy(text: string | undefined, createdAt: string): string | undefined {
  const m = text?.match(/(\d{1,2})\s+([а-яё]+)/i);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  if (!m || month === -1) return undefined;
  const created = new Date(createdAt);
  const year = month < created.getMonth() ? created.getFullYear() + 1 : created.getFullYear();
  return `${year}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Поля, которые знает Авито. Наше (размер, товар склада, история) не трогаем. */
function avitoFields(a: AvitoOrder) {
  const item = a.items?.[0];
  return {
    dispatchNumber: a.dispatchNumber ?? a.trackingNumber,
    shipBy: parseShipBy(a.shipBy ?? (a.status === "confirmed" ? a.info : undefined), a.createdAt),
    itemId: item?.itemId,
    itemTitle: item?.title ?? a.title,
    chatId: a.chatId,
    payout: a.payout,
    price: item?.price,
    listPrice: item?.oldPrice,
  };
}

const same = (a: Order, b: Order) => {
  const { syncedAt: _a, ...x } = a;
  const { syncedAt: _b, ...y } = b;
  return JSON.stringify(x) === JSON.stringify(y);
};

/**
 * Сливает пачку с заказами по номеру Авито — без дублей (ORDERS.md, правила 1, 6, 11):
 * новый номер — новый заказ «Заказан» и сразу статус Авито; знакомый — обновляем только поля Авито и статус.
 * Заказы, которых нет в пачке, не трогаем и не удаляем.
 */
export function mergeAvitoBatch(orders: Order[], batch: AvitoBatch, now = new Date().toISOString()) {
  const report: ImportReport = {
    account: batch.account.name,
    added: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
    unknownStatus: [],
    multiItem: [],
    missingDetails: batch.missingDetails ?? 0,
  };
  const byId = new Map(orders.map((o) => [o.id, o]));
  const added: Order[] = [];

  for (const a of batch.orders) {
    const service = avitoService(a.provider, a.providerLabel);
    if (!service) {
      report.skipped.push(`№${a.orderId}: служба «${a.providerLabel ?? a.provider ?? "?"}»`);
      continue;
    }
    if (!(a.status in AVITO_STATUS)) report.unknownStatus.push(`№${a.orderId}: «${a.statusLabel ?? a.status}»`);
    if ((a.itemsCount ?? 1) > 1) report.multiItem.push(`№${a.orderId}`);

    const fields = avitoFields(a);
    const old = byId.get(a.orderId);
    if (!old) {
      const item = a.items?.[0];
      const fresh: Order = {
        id: a.orderId,
        createdAt: a.createdAt,
        // Пока название объявления; модель склада по привязке поставит сверка (shared/fulfillment/products.ts).
        product: item?.title ?? a.title ?? "Товар Авито",
        service,
        ...fields,
        buyer: "",
        status: "ordered",
        history: [{ status: "ordered", at: a.createdAt }],
      };
      added.push({ ...applyAvitoStatus(fresh, a.status, a.updatedAt), syncedAt: now });
      report.added += 1;
      continue;
    }

    const next = applyAvitoStatus(
      {
        ...old,
        service,
        dispatchNumber: fields.dispatchNumber ?? old.dispatchNumber,
        shipBy: fields.shipBy ?? old.shipBy,
        itemId: fields.itemId ?? old.itemId,
        itemTitle: fields.itemTitle ?? old.itemTitle,
        chatId: fields.chatId ?? old.chatId,
        payout: fields.payout ?? old.payout,
        price: fields.price ?? old.price,
        listPrice: fields.listPrice ?? old.listPrice,
      },
      a.status,
      a.updatedAt,
    );
    if (same(old, next)) report.unchanged += 1;
    else report.updated += 1;
    byId.set(a.orderId, { ...next, syncedAt: now });
  }

  return { orders: [...added, ...orders.map((o) => byId.get(o.id)!)], report };
}
