from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import serialize as ser
from ..db import get_db
from ..models import Label, PrintJob, PrintStation, User
from ..security import current_user, require_roles
from ..services import printing

router = APIRouter(prefix="/api/labels", tags=["print"])


class ReprintIn(BaseModel):
    station_id: int
    printer_name: str | None = None
    reason: str


def _get(db: Session, user: User, label_id: int) -> Label:
    lb = db.get(Label, label_id)
    if not lb or (user.shop_id is not None and lb.order.shop_id != user.shop_id):
        raise HTTPException(404, "Этикетка не найдена")
    return lb


@router.get("/{label_id}")
def get(label_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    lb = _get(db, user, label_id)
    jobs = db.query(PrintJob).filter_by(label_id=lb.id).order_by(PrintJob.id).all()
    return {**ser.label(lb), "jobs": [ser.job(j) for j in jobs]}


@router.get("/{label_id}/file")
def file(label_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    lb = _get(db, user, label_id)
    # Резервный способ печати (ТЗ 12.4): скачать исходный PDF без изменений
    return FileResponse(Path(lb.file_path), media_type="application/pdf", filename=f"{lb.code}.pdf",
                        content_disposition_type="inline")


@router.post("/{label_id}/reprint")
def reprint(label_id: int, body: ReprintIn, db: Session = Depends(get_db),
            user: User = Depends(require_roles("shop_admin", "operator"))):
    if not body.reason.strip():
        raise HTTPException(400, "Укажите причину повторной печати")
    job = printing.reprint_label(db, user, _get(db, user, label_id), db.get(PrintStation, body.station_id),
                                 body.printer_name, body.reason)
    db.commit()
    return ser.job(job)
