import logging

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from limits import parse
from redis.backoff import NoBackoff
from redis.retry import Retry
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings

logger = logging.getLogger(__name__)


def get_client_identity(request: Request) -> str:
    """Like slowapi's get_remote_address, but optionally trusts N hops of
    X-Forwarded-For when this app sits behind that many reverse proxies -
    see TRUSTED_PROXY_HOPS in config.py for why this must stay opt-in."""
    if settings.TRUSTED_PROXY_HOPS > 0:
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
            index = len(hops) - settings.TRUSTED_PROXY_HOPS
            if 0 <= index < len(hops):
                return hops[index]
    return get_remote_address(request)


if not settings.REDIS_URL:
    logger.warning(
        "Rate limiting is using in-process memory storage (REDIS_URL is not "
        "set). Only safe for a single-process deployment - every 'global' "
        "limit silently becomes per-process (effectively N times looser) if "
        "this app ever runs as more than one worker/replica."
    )

OUTAGE_FALLBACK_LIMIT = "5/minute"

limiter = Limiter(
    key_func=get_client_identity,
    storage_uri=settings.REDIS_URL or "memory://",
    # Bounded timeout, no retries: an unreachable Redis must fail (and
    # trigger the fallback below) in ~2s on the first attempt, not hang on
    # the OS's default TCP timeout, and not multiply that wait across
    # redis-py's own default of 3 retries (which alone turned a 2s timeout
    # into an observed ~8s before this was added) - slowapi's own fallback
    # mechanism below is what should handle "tried, failed, degrade", not a
    # second retry layer underneath it.
    storage_options=(
        {
            "socket_connect_timeout": 0.5,
            "socket_timeout": 0.5,
            "retry": Retry(NoBackoff(), 0),
        }
        if settings.REDIS_URL
        else {}
    ),
    # If Redis is configured but becomes unreachable, degrade to per-process
    # in-memory limits rather than crashing every rate-limited route (login,
    # register, chat) outright. Deliberate choice: rate limiting here is
    # cost/abuse control, not an authentication boundary, so staying
    # functional with reduced (per-process, not cross-process) protection
    # during a Redis outage beats a full outage of login/register/chat.
    # slowapi auto-detects recovery and switches back to Redis once it's
    # reachable again.
    #
    # The fallback value REPLACES a route's own configured limit(s) entirely
    # while storage is dead - it doesn't layer on top of them. An earlier
    # version of this used "60/minute", which is actually looser than
    # /chat/'s normal 15/minute per-IP cap, and silently drops its global
    # burst/sustained ceilings to nothing: exactly the scenario those exist
    # to guard against ends up with weaker protection, not stronger - a
    # fail-open dressed up as a fail-safe. Using 5/minute instead - the
    # strictest limit configured on any route (register's) - means no route
    # ever gets LOOSER than normal during an outage, even though the
    # cross-IP aggregation a global limit provides is unavoidably lost (this
    # fallback is still per-key via get_client_identity, same as a plain
    # per-route limit). Degraded-but-bounded, not degraded-and-loosened.
    in_memory_fallback_enabled=bool(settings.REDIS_URL),
    in_memory_fallback=[OUTAGE_FALLBACK_LIMIT],
)


def consume_global(scope: str, limit_value: str) -> None:
    """Spend one unit of a shared (all visitors) budget, or raise 429.

    Used instead of a shared_limit decorator where the request must be
    validated first: a decorator charges the budget before the handler runs,
    so junk requests (wrong type, empty body, oversized upload) would drain a
    scarce provider quota for everyone without ever reaching the provider.
    Same storage and same Redis-outage fallback as the decorators.
    """
    item = parse(limit_value)
    try:
        allowed = limiter._limiter.hit(item, scope, "global")
    except Exception:  # unreachable Redis: degrade to this process, never fail open
        logger.warning("Rate-limit storage unavailable; using in-process fallback for %s", scope)
        # Enforce BOTH the strict outage ceiling and the configured limit, in
        # process. The ceiling alone would turn a daily cap (e.g. 100/day) into
        # 5/minute = 7200/day, looser than normal; the configured limit alone
        # loses the strict per-minute bound. Both together are never looser.
        allowed = limiter._fallback_limiter.hit(parse(OUTAGE_FALLBACK_LIMIT), scope, "global")
        allowed = limiter._fallback_limiter.hit(item, scope + ":configured", "global") and allowed
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests right now, please try again shortly",
            headers={"Retry-After": str(item.get_expiry())},
        )


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """429 with a human sentence and a Retry-After the frontend can act on.

    Retry-After is the length of the window that was exceeded (an upper bound
    on the wait), so a daily cap reads as "come back later", not "10 seconds".
    """
    return JSONResponse(
        {"detail": "Too many requests, please slow down and try again shortly"},
        status_code=429,
        headers={"Retry-After": str(exc.limit.limit.get_expiry())},
    )
