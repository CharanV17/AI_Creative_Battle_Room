# AI Creative Battle Room

Phase 1 scaffold for the intern assignment.

## Current Phase 1 Coverage

- Frontend and backend project skeleton created
- Persistent identity flow (register/login + token session)
- Room creation and room joining
- Host/participant role assignment at room membership level
- SQLite persistence for users, sessions, rooms, and participants

## Tech Stack

- Frontend: Next.js + TypeScript + Tailwind CSS + Zustand (installed dependency)
- Backend: FastAPI + SQLAlchemy + SQLite

## Project Structure

- `frontend/` Next.js application
- `backend/` FastAPI API service

## Backend Setup

1. Open a terminal in `backend/`
2. Create virtual environment
3. Install dependencies
4. Start API server

Example commands (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Frontend Setup

1. Open a second terminal in `frontend/`
2. Install dependencies
3. Start dev server

Example commands:

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Frontend runs at `http://localhost:3000`, backend at `http://localhost:8000`.

## Phase 2 Plan

- Add rounds entity and round lifecycle endpoints
- Add async generation job table and worker
- Add realtime room updates over WebSocket
- Add host scoring/elimination endpoints

