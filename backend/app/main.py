from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import settings
from app.core.database import close_db, connect_db
from app.core.limiter import limiter
from app.routes.auth import router as auth_router
from app.routes.chat import router as chat_router
from app.routes.orders import router as orders_router
from app.routes.products import router as products_router
from app.routes.users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(title="Thread&Co API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        # `npm run dev` defaults to 3000, not 3001 - keeping both so LAN
        # access works whichever port the frontend actually comes up on.
        "http://192.168.18.38:3000",
        "http://192.168.18.38:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(products_router)
app.include_router(orders_router)
app.include_router(chat_router)
app.include_router(users_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    # Canonical dev entrypoint: `python -m app.main` from backend/, so the
    # bind host/port always come from one place (app.core.config.settings)
    # instead of whatever host/port someone happens to pass to uvicorn by hand.
    import uvicorn

    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
