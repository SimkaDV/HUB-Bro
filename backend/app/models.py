from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import DateTime as _DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class DateTime(TypeDecorator):
    """Всегда UTC с таймзоной: SQLite её теряет, и браузер сдвигал бы время."""
    impl = _DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return value.astimezone(timezone.utc) if value is not None and value.tzinfo else value

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


class Shop(Base):
    __tablename__ = "shops"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(20), unique=True)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    avito_account_id: Mapped[str | None] = mapped_column(String(50))
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20))
    # None — доступ ко всем магазинам
    shop_id: Mapped[int | None] = mapped_column(ForeignKey("shops.id"))
    password_hash: Mapped[str] = mapped_column(String(300))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class AuthToken(Base):
    __tablename__ = "auth_tokens"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship()


class Product(Base):
    """Вариация товара (SKU). Остатки пока без адресов — адресное хранение в P1."""
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(50), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    category: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(100))
    size: Mapped[str] = mapped_column(String(20))
    color: Mapped[str] = mapped_column(String(50))
    location_code: Mapped[str | None] = mapped_column(String(50))
    on_hand: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[int] = mapped_column(Integer, default=0)
    quarantine: Mapped[int] = mapped_column(Integer, default=0)


class ProductMapping(Base):
    """Объявление/товар Авито → наш SKU, отдельно для каждого магазина."""
    __tablename__ = "product_mappings"
    __table_args__ = (UniqueConstraint("shop_id", "external_item_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"))
    external_item_id: Mapped[str] = mapped_column(String(100))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("source", "account_id", "external_order_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    source: Mapped[str] = mapped_column(String(20), default="avito")
    account_id: Mapped[str] = mapped_column(String(50))
    external_order_id: Mapped[str] = mapped_column(String(100))
    marketplace_id: Mapped[str | None] = mapped_column(String(100))
    external_status: Mapped[str | None] = mapped_column(String(50))
    internal_status: Mapped[str] = mapped_column(String(30), index=True)
    delivery_type: Mapped[str | None] = mapped_column(String(100))
    pvz_name: Mapped[str | None] = mapped_column(String(300))
    pvz_address: Mapped[str | None] = mapped_column(String(500))
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ordered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw_payload: Mapped[dict] = mapped_column(JSON)
    payload_checksum: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

    shop: Mapped[Shop] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    labels: Mapped[list["Label"]] = relationship(back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    external_item_id: Mapped[str] = mapped_column(String(100))
    title_snapshot: Mapped[str] = mapped_column(String(300))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    sku_snapshot: Mapped[str | None] = mapped_column(String(50))
    qty: Mapped[int] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer, default=0)
    reserved: Mapped[bool] = mapped_column(Boolean, default=False)

    order: Mapped[Order] = relationship(back_populates="items")
    product: Mapped[Product | None] = relationship()


class Label(Base):
    """Официальный транспортный документ. Файл хранится как есть, без изменений."""
    __tablename__ = "labels"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    label_type: Mapped[str] = mapped_column(String(20), default="transport")
    file_path: Mapped[str] = mapped_column(String(500))
    file_sha256: Mapped[str] = mapped_column(String(64))
    is_mock: Mapped[bool] = mapped_column(Boolean, default=False)
    valid: Mapped[bool] = mapped_column(Boolean, default=True)
    invalid_reason: Mapped[str | None] = mapped_column(String(300))
    print_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    order: Mapped[Order] = relationship(back_populates="labels")

    @property
    def code(self) -> str:
        return f"L-{self.id:06d}"


class PrintStation(Base):
    """Компьютер с Print Agent."""
    __tablename__ = "print_stations"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    pairing_code: Mapped[str | None] = mapped_column(String(20))
    pairing_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hostname: Mapped[str | None] = mapped_column(String(200))
    agent_version: Mapped[str | None] = mapped_column(String(50))
    printers: Mapped[list] = mapped_column(JSON, default=list)
    default_printer: Mapped[str | None] = mapped_column(String(200))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PrintBatch(Base):
    __tablename__ = "print_batches"
    id: Mapped[int] = mapped_column(primary_key=True)
    # draft → printing → printed → closed; failed — есть упавшие задания; canceled
    status: Mapped[str] = mapped_column(String(20), default="draft")
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    filters: Mapped[dict] = mapped_column(JSON, default=dict)
    station_id: Mapped[int | None] = mapped_column(ForeignKey("print_stations.id"))
    printer_name: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    orders: Mapped[list[Order]] = relationship(secondary="print_batch_orders", order_by="Order.id")
    jobs: Mapped[list["PrintJob"]] = relationship(back_populates="batch", order_by="PrintJob.id")

    @property
    def code(self) -> str:
        return f"B-{self.id:05d}"


class PrintBatchOrder(Base):
    __tablename__ = "print_batch_orders"
    batch_id: Mapped[int] = mapped_column(ForeignKey("print_batches.id"), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), primary_key=True)


class PrintJob(Base):
    """Одна попытка печати одного документа на конкретном принтере."""
    __tablename__ = "print_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("print_batches.id"), index=True)
    # None — тестовая страница
    label_id: Mapped[int | None] = mapped_column(ForeignKey("labels.id"))
    station_id: Mapped[int] = mapped_column(ForeignKey("print_stations.id"), index=True)
    printer_name: Mapped[str | None] = mapped_column(String(200))
    # queued → sent → done | failed
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    kind: Mapped[str] = mapped_column(String(20), default="batch")  # batch | reprint | test
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str | None] = mapped_column(String(300))
    error: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

    batch: Mapped[PrintBatch | None] = relationship(back_populates="jobs")
    label: Mapped[Label | None] = relationship()


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, index=True)
    action: Mapped[str] = mapped_column(String(50))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class IntegrationEvent(Base):
    __tablename__ = "integration_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int | None] = mapped_column(ForeignKey("shops.id"))
    source: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(30))  # sync | order | error
    external_id: Mapped[str | None] = mapped_column(String(100))
    message: Mapped[str | None] = mapped_column(Text)
    error: Mapped[bool] = mapped_column(Boolean, default=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PrintPreset(Base):
    """Сохранённый фильтр печати для «Пульта». Общий для всех компьютеров."""
    __tablename__ = "print_presets"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    # shop_id, model, size, pvz_name, deadline_hours — все необязательные
    filters: Mapped[dict] = mapped_column(JSON, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
