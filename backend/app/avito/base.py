from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol


@dataclass
class NormalizedItem:
    external_item_id: str
    title: str
    qty: int
    price: int


@dataclass
class NormalizedOrder:
    external_order_id: str
    marketplace_id: str | None
    external_status: str
    delivery_type: str | None
    pvz_name: str | None
    pvz_address: str | None
    deadline_at: datetime | None
    ordered_at: datetime | None
    items: list[NormalizedItem] = field(default_factory=list)


# Внешние статусы, которые мы различаем. Реальные значения сверить с payload Авито.
EXT_WAITING = {"on_confirmation"}
EXT_CANCELED = {"canceled"}


class OrderSource(Protocol):
    account_id: str

    def list_orders(self) -> list[dict]: ...

    def normalize(self, raw: dict) -> NormalizedOrder: ...

    def get_label_pdf(self, raw: dict) -> bytes | None: ...
