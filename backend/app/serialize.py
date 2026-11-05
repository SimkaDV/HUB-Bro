from sqlalchemy.orm import Session

from . import statuses as S
from .models import Label, Order, PrintBatch, PrintBatchOrder, PrintJob, PrintStation, Product, Shop
from .services.orders import valid_label
from .services.printing import station_online


def shop(s: Shop) -> dict:
    return {"id": s.id, "name": s.name, "code": s.code, "logo_url": s.logo_url, "avito_account_id": s.avito_account_id}


def product(p: Product) -> dict:
    return {
        "id": p.id, "sku": p.sku, "title": p.title, "category": p.category, "model": p.model,
        "size": p.size, "color": p.color, "location_code": p.location_code,
        "on_hand": p.on_hand, "reserved": p.reserved, "quarantine": p.quarantine,
        "available": p.on_hand - p.reserved - p.quarantine,
    }


def label(lb: Label) -> dict:
    return {
        "id": lb.id, "code": lb.code, "order_id": lb.order_id, "valid": lb.valid,
        "invalid_reason": lb.invalid_reason, "print_count": lb.print_count, "is_mock": lb.is_mock,
        "created_at": lb.created_at,
    }


def active_batches(db: Session, order_ids: list[int]) -> dict[int, PrintBatch]:
    if not order_ids:
        return {}
    rows = (db.query(PrintBatchOrder.order_id, PrintBatch)
            .join(PrintBatch, PrintBatch.id == PrintBatchOrder.batch_id)
            .filter(PrintBatchOrder.order_id.in_(order_ids), PrintBatch.status.in_(S.BATCH_ACTIVE)))
    return {oid: b for oid, b in rows}


def order(o: Order, batch: PrintBatch | None = None) -> dict:
    lb = valid_label(o)
    return {
        "id": o.id, "shop": shop(o.shop), "external_order_id": o.external_order_id,
        "marketplace_id": o.marketplace_id, "external_status": o.external_status,
        "internal_status": o.internal_status, "delivery_type": o.delivery_type,
        "pvz_name": o.pvz_name, "pvz_address": o.pvz_address,
        "deadline_at": o.deadline_at, "ordered_at": o.ordered_at, "updated_at": o.updated_at,
        "items": [{
            "id": i.id, "external_item_id": i.external_item_id, "title": i.title_snapshot, "qty": i.qty,
            "price": i.price, "sku": i.sku_snapshot, "reserved": i.reserved,
            "product": product(i.product) if i.product else None,
        } for i in o.items],
        "label": label(lb) if lb else None,
        "batch": {"id": batch.id, "code": batch.code, "status": batch.status} if batch else None,
    }


def job(j: PrintJob) -> dict:
    return {
        "id": j.id, "batch_id": j.batch_id, "label_id": j.label_id, "label_code": j.label.code if j.label else None,
        "order_id": j.label.order_id if j.label else None, "kind": j.kind, "status": j.status,
        "attempt": j.attempt, "reason": j.reason, "error": j.error, "printer_name": j.printer_name,
        "created_at": j.created_at, "updated_at": j.updated_at,
    }


def batch(b: PrintBatch, full: bool = False) -> dict:
    latest: dict = {}
    for j in b.jobs:
        latest[j.label_id] = j
    counts = {"queued": 0, "sent": 0, "done": 0, "failed": 0}
    for j in latest.values():
        counts[j.status] += 1
    out = {
        "id": b.id, "code": b.code, "status": b.status, "created_at": b.created_at, "closed_at": b.closed_at,
        "station_id": b.station_id, "printer_name": b.printer_name, "filters": b.filters,
        "orders_count": len(b.orders), "jobs": counts,
    }
    if full:
        out["orders"] = [order(o, b) for o in b.orders]
        out["job_list"] = [job(j) for j in b.jobs]
    return out


def station(st: PrintStation) -> dict:
    return {
        "id": st.id, "name": st.name, "hostname": st.hostname, "agent_version": st.agent_version,
        "printers": st.printers or [], "default_printer": st.default_printer,
        "last_seen_at": st.last_seen_at, "online": station_online(st), "paired": st.token_hash is not None,
        "pairing_code": st.pairing_code if st.token_hash is None else None,
        "pairing_expires_at": st.pairing_expires_at,
    }
