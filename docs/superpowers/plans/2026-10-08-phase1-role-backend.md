# Phase 1: Role Model & Backend RBAC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the binary `is_admin: bool` with a three-value `role`
(`customer`/`lister`/`admin`), add user blocking, and add the admin-only
Users API — the foundation every later phase depends on.

**Architecture:** Add `role`/`is_blocked`/`created_at` fields to the
`users` collection, thread `role` through JWT/`CurrentUser` in place of
`is_admin`, add a `require_role(*roles)` dependency, extend
`products.py`'s write routes to accept `lister` as well as `admin`, and
add a new `users.py` route file for admin user management.

**Tech Stack:** FastAPI, Motor/PyMongo, pytest (existing conventions in
`backend/tests/`).

**Spec:** `docs/superpowers/specs/2026-10-08-site-expansion-design.md`
(sections: Actors & Permission Matrix, Data Model Changes, Backend
Changes — Review Focus items 2 and 4 apply to this phase)

## Global Constraints

- `UserRegister` never accepts a `role` field — registration always
  creates `role: "customer"` server-side, regardless of request body.
- JWT payload key is `role` (string), not `is_admin` (bool) — this is a
  breaking change to token shape; no backward-compat dual-reading, since
  tokens expire in 30 minutes and this is a pre-launch app.
- An admin can never block or demote themselves via the Users API
  (checked server-side, not just hidden client-side).
- `MONGODB_URL` safety guard in `conftest.py` (localhost-only) must keep
  passing — never loosen it to make a test easier to write.

## Review Focus

1. **Blocked user with a still-valid JWT.** `login` checks `is_blocked`,
   but `get_current_user` does not — a blocked user's existing token
   keeps working until it expires. This is accepted per the spec (Review
   Focus item 2) but must be a documented code comment at the blocking
   check, not silently absent.
2. **Self-demotion/self-block lockout.** An admin hitting
   `PATCH /users/{their_own_id}/role` or `/block` must get `400`, not
   succeed and lock themselves out.
3. **Wrong password on a blocked account.** Must return the same
   `401 "Invalid email or password"` as any other wrong password — never
   `403` before the password is verified, or block status leaks to
   someone who doesn't already know the password.
4. **Last-admin demotion by a *different* admin.** Spec explicitly allows
   this (only self-demotion is blocked) — a test must pin this down as
   intentional so a future change doesn't "fix" it into something the
   spec didn't ask for.
5. **Old tokens issued before this change.** Any JWT signed before this
   deploy has `is_admin` in its payload, not `role` — `get_current_user`
   must default missing `role` to `"customer"` rather than crashing on a
   missing key (pre-existing users re-logging in get a correct new token
   anyway; this just prevents a 500 in the gap).

---

### Task 1: User model fields (`role`, `is_blocked`, `created_at`)

