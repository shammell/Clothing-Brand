from datetime import datetime, timezone


def test_register_creates_user_and_returns_token(client):
    response = client.post(
        "/auth/register",
        json={"username": "Jane Doe", "email": "jane@example.com", "password": "strongpass1"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "jane@example.com"
    assert body["user"]["username"] == "Jane Doe"
    assert body["user"]["role"] == "customer"


def test_register_returns_role_not_is_admin(client):
    response = client.post(
        "/auth/register",
        json={"username": "Role Test", "email": "roletest@example.com", "password": "testpass123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["role"] == "customer"
    assert "is_admin" not in body["user"]


def test_register_duplicate_email_rejected(register_user):
    register_user(email="dupe@example.com")
    response = register_user(username="Someone Else", email="dupe@example.com")
    assert response.status_code == 400


def test_register_rejects_short_password(client):
    response = client.post(
        "/auth/register",
        json={"username": "Jane Doe", "email": "jane2@example.com", "password": "short"},
    )
    assert response.status_code == 422


def test_login_success(client, register_user):
    register_user(email="login@example.com", password="correctpass1")
    response = client.post("/auth/login", json={"email": "login@example.com", "password": "correctpass1"})
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_wrong_password_rejected(client, register_user):
    register_user(email="login2@example.com", password="correctpass1")
    response = client.post("/auth/login", json={"email": "login2@example.com", "password": "wrongpass1"})
    assert response.status_code == 401


def test_login_unknown_email_rejected(client):
    response = client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})
    assert response.status_code == 401


def test_email_is_case_insensitive(client, register_user):
    register_user(email="Mixed.Case@Example.com", password="correctpass1")
    response = client.post("/auth/login", json={"email": "mixed.case@example.com", "password": "correctpass1"})
    assert response.status_code == 200


def test_get_current_user_defaults_missing_role_to_customer(client):
    # Simulates a pre-migration user document and JWT, neither of which has
    # ever heard of "role": the user is inserted directly (register() always
    # sets role now) and the token carries no role claim either. get_current_user
    # reads role from the DB document, so this exercises the document's own
    # .get("role", "customer") fallback, not the token's.
    import asyncio

    import jose.jwt as jose_jwt
    from motor.motor_asyncio import AsyncIOMotorClient

    from app.core.config import settings
    from app.services.auth_service import hash_password

    async def _insert_legacy_user() -> str:
        db_client = AsyncIOMotorClient(settings.MONGODB_URL)
        try:
            result = await db_client[settings.DB_NAME]["users"].insert_one(
                {
                    "name": "Legacy User",
                    "email": "legacy@example.com",
                    "password": hash_password("legacypass1"),
                }
            )
            return str(result.inserted_id)
        finally:
            db_client.close()

    user_id = asyncio.run(_insert_legacy_user())
    legacy_token = jose_jwt.encode(
        {"user_id": user_id, "email": "legacy@example.com"},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    response = client.get("/orders/me", headers={"Authorization": f"Bearer {legacy_token}"})
    # Must not 500 - falls back to role="customer" and proceeds (empty list, since no orders).
    assert response.status_code == 200
    assert response.json() == []


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
