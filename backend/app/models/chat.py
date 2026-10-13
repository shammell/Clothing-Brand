from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

MAX_HISTORY_MESSAGES = 20
ALLOWED_HISTORY_ROLES = {"user", "assistant"}


class FitProfile(BaseModel):
    height_cm: float = Field(gt=0, le=272)
    weight_kg: float = Field(gt=0, le=500)
    fit: Literal["snug", "regular", "relaxed"] = "regular"


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)
    fit_profile: Optional[FitProfile] = None
    product_id: Optional[str] = Field(default=None, max_length=40)

    @field_validator("history")
    @classmethod
    def validate_history(cls, history: list[dict[str, str]]) -> list[dict[str, str]]:
        for entry in history:
            role = entry.get("role")
            content = entry.get("content", "")
            if role not in ALLOWED_HISTORY_ROLES:
                raise ValueError(f"history role must be one of {ALLOWED_HISTORY_ROLES}")
            if not isinstance(content, str) or len(content) > 2000:
                raise ValueError("history content must be a string up to 2000 characters")
        return history


class ChatProduct(BaseModel):
    id: str
    name: str
    price: float
    image_url: str
    category: str


class SizeRecommendationSummary(BaseModel):
    product_id: str
    size: str
    confidence: str
    in_stock: bool


class ChatResponse(BaseModel):
    reply: str
    products: list[ChatProduct] = Field(default_factory=list)
    size_recommendation: Optional[SizeRecommendationSummary] = None
