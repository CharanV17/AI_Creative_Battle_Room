# AI Creative Battle Room

A minimal, real-time multiplayer platform where users compete in AI-powered creative challenges. One host controls the room; participants submit creative concepts; AI expands each concept into a full creative output; the host scores and eliminates contestants round by round.

---

## Quick Start

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Edit .env and set GEMINI_API_KEY and JOB_PROVIDER=gemini
..\.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

- Frontend: http://localhost:3000  
- Backend API: http://localhost:8000  
- API docs: http://localhost:8000/docs

---

## Environment Variables

### `backend/.env`

```env
DATABASE_URL=sqlite:///./battle_room.db
SESSION_EXPIRE_HOURS=168
JOB_PROVIDER=gemini          # "gemini" or "mock"
JOB_TIMEOUT_SECONDS=30
MOCK_PROVIDER_DELAY_SECONDS=2.0
GEMINI_API_KEY=AIza...       # Get free key at aistudio.google.com
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WS_BASE_URL=ws://127.0.0.1:8000
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Browser Client                  │
│  Next.js 14 + TypeScript + Tailwind + Zustand   │
│                                                  │
│  ┌──────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Zustand │  │  REST calls │  │ WebSocket  │ │
│  │  Store   │◄─│  (apiReq)  │  │  (useRoom  │ │
│  │          │  │             │  │  Socket)   │ │
│  └────┬─────┘  └─────┬───────┘  └─────┬──────┘ │
└───────┼──────────────┼────────────────┼─────────┘
        │              │                │
        ▼              ▼                ▼
┌───────────────────────────────────────────────────┐
│              FastAPI Backend (:8000)               │
│                                                    │
│  /auth/*        →  Auth router                    │
│  /rooms/*       →  Rooms router                   │
│  /ws/{code}     →  WebSocket endpoint             │
│                                                    │
│  ┌─────────────┐   ┌──────────────────────────┐  │
│  │  SQLAlchemy │   │  ConnectionManager        │  │
│  │  ORM        │   │  (ws_manager.py)          │  │
│  │  + SQLite   │   │  Dict[room_code, Set[ws]] │  │
│  └─────────────┘   └──────────────────────────┘  │
│                                                    │
│  ┌─────────────────────────────────┐              │
│  │  Background Tasks (async def)   │              │
│  │  run_generation_job()           │              │
│  │  → asyncio.to_thread(provider)  │              │
│  │  → ws_manager.broadcast()       │              │
│  └─────────────────────────────────┘              │
│                                                    │
│  ┌─────────────┐   ┌──────────────┐              │
│  │  Gemini     │   │  Mock        │              │
│  │  Provider   │   │  Provider    │              │
│  └─────────────┘   └──────────────┘              │
└───────────────────────────────────────────────────┘
```

**Key design decisions:**
- **Single-server FastAPI** with native WebSocket support. No Redis, no message broker. Simple enough for this scope; the tradeoff is that horizontal scaling would require a pub/sub layer.
- **SQLite** for zero-config persistence. All state survives restarts. Moving to PostgreSQL requires only changing `DATABASE_URL`.
- **Zustand** manages all client state derived from REST + WebSocket events. A single `applyWsEvent()` reducer keeps UI consistent.
- **Async background tasks** (`async def`) for generation jobs so the event loop is not blocked and WS broadcasts fire mid-job.

---

## Database Schema

```
users
  id, email, password_hash, display_name, role(admin|player), created_at

sessions
  id, user_id → users, token, expires_at, created_at

rooms
  id, code(6-char), challenge_prompt, host_user_id → users,
  status(waiting|active|finished), created_at

room_participants
  id, room_id → rooms, user_id → users,
  role(host|participant), is_eliminated, joined_at
  UNIQUE(room_id, user_id)

rounds
  id, room_id → rooms, number, started_at,
  status(open|closed)

submissions
  id, round_id → rounds, user_id → users,
  content, ai_output, score, created_at

generation_jobs
  id, room_id → rooms, round_id → rounds,
  provider_name, prompt, status(pending|running|succeeded|failed|timed_out),
  output_text, error_text, timeout_seconds,
  started_at, finished_at, created_at, updated_at
```

