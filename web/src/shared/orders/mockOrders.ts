import type { DeliveryService, Order, OrderStatus, StatusChange } from "./types";

// Тестовые заказы, пока API заказов Авито отвечает 403. Даты считаются от сегодняшнего дня,
// чтобы фильтры «Сегодня» и «7 дней» всегда было на чём проверить.
// Пометки проблем и резервы здесь не задаются: их ставит сверка со складом (shared/fulfillment).

const SERVICES: DeliveryService[] = ["cdek", "avito", "post", "yandex", "fivepost", "cdek", "avito", "avito"];
const BUYERS = ["Анна", "Илья", "Марина", "Денис", "Ольга", "Кирилл"];

const FLARE = "Джинсы Клёш";
const PIPES = "Джинсы Трубы";
const PUFFER = "Куртка Дутая";

/** [статус, сколько дней назад, время]. Первый шаг — «Заказан». */
type Step = [OrderStatus, number, string];

function at(daysAgo: number, time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Номер отправления в формате службы: так его показывает кабинет Авито. */
function dispatch(service: DeliveryService, id: string): string {
  const tail = id.slice(-6);
  if (service === "post") return `80512${tail}123`;
  if (service === "cdek") return `10348${tail}`;
  if (service === "yandex") return `P04${tail}537`;
  if (service === "fivepost") return `P00${tail}305`;
  return `5133${tail}`;
}

/** Срок отгрузки — три дня после заказа, YYYY-MM-DD. */
function shipBy(createdAt: string): string {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function order(id: string, product: string, size: string | null, price: number, steps: Step[]): Order {
  const history: StatusChange[] = steps.map(([status, daysAgo, time]) => ({ status, at: at(daysAgo, time) }));
  const n = Number(id.slice(-3));
  const service = SERVICES[n % SERVICES.length];
  return {
    id,
    createdAt: history[0].at,
    product,
    size: size ?? undefined,
    service,
    dispatchNumber: dispatch(service, id),
    shipBy: shipBy(history[0].at),
    price,
    buyer: BUYERS[n % BUYERS.length],
    status: history[history.length - 1].status,
    history,
  };
}

export const MOCK_ORDERS: Order[] = [
  // Сегодня
  order("4812339455", PIPES, null, 3290, [["ordered", 0, "12:40"]]),
  order("4812339318", FLARE, null, 3490, [["ordered", 0, "12:05"]]),
  order("4812339207", PUFFER, null, 6900, [["ordered", 0, "11:48"]]),
  order("4812339164", FLARE, null, 3490, [["ordered", 0, "11:31"]]),
  order("4812339102", FLARE, null, 3490, [["ordered", 0, "11:20"]]),
  order("4812338871", PIPES, "31M", 3290, [["ordered", 0, "10:05"]]),
  order("4812338540", FLARE, "34L", 3490, [["ordered", 0, "09:12"]]),
  order("4812337016", PUFFER, "M", 6900, [["ordered", 0, "08:47"]]),
  order("4812336923", FLARE, "31M", 3490, [["ordered", 0, "08:30"]]),
  order("4812336580", FLARE, "30S", 3490, [["ordered", 0, "08:12"]]),
  order("4812336247", PIPES, "30S", 3290, [["ordered", 0, "07:58"]]),
  order("4812335914", FLARE, "29M", 3490, [["ordered", 0, "07:41"]]),
  order("4812335631", PIPES, "32S", 3290, [["ordered", 0, "07:15"]]),
  order("4812335308", PUFFER, "L", 6900, [["ordered", 0, "06:52"]]),
  order("4812334975", FLARE, "32L", 3490, [["ordered", 0, "02:20"]]),
  // Вчера
  order("4812330877", FLARE, "30S", 3490, [["ordered", 1, "19:31"], ["packed", 0, "10:40"]]),
  order("4812330412", PIPES, "30S", 3290, [["ordered", 1, "17:02"], ["packed", 0, "10:42"]]),
  order("4812329905", FLARE, "33M", 3490, [["ordered", 1, "14:15"]]),
  order("4812329762", FLARE, "31M", 3490, [["ordered", 1, "13:30"]]),
  order("4812329644", PIPES, "33M", 3290, [["ordered", 1, "13:02"]]),
  order("4812329436", PIPES, "30S", 3290, [["ordered", 1, "12:10"]]),
  order("4812329217", FLARE, "30S", 3490, [["ordered", 1, "11:44"]]),
  order("4812329051", PIPES, "34L", 3290, [["ordered", 1, "10:05"]]),
  order("4812329588", PIPES, null, 3290, [["ordered", 1, "12:50"]]),
  order("4812328733", FLARE, "31S", 3490, [["ordered", 1, "09:18"], ["cancelled", 1, "15:44"]]),
  // 2–3 дня назад
  order("4812321460", PIPES, "34L", 3290, [["ordered", 2, "18:22"], ["packed", 1, "11:05"], ["sent", 1, "16:30"]]),
  order("4812320194", FLARE, "32M", 3490, [
    ["ordered", 2, "13:40"],
    ["packed", 2, "17:15"],
    ["sent", 1, "12:10"],
    ["inTransit", 0, "07:55"],
  ]),
  order("4812318027", PIPES, "30M", 3290, [
    ["ordered", 3, "20:11"],
    ["packed", 2, "10:30"],
    ["sent", 2, "16:00"],
    ["inTransit", 1, "08:20"],
  ]),
  order("4812316652", PUFFER, "XL", 6900, [
    ["ordered", 3, "15:47"],
    ["packed", 3, "18:02"],
    ["sent", 2, "11:15"],
    ["inTransit", 1, "06:40"],
    ["arrived", 0, "09:30"],
  ]),
  // Неделя
  order("4812301355", FLARE, "30M", 3490, [
    ["ordered", 5, "12:03"],
    ["packed", 5, "16:20"],
    ["sent", 4, "11:00"],
    ["inTransit", 3, "08:15"],
    ["arrived", 2, "13:45"],
  ]),
  order("4812298740", PIPES, "31M", 3290, [
    ["ordered", 6, "10:28"],
    ["packed", 6, "14:40"],
    ["sent", 5, "12:30"],
    ["inTransit", 4, "07:10"],
    ["arrived", 3, "15:20"],
    ["completed", 2, "18:05"],
  ]),
  order("4812295513", FLARE, "29M", 3490, [
    ["ordered", 6, "09:02"],
    ["packed", 6, "13:15"],
    ["sent", 5, "11:50"],
    ["inTransit", 4, "08:00"],
    ["arrived", 3, "12:40"],
    ["completed", 1, "19:22"],
  ]),
  order("4812290186", PIPES, "33M", 3290, [
    ["ordered", 7, "16:44"],
    ["packed", 6, "10:10"],
    ["sent", 6, "15:30"],
    ["inTransit", 5, "07:45"],
    ["arrived", 4, "11:10"],
    ["returnTransit", 1, "10:00"],
  ]),
  // Старше недели
  order("4812254407", PIPES, "32M", 3290, [
    ["ordered", 11, "14:20"],
    ["packed", 11, "17:40"],
    ["sent", 10, "12:00"],
    ["inTransit", 9, "08:30"],
    ["arrived", 8, "10:15"],
    ["returnTransit", 4, "09:00"],
    ["returnCheck", 0, "12:30"],
  ]),
  order("4812248861", FLARE, "31S", 3490, [
    ["ordered", 12, "11:11"],
    ["packed", 12, "15:00"],
    ["sent", 11, "13:20"],
    ["inTransit", 10, "07:50"],
    ["arrived", 9, "14:05"],
    ["returnTransit", 5, "10:30"],
    ["returnCheck", 2, "16:00"],
    ["returnStock", 2, "16:25"],
  ]),
  order("4812240019", FLARE, "32L", 3490, [
    ["ordered", 14, "18:30"],
    ["packed", 13, "10:00"],
    ["sent", 13, "14:45"],
    ["inTransit", 12, "08:10"],
    ["arrived", 11, "12:00"],
    ["returnTransit", 7, "09:40"],
    ["returnCheck", 4, "11:20"],
    ["defect", 4, "11:50"],
  ]),
  order("4812231775", PUFFER, "L", 6900, [
    ["ordered", 16, "13:05"],
    ["packed", 16, "16:30"],
    ["sent", 15, "12:15"],
    ["inTransit", 14, "07:30"],
    ["arrived", 13, "10:50"],
    ["completed", 12, "17:40"],
  ]),
  order("4812210342", PIPES, "32S", 3290, [
    ["ordered", 22, "10:40"],
    ["packed", 22, "14:00"],
    ["sent", 21, "11:30"],
    ["inTransit", 20, "08:00"],
    ["arrived", 19, "13:15"],
    ["completed", 18, "20:10"],
  ]),
  order("4812187628", FLARE, "30S", 3490, [
    ["ordered", 40, "15:25"],
    ["packed", 40, "18:00"],
    ["sent", 39, "12:40"],
    ["inTransit", 38, "07:20"],
    ["arrived", 37, "11:05"],
    ["completed", 35, "16:30"],
  ]),
];
