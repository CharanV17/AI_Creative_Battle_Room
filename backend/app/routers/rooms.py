from __future__ import annotations

import logging
import random
import string
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import (
    GenerationJob,
    ParticipantRole,
    Room,
    RoomParticipant,
    RoomStatus,
    User,
    Round,
    RoundStatus,
    Submission,
)
from app.schemas import (
    JobResponse,
    LeaderboardEntry,
    LeaderboardResponse,
    RoomCreateRequest,
    RoomParticipantResponse,
    RoomResponse,
    SubmissionRequest,
    SubmissionResponse,
    RoundResponse,
    RoomSnapshot,
)
from app.services.jobs import create_generation_job, run_generation_job
from app.ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rooms", tags=["rooms"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_room_code(db: Session) -> str:
    for _ in range(20):
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if not db.query(Room).filter(Room.code == code).first():
            return code
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not generate room code")


def _get_room_by_code(db: Session, code: str) -> Room | None:
    return db.query(Room).filter(Room.code == code.upper()).first()


def _get_membership(db: Session, room: Room, user: User) -> RoomParticipant | None:
    return (
        db.query(RoomParticipant)
        .filter(RoomParticipant.room_id == room.id, RoomParticipant.user_id == user.id)
        .first()
    )


def _compute_participant_scores(db: Session, room: Room) -> dict[int, int]:
    """Return {user_id: total_score} across all closed rounds in the room."""
    closed_round_ids = [
        r.id for r in db.query(Round).filter(Round.room_id == room.id, Round.status == RoundStatus.closed).all()
    ]
    if not closed_round_ids:
        return {}
    submissions = db.query(Submission).filter(Submission.round_id.in_(closed_round_ids)).all()
    totals: dict[int, int] = {}
    for s in submissions:
        totals[s.user_id] = totals.get(s.user_id, 0) + (s.score or 0)
    return totals


def _to_room_response(db: Session, room: Room) -> RoomResponse:
    scores = _compute_participant_scores(db, room)
    participants = (
        db.query(RoomParticipant)
        .filter(RoomParticipant.room_id == room.id)
        .order_by(RoomParticipant.joined_at.asc())
        .all()
    )
    participant_items = [
        RoomParticipantResponse(
            user_id=p.user_id,
            display_name=p.user.display_name,
            role=p.role,
            is_eliminated=p.is_eliminated,
            joined_at=p.joined_at,
            total_score=scores.get(p.user_id, 0),
        )
        for p in participants
    ]
    return RoomResponse(
        id=room.id,
        code=room.code,
        challenge_prompt=room.challenge_prompt,
        host_user_id=room.host_user_id,
        status=room.status,
        participants=participant_items,
    )