---

## Real-Time Event Model

All events travel over `ws://host/ws/{room_code}?token={session_token}` as JSON:

```json
{ "type": "<event_type>", "payload": { ... } }
```

| Event Type | Trigger | Payload |
|---|---|---|
| `room.updated` | Participant joins or room status changes | Full `RoomResponse` |
| `round.started` | Host starts a new round | `RoundResponse` |
| `submission.created` | Participant submits | `SubmissionResponse` |
| `job.updated` | Generation job changes state | `JobResponse` |
| `round.closed` | Host closes round (scores computed) | `{ round: RoundResponse, room: RoomResponse }` |
| `participant.eliminated` | Host eliminates a participant | `RoomParticipantResponse` |
| `room.finished` | Host ends the game | `LeaderboardResponse` |

The frontend `applyWsEvent()` Zustand reducer handles each event type and patches the store optimistically. The WebSocket hook reconnects with exponential backoff (up to 5 retries, starting at 1s).

---

## Generation Job Lifecycle

```
                POST /rooms/{code}/rounds/start
                or POST /rooms/{code}/rounds/{id}/submit
                            │
                            ▼
                    ┌──────────────┐
                    │    pending   │  ← job created in DB
                    └──────┬───────┘
                           │ background task starts
                           ▼
                    ┌──────────────┐
                    │   running    │  ← WS broadcast: job.updated
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │succeeded │ │  failed  │ │timed_out │
        │(output)  │ │(error)   │ │(error)   │
        └──────────┘ └──────────┘ └──────────┘
              │            │            │
              └────────────┴────────────┘
                           │
                    WS broadcast: job.updated
```

Two jobs are created per round:
1. **Round opener job** — when the host starts a round, Gemini generates a dramatic creative opening for the round context.
2. **Submission expansion job** — when a participant submits, Gemini expands their concept into a 100–200 word creative output. This is the AI-generated content displayed in the room.

Jobs are completely isolated from room state. A failed job does not affect the round or room — participants can still submit, and the host can still close the round.

---

## Judging / Scoring Mechanism

### Chosen Approach: AI-judged scoring (0–100 per submission)

When the host closes a round, each submission is scored by Gemini using a structured prompt:

> *"Score this submission from 0 to 100 based on: Creativity & originality (40%), Relevance to the challenge (30%), Impact & persuasiveness (30%). Reply with ONLY a number."*

Scores are stored in `submissions.score` and are permanent. Cumulative scores across all closed rounds form the leaderboard (`SUM(score) per user`).

### Fallback (mock provider)
Word-count score: `min(100, word_count * 5 + random(0, 20))`. This produces plausible-looking scores even without a real LLM.

### Weaknesses
- **Prompt injection**: A crafty participant could include text that manipulates the scoring prompt.
- **Inconsistency**: LLM scores for similar submissions can vary run-to-run.
- **No cross-submission comparison**: Each submission is scored in isolation; a relative ranking prompt would be more fair.
- **No appeal mechanism**: Scores are final on round close.

### Production Improvements
- Score all submissions in a single Gemini call with all submissions visible (comparative scoring).
- Add a human override — host can manually adjust any score.
- Use a structured output schema (JSON mode) to get reliable integer scores.
- Cache scores to avoid re-scoring on retries.

---

## Role & Permission Logic

All permissions are enforced on the backend, not just hidden in the UI.

| Action | Host | Participant | Admin |
|---|---|---|---|
| Create room | ✅ | ✅ | ✅ |
| Join room | ✅ | ✅ | ✅ |
| Start round | ✅ | ❌ 403 | ✅ |
| Submit in round | ❌ 403 | ✅ | ❌ 403 |
| Close round | ✅ | ❌ 403 | ✅ |
| Eliminate participant | ✅ | ❌ 403 | ✅ |
| Finish game | ✅ | ❌ 403 | ✅ |
| View snapshot | ✅ (member) | ✅ (member) | ✅ (member) |

The host **cannot** submit as a contestant — `role == participant` is required at the DB level.

---

## What Is Persisted vs Not

