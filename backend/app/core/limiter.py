from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# swallow_errors stays False (the default): if Redis is configured but
# unreachable, requests should fail loudly rather than silently bypass rate
# limiting - a rate limiter that quietly stops limiting under failure is
# worse than no rate limiter, since it looks like protection is in place
# when it isn't.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.REDIS_URL or "memory://",
)
