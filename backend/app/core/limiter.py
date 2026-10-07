import logging

from fastapi import Request
from redis.backoff import NoBackoff
from redis.retry import Retry
from slowapi import Limiter
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
    in_memory_fallback_enabled=bool(settings.REDIS_URL),
    in_memory_fallback=["60/minute"],
)