### Persisted (SQLite)
- Users, sessions, display names, roles
- Rooms (code, challenge prompt, status, host)
- Room participants (role, elimination status, join time)
- Rounds (number, status, timestamps)
- Submissions (content, AI output, score, timestamps)
- Generation jobs (full lifecycle: status, output, error, timestamps)

### Not Persisted
- Active WebSocket connections (in-memory `ConnectionManager`) — on server restart, clients reconnect and re-subscribe
- Zustand client state — rebuilt from snapshot on page load/refresh
- Generation job queue — jobs that were `running` when the server restarted will appear stuck; a production system would use a durable queue (Celery/Arq/RQ)

---

## Failure Handling

| Failure | Behaviour |
|---|---|
| Generation job fails | `status = failed`, `error_text` stored, WS broadcast fires, room continues normally |
| Generation times out | `status = timed_out`, error stored, room unaffected |
| WebSocket disconnect | Client reconnects with exponential backoff (5 attempts, 1–16s). WS status indicator updates. |
| Invalid room code | 404 returned; UI shows error message |
| Unauthorized action | 403 returned with clear error message displayed |
| Participant already submitted | 400 returned; UI prevents re-submission |
| Backend offline | Health check on load, banner shown |
| Page refresh | Full snapshot re-fetched from `/rooms/{code}/snapshot`; state fully restored |

---

## Known Limitations

1. **No horizontal scaling** — `ConnectionManager` is in-memory. Multiple server instances would not share WS connections. Solution: Redis pub/sub (e.g. with `broadcaster` library).
2. **SQLite concurrency** — Multiple simultaneous writers can cause lock contention. Solution: Switch to PostgreSQL.
3. **No job retry** — Failed/timed-out jobs are terminal. A production version would have automatic retry with backoff.
4. **No spectator mode** — Non-participants cannot view rooms.
5. **Scoring latency on round close** — If there are many submissions, Gemini scoring calls are sequential and blocking. Production: parallelize with `asyncio.gather`.
6. **No real-time submission AI output** — AI expansion job results broadcast via `job.updated`, but the output is not automatically attached to the specific submission in the client store (only the raw job output is shown). A future improvement: link job output back to its submission.
7. **No persistent rate limiting** — A user could spam create rooms or submissions.

---

## What I Would Improve With More Time

1. **Link job output to submission** — After a submission's expansion job succeeds, update `submissions.ai_output` in the DB and broadcast a `submission.updated` event so each submission card shows its own AI output.
2. **Redis pub/sub** — Replace in-memory `ConnectionManager` with a Redis-backed broadcaster for multi-instance support.
3. **Job retry with backoff** — Re-queue failed/timed-out jobs up to 3 times before marking terminal.
4. **Comparative AI scoring** — Score all round submissions in a single Gemini call for relative fairness.
5. **Spectator mode** — Allow non-participants to watch (read-only WS stream, no submission form).
6. **Room activity log** — Persist a timestamped event log so rooms have a full history (event-sourced pattern).
7. **Better auth** — Add a `display_name` field on registration; currently derived from email prefix.
8. **Automated tests** — Unit tests for scoring logic, permission checks, and WS event dispatching.
9. **Reconnect state sync** — On WS reconnect, fetch a fresh snapshot to catch any events missed during disconnect.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | Required; SSR + routing included |
| UI | Tailwind CSS | Required; utility-first, fast to iterate |
| State | Zustand | Required; minimal boilerplate, works well with WS events |
| Language (FE) | TypeScript | Required; type-safe WS events and API responses |
| Backend framework | FastAPI | Async-native, WebSocket support built in, great for rapid API |
| ORM | SQLAlchemy 2 | Mature, supports both sync and async patterns |
| Database | SQLite | Zero-config, sufficient for single-server demo scope |
| Auth | Session tokens (PBKDF2) | Simple, persistent, no JWT complexity |
| AI provider | Google Gemini 1.5 Flash | Free tier available, fast, high quality |
| Realtime | FastAPI native WebSockets | No extra dependencies for single-server setup |
| Async execution | FastAPI `BackgroundTasks` + `asyncio.to_thread` | Lightweight; job runs async, provider call offloaded to thread pool |