**Files:**
- Modify: `backend/app/models/user.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Produces: `UserRole = Literal["customer", "lister", "admin"]`,
  `UserResponse.role: UserRole`, `UserSummary` model, `UserRoleUpdate`,
  `UserBlockUpdate` — consumed by Tasks 2-5.

- [ ] **Step 1: Write the failing test** — registration response no
  longer has `is_admin`, has `role` instead.

```python
# Add to backend/tests/test_auth.py
def test_register_returns_role_not_is_admin(client):
    response = client.post(
        "/auth/register",
        json={"username": "Role Test", "email": "roletest@example.com", "password": "testpass123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["role"] == "customer"
    assert "is_admin" not in body["user"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auth.py::test_register_returns_role_not_is_admin -v`
Expected: FAIL (`KeyError` or `is_admin` still present / `role` missing)

- [ ] **Step 3: Update the model**

```python
# backend/app/models/user.py
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
```

(This is a full replacement of the file's contents — the old
`is_admin: bool = False` field on `UserResponse` is removed, not kept
alongside `role`.)

- [ ] **Step 4: Run test to verify it still fails** (model changed, but
  routes/auth_service haven't yet — this step confirms the test is
  actually exercising the route, not just the model)

Run: `cd backend && python -m pytest tests/test_auth.py::test_register_returns_role_not_is_admin -v`
Expected: FAIL (route still sets `is_admin`, not `role`)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/tests/test_auth.py
git commit -m "Add role enum and user management models"
```

---

### Task 2: `auth_service.py` — role-based JWT and `require_role`

**Files:**
- Modify: `backend/app/services/auth_service.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: nothing new from Task 1 directly (this task works with raw
  dict payloads, not the pydantic models).
- Produces: `CurrentUser.role: str`, `require_role(*roles: str) -> Callable`
  dependency factory, `require_admin` (unchanged signature, now backed by
  `role`) — consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write the failing test**

```python
# Add to backend/tests/test_auth.py
def test_get_current_user_defaults_missing_role_to_customer(client, register_user):
    # Simulates a pre-migration JWT that has no "role" claim at all.
    import jose.jwt as jose_jwt
    from app.core.config import settings

    register_user(email="legacy@example.com")
    legacy_token = jose_jwt.encode(
        {"user_id": "000000000000000000000000", "email": "legacy@example.com"},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    response = client.get("/orders/me", headers={"Authorization": f"Bearer {legacy_token}"})
    # Must not 500 - falls back to role="customer" and proceeds (empty list, since no orders).
    assert response.status_code == 200
    assert response.json() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_auth.py::test_get_current_user_defaults_missing_role_to_customer -v`
Expected: FAIL (current code reads `is_admin`, not `role` — but since
`CurrentUser` is a TypedDict with no runtime validation, this may
currently pass by accident; if so, note in the commit message that this
test is a regression guard for the upcoming change, not a bug fix)

- [ ] **Step 3: Implement**

```python
# backend/app/services/auth_service.py
from typing import Callable, TypedDict
# (keep existing imports: datetime, timedelta, timezone, Depends, HTTPException,
#  status, HTTPAuthorizationCredentials, HTTPBearer, JWTError, jwt, bcrypt, settings)

# ... hash_password, verify_password, create_access_token, decode_token unchanged ...


class CurrentUser(TypedDict):
    user_id: str
    email: str
    role: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
    except JWTError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from error

    user_id = payload.get("user_id")
    email = payload.get("email")
    if not user_id or not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    # Tokens issued before the role migration carry no "role" claim at
    # all (and never carried "is_admin" as a claim name we read here
    # either, post-migration) - default to the least-privileged role
    # rather than raising, so a pre-existing session degrades gracefully
    # to customer-level access instead of a 500.
    return CurrentUser(user_id=user_id, email=email, role=str(payload.get("role", "customer")))


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_role(*roles: str) -> Callable[[CurrentUser], CurrentUser]:
    def _check(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user["role"] not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return _check
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: PASS (all of `test_auth.py`, not just the new test — this
touches a shared dependency used by every authenticated route)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth_service.py backend/tests/test_auth.py
git commit -m "Replace is_admin with role claim and add require_role dependency"
```

---

### Task 3: `auth.py` routes — register/login use `role`, add blocking check

**Files:**
- Modify: `backend/app/routes/auth.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `UserResponse`, `UserRole` (Task 1); `create_access_token`
  (unchanged signature, Task 2).
- Produces: `users` documents now always have `role`, `is_blocked`,
  `created_at` fields — consumed by Task 4's `make_lister`/`make_admin`
  fixtures and Task 5's `users.py` routes.

- [ ] **Step 1: Write the failing tests**

```python
# Add to backend/tests/test_auth.py
from datetime import datetime, timezone


def test_register_sets_customer_role_and_created_at(client):
    response = client.post(
        "/auth/register",
        json={"username": "New User", "email": "newuser@example.com", "password": "testpass123"},
    )
    assert response.json()["user"]["role"] == "customer"


def test_blocked_user_cannot_log_in(client, register_user):
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    from app.core.config import settings

    register_user(email="blocked@example.com", password="blockedpass1")

    async def _block():
        db_client = AsyncIOMotorClient(settings.MONGODB_URL)
        try:
            await db_client[settings.DB_NAME]["users"].update_one(
                {"email": "blocked@example.com"}, {"$set": {"is_blocked": True}}
            )
        finally:
            db_client.close()

    asyncio.run(_block())

    response = client.post("/auth/login", json={"email": "blocked@example.com", "password": "blockedpass1"})
    assert response.status_code == 403
    assert "blocked" in response.json()["detail"].lower()


def test_wrong_password_on_blocked_account_still_says_invalid_credentials(client, register_user):
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    from app.core.config import settings

    register_user(email="blocked2@example.com", password="blockedpass1")

    async def _block():
        db_client = AsyncIOMotorClient(settings.MONGODB_URL)
        try:
            await db_client[settings.DB_NAME]["users"].update_one(
                {"email": "blocked2@example.com"}, {"$set": {"is_blocked": True}}
            )
        finally:
            db_client.close()

    asyncio.run(_block())

    response = client.post("/auth/login", json={"email": "blocked2@example.com", "password": "wrongpass"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_auth.py -k "role_and_created_at or blocked" -v`
Expected: FAIL (route still writes `is_admin`, no blocking check exists)

- [ ] **Step 3: Implement**

```python
# backend/app/routes/auth.py
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

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
        user=UserResponse(id=user_id, username=existing.get("name", ""), email=existing["email"], role=role),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/auth.py backend/tests/test_auth.py
git commit -m "Set role/is_blocked/created_at on registration, block check on login"
```

---

### Task 4: `conftest.py` fixtures — `make_admin`/`make_lister`, update existing tests

**Files:**
- Modify: `backend/tests/conftest.py`
- Modify: `backend/tests/test_products.py`
- Modify: `backend/tests/test_orders.py`

**Interfaces:**
- Produces: `make_lister(email)` fixture (mirrors existing `make_admin`),
  `lister_headers` fixture (mirrors `admin_headers`) — consumed by Task 5
  and any later-phase test needing a lister identity.

- [ ] **Step 1: Update `make_admin` and add `make_lister`/`lister_headers`**

```python
# backend/tests/conftest.py - replace the existing make_admin fixture and
# admin_headers fixture with:

@pytest.fixture
def make_admin():
    async def _update(email: str) -> None:
        db_client = AsyncIOMotorClient(settings.MONGODB_URL)
        try:
            await db_client[settings.DB_NAME]["users"].update_one(
                {"email": email.lower()}, {"$set": {"role": "admin"}}
            )
        finally:
            db_client.close()

    def _make_admin(email: str) -> None:
        _run(_update(email))

    return _make_admin


@pytest.fixture
def make_lister():
    async def _update(email: str) -> None:
        db_client = AsyncIOMotorClient(settings.MONGODB_URL)
        try:
            await db_client[settings.DB_NAME]["users"].update_one(
                {"email": email.lower()}, {"$set": {"role": "lister"}}
            )
        finally:
            db_client.close()

    def _make_lister(email: str) -> None:
        _run(_update(email))

    return _make_lister


@pytest.fixture
def admin_headers(client: TestClient, register_user, make_admin):
    email = "admin@example.com"
    register_user(username="Admin", email=email, password="adminpass123")
    make_admin(email)
    login_response = client.post("/auth/login", json={"email": email, "password": "adminpass123"})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def lister_headers(client: TestClient, register_user, make_lister):
    email = "lister@example.com"
    register_user(username="Lister", email=email, password="listerpass1")
    make_lister(email)
    login_response = client.post("/auth/login", json={"email": email, "password": "listerpass1"})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2: Run full backend test suite to find breakage**

Run: `cd backend && python -m pytest -v`
Expected: Any test asserting `is_admin` in a response body now fails.
Note the failing test names.

- [ ] **Step 3: Fix the breakage** — search `test_products.py` and
  `test_orders.py` for any `is_admin` assertions and update them to read
  `role` instead (there are no known `is_admin` response-body assertions
  in these two files as of this plan's writing, based on the versions
  read during spec research, but this step exists in case one was added
  since). If none are found, this step is a no-op confirmation, not
  skipped — run the search explicitly:

```bash
grep -rn "is_admin" backend/tests/
```

Fix any matches found; if there are none, proceed to Step 4.

- [ ] **Step 4: Run full backend test suite to confirm green**

Run: `cd backend && python -m pytest -v`
Expected: PASS (every test)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/
git commit -m "Add lister test fixtures, migrate is_admin assertions to role"
```

---

### Task 5: Lister product permissions

**Files:**
- Modify: `backend/app/routes/products.py`
- Test: `backend/tests/test_products.py`

**Interfaces:**
- Consumes: `require_role` (Task 2), `lister_headers` (Task 4).

- [ ] **Step 1: Write the failing tests**

```python
# Add to backend/tests/test_products.py
def test_lister_can_create_product(client, lister_headers):
    response = client.post(
        "/products/",
        headers=lister_headers,
        json={
            "name": "Lister Tee", "price": 15.0, "category": "T-Shirts", "brand": "TestBrand",
            "sizes": ["S", "M"], "colors": ["Black"], "image_url": "/products/no-image.svg", "stock": 5,
        },
    )
    assert response.status_code == 201


def test_lister_can_update_and_delete_product(client, lister_headers, seed_product):
    product_id = seed_product()
    update = client.put(
        f"/products/{product_id}",
        headers=lister_headers,
        json={
            "name": "Updated Tee", "price": 25.0, "category": "T-Shirts", "brand": "TestBrand",
            "sizes": ["S"], "colors": ["Black"], "image_url": "/products/no-image.svg", "stock": 3,
        },
    )
    assert update.status_code == 200
    delete = client.delete(f"/products/{product_id}", headers=lister_headers)
    assert delete.status_code == 204


def test_customer_cannot_create_product(client, auth_headers):
    response = client.post(
        "/products/",
        headers=auth_headers,
        json={
            "name": "Customer Tee", "price": 15.0, "category": "T-Shirts", "brand": "TestBrand",
            "sizes": ["S"], "colors": ["Black"], "image_url": "/products/no-image.svg", "stock": 5,
        },
    )
    assert response.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_products.py -k "lister or customer_cannot" -v`
Expected: FAIL (`lister_can_create_product` and
`lister_can_update_and_delete_product` get 403; `customer_cannot_create_product`
already passes today under `require_admin` — confirm it still passes
after the change in Step 3, don't skip re-running it)

- [ ] **Step 3: Implement**

```python
# backend/app/routes/products.py - change the import and three dependencies
from app.services.auth_service import CurrentUser, require_admin, require_role

# ... get_products, get_product unchanged ...

@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(product: ProductCreate, _: CurrentUser = Depends(require_role("admin", "lister"))):
    ...  # body unchanged

@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, product: ProductCreate, _: CurrentUser = Depends(require_role("admin", "lister"))):
    ...  # body unchanged

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: str, _: CurrentUser = Depends(require_role("admin", "lister"))):
    ...  # body unchanged
```

(`require_admin` import stays even though unused here if any other route
in this file still uses it — check before removing the import; as of
this plan's research, `products.py` only used `require_admin` on these
three routes, so the import can be fully replaced, not kept alongside.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_products.py -v`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/products.py backend/tests/test_products.py
git commit -m "Allow listers the same product CRUD permissions as admins"
```

---

### Task 6: Admin Users API

**Files:**
- Create: `backend/app/routes/users.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_users.py` (new file)

**Interfaces:**
- Consumes: `UserSummary`, `UserRoleUpdate`, `UserBlockUpdate` (Task 1),
  `require_admin` (Task 2), `lister_headers`/`admin_headers` (Task 4).
- Produces: `GET /users/`, `PATCH /users/{id}/role`,
  `PATCH /users/{id}/block` — consumed by Phase 4's Admin Users tab.

- [ ] **Step 1: Write the failing tests**

```python
# Create backend/tests/test_users.py
def test_list_users_requires_admin(client, auth_headers):
    response = client.get("/users/", headers=auth_headers)
    assert response.status_code == 403


def test_admin_can_list_users(client, admin_headers, register_user):
    register_user(username="Someone", email="someone@example.com", password="somepass123")
    response = client.get("/users/", headers=admin_headers)
    assert response.status_code == 200
    emails = [user["email"] for user in response.json()]
    assert "someone@example.com" in emails
    assert "admin@example.com" in emails


def test_admin_can_promote_customer_to_lister(client, admin_headers, register_user):
    register_user(username="Promote Me", email="promoteme@example.com", password="promotepass1")
    users = client.get("/users/", headers=admin_headers).json()
    target_id = next(u["id"] for u in users if u["email"] == "promoteme@example.com")

    response = client.patch(f"/users/{target_id}/role", headers=admin_headers, json={"role": "lister"})
    assert response.status_code == 200
    assert response.json()["role"] == "lister"


def test_admin_cannot_demote_self(client, admin_headers):
    users = client.get("/users/", headers=admin_headers).json()
    self_id = next(u["id"] for u in users if u["email"] == "admin@example.com")

    response = client.patch(f"/users/{self_id}/role", headers=admin_headers, json={"role": "customer"})
    assert response.status_code == 400


def test_admin_can_demote_a_different_admin(client, admin_headers, register_user, make_admin):
    register_user(username="Other Admin", email="otheradmin@example.com", password="otherpass123")
    make_admin("otheradmin@example.com")
    users = client.get("/users/", headers=admin_headers).json()
    other_id = next(u["id"] for u in users if u["email"] == "otheradmin@example.com")

    # Intentional per spec: only SELF-demotion is blocked. A different
    # admin demoting another admin (even the last other one) is allowed.
    response = client.patch(f"/users/{other_id}/role", headers=admin_headers, json={"role": "customer"})
    assert response.status_code == 200
    assert response.json()["role"] == "customer"


def test_admin_can_block_and_unblock_user(client, admin_headers, register_user):
    register_user(username="Block Me", email="blockme@example.com", password="blockpass123")
    users = client.get("/users/", headers=admin_headers).json()
    target_id = next(u["id"] for u in users if u["email"] == "blockme@example.com")

    block = client.patch(f"/users/{target_id}/block", headers=admin_headers, json={"is_blocked": True})
    assert block.status_code == 200
    assert block.json()["is_blocked"] is True

    unblock = client.patch(f"/users/{target_id}/block", headers=admin_headers, json={"is_blocked": False})
    assert unblock.json()["is_blocked"] is False


def test_admin_cannot_block_self(client, admin_headers):
    users = client.get("/users/", headers=admin_headers).json()
    self_id = next(u["id"] for u in users if u["email"] == "admin@example.com")

    response = client.patch(f"/users/{self_id}/block", headers=admin_headers, json={"is_blocked": True})
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_users.py -v`
Expected: FAIL (`404 Not Found` — no `/users/` route exists yet)

- [ ] **Step 3: Implement**

```python
# backend/app/routes/users.py
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.database import get_database
from app.models.user import UserBlockUpdate, UserRoleUpdate, UserSummary
from app.services.auth_service import CurrentUser, require_admin

router = APIRouter(prefix="/users", tags=["Users"])


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "username": user.get("name", ""),
        "email": user["email"],
        "role": user.get("role", "customer"),
        "is_blocked": user.get("is_blocked", False),
        "created_at": user["created_at"],
    }


def parse_user_id(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except InvalidId as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid user id") from error


@router.get("/", response_model=list[UserSummary])
async def list_users(_: CurrentUser = Depends(require_admin)):
    db = get_database()
    users = await db["users"].find({}).sort("created_at", -1).to_list(length=500)
    return [serialize_user(user) for user in users]


@router.patch("/{user_id}/role", response_model=UserSummary)
async def update_user_role(
    user_id: str,
    update: UserRoleUpdate,
    current_user: CurrentUser = Depends(require_admin),
):
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own role")
    object_id = parse_user_id(user_id)
    db = get_database()
    result = await db["users"].find_one_and_update(
        {"_id": object_id}, {"$set": {"role": update.role}}
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    updated = await db["users"].find_one({"_id": object_id})
    return serialize_user(updated)


@router.patch("/{user_id}/block", response_model=UserSummary)
async def update_user_block(
    user_id: str,
    update: UserBlockUpdate,
    current_user: CurrentUser = Depends(require_admin),
):
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot block your own account")
    object_id = parse_user_id(user_id)
    db = get_database()
    result = await db["users"].find_one_and_update(
        {"_id": object_id}, {"$set": {"is_blocked": update.is_blocked}}
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    updated = await db["users"].find_one({"_id": object_id})
    return serialize_user(updated)
```

```python
# backend/app/main.py - add the import and include_router call
from app.routes.users import router as users_router
# ...
app.include_router(users_router)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_users.py -v`
Expected: PASS (all 7 tests)

Then run the full suite to confirm no regressions:

Run: `cd backend && python -m pytest -v`
Expected: PASS (every test in the backend)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/users.py backend/app/main.py backend/tests/test_users.py
git commit -m "Add admin-only user management API (list, promote, block)"
```

---

### Task 7: Production migration script (manual, one-time)

**Files:**
- Create: `backend/scripts/migrate_user_roles.py`

**Interfaces:**
- Consumes: nothing from the app code — standalone script using the same
  `MONGODB_URL`/`DB_NAME` as production, read directly from `.env`.

This task is NOT run against the test database and is NOT part of the
test suite — it's a one-off script for the real Atlas database, run by
hand after this phase's code is deployed.

- [ ] **Step 1: Write the script**

```python
# backend/scripts/migrate_user_roles.py
"""
One-time migration: replace is_admin: bool with role: str on every
existing user document, and backfill is_blocked/created_at where missing.

Run once, manually, after deploying Phase 1's backend code:
    cd backend && python scripts/migrate_user_roles.py
"""
import asyncio
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings


async def migrate() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        users = client[settings.DB_NAME]["users"]

        admin_result = await users.update_many({"is_admin": True}, {"$set": {"role": "admin"}})
        customer_result = await users.update_many(
            {"is_admin": {"$ne": True}, "role": {"$exists": False}},
            {"$set": {"role": "customer"}},
        )
        unset_result = await users.update_many({}, {"$unset": {"is_admin": ""}})
        blocked_result = await users.update_many(
            {"is_blocked": {"$exists": False}}, {"$set": {"is_blocked": False}}
        )
        created_at_result = await users.update_many(
            {"created_at": {"$exists": False}},
            {"$set": {"created_at": datetime.now(timezone.utc)}},
        )

        print(f"Promoted to admin: {admin_result.modified_count}")
        print(f"Set to customer: {customer_result.modified_count}")
        print(f"Removed is_admin field from: {unset_result.modified_count}")
        print(f"Backfilled is_blocked: {blocked_result.modified_count}")
        print(f"Backfilled created_at: {created_at_result.modified_count}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
```

- [ ] **Step 2: Dry-run verification (read-only query, before running the migration)**

Run manually against production to see current state before migrating:

```bash
cd backend && python -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

async def check():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    users = await client[settings.DB_NAME]['users'].find({}).to_list(length=100)
    for u in users:
        print(u.get('email'), u.get('is_admin'), u.get('role'))
    client.close()

asyncio.run(check())
"
```

Confirm the printed list matches expectations (the one known admin
account from last session, `shameelalvi.skycodein@gmail.com`, should
show `is_admin=True`, `role=None` before migration) before proceeding.

- [ ] **Step 3: Run the migration against production**

```bash
cd backend && python scripts/migrate_user_roles.py
```

- [ ] **Step 4: Verify with the same read-only query from Step 2** —
  confirm every user now has `role` set correctly (`admin` for the one
  known admin, `customer` for everyone else) and no `is_admin` field
  remains.

- [ ] **Step 5: Commit the script** (not a code change to the app, but
  it belongs in version control so the one-off migration is reproducible
  and auditable)

```bash
git add backend/scripts/migrate_user_roles.py
git commit -m "Add one-time production migration script for role field"
```

---

## Phase 1 Completion Check

Before moving to Phase 2:
- [ ] `cd backend && python -m pytest -v` — full suite green
- [ ] Production migration (Task 7) has been run and verified
- [ ] `git log --oneline -7` shows all 7 commits from this phase
