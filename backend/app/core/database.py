import certifi
from motor.motor_asyncio import AsyncIOMotorClient
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
    client = AsyncIOMotorClient(settings.MONGODB_URL, **tls_kwargs)
    await client[settings.DB_NAME]["orders"].create_index(
        [("user_id", 1), ("idempotency_key", 1)],
        unique=True,
        partialFilterExpression={"idempotency_key": {"$exists": True}},
    )
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