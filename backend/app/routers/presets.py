from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import serialize as ser
from ..audit import audit
from ..db import get_db
from .. import statuses as S
from ..models import Order, PrintBatch, PrintPreset, User
from ..security import current_user, require_roles
from ..services import printing

router = APIRouter(prefix="/api", tags=["console"])
Operator = require_roles("shop_admin", "operator")


class Filters(BaseModel):
    shop_id: int | None = None
    model: str | None = None
    size: str | None = None
    pvz_name: str | None = None
    deadline_hours: int | None = Field(None, ge=1, le=240)


class PresetIn(BaseModel):
    name: str
    filters: Filters


class QuickIn(BaseModel):
    preset_id: int | None = None
    filters: Filters = Filters()


def _filters(f: Filters) -> dict:
    return f.model_dump(exclude_none=True)


@router.get("/console")
def console(db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Всё для «Пульта» одним запросом: готовые заказы, пресеты со счётчиками, сбои."""
    ready = printing.ready_orders(db, user)
    presets = db.query(PrintPreset).order_by(PrintPreset.sort_order, PrintPreset.id).all()
    failed = db.query(PrintBatch).filter_by(status="failed").all()
    by_shop: dict[int, int] = {}
    for o in ready:
        by_shop[o.shop_id] = by_shop.get(o.shop_id, 0) + 1
    problems = db.query(Order).filter(Order.internal_status.in_(S.PROBLEM))
    if user.shop_id is not None:
        problems = problems.filter(Order.shop_id == user.shop_id)
    return {
        "ready": len(ready),
        "problems": problems.count(),
        "ready_by_shop": by_shop,
        "urgent": sum(printing.matches(o, {"deadline_hours": 6}) for o in ready),
        "failed_jobs": sum(ser.batch(b)["jobs"]["failed"] for b in failed),
        "presets": [{"id": p.id, "name": p.name, "filters": p.filters,
                     "ready": sum(printing.matches(o, p.filters) for o in ready)} for p in presets],
    }


@router.post("/presets")
def create_preset(body: PresetIn, db: Session = Depends(get_db), user: User = Depends(Operator)):
    if not body.name.strip():
        raise HTTPException(400, "Назовите пресет")
    last = db.query(PrintPreset).order_by(PrintPreset.sort_order.desc()).first()
    p = PrintPreset(name=body.name.strip(), filters=_filters(body.filters),
                    sort_order=(last.sort_order + 1) if last else 0, created_by=user.id)
    db.add(p)
    db.flush()
    audit(db, user, "preset", p.id, "created", name=p.name, filters=p.filters)
    db.commit()
    return {"id": p.id}


@router.delete("/presets/{preset_id}")
def delete_preset(preset_id: int, db: Session = Depends(get_db), user: User = Depends(Operator)):
    p = db.get(PrintPreset, preset_id)
    if not p:
        raise HTTPException(404, "Пресет не найден")
    audit(db, user, "preset", p.id, "deleted", name=p.name)
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/console/batch")
def quick_batch(body: QuickIn, db: Session = Depends(get_db), user: User = Depends(Operator)):
    """Черновая партия из всех готовых заказов (или по пресету). Печать — после подтверждения."""
    filters = _filters(body.filters)
    name = "Всё готовое"
    if body.preset_id:
        p = db.get(PrintPreset, body.preset_id)
        if not p:
            raise HTTPException(404, "Пресет не найден")
        filters, name = p.filters, p.name
    orders = printing.ready_orders(db, user, filters)
    if not orders:
        raise HTTPException(409, "Нечего печатать — готовых заказов нет")
    b = printing.create_batch(db, user, [o.id for o in orders], {"source": "console", "name": name, **filters})
    db.commit()
    return {"id": b.id}


@router.post("/console/retry-failed")
def retry_failed(db: Session = Depends(get_db), user: User = Depends(Operator)):
    n = printing.retry_all_failed(db, user)
    db.commit()
    return {"requeued": n}
