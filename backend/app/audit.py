from sqlalchemy.orm import Session

from .models import AuditEvent, User


def audit(db: Session, user: User | None, entity_type: str, entity_id: int | None, action: str, **data) -> None:
    db.add(AuditEvent(
        user_id=user.id if user else None,
        entity_type=entity_type, entity_id=entity_id, action=action, data=data,
    ))
