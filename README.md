# AI Creative Battle Room

A real-time multiplayer platform where users compete in AI-powered creative challenges. One host controls the room, participants submit creative concepts, Google Gemini expands each concept into a full creative campaign and scores them, and the host eliminates contestants round by round until a winner is crowned.

👉 **Live Application (Vercel)**: [https://ai-creative-battle-room.vercel.app/login](https://ai-creative-battle-room.vercel.app/login)  
👉 **Live Backend API (Render)**: [https://ai-creative-battle-room.onrender.com/docs](https://ai-creative-battle-room.onrender.com/docs)

---

## ⚡ Quick Start (Local Setup)

### 1. Backend Setup
```powershell
cd backend
python -m venv .venv
# On Windows:
.\.venv\Scripts\Activate.ps1
# On Unix/macOS:
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env
# Edit .env and set GEMINI_API_KEY, JOB_PROVIDER=gemini
uvicorn app.main:app --reload --port 8000
```
- API Docs: `http://localhost:8000/docs`

### 2. Frontend Setup
```powershell
cd frontend
npm install
copy .env.example .env.local
# Set NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 and NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8000
npm run dev
```
- App URL: `http://localhost:3000`

---

## 🏛️ Architecture Overview

The system is a single-server real-time application using WebSockets for live states and SQLite/PostgreSQL for persistent state.

```
┌────────────────────────────────────────────────────────┐
│                     Browser Client                     │
│  React + Next.js 14 + Tailwind + TypeScript + Zustand  │
│                                                        │
│   ┌──────────────┐     ┌─────────────┐  ┌──────────┐   │
│   │ Zustand Store│◄────│ REST Client │  │WebSocket │   │
│   │ (Local State)│     │ (api.ts)    │  │ (useWS)  │   │
│   └──────┬───────┘     └─────┬───────┘  └────┬─────┘   │
└──────────┼───────────────────┼───────────────┼─────────┘
           │                   │               │
           ▼                   ▼               ▼
┌────────────────────────────────────────────────────────┐
│                     FastAPI Backend                    │
│                                                        │
│  /auth/*  → Auth router                                │
│  /rooms/* → Rooms & Rounds router                      │
│  /ws/*    → WebSockets Endpoint                        │
│                                                        │
│   ┌──────────────┐     ┌──────────────┐ ┌──────────┐   │
│   │  SQLAlchemy  │     │ ws_manager   │ │Background│   │
│   │  (SQLite/PG) │     │ (WS Groups)  │ │ Workers  │   │
│   └──────────────┘     └──────────────┘ └──────────┘   │
└────────────────────────────────────────────────────────┘
```

### Key Design Tradeoffs
* **In-Memory WebSockets**: WebSocket connections are grouped and tracked in-memory using `ConnectionManager`. Scaling horizontally would require a Redis pub/sub broker.
* **SQLite / PostgreSQL**: Configured via SQLAlchemy to seamlessly transition from SQLite (local) to PostgreSQL (production) by modifying the `DATABASE_URL`.
* **Async Workers**: Heavy LLM calls run in a separate worker thread pool (`asyncio.to_thread`) to prevent blocking FastAPI's async event loop.

---

## 🗄️ Database Schema

* **`users`**: `id`, `email`, `password_hash`, `display_name`, `role` (admin | player), `created_at`
* **`sessions`**: `id`, `user_id`, `token`, `expires_at`, `created_at`
* **`rooms`**: `id`, `code` (6-char), `challenge_prompt`, `host_user_id`, `status` (waiting | active | finished), `created_at`
* **`room_participants`**: `id`, `room_id`, `user_id`, `role` (host | participant), `is_eliminated`, `joined_at`
* **`rounds`**: `id`, `room_id`, `number`, `started_at`, `status` (open | closed)
* **`submissions`**: `id`, `round_id`, `user_id`, `content`, `ai_output`, `score`, `created_at`
* **`generation_jobs`**: `id`, `room_id`, `round_id`, `provider_name`, `prompt`, `status` (pending | running | succeeded | failed | timed_out), `output_text`, `error_text`, `timeout_seconds`, `started_at`, `finished_at`, `created_at`

---

## 📡 Real-Time Event Model

All client/server events are broadcasted over `ws://<host>/ws/{room_code}?token={token}` as JSON payloads.

| Event Type | Trigger | Payload |
|---|---|---|
| `room.updated` | Participant joins, room status changes | `RoomSnapshot` |
| `round.started` | Host starts a round | `RoundResponse` |
| `submission.created` | Contestant submits a prompt | `SubmissionResponse` |
| `job.updated` | AI expansion job changes state | `JobResponse` |
| `round.closed` | Host closes round (AI scoring done) | `{ round: Round, room: Room }` |
| `participant.eliminated`| Host eliminates a participant | `RoomParticipantResponse` |
| `room.finished` | Host ends the game | `LeaderboardResponse` |

---

## ⚙️ Generation Job Lifecycle

Jobs process async LLM generations:
```
[POST Submission] ──> [Pending] ──(asyncio)──> [Running] ──> [Succeeded] (stores text)
                                                       └──> [Failed / Timed_out] (stores error)
```
- **Job updates** broadcast to the room instantly (`job.updated` event) to render animated loader states in the UI.
- Failed/timed-out jobs are non-blocking; the game loop and room status remain active.

---

## ⚖️ Judging / Scoring Mechanism

* **Chosen Approach (AI-judged)**: When a round closes, Gemini scores each submission from `0` to `100` based on: Creativity & originality (40%), Relevance (30%), and Impact (30%).
  - *Prompt*: *"Score this submission from 0 to 100 based on... Reply with ONLY a single integer. No explanation, no punctuation."*
* **Fallback Mode (Mock)**: If the Gemini API key is missing or fails, scores default to word-count weighting: `min(100, word_count * 5)`.
* **Leaderboard**: Displays cumulative `SUM(score)` across all closed rounds, ranking active/eliminated players.

### Design Tradeoffs & Weaknesses
- **Isolated Scoring**: Submissions are evaluated individually. A relative ranking prompt comparing all entries together would provide fairer results.
- **Latency**: Scoring queries run sequentially. With large player counts, this introduces visible latency during round closure.

---

## 🛡️ Role & Permission Logic

Permissions are strictly validated in the backend:
- **Host**: Can start/close rounds, eliminate players, and finish the room. Cannot make submissions.
- **Participant**: Can join and make submissions. Cannot start/close rounds, eliminate players, or access host panels.

---

## 💾 What is Persisted vs Not

### Persisted (Database)
- All user configurations, session tokens, rooms, rounds, participant roles, submission content, AI outputs, and job logs.

### Not Persisted (In-Memory)
- **WebSocket connections**: Stored in active RAM. On server restart, clients reconnect automatically via the frontend's auto-reconnection loop.
- **Job queue**: In-progress background tasks. If the container restarts, running tasks will show as stalled.

---

## 🚨 Failure Handling Strategy

* **WS Disconnects**: Client automatically reconnects using exponential backoff (up to 5 retries, 1s to 16s).
* **LLM Failures**: If the Gemini API fails/limits, the app falls back to word-count scoring instantly.
* **Page Refresh**: Refreshing retrieves a full state snapshot from `/rooms/{code}/snapshot` to restore the UI.

---

## ⚠️ Known Limitations & Future Improvements

1. **No Horizontal Scaling**: In-memory WebSockets restrict the application to single-instance deployments.
2. **Missing Comparative Scoring**: AI scores are generated in isolation.
3. **No Retry Queue**: Interrupted LLM jobs are marked as terminal without automatic backoff retries.
4. **Future improvements with more time**:
   - Integrate **Redis** for distributed WebSocket broadcasting.
   - Implement **Comparative LLM Scoring** by sending all submissions in a single prompt.
   - Add **Interactive manual overrides** allowing hosts to adjust AI-generated scores.
