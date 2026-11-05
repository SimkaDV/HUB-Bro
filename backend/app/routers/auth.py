from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import AuthToken, User
from ..security import current_user, issue_user_token, sha256, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


def me_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "shop_id": u.shop_id}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.strip().lower(), active=True).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Неверный email или пароль")
    token = issue_user_token(db, user)
    db.commit()
    return {"token": token, "user": me_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return me_out(user)


@router.post("/logout")
def logout(authorization: str = Header(""), db: Session = Depends(get_db)):
    db.query(AuthToken).filter_by(token_hash=sha256(authorization.removeprefix("Bearer ").strip())).delete()
    db.commit()
    return {"ok": True}
