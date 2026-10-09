# backend/scripts/migrate_user_roles.py
"""
One-time migration: replace is_admin: bool with role: str on every
existing user document, and backfill is_blocked/created_at where missing.

Run once, manually, after deploying Phase 1's backend code:
    cd backend && python scripts/migrate_user_roles.py
"""
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

# Make `app` importable regardless of how this script is invoked. Running it
# as documented above (`python scripts/migrate_user_roles.py` from `backend/`)
# puts `backend/scripts` on sys.path, not `backend/` itself, so without this
# `from app.core.config import settings` below fails with ModuleNotFoundError.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings


async def migrate() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    try:
        users = client[settings.DB_NAME]["users"]

        # "role": {"$exists": False} guards against re-promoting someone who
        # was deliberately demoted through the API between deploy and
        # migration: their document would still have a stale is_admin: True,
        # but it now also has a role the new code already set, which this
        # migration must not stomp on.
        admin_result = await users.update_many(
            {"is_admin": True, "role": {"$exists": False}}, {"$set": {"role": "admin"}}
        )
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
