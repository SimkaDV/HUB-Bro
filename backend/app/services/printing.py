"""Печатные партии и задания для Print Agent."""
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .. import statuses as S
from ..audit import audit
from ..config import settings
from ..models import Order, PrintBatch, PrintBatchOrder, PrintJob, PrintStation, User, now
from ..pdf import test_page
from .orders import set_status, valid_label


def station_online(st: PrintStation) -> bool:
    if not st.last_seen_at:
        return False
    seen = st.last_seen_at if st.last_seen_at.tzinfo else st.last_seen_at.replace(tzinfo=now().tzinfo)
    return now() - seen < timedelta(seconds=settings.station_online_sec)


def _active_batch_of(db: Session, order_id: int, exclude: int | None = None) -> PrintBatch | None:
    q = (db.query(PrintBatch).join(PrintBatchOrder, PrintBatchOrder.batch_id == PrintBatch.id)
         .filter(PrintBatchOrder.order_id == order_id, PrintBatch.status.in_(S.BATCH_ACTIVE)))
    if exclude:
        q = q.filter(PrintBatch.id != exclude)
    return q.first()


def order_print_problem(db: Session, order: Order, batch_id: int | None = None) -> str | None:
    if order.internal_status not in S.PRINTABLE:
        return f"статус {order.internal_status}"
    if not valid_label(order):
        return "нет транспортного документа"
    other = _active_batch_of(db, order.id, exclude=batch_id)
    if other:
        return f"уже в партии {other.code}"
    return None


def create_batch(db: Session, user: User, order_ids: list[int], filters: dict) -> PrintBatch:
    if not order_ids:
        raise HTTPException(400, "Не выбраны заказы")
    orders = db.query(Order).filter(Order.id.in_(order_ids)).all()
    if user.shop_id is not None:
        orders = [o for o in orders if o.shop_id == user.shop_id]
    problems = {o.id: p for o in orders if (p := order_print_problem(db, o))}
    if problems or len(orders) != len(set(order_ids)):
        raise HTTPException(409, {"message": "Часть заказов нельзя печатать", "problems": problems})
    batch = PrintBatch(user_id=user.id, filters=filters, orders=orders)
    db.add(batch)
    db.flush()
    audit(db, user, "batch", batch.id, "created", orders=len(orders))
    return batch


def _check_station(st: PrintStation | None, printer: str | None) -> None:
    if not st or not st.active:
        raise HTTPException(404, "Станция печати не найдена")
    if printer and st.printers and printer not in st.printers:
        raise HTTPException(400, "На станции нет такого принтера")


def print_batch(db: Session, user: User, batch: PrintBatch, station: PrintStation, printer: str | None) -> None:
    if batch.status != "draft":
        raise HTTPException(409, f"Партия уже в статусе {batch.status}")
    _check_station(station, printer)
    # Перепроверяем: заказ мог отмениться, пока партия ждала печати
    problems = {o.id: p for o in batch.orders if (p := order_print_problem(db, o, batch.id))}
    if problems:
        raise HTTPException(409, {"message": "Заказы изменились после создания партии", "problems": problems})
    batch.station_id, batch.printer_name, batch.status = station.id, printer, "printing"
    for o in batch.orders:
        db.add(PrintJob(batch=batch, label_id=valid_label(o).id, station_id=station.id,
                        printer_name=printer, user_id=user.id))
    audit(db, user, "batch", batch.id, "print", station=station.name, printer=printer)


def retry_failed(db: Session, user: User, batch: PrintBatch) -> int:
    failed = [j for j in batch.jobs if j.status == "failed"]
    latest = {}
    for j in batch.jobs:
        latest[j.label_id] = j
    n = 0
    for j in failed:
        if latest[j.label_id] is not j:
            continue
        if not j.label or not j.label.valid:
            continue
        db.add(PrintJob(batch=batch, label_id=j.label_id, station_id=batch.station_id, printer_name=batch.printer_name,
                        attempt=j.attempt + 1, reason="Повтор после сбоя", user_id=user.id))
        n += 1
    if n:
        batch.status = "printing"
        audit(db, user, "batch", batch.id, "retry", jobs=n)
    return n


