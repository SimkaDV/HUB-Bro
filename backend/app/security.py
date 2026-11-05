import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AuthToken, PrintStation, User, now


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    return hmac.compare_digest(check.hex(), digest)


def sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def issue_user_token(db: Session, user: User) -> str:
    raw = "u_" + secrets.token_urlsafe(32)
    db.add(AuthToken(
        token_hash=sha256(raw), user_id=user.id,
        expires_at=now() + timedelta(hours=settings.token_ttl_hours),
    ))
    return raw


def _bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Нужна авторизация")
    return authorization.removeprefix("Bearer ").strip()


def _aware(dt: datetime) -> datetime:
    # SQLite отдаёт даты без таймзоны
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def current_user(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> User:
    tok = db.get(AuthToken, sha256(_bearer(authorization)))
    if not tok or _aware(tok.expires_at) < now() or not tok.user.active:
        raise HTTPException(401, "Сессия истекла, войдите заново")
    return tok.user


def require_roles(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role != "owner" and user.role not in roles:
            raise HTTPException(403, "Недостаточно прав")
        return user
    return dep


def current_station(authorization: str | None = Header(None), db: Session = Depends(get_db)) -> PrintStation:
    raw = _bearer(authorization)
    st = db.query(PrintStation).filter_by(token_hash=sha256(raw), active=True).first()
    if not st:
        raise HTTPException(401, "Станция не зарегистрирована")
    st.last_seen_at = now()
    db.commit()
    return st


def shop_ids_for(user: User) -> list[int] | None:
    """None — все магазины."""
    return None if user.shop_id is None else [user.shop_id]
