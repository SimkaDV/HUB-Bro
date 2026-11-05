from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import serialize as ser
from .. import statuses as S
from ..db import get_db
from ..models import Order, User
from ..security import current_user
from .orders import _scoped

router = APIRouter(prefix="/api/fulfillment", tags=["fulfillment"])

QUEUE = S.PRINTABLE | S.BLOCKED | S.PROBLEM | {S.LABEL_PRINTED, S.PICKED}


@router.get("/queue")
def queue(shop_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = _scoped(db, user).filter(Order.internal_status.in_(QUEUE))
    if shop_id:
        q = q.filter(Order.shop_id == shop_id)
    orders = q.order_by(Order.deadline_at.is_(None), Order.deadline_at, Order.id).all()
    batches = ser.active_batches(db, [o.id for o in orders])
    items = [ser.order(o, batches.get(o.id)) for o in orders]
    # Счётчики считаются по всей очереди и не зависят от фильтров на экране
    counts = {
        "total": len(items),
        "ready": sum(o.internal_status in S.PRINTABLE and o.id not in batches for o in orders),
        "in_batch": sum(o.id in batches for o in orders),
        "blocked": sum(o.internal_status in S.BLOCKED for o in orders),
        "problem": sum(o.internal_status in S.PROBLEM for o in orders),
        "printed": sum(o.internal_status in (S.LABEL_PRINTED, S.PICKED) for o in orders),
    }
    return {"counts": counts, "orders": items}
