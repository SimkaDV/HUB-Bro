// Объявления Авито и их привязка к моделям склада. Описание — docs/LISTINGS.md

/** Статус объявления на Авито. */
export type ListingStatus = "active" | "old" | "removed" | "blocked" | "rejected";

/** Статистика за последние 30 дней. */
export type ListingStats = {
  views: number;
  contacts: number;
  favorites: number;
};

export type Listing = {
  /** ID объявления на Авито. Не меняется, даже если поменять название. */
  id: string;
  title: string;
  /** Цена на Авито, ₽. */
  price: number;
  status: ListingStatus;
  url: string;
  /** Категория Авито: «Одежда, обувь, аксессуары». */
  category: string;
  address: string;
  /** Модель склада (Model.id), которую продаёт объявление. null — ещё не привязано. */
  modelId: string | null;
  /** Когда привязали к модели, ISO. */
  linkedAt?: string;
  stats?: ListingStats;
  /** Когда впервые увидели при обновлении, ISO. */
  firstSeenAt: string;
  /** Когда последний раз пришло с Авито, ISO. */
  syncedAt: string;
  /** Авито перестал его отдавать (удалено насовсем). Запись остаётся: по ней могут быть заказы. */
  goneAt?: string;
};

export type ListingsState = {
  listings: Listing[];
  /** Когда последний раз обновляли с Авито, ISO. */
  syncedAt?: string;
};
