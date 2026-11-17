// Объявления Авито нужны нескольким разделам: «Объявления» привязывают их к моделям, склад показывает,
// сколько объявлений у модели, позже заказ будет узнавать товар по объявлению. Поэтому живут в shared.
// Хранятся в браузере и на сервере (shared/lib/sync.ts). Описание — docs/LISTINGS.md
import { createStore } from "@/shared/lib/store";
import { fetchListings } from "./avito";
import { mergeListings } from "./listings";
import type { ListingsState } from "./types";

export { fetchListingDetails, type ListingDetails } from "./avito";
export { isActive, linkedModel, listingsCount, listingStatus, sortListings, STATUS_META } from "./listings";
export type { Listing, ListingStats, ListingStatus, ListingsState } from "./types";

const STORAGE_KEY = "hubbro.listings.v2";

export const listingsStore = createStore<ListingsState>(STORAGE_KEY, () => ({ listings: [] }));

export const useListings = listingsStore.use;

/** Забрать все объявления с Авито и слить с тем, что уже есть (привязки сохраняются). */
export async function syncListings() {
  const fetched = await fetchListings();
  const now = new Date().toISOString();
  listingsStore.set((s) => ({ listings: mergeListings(s.listings, fetched, now), syncedAt: now }));
}

/** Привязать объявление к модели склада или отвязать (`null`). */
export function linkListing(id: string, modelId: string | null) {
  listingsStore.set((s) => ({
    ...s,
    listings: s.listings.map((l) =>
      l.id === id ? { ...l, modelId, linkedAt: modelId ? new Date().toISOString() : undefined } : l,
    ),
  }));
}

/** Отвязать все объявления модели — когда модель удаляют. */
export function unlinkModel(modelId: string) {
  listingsStore.set((s) => ({
    ...s,
    listings: s.listings.map((l) => (l.modelId === modelId ? { ...l, modelId: null, linkedAt: undefined } : l)),
  }));
}
