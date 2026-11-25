// Объявления Авито нужны нескольким разделам: «Объявления» привязывают их к моделям, склад показывает,
// сколько объявлений у модели, позже заказ будет узнавать товар по объявлению. Поэтому живут в shared.
// Хранятся в браузере и на сервере данных — файл listings.json (shared/lib/sync.ts). Описание — docs/LISTINGS.md
import { createFileStore } from "@/shared/lib/store";
import { fetchListings } from "./avito";
import { mergeListings } from "./listings";
import type { Listing, ListingsState } from "./types";

export { fetchListingDetails, type ListingDetails } from "./avito";
export { isActive, linkedModel, listingsCount, listingStatus, sortListings, STATUS_META } from "./listings";
export type { Listing, ListingStats, ListingStatus, ListingsState } from "./types";

type OldListing = Listing & { modelId?: string | null };

export const listingsStore = createFileStore<ListingsState>("listings", 1, () => ({ listings: [] }), {
  read: (r) => ({
    // Старая привязка (modelId) — на всякий случай тоже читаем как productId.
    listings: (Array.isArray(r.listings) ? (r.listings as OldListing[]) : []).map(({ modelId, ...l }) => ({
      ...l,
      productId: l.productId ?? modelId ?? null,
    })),
    ...(typeof r.syncedAt === "string" ? { syncedAt: r.syncedAt } : {}),
  }),
  write: (s) => ({ listings: s.listings, syncedAt: s.syncedAt }),
});

export const useListings = listingsStore.use;

/** Забрать все объявления с Авито и слить с тем, что уже есть (привязки сохраняются). */
export async function syncListings() {
  const fetched = await fetchListings();
  const now = new Date().toISOString();
  listingsStore.set((s) => ({ listings: mergeListings(s.listings, fetched, now), syncedAt: now }));
}

/** Привязать объявление к товару или отвязать (`null`). */
export function linkListing(id: string, productId: string | null) {
  listingsStore.set((s) => ({
    ...s,
    listings: s.listings.map((l) =>
      l.id === id ? { ...l, productId, linkedAt: productId ? new Date().toISOString() : undefined } : l,
    ),
  }));
}

/** Отвязать все объявления товара — когда модель удаляют. */
export function unlinkModel(productId: string) {
  listingsStore.set((s) => ({
    ...s,
    listings: s.listings.map((l) => (l.productId === productId ? { ...l, productId: null, linkedAt: undefined } : l)),
  }));
}
