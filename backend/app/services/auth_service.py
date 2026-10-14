import hashlib
from datetime import datetime, timedelta, timezone
from typing import Callable, TypedDict

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

import bcrypt
from app.core.config import settings
from app.core.database import get_database

bearer_scheme = HTTPBearer(auto_error=False)


BCRYPT_MAX_BYTES = 72


def _password_bytes(password: str) -> bytes:
    # bcrypt only uses the first 72 bytes, and bcrypt>=5 raises ValueError
    # beyond that instead of truncating - while the models accept up to 128
    # characters. Truncating here, identically for hashing and verifying,
    # matches what older bcrypt did silently, so existing hashes still verify.
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    return bcrypt.checkpw(_password_bytes(plain_password), hashed_password.encode("utf-8"))


RESET_TOKEN_EXPIRE_MINUTES = 15
# Per-IP limiting on the /forgot-password route (see core/limiter.py) guards
# cost/abuse, but IP is the wrong principal for "how often can THIS account
# be emailed" - an attacker spreading requests across many IPs could
# otherwise email-bomb one victim's inbox without limit. This cooldown is
# keyed on the account itself (via a DB field, not per-process memory) so it
# holds regardless of how many distinct IPs the requests come from.
PASSWORD_RESET_COOLDOWN_SECONDS = 60


def password_fingerprint(password_hash: str) -> str:
    # A short digest of the current bcrypt hash, not the hash itself - the
    # hash is already one-way, but there's no reason to also put it
    # verbatim into a bearer token that travels over email. Embedding this
    # in the reset token and re-checking it at reset time is what makes the
    # token single-use: resetting the password changes the hash, so a
    # replayed copy of the same token no longer matches and is rejected,
    # without needing a separate used-token store.
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def create_reset_token(user_id: str, email: str, current_password_hash: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "purpose": "password_reset",
        "pwd_fp": password_fingerprint(current_password_hash),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload.setdefault("purpose", "access")
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload["exp"] = expires_at
    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )


class CurrentUser(TypedDict):
    user_id: str
    email: str
    role: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    try:
        payload = decode_token(credentials.credentials)
    except JWTError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from error

    user_id = payload.get("user_id")
    email = payload.get("email")
    if not user_id or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    # A password-reset token is a JWT signed with this same secret and also
    # carries user_id/email, so without this check it would work as a
    # bearer access token too - anyone who received a reset email (or
    # intercepted the link) could call any protected route for the
    # token's 15-minute lifetime without ever resetting a password. Legacy
    # tokens with no "purpose" claim at all (pre-dating this field) are
    # still accepted as access tokens.
    if payload.get("purpose") not in (None, "access"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        object_id = ObjectId(user_id)
    except InvalidId as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        ) from error

    # role and is_blocked are read from the database on every request, never
    # trusted from the token claim - a block or role change made after login
    # must take effect immediately, not after the token's 30-minute expiry.
    user = await get_database()["users"].find_one({"_id": object_id})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if user.get("is_blocked"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is blocked",
        )

    return CurrentUser(user_id=user_id, email=email, role=str(user.get("role", "customer")))


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


def require_role(*roles: str) -> Callable[[CurrentUser], CurrentUser]:
    def _check(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return current_user

    return _check