def reprint_label(db: Session, user: User, label, station: PrintStation, printer: str | None, reason: str) -> PrintJob:
    _check_station(station, printer)
    if not label.valid:
        raise HTTPException(409, f"Этикетка недействительна: {label.invalid_reason}")
    if label.order.internal_status in S.FINAL and user.role not in ("owner", "shop_admin"):
        raise HTTPException(403, "Заказ закрыт или отменён — повторная печать только для администратора")
    attempts = db.query(PrintJob).filter_by(label_id=label.id).count()
    job = PrintJob(label_id=label.id, station_id=station.id, printer_name=printer, kind="reprint",
                   attempt=attempts + 1, reason=reason, user_id=user.id)
    db.add(job)
    db.flush()
    audit(db, user, "label", label.id, "reprint", reason=reason, job=job.id)
    return job


def test_print(db: Session, user: User, station: PrintStation, printer: str | None) -> PrintJob:
    _check_station(station, printer)
    job = PrintJob(station_id=station.id, printer_name=printer, kind="test", user_id=user.id)
    db.add(job)
    db.flush()
    return job


def job_file(job: PrintJob, station: PrintStation) -> bytes:
    if job.kind == "test":
        return test_page(station=station.name, printer=job.printer_name or "по умолчанию")
    return Path(job.label.file_path).read_bytes()


def finish_job(db: Session, job: PrintJob, ok: bool, error: str | None) -> None:
    if job.status in ("done", "failed"):
        return  # агент мог прислать результат повторно после обрыва связи
    job.status = "done" if ok else "failed"
    job.error = error
    if ok and job.label:
        job.label.print_count += 1
        order = job.label.order
        if order.internal_status == S.LABEL_READY:
            set_status(db, order, S.LABEL_PRINTED, f"Напечатано (задание {job.id})")
    if job.batch:
        _update_batch(job.batch)


def _update_batch(batch: PrintBatch) -> None:
    latest = {}
    for j in batch.jobs:
        latest[j.label_id] = j
    states = {j.status for j in latest.values()}
    if states & {"queued", "sent"}:
        batch.status = "printing"
    elif "failed" in states:
        batch.status = "failed"
    else:
        batch.status = "printed"


def matches(order: Order, filters: dict) -> bool:
    """Подходит ли заказ под фильтр пресета. Пустой фильтр — подходит всё."""
    f = filters or {}
    if f.get("shop_id") and order.shop_id != f["shop_id"]:
        return False
    if f.get("pvz_name") and order.pvz_name != f["pvz_name"]:
        return False
    products = [i.product for i in order.items if i.product]
    if f.get("model") and not any(p.model == f["model"] for p in products):
        return False
    if f.get("size") and not any(p.size == f["size"] for p in products):
        return False
    if f.get("deadline_hours"):
        if not order.deadline_at or order.deadline_at > now() + timedelta(hours=f["deadline_hours"]):
            return False
    return True


def ready_orders(db: Session, user: User, filters: dict | None = None) -> list[Order]:
    """Готовые к печати заказы вне активных партий, срочные первыми."""
    q = db.query(Order).filter(Order.internal_status.in_(S.PRINTABLE))
    if user.shop_id is not None:
        q = q.filter(Order.shop_id == user.shop_id)
    busy = {oid for (oid,) in db.query(PrintBatchOrder.order_id).join(PrintBatch, PrintBatch.id == PrintBatchOrder.batch_id)
            .filter(PrintBatch.status.in_(S.BATCH_ACTIVE))}
    orders = q.order_by(Order.deadline_at.is_(None), Order.deadline_at, Order.id).all()
    return [o for o in orders if o.id not in busy and valid_label(o) and matches(o, filters or {})]


def retry_all_failed(db: Session, user: User) -> int:
    return sum(retry_failed(db, user, b) for b in db.query(PrintBatch).filter_by(status="failed"))
