import random
import string

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import ParticipantRole, Room, RoomParticipant, User
from app.schemas import RoomCreateRequest, RoomParticipantResponse, RoomResponse


router = APIRouter(prefix="/rooms", tags=["rooms"])


def _normalize_role(value: str) -> str:
    return value if value in {"admin", "player"} else "player"


def _generate_room_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        exists = db.query(Room).filter(Room.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not generate room code")


def _to_room_response(db: Session, room: Room) -> RoomResponse:
    participants = (
        db.query(RoomParticipant)
        .filter(RoomParticipant.room_id == room.id)
        .order_by(RoomParticipant.joined_at.asc())
        .all()
    )
    participant_items = [
        RoomParticipantResponse(
            user_id=p.user_id,
            display_name=_normalize_role(p.user.display_name),
            role=p.role,
            is_eliminated=p.is_eliminated,
            joined_at=p.joined_at,
        )
        for p in participants
    ]
    return RoomResponse(
        code=room.code,
        challenge_prompt=room.challenge_prompt,
        host_user_id=room.host_user_id,
        status=room.status,
        participants=participant_items,
    )


@router.post("", response_model=RoomResponse)
def create_room(
    payload: RoomCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    code = _generate_room_code(db)
    room = Room(code=code, challenge_prompt=payload.challenge_prompt, host_user_id=current_user.id)
    db.add(room)
    db.commit()
    db.refresh(room)

    participant = RoomParticipant(room_id=room.id, user_id=current_user.id, role=ParticipantRole.host)
    db.add(participant)
    db.commit()

    return _to_room_response(db, room)


@router.post("/{code}/join", response_model=RoomResponse)
def join_room(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = db.query(Room).filter(Room.code == code.upper()).first()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    existing = (
        db.query(RoomParticipant)
        .filter(RoomParticipant.room_id == room.id, RoomParticipant.user_id == current_user.id)
        .first()
    )
    if not existing:
        role = ParticipantRole.host if current_user.id == room.host_user_id else ParticipantRole.participant
        db.add(RoomParticipant(room_id=room.id, user_id=current_user.id, role=role))
        db.commit()

    return _to_room_response(db, room)


@router.get("/{code}", response_model=RoomResponse)
def get_room(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = db.query(Room).filter(Room.code == code.upper()).first()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    membership = (
        db.query(RoomParticipant)
        .filter(RoomParticipant.room_id == room.id, RoomParticipant.user_id == current_user.id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a room participant")

    return _to_room_response(db, room)
