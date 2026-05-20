import json
import logging
from collections import defaultdict
from typing import Any, Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections grouped by room code."""

    def __init__(self) -> None:
        self._rooms: Dict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, room_code: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._rooms[room_code].add(websocket)
        logger.info("WS connected: room=%s total=%d", room_code, len(self._rooms[room_code]))

    def disconnect(self, room_code: str, websocket: WebSocket) -> None:
        self._rooms[room_code].discard(websocket)
        if not self._rooms[room_code]:
            self._rooms.pop(room_code, None)
        logger.info("WS disconnected: room=%s", room_code)

    async def broadcast(self, room_code: str, event_type: str, payload: Any) -> None:
        """Send a named event to every connected client in a room."""
        message = json.dumps({"type": event_type, "payload": payload}, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._rooms.get(room_code, set())):
            try:
                await ws.send_text(message)
            except Exception as exc:  # noqa: BLE001
                logger.warning("WS send failed (%s), removing client: %s", room_code, exc)
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_code, ws)


# Singleton used across the app
ws_manager = ConnectionManager()
