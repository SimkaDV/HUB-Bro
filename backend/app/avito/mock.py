"""Заглушка Авито: заказы лежат в JSON-файле на диске, как будто их отдаёт API.

Форма payload — предположение. Когда подключат Доставку для бизнеса,
сверим с реальным ответом и поправим normalize() в client.py.
"""
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..config import settings
from ..pdf import mock_transport_label
from .base import EXT_WAITING, NormalizedItem, NormalizedOrder

PVZ = [
    ("ПВЗ Авито №101", "ул. Ленина, 12"),
    ("ПВЗ Авито №117", "пр. Мира, 45, вход со двора"),
    ("ПВЗ Авито №132", "ул. Садовая, 3"),
    ("Постамат Авито №208", "ТЦ «Галерея», 1 этаж"),
    ("ПВЗ Авито №240", "ул. Гагарина, 88"),
]

MODELS = [("KL", "Клёш"), ("TR", "Трубы"), ("BN", "Бананы")]
SIZES = ["28", "29", "30", "31", "32", "33", "34"]
COLORS = [("BLK", "чёрный"), ("BLU", "синий")]


def catalog() -> list[dict]:
    """Демо-каталог SKU в формате ТЗ: BRO-KL-030-BLK."""
    out = []
    for i, (mcode, mname) in enumerate(MODELS):
        for j, size in enumerate(SIZES):
            for k, (ccode, cname) in enumerate(COLORS):
                out.append({
                    "sku": f"BRO-{mcode}-0{size}-{ccode}",
                    "title": f"Джинсы {mname.lower()} {cname}, {size}",
                    "category": "Джинсы", "model": mname, "size": size, "color": cname,
                    "location_code": f"A-R0{i + 1}-S0{k + 1}-B{j + 1:02d}",
                })
    return out


def avito_item_id(shop_code: str, sku: str) -> str:
    return f"{shop_code}-{sku}"


class MockAvito:
    def __init__(self, account_id: str, shop_code: str, shop_name: str):
        self.account_id = account_id
        self.shop_code = shop_code
        self.shop_name = shop_name
        self.path = Path(settings.storage_dir) / "mock_avito" / f"{account_id}.json"

    def _load(self) -> list[dict]:
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text())

    def _save(self, orders: list[dict]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(orders, ensure_ascii=False, indent=1))

    def list_orders(self) -> list[dict]:
        return self._load()

    def generate(self, count: int, seed: int | None = None) -> list[dict]:
        rnd = random.Random(seed)
        orders = self._load()
        skus = [p["sku"] for p in catalog()]
        start = int(datetime.now().timestamp()) % 10_000_000
        now = datetime.now(timezone.utc)
        new = []
        for n in range(count):
            ext_id = f"7{self.account_id[-3:]}{start + len(orders) + n:07d}"
            items = []
            for _ in range(1 if rnd.random() < 0.85 else 2):
                if rnd.random() < 0.07:
                    item_id, title = f"{self.shop_code}-AV{rnd.randint(1000, 9999)}", "Джинсы (новое объявление без SKU)"
                else:
                    sku = rnd.choice(skus)
                    item_id, title = avito_item_id(self.shop_code, sku), next(p["title"] for p in catalog() if p["sku"] == sku)
                items.append({"avitoId": item_id, "title": title, "count": 1, "price": rnd.choice([2990, 3490, 3990])})
            pvz = rnd.choice(PVZ)
            created = now - timedelta(hours=rnd.randint(0, 40))
            new.append({
                "id": ext_id,
                "marketplaceId": f"{ext_id[:5]}-{ext_id[5:]}",
                "status": "on_confirmation" if rnd.random() < 0.12 else "ready_to_ship",
                "createdAt": created.isoformat(),
                "delivery": {
                    "serviceType": "pvz",
                    "serviceName": "Авито Доставка",
                    "terminal": {"name": pvz[0], "address": pvz[1]},
                    "shipBefore": (created + timedelta(hours=rnd.choice([24, 48, 72]))).isoformat(),
                },
                "items": items,
            })
        self._save(orders + new)
        return new

    def update(self, ext_id: str, **changes) -> dict | None:
        orders = self._load()
        for o in orders:
            if o["id"] == ext_id:
                if "status" in changes:
                    o["status"] = changes["status"]
                if "pvz" in changes:
                    name, address = changes["pvz"]
                    o["delivery"]["terminal"] = {"name": name, "address": address}
                self._save(orders)
                return o
        return None

    def normalize(self, raw: dict) -> NormalizedOrder:
        d = raw.get("delivery") or {}
        t = d.get("terminal") or {}
        return NormalizedOrder(
            external_order_id=str(raw["id"]),
            marketplace_id=raw.get("marketplaceId"),
            external_status=raw.get("status", ""),
            delivery_type=d.get("serviceType"),
            pvz_name=t.get("name"),
            pvz_address=t.get("address"),
            deadline_at=_dt(d.get("shipBefore")),
            ordered_at=_dt(raw.get("createdAt")),
            items=[NormalizedItem(str(i["avitoId"]), i.get("title", ""), int(i.get("count", 1)), int(i.get("price", 0)))
                   for i in raw.get("items", [])],
        )

    def get_label_pdf(self, raw: dict) -> bytes | None:
        if raw.get("status") in EXT_WAITING:
            return None
        n = self.normalize(raw)
        return mock_transport_label(
            order_ext_id=n.external_order_id, marketplace_id=n.marketplace_id or "",
            shop=self.shop_name, pvz=f"{n.pvz_name}, {n.pvz_address}",
            items=[f"{i.title} × {i.qty}" for i in n.items],
        )


def _dt(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s) if s else None
