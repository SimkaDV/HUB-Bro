from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..avito.mock import PVZ, MockAvito
from ..config import settings
from ..db import get_db
from ..models import IntegrationEvent, Shop, User
from ..security import current_user, require_roles
from ..services.orders import sync_all

router = APIRouter(prefix="/api", tags=["integrations"])


@router.get("/integrations/status")
def status(db: Session = Depends(get_db), _: User = Depends(current_user)):
    last = db.query(IntegrationEvent).filter_by(kind="sync").order_by(IntegrationEvent.id.desc()).first()
    return {"mode": settings.avito_mode, "interval_sec": settings.sync_interval_sec,
            "last_sync_at": last.received_at if last else None}


@router.post("/integrations/sync")
def sync(db: Session = Depends(get_db), _: User = Depends(require_roles("shop_admin", "operator", "tech_admin"))):
    return sync_all(db)


@router.get("/integrations/events")
def events(errors_only: bool = False, limit: int = 100, db: Session = Depends(get_db),
           _: User = Depends(current_user)):
    q = db.query(IntegrationEvent)
    if errors_only:
        q = q.filter_by(error=True)
    return [{"id": e.id, "shop_id": e.shop_id, "kind": e.kind, "external_id": e.external_id,
             "message": e.message, "error": e.error, "at": e.received_at}
            for e in q.order_by(IntegrationEvent.id.desc()).limit(limit)]


# --- только для разработки: управление заглушкой Авито ----------------------

class MockIn(BaseModel):
    shop_id: int
    count: int = 5


class MockChangeIn(BaseModel):
    shop_id: int
    status: str | None = None
    change_pvz: bool = False


def _mock(db: Session, shop_id: int) -> MockAvito:
    if settings.avito_mode != "mock":
        raise HTTPException(400, "Доступно только в режиме заглушки")
    shop = db.get(Shop, shop_id)
    if not shop:
        raise HTTPException(404, "Магазин не найден")
    return MockAvito(shop.avito_account_id or str(shop.id), shop.code, shop.name)


@router.post("/dev/mock-orders")
def mock_orders(body: MockIn, db: Session = Depends(get_db), _: User = Depends(require_roles("tech_admin"))):
    return {"created": len(_mock(db, body.shop_id).generate(min(body.count, 100)))}


@router.post("/dev/mock-orders/{external_id}")
def mock_change(external_id: str, body: MockChangeIn, db: Session = Depends(get_db),
                _: User = Depends(require_roles("tech_admin"))):
    m = _mock(db, body.shop_id)
    changes = {}
    if body.status:
        changes["status"] = body.status
    if body.change_pvz:
        cur = next((o for o in m.list_orders() if o["id"] == external_id), None)
        name = cur["delivery"]["terminal"]["name"] if cur else None
        changes["pvz"] = next(p for p in PVZ if p[0] != name)
    if not m.update(external_id, **changes):
        raise HTTPException(404, "Заказ не найден в заглушке")
    return {"ok": True}
