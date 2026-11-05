from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from .. import serialize as ser
from .. import statuses as S
from ..audit import audit
from ..db import get_db
from ..models import AuditEvent, Order, OrderItem, User
from ..security import current_user, require_roles, shop_ids_for
from ..services.orders import consume_order, set_status

router = APIRouter(prefix="/api", tags=["orders"])


def _scoped(db: Session, user: User):
    q = db.query(Order).options(selectinload(Order.items).selectinload(OrderItem.product),
                                selectinload(Order.labels), selectinload(Order.shop))
    ids = shop_ids_for(user)
    return q.filter(Order.shop_id.in_(ids)) if ids is not None else q


def _get(db: Session, user: User, order_id: int) -> Order:
    o = _scoped(db, user).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(404, "Заказ не найден")
    return o


@router.get("/orders")
def list_orders(status: str | None = None, shop_id: int | None = None, q: str | None = None,
                limit: int = 300, db: Session = Depends(get_db), user: User = Depends(current_user)):
    query = _scoped(db, user)
    if status:
        query = query.filter(Order.internal_status.in_(status.split(",")))
    if shop_id:
        query = query.filter(Order.shop_id == shop_id)
    if q:
        like = f"%{q.strip()}%"
        conds = [Order.external_order_id.ilike(like), Order.marketplace_id.ilike(like), Order.pvz_name.ilike(like),
                 Order.items.any(OrderItem.sku_snapshot.ilike(like))]
        digits = q.strip().upper().removeprefix("L-").lstrip("0")
        if digits.isdigit():
            conds += [Order.id == int(digits), Order.labels.any(id=int(digits))]
        query = query.filter(or_(*conds))
    orders = query.order_by(Order.ordered_at.desc().nullslast(), Order.id.desc()).limit(limit).all()
    batches = ser.active_batches(db, [o.id for o in orders])
    return [ser.order(o, batches.get(o.id)) for o in orders]


@router.get("/orders/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    o = _get(db, user, order_id)
    out = ser.order(o, ser.active_batches(db, [o.id]).get(o.id))
    out["raw_payload"] = o.raw_payload
    out["labels"] = [ser.label(lb) for lb in o.labels]
    label_ids = [lb.id for lb in o.labels]
    events = db.query(AuditEvent).filter(
        or_((AuditEvent.entity_type == "order") & (AuditEvent.entity_id == o.id),
            (AuditEvent.entity_type == "label") & AuditEvent.entity_id.in_(label_ids or [-1]))
    ).order_by(AuditEvent.id).all()
    out["history"] = [{"at": e.created_at, "type": e.entity_type, "action": e.action, "data": e.data, "user_id": e.user_id}
                      for e in events]
    return out


@router.post("/orders/{order_id}/pick")
def pick(order_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("shop_admin", "operator"))):
    o = _get(db, user, order_id)
    if o.internal_status != S.LABEL_PRINTED:
        raise HTTPException(409, "Собрать можно только заказ с напечатанной этикеткой")
    set_status(db, o, S.PICKED, "Собран и проверен", user)
    db.commit()
    return ser.order(o)


@router.post("/orders/{order_id}/dispatch")
def dispatch(order_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("shop_admin", "operator"))):
    o = _get(db, user, order_id)
    if o.internal_status not in (S.PICKED, S.READY_FOR_DISPATCH):
        raise HTTPException(409, "Сдать можно только собранный заказ")
    consume_order(db, o)
    # Внутренняя отметка — не подтверждение Авито (ТЗ, раздел 5)
    set_status(db, o, S.DISPATCHED, "Сдан в ПВЗ (внутренняя отметка)", user)
    audit(db, user, "order", o.id, "dispatched")
    db.commit()
    return ser.order(o)
