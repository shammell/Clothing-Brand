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