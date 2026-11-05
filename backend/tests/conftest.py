import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp()
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_tmp}/test.db", "STORAGE_DIR": f"{_tmp}/storage",
    "AVITO_MODE": "mock", "SYNC_INTERVAL_SEC": "0", "SEED_DEMO": "true",
})

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    import shutil
    Base.metadata.drop_all(engine)
    shutil.rmtree(f"{_tmp}/storage", ignore_errors=True)
    with TestClient(app) as c:
        token = c.post("/api/auth/login", json={"email": "admin@hubbro.local", "password": "admin"}).json()["token"]
        c.headers["Authorization"] = f"Bearer {token}"
        yield c


@pytest.fixture()
def station(client):
    st = client.post("/api/stations", json={"name": "Склад"}).json()
    agent = TestClient(app)
    tok = agent.post("/api/agent/pair", json={"code": st["pairing_code"], "hostname": "pc"}).json()["token"]
    agent.headers["Authorization"] = f"Bearer {tok}"
    agent.post("/api/agent/heartbeat", json={"printers": ["Zebra"], "default_printer": "Zebra"})
    return st["id"], agent
