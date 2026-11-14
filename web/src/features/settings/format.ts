const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export const formatSavedAt = (savedAt?: string) =>
  savedAt ? `Сохранено ${dateFormat.format(new Date(savedAt))}` : "Ещё не сохраняли";
