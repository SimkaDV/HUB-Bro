import { avitoRequest, avitoUserId } from "@/shared/avito/api";
import type { FetchedListing } from "./listings";
import type { ListingStats, ListingStatus } from "./types";

// Запросы к Авито за объявлениями. Что какой запрос отдаёт — docs/LISTINGS.md, «Откуда берём».

type ItemsResponse = {
  resources: {
    id: number;
    title: string;
    price: number;
    status: ListingStatus;
    url: string;
    category?: { name: string };
    address?: string;
  }[];
};

type StatsResponse = {
  result: { items: { itemId: number; stats: { uniqViews?: number; uniqContacts?: number; uniqFavorites?: number }[] }[] };
};

const PER_PAGE = 100;
const ALL_STATUSES = "active,removed,old,blocked,rejected";
const STATS_DAYS = 30;
const STATS_CHUNK = 200;

/** Все объявления аккаунта во всех статусах, со статистикой за 30 дней. */
export async function fetchListings(): Promise<FetchedListing[]> {
  const items: ItemsResponse["resources"] = [];
  for (let page = 1; ; page++) {
    const { resources } = await avitoRequest<ItemsResponse>(`/core/v1/items?per_page=${PER_PAGE}&page=${page}&status=${ALL_STATUSES}`);
    items.push(...resources);
    if (resources.length < PER_PAGE) break;
  }
  const stats = await fetchStats(items.map((i) => i.id)).catch(() => new Map<string, ListingStats>());
  return items.map((i) => ({
    id: String(i.id),
    title: i.title,
    price: i.price,
    status: i.status,
    url: i.url,
    category: i.category?.name ?? "",
    address: i.address ?? "",
    stats: stats.get(String(i.id)),
  }));
}

async function fetchStats(ids: number[]): Promise<Map<string, ListingStats>> {
  const userId = await avitoUserId();
  const to = new Date();
  const from = new Date(to.getTime() - (STATS_DAYS - 1) * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const out = new Map<string, ListingStats>();
  for (let i = 0; i < ids.length; i += STATS_CHUNK) {
    const { result } = await avitoRequest<StatsResponse>(`/stats/v1/accounts/${userId}/items`, {
      method: "POST",
      body: {
        dateFrom: day(from),
        dateTo: day(to),
        itemIds: ids.slice(i, i + STATS_CHUNK),
        fields: ["uniqViews", "uniqContacts", "uniqFavorites"],
        periodGrouping: "month",
      },
    });
    for (const item of result.items) {
      out.set(String(item.itemId), {
        views: item.stats.reduce((s, x) => s + (x.uniqViews ?? 0), 0),
        contacts: item.stats.reduce((s, x) => s + (x.uniqContacts ?? 0), 0),
        favorites: item.stats.reduce((s, x) => s + (x.uniqFavorites ?? 0), 0),
      });
    }
  }
  return out;
}

export type ListingDetails = {
  /** Когда размещено и до какого числа показывается, ISO. */
  startTime?: string;
  finishTime?: string;
};

/** Подробности одного объявления: даты размещения. Запрашиваем, когда карточку раскрыли. */
export async function fetchListingDetails(id: string): Promise<ListingDetails> {
  const userId = await avitoUserId();
  const d = await avitoRequest<{ start_time?: string; finish_time?: string }>(`/core/v1/accounts/${userId}/items/${id}/`);
  return { startTime: d.start_time, finishTime: d.finish_time };
}
