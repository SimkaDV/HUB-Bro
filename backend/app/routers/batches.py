from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import serialize as ser
from ..audit import audit
from ..db import get_db
from ..models import PrintBatch, PrintStation, User, now
from ..security import current_user, require_roles
from ..services import printing

router = APIRouter(prefix="/api/print-batches", tags=["print"])
Operator = require_roles("shop_admin", "operator")


class BatchIn(BaseModel):
    order_ids: list[int]
    filters: dict = {}


class PrintIn(BaseModel):
    station_id: int
    printer_name: str | None = None


def _get(db: Session, user: User, batch_id: int) -> PrintBatch:
    b = db.get(PrintBatch, batch_id)
    if not b or (user.shop_id is not None and any(o.shop_id != user.shop_id for o in b.orders)):
        raise HTTPException(404, "Партия не найдена")
    return b


@router.get("")
def list_batches(limit: int = 50, db: Session = Depends(get_db), user: User = Depends(current_user)):
    batches = db.query(PrintBatch).order_by(PrintBatch.id.desc()).limit(limit).all()
    if user.shop_id is not None:
        batches = [b for b in batches if all(o.shop_id == user.shop_id for o in b.orders)]
    return [ser.batch(b) for b in batches]


@router.post("")
def create(body: BatchIn, db: Session = Depends(get_db), user: User = Depends(Operator)):
    b = printing.create_batch(db, user, body.order_ids, body.filters)
    db.commit()
    return ser.batch(b, full=True)


@router.get("/{batch_id}")
def get(batch_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return ser.batch(_get(db, user, batch_id), full=True)


@router.get("/{batch_id}/preview")
def preview(batch_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    b = _get(db, user, batch_id)
    summary: dict[str, dict[str, int]] = {"shop": {}, "model": {}, "size": {}, "pvz": {}}
    for o in b.orders:
        summary["shop"][o.shop.name] = summary["shop"].get(o.shop.name, 0) + 1
        summary["pvz"][o.pvz_name or "—"] = summary["pvz"].get(o.pvz_name or "—", 0) + 1
        for i in o.items:
            if i.product:
                summary["model"][i.product.model] = summary["model"].get(i.product.model, 0) + i.qty
                summary["size"][i.product.size] = summary["size"].get(i.product.size, 0) + i.qty
    problems = {o.id: p for o in b.orders if (p := printing.order_print_problem(db, o, b.id))} if b.status == "draft" else {}
    return {**ser.batch(b, full=True), "labels_count": len(b.orders), "summary": summary, "problems": problems}


@router.post("/{batch_id}/print")
def print_(batch_id: int, body: PrintIn, db: Session = Depends(get_db), user: User = Depends(Operator)):
    b = _get(db, user, batch_id)
    printing.print_batch(db, user, b, db.get(PrintStation, body.station_id), body.printer_name)
    db.commit()
    return ser.batch(b, full=True)


@router.post("/{batch_id}/retry")
def retry(batch_id: int, db: Session = Depends(get_db), user: User = Depends(Operator)):
    b = _get(db, user, batch_id)
    n = printing.retry_failed(db, user, b)
    db.commit()
    return {"requeued": n, "batch": ser.batch(b, full=True)}


@router.post("/{batch_id}/close")
def close(batch_id: int, db: Session = Depends(get_db), user: User = Depends(Operator)):
    b = _get(db, user, batch_id)
    if b.status not in ("printed", "failed"):
        raise HTTPException(409, "Закрыть можно только напечатанную партию")
    b.status, b.closed_at = "closed", now()
    audit(db, user, "batch", b.id, "closed")
    db.commit()
    return ser.batch(b)


@router.post("/{batch_id}/cancel")
def cancel(batch_id: int, db: Session = Depends(get_db), user: User = Depends(Operator)):
    b = _get(db, user, batch_id)
    if b.status != "draft":
        raise HTTPException(409, "Отменить можно только партию, которая ещё не печаталась")
    b.status = "canceled"
    audit(db, user, "batch", b.id, "canceled")
    db.commit()
    return ser.batch(b)
