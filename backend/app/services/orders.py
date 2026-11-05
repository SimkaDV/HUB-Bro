"""Импорт заказов, резервирование и пересчёт внутреннего статуса."""
import hashlib
import json
import logging
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import statuses as S
from ..audit import audit
from ..avito import source_for
from ..avito.base import EXT_CANCELED, EXT_WAITING, OrderSource
from ..config import settings
from ..models import IntegrationEvent, Label, Order, OrderItem, PrintBatch, PrintBatchOrder, Product, ProductMapping, Shop, User

log = logging.getLogger(__name__)


def set_status(db: Session, order: Order, status: str, reason: str = "", user: User | None = None) -> None:
    if order.internal_status == status:
        return
    audit(db, user, "order", order.id, "status", frm=order.internal_status, to=status, reason=reason)
    order.internal_status = status


# --- резервы ---------------------------------------------------------------

def reserve_order(db: Session, order: Order) -> bool:
    """Резервирует все позиции или ни одной. Условный UPDATE не даст двум заказам занять последнюю единицу."""
    done: list[OrderItem] = []
    for item in order.items:
        if item.reserved:
            continue
        res = db.execute(
            update(Product)
            .where(Product.id == item.product_id,
                   Product.on_hand - Product.reserved - Product.quarantine >= item.qty)
            .values(reserved=Product.reserved + item.qty)
            .execution_options(synchronize_session=False)
        )
        if res.rowcount != 1:
            for d in done:
                _release_item(db, d)
            return False
        item.reserved = True
        done.append(item)
    return True


def _release_item(db: Session, item: OrderItem) -> None:
    db.execute(
        update(Product).where(Product.id == item.product_id)
        .values(reserved=Product.reserved - item.qty)
        .execution_options(synchronize_session=False)
    )
    item.reserved = False


def release_order(db: Session, order: Order) -> None:
    for item in order.items:
        if item.reserved:
            _release_item(db, item)


def consume_order(db: Session, order: Order) -> None:
    """Товар физически ушёл: списываем и остаток, и резерв."""
    for item in order.items:
        if item.reserved:
            db.execute(
                update(Product).where(Product.id == item.product_id)
                .values(on_hand=Product.on_hand - item.qty, reserved=Product.reserved - item.qty)
                .execution_options(synchronize_session=False)
            )
            item.reserved = False


# --- этикетки --------------------------------------------------------------

def valid_label(order: Order) -> Label | None:
    return next((lb for lb in order.labels if lb.valid), None)


def invalidate_labels(db: Session, order: Order, reason: str, user: User | None = None) -> None:
    for lb in order.labels:
        if lb.valid:
            lb.valid = False
            lb.invalid_reason = reason
            audit(db, user, "label", lb.id, "invalidated", reason=reason, printed=lb.print_count > 0)


def fetch_label(db: Session, order: Order, source: OrderSource) -> Label | None:
    data = source.get_label_pdf(order.raw_payload)
    if not data:
        return None
    digest = hashlib.sha256(data).hexdigest()
    path = Path(settings.storage_dir) / "labels" / f"{order.shop_id}" / f"{order.external_order_id}-{digest[:12]}.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    label = Label(order=order, file_path=str(path), file_sha256=digest, is_mock=settings.avito_mode != "live")
    db.add(label)
    db.flush()
    return label


# --- пересчёт статуса -------------------------------------------------------

def cancel_order(db: Session, order: Order, reason: str, user: User | None = None) -> None:
    release_order(db, order)
    printed = any(lb.print_count > 0 for lb in order.labels if lb.valid)
    invalidate_labels(db, order, reason, user)
    # Из черновых партий убираем сразу; напечатанную наклейку нужно снять физически
    db.query(PrintBatchOrder).filter(
        PrintBatchOrder.order_id == order.id,
        PrintBatchOrder.batch_id.in_(select(PrintBatch.id).where(PrintBatch.status == "draft")),
    ).delete(synchronize_session=False)
    set_status(db, order, S.CANCELED, reason + (" — снять напечатанную наклейку" if printed else ""), user)


def evaluate(db: Session, order: Order, source: OrderSource, user: User | None = None) -> None:
    ext = order.external_status or ""
    if ext in EXT_CANCELED:
        if order.internal_status != S.CANCELED:
            cancel_order(db, order, "Отменён в Авито", user)
        return
    if order.internal_status not in S.PRE_PRINT:
        return
    if any(i.product_id is None for i in order.items):
        release_order(db, order)
        set_status(db, order, S.NEEDS_MAPPING, "Товар не сопоставлен с SKU", user)
        return
    if not reserve_order(db, order):
        set_status(db, order, S.OUT_OF_STOCK, "Нет доступного остатка", user)
        return
    if ext in EXT_WAITING:
        set_status(db, order, S.WAITING_CONFIRMATION, "Ожидает подтверждения в Авито", user)
        return
    if not valid_label(order):
        try:
            label = fetch_label(db, order, source)
        except Exception as e:  # noqa: BLE001 — сетевые ошибки не должны ронять синк
            log.warning("label fetch failed for %s: %s", order.external_order_id, e)
            label = None
        if not label:
            set_status(db, order, S.READY_TO_PICK, "Транспортный документ ещё не получен", user)
            return
    set_status(db, order, S.LABEL_READY, "Получен транспортный документ", user)


