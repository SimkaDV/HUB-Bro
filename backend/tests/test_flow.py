from app.db import SessionLocal
from app.models import Product


def queue(client):
    return client.get("/api/fulfillment/queue").json()


def ready(client):
    return [o for o in queue(client)["orders"] if o["internal_status"] == "LABEL_READY" and not o["batch"]]


def test_reimport_does_not_duplicate(client):
    before = queue(client)["counts"]["total"]
    stats = client.post("/api/integrations/sync").json()
    assert all(s["created"] == 0 for s in stats.values())
    assert queue(client)["counts"]["total"] == before


def test_last_unit_reserved_once(client):
    with SessionLocal() as db:
        p = db.query(Product).filter(Product.on_hand > 0).first()
        p.on_hand = p.reserved  # свободных единиц ноль
        p.on_hand += 1  # ровно одна свободная
        sku, pid = p.sku, p.id
        db.commit()
    shop = client.get("/api/shops").json()[0]
    from app.avito.mock import MockAvito, avito_item_id
    m = MockAvito(shop["avito_account_id"], shop["code"], shop["name"])
    orders = m._load()
    for n in range(2):
        orders.append({"id": f"race{n}", "status": "ready_to_ship", "delivery": {"terminal": {"name": "П", "address": "А"}},
                       "items": [{"avitoId": avito_item_id(shop["code"], sku), "title": "t", "count": 1}]})
    m._save(orders)
    client.post("/api/integrations/sync")
    got = {o["external_order_id"]: o["internal_status"] for o in client.get("/api/orders?q=race").json()}
    assert sorted(got.values()) == ["LABEL_READY", "OUT_OF_STOCK"]
    with SessionLocal() as db:
        p = db.get(Product, pid)
        assert p.on_hand - p.reserved == 0


def test_batch_print_and_reprint(client, station):
    station_id, agent = station
    ids = [o["id"] for o in ready(client)[:3]]
    b = client.post("/api/print-batches", json={"order_ids": ids}).json()
    # заказ нельзя положить во вторую активную партию
    assert client.post("/api/print-batches", json={"order_ids": ids[:1]}).status_code == 409
    prev = client.get(f"/api/print-batches/{b['id']}/preview").json()
    assert prev["labels_count"] == 3 and not prev["problems"]
    client.post(f"/api/print-batches/{b['id']}/print", json={"station_id": station_id, "printer_name": "Zebra"})

    results = [True, False, True]
    for ok in results:
        job = agent.get("/api/agent/jobs/next").json()
        assert agent.get(job["file_url"]).content.startswith(b"%PDF")
        agent.post(f"/api/agent/jobs/{job['id']}/result", json={"ok": ok, "error": None if ok else "нет бумаги"})
    assert agent.get("/api/agent/jobs/next").status_code == 204
    assert client.get(f"/api/print-batches/{b['id']}").json()["status"] == "failed"

    assert client.post(f"/api/print-batches/{b['id']}/retry").json()["requeued"] == 1
    job = agent.get("/api/agent/jobs/next").json()
    agent.post(f"/api/agent/jobs/{job['id']}/result", json={"ok": True})
    batch = client.get(f"/api/print-batches/{b['id']}").json()
    assert batch["status"] == "printed"
    assert all(o["internal_status"] == "LABEL_PRINTED" for o in batch["orders"])

    label_id = batch["orders"][0]["label"]["id"]
    total = queue(client)["counts"]["total"]
    r = client.post(f"/api/labels/{label_id}/reprint", json={"station_id": station_id, "reason": "смазалась"})
    assert r.json()["attempt"] == 2
    assert queue(client)["counts"]["total"] == total


def test_cancel_releases_reserve(client):
    o = ready(client)[0]
    pid = o["items"][0]["product"]["id"]
    with SessionLocal() as db:
        reserved = db.get(Product, pid).reserved
    client.post(f"/api/dev/mock-orders/{o['external_order_id']}", json={"shop_id": o["shop"]["id"], "status": "canceled"})
    client.post("/api/integrations/sync")
    after = client.get(f"/api/orders/{o['id']}").json()
    assert after["internal_status"] == "CANCELED" and after["label"] is None
    with SessionLocal() as db:
        assert db.get(Product, pid).reserved == reserved - o["items"][0]["qty"]


def test_mapping_unblocks_order(client):
    o = next(o for o in queue(client)["orders"] if o["internal_status"] == "NEEDS_MAPPING")
    item = next(i for i in o["items"] if not i["sku"])
    prod = max(client.get("/api/products").json(), key=lambda p: p["available"])
    r = client.post("/api/mappings", json={"shop_id": o["shop"]["id"], "external_item_id": item["external_item_id"],
                                           "product_id": prod["id"]})
    assert r.status_code == 200
    assert client.get(f"/api/orders/{o['id']}").json()["internal_status"] != "NEEDS_MAPPING"


def test_operator_cannot_manage_stations(client):
    from fastapi.testclient import TestClient

    from app.main import app
    op = TestClient(app)
    tok = op.post("/api/auth/login", json={"email": "operator@hubbro.local", "password": "operator"}).json()["token"]
    op.headers["Authorization"] = f"Bearer {tok}"
    assert op.post("/api/stations", json={"name": "x"}).status_code == 403
    assert op.get("/api/orders").status_code == 200


def test_console_presets(client, station):
    station_id, agent = station
    c = client.get("/api/console").json()
    assert c["ready"] > 0 and c["presets"] == []
    shop = client.get("/api/shops").json()[0]
    pid = client.post("/api/presets", json={"name": "BRO", "filters": {"shop_id": shop["id"]}}).json()["id"]
    c = client.get("/api/console").json()
    expected = c["ready_by_shop"][str(shop["id"])]
    assert c["presets"][0]["ready"] == expected

    b = client.post("/api/console/batch", json={"preset_id": pid}).json()
    prev = client.get(f"/api/print-batches/{b['id']}/preview").json()
    assert prev["labels_count"] == expected and list(prev["summary"]["shop"]) == [shop["name"]]
    # повторно те же заказы не попадут
    assert client.post("/api/console/batch", json={"preset_id": pid}).status_code == 409

    rest = client.get("/api/console").json()["ready"]
    b2 = client.post("/api/console/batch", json={}).json()
    assert client.get(f"/api/print-batches/{b2['id']}").json()["orders_count"] == rest

    client.post(f"/api/print-batches/{b['id']}/print", json={"station_id": station_id})
    while (job := agent.get("/api/agent/jobs/next")).status_code == 200:
        agent.post(f"/api/agent/jobs/{job.json()['id']}/result", json={"ok": False, "error": "x"})
    assert client.get("/api/console").json()["failed_jobs"] == expected
    assert client.post("/api/console/retry-failed").json()["requeued"] == expected
