import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError
from app.core.config import settings

client: AsyncIOMotorClient = None

async def connect_db():
    global client
    # Passing tlsCAFile unconditionally implicitly forces tls=True on *every*
    # connection (pymongo treats "any tls* option given" as "enable tls"),
    # which breaks the plain, unencrypted mongodb:// used by local dev and
    # the test suite - only Atlas's mongodb+srv:// needs an explicit CA
    # bundle (Vercel's Python runtime lacks the system CA store Atlas's TLS
    # handshake needs; a local/test MongoDB never negotiates TLS at all).
    tls_kwargs = {"tlsCAFile": certifi.where()} if settings.MONGODB_URL.startswith("mongodb+srv://") else {}
    client = AsyncIOMotorClient(settings.MONGODB_URL, tz_aware=True, **tls_kwargs)
    await client[settings.DB_NAME]["orders"].create_index(
        [("user_id", 1), ("idempotency_key", 1)],
        unique=True,
        partialFilterExpression={"idempotency_key": {"$exists": True}},
    )
    # Registration checks for an existing email and then inserts; without a
    # unique index two simultaneous registrations both pass the check. Failure
    # to build it (e.g. pre-existing duplicate emails in the data) must not
    # stop the app from starting, so it is reported and skipped.
    try:
        await client[settings.DB_NAME]["users"].create_index("email", unique=True)
    except PyMongoError as error:
        print(f"WARNING: could not create unique users.email index: {error}")
    print("Connected to MongoDB")

async def close_db():
    global client
    if client:
        client.close()
        print("MongoDB connection closed")

def get_database():
    if not client:
        raise Exception("Database not connected")
    return client[settings.DB_NAME]        