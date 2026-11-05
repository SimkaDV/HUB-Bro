"""Настоящий клиент Avito API.

Проверено 05.11.2026: токен (client_credentials) выдаётся, /order-management/1/orders
отвечает 403, пока на аккаунте не подключена «Авито Доставка для бизнеса».
Методы заказов и этикеток допишем по реальному ответу API.
"""
import time

import httpx

from .base import NormalizedOrder

API = "https://api.avito.ru"


class AvitoNotAvailable(RuntimeError):
    pass


class AvitoClient:
    def __init__(self, account_id: str, client_id: str, client_secret: str):
        self.account_id = account_id
        self._client_id = client_id
        self._client_secret = client_secret
        self._token: str | None = None
        self._token_exp = 0.0
        self._http = httpx.Client(base_url=API, timeout=30)

    def _auth(self) -> dict:
        if not self._token or time.time() > self._token_exp - 60:
            r = self._http.post("/token", data={
                "grant_type": "client_credentials",
                "client_id": self._client_id, "client_secret": self._client_secret,
            })
            r.raise_for_status()
            d = r.json()
            self._token, self._token_exp = d["access_token"], time.time() + d.get("expires_in", 3600)
        return {"Authorization": f"Bearer {self._token}"}

    def get(self, path: str, **params) -> httpx.Response:
        r = self._http.get(path, params=params, headers=self._auth())
        if r.status_code == 401:
            self._token = None
            r = self._http.get(path, params=params, headers=self._auth())
        if r.status_code == 403:
            raise AvitoNotAvailable(r.json().get("message", r.text))
        r.raise_for_status()
        return r

    def account(self) -> dict:
        return self.get("/core/v1/accounts/self").json()

    def list_orders(self) -> list[dict]:
        # Проверяем доступ: пока Доставка для бизнеса не включена, здесь будет AvitoNotAvailable
        self.get("/order-management/1/orders")
        raise NotImplementedError("Разбор заказов допишем после первого реального ответа API")

    def normalize(self, raw: dict) -> NormalizedOrder:
        raise NotImplementedError

    def get_label_pdf(self, raw: dict) -> bytes | None:
        raise NotImplementedError
