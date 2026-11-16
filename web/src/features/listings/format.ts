const dateTime = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

/** «16 ноября в 15:30». */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso)).replace(",", " в");

/** «16 ноября». */
export const formatDate = (iso: string) => date.format(new Date(iso));
