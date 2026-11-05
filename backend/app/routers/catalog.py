from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import serialize as ser
from ..audit import audit
from ..db import get_db
from ..models import Product, ProductMapping, Shop, User
from ..security import current_user, require_roles
from ..services.orders import reevaluate_waiting

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/shops")
def shops(db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = db.query(Shop).order_by(Shop.id)
    if user.shop_id is not None:
        q = q.filter(Shop.id == user.shop_id)
    return [ser.shop(s) for s in q]


@router.get("/products")
def products(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [ser.product(p) for p in db.query(Product).order_by(Product.sku)]


class AdjustIn(BaseModel):
    delta: int
    reason: str


@router.post("/products/{product_id}/adjust")
def adjust(product_id: int, body: AdjustIn, db: Session = Depends(get_db),
           user: User = Depends(require_roles("shop_admin", "operator"))):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "SKU не найден")
    if not body.reason.strip():
        raise HTTPException(400, "Укажите причину")
    if p.on_hand + body.delta < p.reserved + p.quarantine:
        raise HTTPException(409, "Остаток станет меньше резерва")
    p.on_hand += body.delta
    audit(db, user, "product", p.id, "adjust", delta=body.delta, reason=body.reason)
    db.flush()
    changed = reevaluate_waiting(db, product_id=p.id)
    db.commit()
    return {"product": ser.product(p), "orders_changed": changed}


class MappingIn(BaseModel):
    shop_id: int
    external_item_id: str
    product_id: int


@router.get("/mappings")
def mappings(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": m.id, "shop_id": m.shop_id, "external_item_id": m.external_item_id, "product_id": m.product_id}
            for m in db.query(ProductMapping).order_by(ProductMapping.id)]


@router.post("/mappings")
def create_mapping(body: MappingIn, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("shop_admin"))):
    if not db.get(Product, body.product_id):
        raise HTTPException(404, "SKU не найден")
    if db.query(ProductMapping).filter_by(shop_id=body.shop_id, external_item_id=body.external_item_id).first():
        raise HTTPException(409, "Это объявление уже сопоставлено")
    m = ProductMapping(**body.model_dump())
    db.add(m)
    db.flush()
    audit(db, user, "mapping", m.id, "created", **body.model_dump())
    changed = reevaluate_waiting(db, shop_id=body.shop_id)
    db.commit()
    return {"id": m.id, "orders_changed": changed}
