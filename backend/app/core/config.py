from pydantic import field_validator
from pydantic_settings import BaseSettings

INSECURE_DEFAULTS = {"your-secret-key", "your-groq-api-key"}
# A denylist of just the placeholder strings is fail-open: "JWT_SECRET_KEY=123"
# or "=password" would sail through untouched. HS256 needs real entropy, so
# also reject anything too short to have been a deliberately generated secret.
MIN_JWT_SECRET_LENGTH = 32


class Settings(BaseSettings):
    MONGODB_URL: str
    DB_NAME: str = "clothing_store"
    JWT_SECRET_KEY: str = "your-secret-key"
    GROQ_API_KEY: str = "your-groq-api-key"
    GROQ_MODEL: str = "openai/gpt-oss-20b"
    GROQ_TIMEOUT_SECONDS: float = 30.0
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    # 0.0.0.0 (not 127.0.0.1) so the server is reachable from other devices
    # on the LAN - the frontend's NEXT_PUBLIC_API_URL points at a LAN IP for
    # exactly that reason, and a loopback-only bind silently breaks it.
    HOST: str = "0.0.0.0"
    PORT: int = 8003
    # Two layered ceilings on total /chat/ calls across every caller combined
    # (each call is a paid Groq request, and the endpoint is unauthenticated).
    # Neither window alone is enough: a short-only global cap gets drained in
    # seconds by a client with a handful of proxy IPs; a long-only one avoids
    # that but then locks out EVERY visitor for up to the full window once
    # drained - by abuse, or just a genuine traffic spike, which is a worse
    # outage than the attack it was meant to stop. Layering them bounds both:
    # the burst window caps the damage and recovery time of any single spike,
    # the sustained window catches slow abuse that stays under the burst
    # threshold. "Acceptable worst-case spend" is a business call, not
    # something to hardcode a guess for - tune both in .env.
    CHAT_GLOBAL_BURST_RATE_LIMIT: str = "40/minute"
    CHAT_GLOBAL_SUSTAINED_RATE_LIMIT: str = "1000/hour"
    # The limiter's default storage is in-process memory - fine for a single
    # process, but each worker/replica gets its OWN independent counters if
    # the app ever runs as more than one process (uvicorn --workers, gunicorn,
    # multiple container replicas). That silently turns every "global" limit
    # above into a per-process one - the real ceiling becomes N times what's
    # configured, with zero attacker effort. Set this to share rate-limit
    # state across all processes via Redis; required for ANY multi-process
    # deployment, not optional hardening. Left unset, only a single-process
    # deployment is safe.
    REDIS_URL: str | None = None
    # get_remote_address reads the immediate TCP peer. Behind any reverse
    # proxy/load balancer/CDN - the normal way to deploy this in production -
    # that peer is always the proxy itself, collapsing every real visitor
    # into one shared rate-limit identity: one active legitimate user would
    # lock out everyone else behind the same proxy. 0 (default) keeps today's
    # direct-connection behavior unchanged and safe. Set to the number of
    # trusted reverse proxies in front of this app to instead trust that many
    # hops of X-Forwarded-For, counted from the right (nearest proxy first) -
    # NEVER set this unless every one of those hops is a proxy you control,
    # since trusting a hop you don't control lets any client forge their
    # apparent identity and bypass per-IP limiting entirely.
    TRUSTED_PROXY_HOPS: int = 0

    class Config:
        env_file = ".env"

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def jwt_secret_must_be_set(cls, value: str) -> str:
        if value in INSECURE_DEFAULTS:
            raise ValueError(
                "JWT_SECRET_KEY is using the insecure placeholder default. "
                "Set a real secret in .env."
            )
        if len(value) < MIN_JWT_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET_KEY is too short ({len(value)} chars, need at least "
                f"{MIN_JWT_SECRET_LENGTH}). Generate one with: "
                'python -c "import secrets; print(secrets.token_urlsafe(32))"'
            )
        return value


settings = Settings()