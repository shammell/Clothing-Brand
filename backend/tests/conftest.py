import asyncio
import os

# Must happen before anything imports app.core.config, so Settings() picks up
# these values instead of the real .env (Atlas credentials). Using
# setdefault rather than assignment so a developer can still override by
# exporting their own TEST_MONGODB_URL etc. before running pytest.
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET_KEY", "pytest-only-secret-not-for-production")
os.environ.setdefault("GROQ_API_KEY", "pytest-only-placeholder")

import pytest
from fastapi.testclient import TestClient
from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.limiter import limiter
from app.main import app

# The test fixtures below call delete_many({}) on every collection between
# tests. If MONGODB_URL ever resolved to the real Atlas cluster (e.g. because
# a .env value leaked in ahead of the os.environ.setdefault calls above),
# that would silently wipe production data. Refuse to run at all rather than
# risk it.
if "localhost" not in settings.MONGODB_URL and "127.0.0.1" not in settings.MONGODB_URL:
    raise RuntimeError(
        "Refusing to run tests: MONGODB_URL does not point to localhost "
        f"(got {settings.MONGODB_URL!r}). Tests delete all data in the "
        "target database on every run."
    )


def _run(coro):
    return asyncio.run(coro)


async def _clear_database() -> None:
    db_client = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        database = db_client[settings.DB_NAME]
        await database["users"].delete_many({})
        await database["products"].delete_many({})
        await database["orders"].delete_many({})
    finally:
        db_client.close()


@pytest.fixture(autouse=True)
def clean_database():
    # limiter.reset() too: slowapi's storage is a module-level singleton keyed
    # by remote address, and TestClient always reports the same fake address -
    # without resetting, rate limits accumulate across tests in the same
    # session regardless of which test actually hit the endpoint.
    limiter.reset()
    _run(_clear_database())
    yield
    _run(_clear_database())


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def register_user(client: TestClient):
    def _register(username="Test User", email="test@example.com", password="testpass123"):
        return client.post(
            "/auth/register",
            json={"username": username, "email": email, "password": password},
        )

    return _register


@pytest.fixture
def auth_headers(register_user):
    response = register_user()
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_admin():
    async def _update(email: str) -> None:
        db_client = AsyncIOMotorClient(settings.MONGODB_URL)
        try:
            await db_client[settings.DB_NAME]["users"].update_one(
                {"email": email.lower()}, {"$set": {"is_admin": True}}
            )
        finally:
            db_client.close()

    def _make_admin(email: str) -> None:
        _run(_update(email))

    return _make_admin


@pytest.fixture
def admin_headers(client: TestClient, register_user, make_admin):
    email = "admin@example.com"
    register_user(username="Admin", email=email, password="adminpass123")
    make_admin(email)
    # Re-login: the token issued at registration still carries is_admin=False
    # (it was minted before the account was promoted), matching make_admin.py's
    # own printed warning that the user must log in again for a fresh token.
    login_response = client.post("/auth/login", json={"email": email, "password": "adminpass123"})
    token = login_response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seed_product():
    async def _insert(product: dict) -> str:
        db_client = AsyncIOMotorClient(settings.MONGODB_URL)
        try:
            result = await db_client[settings.DB_NAME]["products"].insert_one(product)
            return str(result.inserted_id)
        finally:
            db_client.close()

    def _seed(**overrides) -> str:
        product = {
            "name": "Test Tee",
            "description": "A test product",
            "price": 20.0,
            "category": "T-Shirts",
            "brand": "TestBrand",
            "sizes": ["S", "M", "L"],
            "colors": ["Black", "White"],
            "image_url": "/products/no-image.svg",
            "stock": 10,
            "rating": 4.0,
            **overrides,
        }
        return _run(_insert(product))

    return _seed
