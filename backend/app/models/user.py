from datetime import datetime
from typing import Literal, Optional

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
    # Defaulted, unlike a freshly registered user's always-present field:
    # documents that haven't been through the Task 7 migration yet (the
    # deploy-to-migration gap this phase creates) have no created_at, and
    # GET /users/ and the PATCH routes' responses must keep rendering those,
    # not 500 on them. Matches the established pattern for other backfilled
    # fields - see OrderItemResponse.size/color and
    # OrderResponse.shipping_address in app/models/order.py.
    created_at: Optional[datetime] = None


class UserRoleUpdate(BaseModel):
    role: UserRole


class UserBlockUpdate(BaseModel):
    is_blocked: bool
