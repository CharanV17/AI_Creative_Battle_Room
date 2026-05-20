from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field

from app.models import ParticipantRole, RoomStatus

UserRole = Literal["admin", "player"]


class AuthRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class RegisterRequest(AuthRequest):
    role: UserRole = "player"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str
    role: UserRole

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class RoomCreateRequest(BaseModel):
    challenge_prompt: str = Field(min_length=10, max_length=500)


class RoomParticipantResponse(BaseModel):
    user_id: int
    display_name: str
    role: ParticipantRole
    is_eliminated: bool
    joined_at: datetime
    total_score: int = 0


class RoomResponse(BaseModel):
    id: int
    code: str
    challenge_prompt: str
    host_user_id: int
    status: RoomStatus
    participants: List[RoomParticipantResponse]


class SubmissionRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class SubmissionResponse(BaseModel):
    id: int
    round_id: int
    user_id: int
    display_name: str
    content: str
    score: Optional[int] = None
    ai_output: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RoundResponse(BaseModel):
    id: int
    room_id: int
    number: int
    started_at: datetime
    status: str
    submissions: List[SubmissionResponse] = []


class JobResponse(BaseModel):
    id: int
    room_id: int
    round_id: Optional[int] = None
    provider_name: str
    prompt: str
    status: str
    output_text: Optional[str] = None
    error_text: Optional[str] = None
    timeout_seconds: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RoomSnapshot(BaseModel):
    room: RoomResponse
    current_round: Optional[RoundResponse] = None
    latest_job: Optional[JobResponse] = None


class LeaderboardEntry(BaseModel):
    user_id: int
    display_name: str
    total_score: int
    is_eliminated: bool
    rank: int


class LeaderboardResponse(BaseModel):
    room_code: str
    entries: List[LeaderboardEntry]
