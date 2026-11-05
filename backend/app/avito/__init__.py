from ..config import settings
from ..models import Shop
from .base import OrderSource
from .client import AvitoClient
from .mock import MockAvito


def source_for(shop: Shop) -> OrderSource:
    if settings.avito_mode == "live":
        # Пока ключи одни на всё приложение; ключи по магазинам — в зашифрованном хранилище позже
        return AvitoClient(shop.avito_account_id or "", settings.avito_client_id, settings.avito_client_secret)
    return MockAvito(shop.avito_account_id or str(shop.id), shop.code, shop.name)
