import type { StatusTone } from "@/shared/ui";
import type { Listing, ListingStatus } from "./types";

// Чистые функции: слияние с Авито, статусы, сортировка, связь с моделями.

/** Как объявление пришло с Авито — без наших полей. */
export type FetchedListing = Pick<Listing, "id" | "title" | "price" | "status" | "url" | "category" | "address" | "stats">;

/**
 * Обновление с Авито. Привязку и дату «впервые увидели» не трогаем, остальное берём свежее.
 * Новые — без модели. Пропавшие с Авито не удаляем, а помечаем `goneAt`: по ним могут быть заказы.
 */
export function mergeListings(current: Listing[], fetched: FetchedListing[], now: string): Listing[] {
  const byId = new Map(current.map((l) => [l.id, l]));
  const fresh = fetched.map((f): Listing => {
    const old = byId.get(f.id);
    return old
      ? { ...old, ...f, stats: f.stats ?? old.stats, syncedAt: now, goneAt: undefined }
      : { ...f, productId: null, firstSeenAt: now, syncedAt: now };
  });
  const seen = new Set(fetched.map((f) => f.id));
  const gone = current.filter((l) => !seen.has(l.id)).map((l) => (l.goneAt ? l : { ...l, goneAt: now }));
  return [...fresh, ...gone];
}

export const STATUS_META: Record<ListingStatus | "gone", { label: string; tone: StatusTone }> = {
  active: { label: "Активно", tone: "success" },
  old: { label: "Срок вышел", tone: "neutral" },
  removed: { label: "Снято", tone: "neutral" },
  blocked: { label: "Заблокировано", tone: "danger" },
  rejected: { label: "Отклонено", tone: "danger" },
  gone: { label: "Нет на Авито", tone: "neutral" },
};

export const listingStatus = (l: Listing) => STATUS_META[l.goneAt ? "gone" : l.status];

export const isActive = (l: Listing) => !l.goneAt && l.status === "active";

/** Модель, к которой привязано объявление. Модель удалили — считаем непривязанным. */
export function linkedModel<M extends { id: string }>(l: Listing, models: M[]): M | undefined {
  return l.productId ? models.find((m) => m.id === l.productId) : undefined;
}

/**
 * Активные первыми, внутри — свежие сверху (у Авито ID растут со временем).
 * От привязки порядок не зависит: выбрал товар — карточка остаётся на месте.
 */
export function sortListings(listings: Listing[]): Listing[] {
  return [...listings].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || Number(b.id) - Number(a.id));
}

/** «1 объявление», «3 объявления», «9 объявлений». */
export function listingsCount(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "объявление" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "объявления" : "объявлений";
  return `${n} ${word}`;
}
