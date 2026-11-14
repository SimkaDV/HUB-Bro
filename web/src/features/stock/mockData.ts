import type { Batch, Model, SizeStock, Unit, UnitStatus } from "./types";

// Тестовые данные, пока нет бэкенда.

const PICKUP_POINTS = ["Avito · Профсоюзная 56", "Avito · Ленинский 30", "Avito · Мира 112", "Avito · Тверская 18"];
const DATES = ["10.11", "11.11", "12.11", "13.11", "14.11"];

type UnitRow = [UnitStatus, number, string];

function size(name: string, stock: [string, number][], units: UnitRow[] = []): SizeStock {
  return {
    size: name,
    stock: stock.map(([batchId, qty]) => ({ batchId, qty })),
    units: units.map(
      ([status, order, batchId]): Unit => ({
        status,
        order,
        batchId,
        orderDate: DATES[order % DATES.length],
        pickupPoint: status === "reserve" ? undefined : PICKUP_POINTS[order % PICKUP_POINTS.length],
      }),
    ),
  };
}

type MockModel = Omit<Model, "batches"> & { batches: Omit<Batch, "delivered" | "addedAt">[] };

const MODELS: MockModel[] = [
  {
    id: "flare",
    name: "Джинсы Клёш",
    category: "Джинсы",
    batches: [
      { id: "f1", name: "Клёш 02.11", date: "2026-11-02", from: "Садовод", price: 1450 },
      { id: "f2", name: "Клёш 12.11", date: "2026-11-12", from: "Садовод", price: 1400 },
    ],
    sizes: [
      size("29M", [], [["sent", 1188, "f1"]]),
      size("30S", [["f1", 4], ["f2", 9]], [["reserve", 1241, "f1"]]),
      size("30M", [["f1", 2], ["f2", 6]], [["delivered", 1219, "f1"]]),
      size("31S", [["f1", 1], ["f2", 2]], [["reserve", 1238, "f1"], ["returnTransit", 1176, "f1"]]),
      size(
        "31M",
        [["f1", 3], ["f2", 2]],
        [
          ["reserve", 1234, "f1"],
          ["returnStock", 1198, "f1"],
          ["sent", 1229, "f1"],
          ["delivered", 1221, "f1"],
          ["returnTransit", 1210, "f1"],
        ],
      ),
      size("32M", [["f1", 4], ["f2", 6]], [["sent", 1232, "f2"]]),
      size("32L", [["f1", 8], ["f2", 12]]),
      size("33M", [["f1", 5], ["f2", 9]], [["reserve", 1240, "f1"]]),
      size("34M", [["f2", 4]]),
    ],
  },
  {
    id: "pipe",
    name: "Джинсы Трубы",
    category: "Джинсы",
    batches: [
      { id: "p1", name: "Трубы 05.11", date: "2026-11-05", from: "Южные ворота", price: 1300 },
      { id: "p2", name: "Трубы 13.11", date: "2026-11-13", from: "Южные ворота", price: 1350 },
    ],
    sizes: [
      size("30S", [["p1", 6], ["p2", 10]], [["reserve", 1243, "p1"]]),
      size("30M", [["p1", 3], ["p2", 4]], [["sent", 1230, "p1"]]),
      size("31M", [["p2", 2]], [["reserve", 1239, "p1"], ["reserve", 1242, "p1"], ["delivered", 1215, "p1"]]),
      size("32S", [["p1", 5], ["p2", 7]]),
      size("32M", [["p1", 2], ["p2", 8]], [["returnStock", 1201, "p1"]]),
      size("33M", [], [["returnTransit", 1207, "p1"]]),
      size("34L", [["p1", 4], ["p2", 5]], [["sent", 1227, "p1"]]),
    ],
  },
  {
    id: "puffer",
    name: "Куртка Дутая",
    category: "Куртки",
    batches: [{ id: "d1", name: "Дутая 01.11", date: "2026-11-01", from: "Садовод", price: 3200 }],
    sizes: [
      size("S", [["d1", 2]]),
      size("M", [["d1", 6]], [["reserve", 1236, "d1"]]),
      size("L", [["d1", 11]]),
      size("XL", [["d1", 3]], [["delivered", 1224, "d1"]]),
    ],
  },
];

// «Пришло» в каждой поставке = что лежит на полке + что уже ушло по заказам.
export const MOCK_MODELS: Model[] = MODELS.map((m) => ({
  ...m,
  batches: m.batches.map((b) => ({
    ...b,
    addedAt: `${b.date}T12:00:00`,
    delivered: m.sizes
      .map((s) => ({
        size: s.size,
        qty:
          (s.stock.find((x) => x.batchId === b.id)?.qty ?? 0) + s.units.filter((u) => u.batchId === b.id).length,
      }))
      .filter((d) => d.qty > 0),
  })),
}));
