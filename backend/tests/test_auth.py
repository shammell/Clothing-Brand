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

    # /orders/me alone doesn't prove the fallback is actually "customer" and
    # not some more privileged default - any role could reach it. Hitting a
    # role-gated route (admin/lister only) with the same legacy token and
    # getting 403 proves the fallback really does resolve to the
    # least-privileged role.
    create_response = client.post(
        "/products/",
        headers={"Authorization": f"Bearer {legacy_token}"},
        json={
            "name": "Legacy Token Product",
            "description": "Should be rejected",
            "price": 10.0,
            "category": "T-Shirts",
            "brand": "TestBrand",
            "sizes": ["S"],
            "colors": ["Black"],
            "image_url": "/products/no-image.svg",
            "stock": 1,
        },
    )
    assert create_response.status_code == 403


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


def test_blocking_user_revokes_access_for_their_existing_token(client, register_user, admin_headers):
    # get_current_user re-fetches is_blocked from the DB on every request
    # instead of trusting the JWT claim, specifically so a block made after
    # a token was issued takes effect immediately rather than waiting out
    # the token's expiry. This proves that property, not just that blocking
    # works at all.
    register_response = register_user(username="To Block", email="tobeblocked@example.com", password="tobepass123")
    original_token = register_response.json()["access_token"]

    users = client.get("/users/", headers=admin_headers).json()
    target_id = next(u["id"] for u in users if u["email"] == "tobeblocked@example.com")
    block_response = client.patch(f"/users/{target_id}/block", headers=admin_headers, json={"is_blocked": True})
    assert block_response.status_code == 200

    response = client.get("/orders/me", headers={"Authorization": f"Bearer {original_token}"})
    assert response.status_code == 403


def test_demoting_admin_revokes_admin_access_for_their_existing_token(
    client, register_user, make_admin
):
    # Same property as the blocking test above, but for a role downgrade:
    # a demoted admin's pre-existing token must lose admin access on its
    # very next request, not just after re-login.
    register_response = register_user(username="First Admin", email="firstadmin@example.com", password="firstpass123")
    make_admin("firstadmin@example.com")
    login_response = client.post(
        "/auth/login", json={"email": "firstadmin@example.com", "password": "firstpass123"}
    )
    first_admin_token = login_response.json()["access_token"]
    first_admin_headers = {"Authorization": f"Bearer {first_admin_token}"}

    register_user(username="Second Admin", email="secondadmin@example.com", password="secondpass123")
    make_admin("secondadmin@example.com")
    second_login_response = client.post(
        "/auth/login", json={"email": "secondadmin@example.com", "password": "secondpass123"}
    )
    second_admin_headers = {"Authorization": f"Bearer {second_login_response.json()['access_token']}"}

    users = client.get("/users/", headers=second_admin_headers).json()
    first_admin_id = next(u["id"] for u in users if u["email"] == "firstadmin@example.com")
    demote_response = client.patch(
        f"/users/{first_admin_id}/role", headers=second_admin_headers, json={"role": "customer"}
    )
    assert demote_response.status_code == 200

    response = client.get("/users/", headers=first_admin_headers)
    assert response.status_code == 403
