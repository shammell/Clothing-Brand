from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from jose import JWTError

from app.core.config import settings
from app.core.database import get_database
from app.core.limiter import limiter
from app.models.user import (
    PasswordResetConfirm,
    PasswordResetRequest,
    UserRegister,
    UserLogin,
    TokenResponse,
    UserResponse,
)
from app.services.auth_service import (
    PASSWORD_RESET_COOLDOWN_SECONDS,
    CurrentUser,
    create_access_token,
    create_reset_token,
    decode_token,
    get_current_user,
    hash_password,
    password_fingerprint,
    verify_password,
)
from app.services.email_service import send_email


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


@router.get("/me")
async def get_me(current_user: CurrentUser = Depends(get_current_user)):
    return {"user_id": current_user["user_id"], "email": current_user["email"], "role": current_user["role"]}


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: PasswordResetRequest, background_tasks: BackgroundTasks):
    db = get_database()
    email = str(body.email).lower()
    user = await db["users"].find_one({"email": email})
    # Always 202 regardless of whether the account exists - a different
    # response here would let anyone enumerate registered emails by
    # watching which ones trigger a 404 vs 202.
    if user:
        now = datetime.now(timezone.utc)
        last_request = user.get("last_password_reset_request_at")
        # Motor/PyMongo round-trips BSON datetimes as naive UTC regardless of
        # what was stored - reattach the UTC tzinfo before subtracting, or
        # this raises on every account that has ever requested a reset.
        if last_request and last_request.tzinfo is None:
            last_request = last_request.replace(tzinfo=timezone.utc)
        if last_request and (now - last_request).total_seconds() < PASSWORD_RESET_COOLDOWN_SECONDS:
            return {"status": "if that email exists, a reset link was sent"}
        await db["users"].update_one({"_id": user["_id"]}, {"$set": {"last_password_reset_request_at": now}})
        token = create_reset_token(str(user["_id"]), email, user.get("password", ""))
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        background_tasks.add_task(
            send_email,
            to=email,
            subject="Reset your Thread&Co password",
            html=f'<p>Click to reset your password (expires in 15 minutes): <a href="{reset_link}">{reset_link}</a></p>',
        )
    return {"status": "if that email exists, a reset link was sent"}


@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, body: PasswordResetConfirm):
    try:
        payload = decode_token(body.token)
    except JWTError as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link"
        ) from error
    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")

    db = get_database()
    try:
        object_id = ObjectId(payload["user_id"])
    except InvalidId as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link"
        ) from error

    user = await db["users"].find_one({"_id": object_id})
    if not user or password_fingerprint(user.get("password", "")) != payload.get("pwd_fp"):
        # Either the user is gone, or the password has already changed
        # since this token was issued (a previous use of this same token,
        # or a change made some other way) - the token is single-use by
        # construction, not by a separate used-token store.
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")

    # Conditioned on the password still matching what was just checked -
    # closes the race between two concurrent requests replaying the same
    # still-valid token before either has committed its update.
    result = await db["users"].update_one(
        {"_id": object_id, "password": user["password"]},
        {"$set": {"password": hash_password(body.new_password)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")
    return {"status": "password updated"}
