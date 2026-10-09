import asyncio
import os
import sys

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL")
DB_NAME = os.getenv("DB_NAME", "clothing_store")


async def make_admin(email: str) -> None:
    if not MONGODB_URL:
        raise RuntimeError("MONGODB_URL is missing from the .env file.")

    client = AsyncIOMotorClient(MONGODB_URL)
    try:
        database = client[DB_NAME]
        result = await database["users"].update_one(
            {"email": email.lower()},
            {"$set": {"role": "admin"}},
        )
        if result.matched_count == 0:
            print(f"No user found with email {email}. Register the account first.")
        else:
            print(f"{email} is now an admin. The change takes effect on their next request.")
    finally:
        client.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python make_admin.py <email>")
        raise SystemExit(1)
    asyncio.run(make_admin(sys.argv[1]))