def _map_product(db: Session, shop_id: int, external_item_id: str) -> Product | None:
    m = db.query(ProductMapping).filter_by(shop_id=shop_id, external_item_id=external_item_id).first()
    return db.get(Product, m.product_id) if m else None


def upsert_order(db: Session, shop: Shop, source: OrderSource, raw: dict) -> str:
    n = source.normalize(raw)
    checksum = hashlib.sha256(json.dumps(raw, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    order = db.query(Order).filter_by(source="avito", account_id=source.account_id,
                                      external_order_id=n.external_order_id).first()
    if order and order.payload_checksum == checksum:
        return "unchanged"

    result = "updated"
    pvz_changed = False
    if not order:
        result = "created"
        order = Order(shop_id=shop.id, source="avito", account_id=source.account_id,
                      external_order_id=n.external_order_id, internal_status=S.NEW)
        for it in n.items:
            p = _map_product(db, shop.id, it.external_item_id)
            order.items.append(OrderItem(
                external_item_id=it.external_item_id, title_snapshot=it.title, qty=it.qty, price=it.price,
                product_id=p.id if p else None, sku_snapshot=p.sku if p else None,
            ))
        db.add(order)
    else:
        pvz_changed = (order.pvz_name, order.pvz_address) != (n.pvz_name, n.pvz_address)

    order.marketplace_id = n.marketplace_id
    order.external_status = n.external_status
    order.delivery_type = n.delivery_type
    order.pvz_name, order.pvz_address = n.pvz_name, n.pvz_address
    order.deadline_at, order.ordered_at = n.deadline_at, n.ordered_at
    order.raw_payload, order.payload_checksum = raw, checksum
    db.flush()
    if result == "created":
        audit(db, None, "order", order.id, "imported", external_order_id=n.external_order_id)

    if pvz_changed and order.labels:
        invalidate_labels(db, order, "ПВЗ изменился")
        if order.internal_status in {S.LABEL_PRINTED, S.PICKED, S.READY_FOR_DISPATCH}:
            # Наклейка уже на товаре — вернём заказ к печати, evaluate получит новый документ
            set_status(db, order, S.READY_TO_PICK, "ПВЗ изменился, нужна новая этикетка")
    evaluate(db, order, source)
    return result


def sync_shop(db: Session, shop: Shop) -> dict:
    source = source_for(shop)
    stats = {"created": 0, "updated": 0, "unchanged": 0, "errors": 0}
    try:
        raws = source.list_orders()
    except Exception as e:  # noqa: BLE001
        db.add(IntegrationEvent(shop_id=shop.id, source="avito", kind="sync", message=str(e), error=True))
        db.commit()
        stats["errors"] += 1
        stats["error"] = str(e)
        return stats
    for raw in raws:
        try:
            with db.begin_nested():
                stats[upsert_order(db, shop, source, raw)] += 1
        except Exception as e:  # noqa: BLE001
            log.exception("order import failed")
            db.add(IntegrationEvent(shop_id=shop.id, source="avito", kind="order",
                                    external_id=str(raw.get("id")), message=str(e), error=True))
            stats["errors"] += 1
    db.add(IntegrationEvent(shop_id=shop.id, source="avito", kind="sync",
                            message=json.dumps(stats, ensure_ascii=False)))
    db.commit()
    return stats


def sync_all(db: Session) -> dict:
    return {shop.name: sync_shop(db, shop) for shop in db.query(Shop).order_by(Shop.id)}


def reevaluate_waiting(db: Session, shop_id: int | None = None, product_id: int | None = None) -> int:
    """После сопоставления SKU или приёмки товара — снова пробуем заказы с проблемами, старые первыми."""
    q = db.query(Order).filter(Order.internal_status.in_([S.NEEDS_MAPPING, S.OUT_OF_STOCK]))
    if shop_id:
        q = q.filter(Order.shop_id == shop_id)
    if product_id:
        q = q.filter(Order.items.any(OrderItem.product_id == product_id))
    n = 0
    for order in q.order_by(Order.deadline_at.is_(None), Order.deadline_at, Order.id):
        for item in order.items:
            if item.product_id is None:
                p = _map_product(db, order.shop_id, item.external_item_id)
                if p:
                    item.product_id, item.sku_snapshot = p.id, p.sku
        before = order.internal_status
        evaluate(db, order, source_for(order.shop))
        n += order.internal_status != before
    return n
