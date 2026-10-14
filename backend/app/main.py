from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sentry_sdk.integrations.fastapi import FastApiIntegration
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import build_allowed_origins, settings
from app.core.database import close_db, connect_db
from app.core.limiter import limiter, rate_limit_exceeded_handler
from app.routes.auth import router as auth_router
from app.routes.chat import router as chat_router
from app.routes.contact import router as contact_router
from app.routes.orders import router as orders_router
from app.routes.products import router as products_router
from app.routes.search import router as search_router
from app.routes.users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    await connect_db()
    yield
    await close_db()


if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, integrations=[FastApiIntegration()], traces_sample_rate=0.1)

app = FastAPI(title="Thread&Co API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=build_allowed_origins(settings.ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(products_router)
app.include_router(search_router)
app.include_router(orders_router)
app.include_router(chat_router)
app.include_router(users_router)
app.include_router(contact_router)


# TEMPORARY: Sentry delivery check. Remove after confirming an event in Sentry.
@app.get("/debug-sentry", include_in_schema=False)
@limiter.limit("2/minute")
async def debug_sentry(request: Request):
    raise RuntimeError("Sentry test event - safe to ignore")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    # Canonical dev entrypoint: `python -m app.main` from backend/, so the
    # bind host/port always come from one place (app.core.config.settings)
    # instead of whatever host/port someone happens to pass to uvicorn by hand.
    import uvicorn

    uvicorn.run(app, host=settings.HOST, port=settings.PORT)
