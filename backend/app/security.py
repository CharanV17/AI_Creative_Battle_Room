from datetime import datetime, timedelta
from secrets import token_urlsafe

from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Session as UserSession


# Use PBKDF2 here to avoid bcrypt backend issues on Windows / newer bcrypt builds.
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_session_token(db: Session, user_id: int) -> str:
    token = token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=settings.session_expire_hours)

    session = UserSession(user_id=user_id, token=token, expires_at=expires_at)
    db.add(session)
    db.commit()
    return token
