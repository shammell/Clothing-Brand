from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

UserRole = Literal["customer", "lister", "admin"]


class UserRegister(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr
    role: UserRole = "customer"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserSummary(BaseModel):
    id: str
    username: str
    email: EmailStr
    role: UserRole
    is_blocked: bool
    created_at: datetime


class UserRoleUpdate(BaseModel):
    role: UserRole


class UserBlockUpdate(BaseModel):
    is_blocked: bool
