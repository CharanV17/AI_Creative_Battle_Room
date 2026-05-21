from datetime import datetime

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, engine, SessionLocal
from app.models import Room, RoomParticipant, Session as UserSession, User
from app.routers.auth import router as auth_router
from app.routers.rooms import router as rooms_router
from app.ws_manager import ws_manager


app = FastAPI(title="AI Creative Battle Room API", version="1.0.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

    # Backfill schema for SQLite dev migrations
    with engine.begin() as conn:
        try:
            res = conn.execute(text("PRAGMA table_info('users')")).mappings().all()
            cols = [r['name'] for r in res]
            if 'role' not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'player' NOT NULL"))
            conn.execute(text("UPDATE users SET role = display_name WHERE display_name IN ('admin','player')"))
        except Exception as exc:  # noqa: BLE001
            print("Warning: users migration skipped:", exc)

        try:
            res = conn.execute(text("PRAGMA table_info('submissions')")).mappings().all()
            cols = [r['name'] for r in res]
            if 'score' not in cols:
                conn.execute(text("ALTER TABLE submissions ADD COLUMN score INTEGER"))
            if 'ai_output' not in cols:
                conn.execute(text("ALTER TABLE submissions ADD COLUMN ai_output TEXT"))
        except Exception as exc:  # noqa: BLE001
            print("Warning: submissions migration skipped:", exc)



@app.get("/health")
def health():
    return {"status": "ok"}


@app.websocket("/ws/{room_code}")
async def websocket_endpoint(
    room_code: str,
    websocket: WebSocket,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time room updates. Authenticated via token query param."""
    db: Session = SessionLocal()
    try:
        # Authenticate
        user_session = db.query(UserSession).filter(UserSession.token == token).first()
        if not user_session or user_session.expires_at < datetime.utcnow():
            await websocket.close(code=4001)
            return

        user = db.query(User).filter(User.id == user_session.user_id).first()
        if not user:
            await websocket.close(code=4001)
            return

        # Check room membership
        normalized_code = room_code.upper()
        room = db.query(Room).filter(Room.code == normalized_code).first()
        if not room:
            await websocket.close(code=4004)
            return

        membership = (
            db.query(RoomParticipant)
            .filter(RoomParticipant.room_id == room.id, RoomParticipant.user_id == user.id)
            .first()
        )
        if not membership:
            await websocket.close(code=4003)
            return
    finally:
        db.close()

    # Accept and register
    await ws_manager.connect(normalized_code, websocket)
    try:
        while True:
            # Keep alive; clients may send ping frames
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(normalized_code, websocket)


app.include_router(auth_router)
app.include_router(rooms_router)
