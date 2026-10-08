from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status

from app.core.database import get_database
from app.core.limiter import limiter
from app.models.user import UserRegister, UserLogin, TokenResponse, UserResponse
from app.services.auth_service import hash_password, verify_password, create_access_token


router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, user: UserRegister):
    db = get_database()
    email = str(user.email).lower()
    existing = await db["users"].find_one({"email": email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    new_user = {
        "name": user.username,
        "email": email,
        "password": hash_password(user.password),
        "role": "customer",
        "is_blocked": False,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db["users"].insert_one(new_user)

    user_id = str(result.inserted_id)
    token = create_access_token({"user_id": user_id, "email": email, "role": "customer"})

    return TokenResponse(
        access_token=token,
        user=UserResponse(id=user_id, username=user.username, email=email, role="customer"),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, user: UserLogin):
    db = get_database()
    email = str(user.email).lower()
    existing = await db["users"].find_one({"email": email})
    if not existing or not verify_password(user.password, existing.get("password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Checked only after the password is verified - a wrong password on a
    # blocked account must still read as "Invalid email or password", not
    # reveal block status to someone who doesn't already know it.
    if existing.get("is_blocked", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been blocked. Contact support.",
        )

    user_id = str(existing["_id"])
    role = existing.get("role", "customer")
    token = create_access_token({"user_id": user_id, "email": email, "role": role})

    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user_id,
            username=existing.get("name", ""),
            email=existing["email"],
            role=role,
        ),
    )
