"""Начальные данные для разработки: админ, магазины, каталог, тестовые заказы."""
import logging
import random

from sqlalchemy.orm import Session

from .avito.mock import MockAvito, avito_item_id, catalog
from .config import settings
from .models import Product, ProductMapping, Shop, User
from .security import hash_password
from .services.orders import sync_all

log = logging.getLogger(__name__)

DEMO_SHOPS = [
    {"name": "BRO x BRO SHOP", "code": "BRO", "avito_account_id": "444530615"},
    {"name": "Второй магазин (демо)", "code": "SH2", "avito_account_id": "demo-2"},
]


def seed(db: Session) -> None:
    if not db.query(User).first():
        db.add(User(email=settings.admin_email, name="Владелец", role="owner",
                    password_hash=hash_password(settings.admin_password)))
        log.warning("Создан владелец %s — смените пароль в .env (ADMIN_PASSWORD) перед запуском на сервере",
                    settings.admin_email)
    if not settings.seed_demo or db.query(Shop).first():
        db.commit()
        return

    rnd = random.Random(7)
    shops = [Shop(**s) for s in DEMO_SHOPS]
    db.add_all(shops)
    for p in catalog():
        db.add(Product(**p, on_hand=rnd.choice([0, 1, 2, 3, 5, 8, 10])))
    db.flush()
    db.add(User(email="operator@hubbro.local", name="Оператор склада", role="operator",
                password_hash=hash_password("operator")))
    for shop in shops:
        for prod in db.query(Product):
            db.add(ProductMapping(shop_id=shop.id, external_item_id=avito_item_id(shop.code, prod.sku), product_id=prod.id))
        if settings.avito_mode == "mock":
            MockAvito(shop.avito_account_id, shop.code, shop.name).generate(18, seed=shop.id)
    db.commit()
    if settings.avito_mode == "mock":
        log.info("Импорт тестовых заказов: %s", sync_all(db))
