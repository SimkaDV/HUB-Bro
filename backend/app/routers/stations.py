import secrets
import socket
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import serialize as ser
from ..audit import audit
from ..db import get_db
from ..models import PrintJob, PrintStation, User, now
from ..security import current_user, require_roles
from ..services import printing

router = APIRouter(prefix="/api/stations", tags=["stations"])
Tech = require_roles("tech_admin")


class StationIn(BaseModel):
    name: str


class TestIn(BaseModel):
    printer_name: str | None = None


def _pairing(st: PrintStation) -> None:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    st.pairing_code = "".join(secrets.choice(alphabet) for _ in range(8))
    st.pairing_expires_at = now() + timedelta(minutes=30)


def _get(db: Session, station_id: int) -> PrintStation:
    st = db.get(PrintStation, station_id)
    if not st or not st.active:
        raise HTTPException(404, "Станция не найдена")
    return st


@router.get("")
def list_stations(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [ser.station(s) for s in db.query(PrintStation).filter_by(active=True).order_by(PrintStation.id)]


@router.post("")
def create(body: StationIn, db: Session = Depends(get_db), user: User = Depends(Tech)):
    st = PrintStation(name=body.name.strip() or socket.gethostname())
    _pairing(st)
    db.add(st)
    db.flush()
    audit(db, user, "station", st.id, "created", name=st.name)
    db.commit()
    return ser.station(st)


@router.post("/{station_id}/pairing-code")
def new_pairing(station_id: int, db: Session = Depends(get_db), user: User = Depends(Tech)):
    st = _get(db, station_id)
    st.token_hash = None  # старый агент отключится
    _pairing(st)
    audit(db, user, "station", st.id, "repair")
    db.commit()
    return ser.station(st)


@router.post("/{station_id}/test-print")
def test_print(station_id: int, body: TestIn, db: Session = Depends(get_db),
               user: User = Depends(require_roles("tech_admin", "shop_admin", "operator"))):
    job = printing.test_print(db, user, _get(db, station_id), body.printer_name)
    db.commit()
    return ser.job(job)


@router.get("/{station_id}/jobs")
def jobs(station_id: int, limit: int = 30, db: Session = Depends(get_db), _: User = Depends(current_user)):
    q = db.query(PrintJob).filter_by(station_id=station_id).order_by(PrintJob.id.desc()).limit(limit)
    return [ser.job(j) for j in q]


@router.delete("/{station_id}")
def delete(station_id: int, db: Session = Depends(get_db), user: User = Depends(Tech)):
    st = _get(db, station_id)
    st.active, st.token_hash = False, None
    audit(db, user, "station", st.id, "deactivated")
    db.commit()
    return {"ok": True}
