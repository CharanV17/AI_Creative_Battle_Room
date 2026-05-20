from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import GenerationJob, JobStatus, Room
from app.providers.factory import get_generation_provider

logger = logging.getLogger(__name__)


def create_generation_job(
    db: Session,
    *,
    room_id: int,
    round_id: int | None,
    prompt: str,
    timeout_seconds: int,
    provider_name: str = "mock",
) -> GenerationJob:
    job = GenerationJob(
        room_id=room_id,
        round_id=round_id,
        provider_name=provider_name,
        prompt=prompt,
        timeout_seconds=timeout_seconds,
        status=JobStatus.pending,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _job_to_dict(job: GenerationJob) -> dict:
    return {
        "id": job.id,
        "room_id": job.room_id,
        "round_id": job.round_id,
        "provider_name": job.provider_name,
        "prompt": job.prompt,
        "status": job.status.value if hasattr(job.status, "value") else str(job.status),
        "output_text": job.output_text,
        "error_text": job.error_text,
        "timeout_seconds": job.timeout_seconds,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat(),
    }


async def run_generation_job(job_id: int) -> None:
    """Async background task: run a generation job and broadcast WS events at each state transition."""
    from app.ws_manager import ws_manager  # deferred to avoid circular import

    db: Session = SessionLocal()
    try:
        job: GenerationJob | None = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
        if not job:
            logger.warning("run_generation_job: job %d not found", job_id)
            return

        room: Room | None = db.query(Room).filter(Room.id == job.room_id).first()
        room_code: str = room.code if room else ""

        # Transition: pending → running
        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        job.error_text = None
        db.commit()
        db.refresh(job)
        await ws_manager.broadcast(room_code, "job.updated", _job_to_dict(job))

        provider = get_generation_provider()

        try:
            # Run blocking provider call in thread pool so event loop is not blocked
            output_text: str = await asyncio.to_thread(provider.generate, job.prompt, job.timeout_seconds)
        except TimeoutError as exc:
            job.status = JobStatus.timed_out
            job.error_text = str(exc)
            job.finished_at = datetime.utcnow()
            db.commit()
            db.refresh(job)
            await ws_manager.broadcast(room_code, "job.updated", _job_to_dict(job))
            return
        except Exception as exc:  # noqa: BLE001
            job.status = JobStatus.failed
            job.error_text = str(exc)
            job.finished_at = datetime.utcnow()
            db.commit()
            db.refresh(job)
            await ws_manager.broadcast(room_code, "job.updated", _job_to_dict(job))
            return

        # Transition: running → succeeded
        job.status = JobStatus.succeeded
        job.output_text = output_text
        job.error_text = None
        job.finished_at = datetime.utcnow()
        db.commit()
        db.refresh(job)
        await ws_manager.broadcast(room_code, "job.updated", _job_to_dict(job))

    finally:
        db.close()
