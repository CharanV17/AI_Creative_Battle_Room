from datetime import datetime
from typing import List, Literal

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


class RoomResponse(BaseModel):
    code: str
    challenge_prompt: str
    host_user_id: int
    status: RoomStatus
    participants: List[RoomParticipantResponse]