def _to_job_response(job: GenerationJob) -> JobResponse:
    return JobResponse(
        id=job.id,
        room_id=job.room_id,
        round_id=job.round_id,
        provider_name=job.provider_name,
        prompt=job.prompt,
        status=job.status,
        output_text=job.output_text,
        error_text=job.error_text,
        timeout_seconds=job.timeout_seconds,
        started_at=job.started_at,
        finished_at=job.finished_at,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _submission_to_response(s: Submission) -> SubmissionResponse:
    return SubmissionResponse(
        id=s.id,
        round_id=s.round_id,
        user_id=s.user_id,
        display_name=s.user.display_name,
        content=s.content,
        score=s.score,
        ai_output=s.ai_output if hasattr(s, "ai_output") else None,
        created_at=s.created_at,
    )


def _round_to_response(db: Session, rnd: Round) -> RoundResponse:
    submissions = (
        db.query(Submission)
        .filter(Submission.round_id == rnd.id)
        .order_by(Submission.created_at.asc())
        .all()
    )
    return RoundResponse(
        id=rnd.id,
        room_id=rnd.room_id,
        number=rnd.number,
        started_at=rnd.started_at,
        status=rnd.status,
        submissions=[_submission_to_response(s) for s in submissions],
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=RoomResponse)
def create_room(
    payload: RoomCreateRequest,
    background_tasks: BackgroundTasks,
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

    room_resp = _to_room_response(db, room)
    background_tasks.add_task(
        ws_manager.broadcast, code, "room.updated", room_resp.model_dump(mode="json")
    )
    return room_resp


@router.post("/{code}/join", response_model=RoomResponse)
def join_room(
    code: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    existing = _get_membership(db, room, current_user)
    if not existing:
        role = ParticipantRole.host if current_user.id == room.host_user_id else ParticipantRole.participant
        db.add(RoomParticipant(room_id=room.id, user_id=current_user.id, role=role))
        db.commit()

    room_resp = _to_room_response(db, room)
    background_tasks.add_task(
        ws_manager.broadcast, room.code, "room.updated", room_resp.model_dump(mode="json")
    )
    return room_resp


@router.get("/{code}", response_model=RoomResponse)
def get_room(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    membership = _get_membership(db, room, current_user)
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a room participant")
    return _to_room_response(db, room)


@router.get("/{code}/snapshot", response_model=RoomSnapshot)
def room_snapshot(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    membership = _get_membership(db, room, current_user)
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a room participant")

    room_resp = _to_room_response(db, room)

    active_round = (
        db.query(Round)
        .filter(Round.room_id == room.id, Round.status == RoundStatus.open)
        .order_by(Round.started_at.desc())
        .first()
    )
    current_round_resp = _round_to_response(db, active_round) if active_round else None

    # Also include the most recently closed round if no open round (so scores are visible)
    if not current_round_resp:
        last_closed = (
            db.query(Round)
            .filter(Round.room_id == room.id, Round.status == RoundStatus.closed)
            .order_by(Round.started_at.desc())
            .first()
        )
        current_round_resp = _round_to_response(db, last_closed) if last_closed else None

    latest_job = (
        db.query(GenerationJob)
        .filter(GenerationJob.room_id == room.id)
        .order_by(GenerationJob.created_at.desc())
        .first()
    )

    return RoomSnapshot(
        room=room_resp,
        current_round=current_round_resp,
        latest_job=_to_job_response(latest_job) if latest_job else None,
    )


@router.post("/{code}/rounds/start", response_model=RoundResponse)
def start_round(
    code: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    is_admin = getattr(current_user, "role", "player") == "admin"
    if current_user.id != room.host_user_id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only host or admin can start round")

    if room.status == RoomStatus.finished:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Room is finished")

    # Close any existing open round first
    open_round = db.query(Round).filter(Round.room_id == room.id, Round.status == RoundStatus.open).first()
    if open_round:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A round is already open")

    existing_count = db.query(Round).filter(Round.room_id == room.id).count()
    rnd = Round(room_id=room.id, number=existing_count + 1)
    db.add(rnd)
    room.status = RoomStatus.active
    db.commit()
    db.refresh(rnd)

    # No intro AI job — saves one free-tier API call per round.
    # The challenge prompt at the top of the screen already gives players context.

    round_resp = _round_to_response(db, rnd)
    background_tasks.add_task(
        ws_manager.broadcast, room.code, "round.started", round_resp.model_dump(mode="json")
    )
    return round_resp


@router.post("/{code}/rounds/{round_id}/submit", response_model=SubmissionResponse)
def submit_round(
    code: str,
    round_id: int,
    payload: SubmissionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    membership = _get_membership(db, room, current_user)
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a room participant")

    if membership.role != ParticipantRole.participant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only participants can submit. Hosts judge, not compete.")

    if current_user.role == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins cannot submit as contestants")

    rnd = db.query(Round).filter(Round.id == round_id, Round.room_id == room.id).first()
    if not rnd:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")

    if rnd.status != RoundStatus.open:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round is not open for submissions")

    if membership.is_eliminated:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Eliminated participants cannot submit")

    existing = db.query(Submission).filter(Submission.round_id == rnd.id, Submission.user_id == current_user.id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already submitted for this round")

    sub = Submission(round_id=rnd.id, user_id=current_user.id, content=payload.content)
    db.add(sub)
    db.commit()
    db.refresh(sub)

    # Create a generation job for this submission's AI output
    job = create_generation_job(
        db,
        room_id=room.id,
        round_id=rnd.id,
        prompt=(
            f'Challenge: "{room.challenge_prompt}"\n\n'
            f'Contestant submission concept: "{payload.content}"\n\n'
            f'You are a creative AI. Expand this concept into a vivid, detailed creative output '
            f'(100-200 words). Make it exciting, original, and tailored to the challenge.'
        ),
        timeout_seconds=settings.job_timeout_seconds,
        provider_name=settings.job_provider,
    )
    background_tasks.add_task(run_generation_job, job.id)

    sub_resp = _submission_to_response(sub)
    background_tasks.add_task(
        ws_manager.broadcast, room.code, "submission.created", sub_resp.model_dump(mode="json")
    )
    return sub_resp


@router.post("/{code}/rounds/{round_id}/close", response_model=RoundResponse)
def close_round(
    code: str,
    round_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    is_admin = getattr(current_user, "role", "player") == "admin"
    if current_user.id != room.host_user_id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only host or admin can close round")

    rnd = db.query(Round).filter(Round.id == round_id, Round.room_id == room.id).first()
    if not rnd:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")

    if rnd.status != RoundStatus.open:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Round is not open")

    # Score submissions
    submissions = db.query(Submission).filter(Submission.round_id == rnd.id).all()

    provider = None
    if settings.job_provider == "gemini" and settings.gemini_api_key:
        try:
            from app.providers.gemini import GeminiGenerationProvider  # noqa: PLC0415
            provider = GeminiGenerationProvider()
        except Exception:  # noqa: BLE001
            provider = None

    for s in submissions:
        if provider is not None:
            try:
                s.score = provider.score(room.challenge_prompt, s.content)
            except Exception:  # noqa: BLE001
                s.score = min(100, len(s.content.split()) * 5)
        else:
            s.score = min(100, len(s.content.split()) * 5)
        db.add(s)

    rnd.status = RoundStatus.closed
    room.status = RoomStatus.waiting
    db.add(rnd)
    db.add(room)
    db.commit()

    round_resp = _round_to_response(db, rnd)
    room_resp = _to_room_response(db, room)
    background_tasks.add_task(
        ws_manager.broadcast, room.code, "round.closed", {
            "round": round_resp.model_dump(mode="json"),
            "room": room_resp.model_dump(mode="json"),
        }
    )
    return round_resp


@router.post("/{code}/participants/{user_id}/eliminate", response_model=RoomParticipantResponse)
def eliminate_participant(
    code: str,
    user_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Host eliminates a participant from the room."""
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    is_admin = getattr(current_user, "role", "player") == "admin"
    if current_user.id != room.host_user_id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only host or admin can eliminate participants")

    target = db.query(RoomParticipant).filter(
        RoomParticipant.room_id == room.id,
        RoomParticipant.user_id == user_id,
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found")

    if target.role == ParticipantRole.host:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot eliminate the host")

    target.is_eliminated = True
    db.add(target)
    db.commit()
    db.refresh(target)

    scores = _compute_participant_scores(db, room)
    participant_resp = RoomParticipantResponse(
        user_id=target.user_id,
        display_name=target.user.display_name,
        role=target.role,
        is_eliminated=target.is_eliminated,
        joined_at=target.joined_at,
        total_score=scores.get(target.user_id, 0),
    )
    background_tasks.add_task(
        ws_manager.broadcast, room.code, "participant.eliminated", participant_resp.model_dump(mode="json")
    )
    return participant_resp


@router.post("/{code}/finish", response_model=LeaderboardResponse)
def finish_room(
    code: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Host ends the game and reveals the final leaderboard."""
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    is_admin = getattr(current_user, "role", "player") == "admin"
    if current_user.id != room.host_user_id and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only host or admin can finish room")

    room.status = RoomStatus.finished
    db.add(room)
    db.commit()

    leaderboard = _build_leaderboard(db, room)
    background_tasks.add_task(
        ws_manager.broadcast, room.code, "room.finished", leaderboard.model_dump(mode="json")
    )
    return leaderboard


@router.get("/{code}/leaderboard", response_model=LeaderboardResponse)
def get_leaderboard(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    room = _get_room_by_code(db, code)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    membership = _get_membership(db, room, current_user)
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a room participant")
    return _build_leaderboard(db, room)


def _build_leaderboard(db: Session, room: Room) -> LeaderboardResponse:
    scores = _compute_participant_scores(db, room)
    participants = (
        db.query(RoomParticipant)
        .filter(RoomParticipant.room_id == room.id)
        .all()
    )
    entries = [
        {"user_id": p.user_id, "display_name": p.user.display_name,
         "total_score": scores.get(p.user_id, 0), "is_eliminated": p.is_eliminated}
        for p in participants if p.role != ParticipantRole.host
    ]
    entries.sort(key=lambda e: e["total_score"], reverse=True)
    return LeaderboardResponse(
        room_code=room.code,
        entries=[
            LeaderboardEntry(rank=i + 1, **e)
            for i, e in enumerate(entries)
        ],
    )
