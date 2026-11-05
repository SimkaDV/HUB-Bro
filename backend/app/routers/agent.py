"""API для Print Agent. Агент сам ходит на сервер, входящие порты на складе не нужны."""
import secrets
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import PrintJob, PrintStation, now
from ..security import current_station, sha256
from ..services import printing

router = APIRouter(prefix="/api/agent", tags=["agent"])


class PairIn(BaseModel):
    code: str
    hostname: str | None = None


class HeartbeatIn(BaseModel):
    printers: list[str] = []
    default_printer: str | None = None
    version: str | None = None


class ResultIn(BaseModel):
    ok: bool
    error: str | None = None


@router.post("/pair")
def pair(body: PairIn, db: Session = Depends(get_db)):
    st = db.query(PrintStation).filter_by(pairing_code=body.code.strip().upper(), active=True).first()
    exp = st.pairing_expires_at if st else None
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not st or st.token_hash or not exp or exp < now():
        raise HTTPException(400, "Код недействителен или устарел — создайте новый в кабинете")
    token = "d_" + secrets.token_urlsafe(32)
    st.token_hash, st.pairing_code, st.hostname, st.last_seen_at = sha256(token), None, body.hostname, now()
    db.commit()
    return {"token": token, "station": {"id": st.id, "name": st.name}}


@router.post("/heartbeat")
def heartbeat(body: HeartbeatIn, db: Session = Depends(get_db), st: PrintStation = Depends(current_station)):
    st.printers, st.default_printer, st.agent_version = body.printers, body.default_printer, body.version
    db.commit()
    return {"ok": True, "station": {"id": st.id, "name": st.name}}


@router.get("/jobs/next")
def next_job(db: Session = Depends(get_db), st: PrintStation = Depends(current_station)):
    job = (db.query(PrintJob).filter_by(station_id=st.id, status="queued")
           .order_by(PrintJob.id).with_for_update().first())
    if not job:
        return Response(status_code=204)
    job.status = "sent"
    db.commit()
    return {"id": job.id, "kind": job.kind, "printer_name": job.printer_name or st.default_printer,
            "label_code": job.label.code if job.label else None, "file_url": f"/api/agent/jobs/{job.id}/file"}


def _job(db: Session, st: PrintStation, job_id: int) -> PrintJob:
    job = db.get(PrintJob, job_id)
    if not job or job.station_id != st.id:
        raise HTTPException(404, "Задание не найдено")
    return job


@router.get("/jobs/{job_id}/file")
def job_file(job_id: int, db: Session = Depends(get_db), st: PrintStation = Depends(current_station)):
    return Response(printing.job_file(_job(db, st, job_id), st), media_type="application/pdf")


@router.post("/jobs/{job_id}/result")
def job_result(job_id: int, body: ResultIn, db: Session = Depends(get_db), st: PrintStation = Depends(current_station)):
    printing.finish_job(db, _job(db, st, job_id), body.ok, body.error)
    db.commit()
    return {"ok": True}
