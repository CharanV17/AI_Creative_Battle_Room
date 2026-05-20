from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from app.security import create_session_token, hash_password, verify_password


router = APIRouter(prefix="/auth", tags=["auth"])


def _normalize_role(value: str) -> str:
    return value if value in {"admin", "player"} else "player"


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, role=_normalize_role(user.display_name))


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_session_token(db=db, user_id=user.id)
    return AuthResponse(token=token, user=_user_response(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_session_token(db=db, user_id=user.id)
    return AuthResponse(token=token, user=_user_response(user))


@router.post("/register-or-login", response_model=AuthResponse)
def register_or_login(payload: RegisterRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()

    if user:
        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    else:
        user = User(
            email=payload.email,
            password_hash=hash_password(payload.password),
            display_name=payload.role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_session_token(db=db, user_id=user.id)
    return AuthResponse(token=token, user=_user_response(user))


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)
