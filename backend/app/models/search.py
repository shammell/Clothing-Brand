from pydantic import BaseModel, Field, field_validator

PALETTE = [
    "Black", "White", "Grey", "Navy", "Blue", "Red", "Green", "Beige",
    "Brown", "Cream", "Pink", "Yellow", "Orange", "Purple",
]


class VisionAttributes(BaseModel):
    """What the vision model says it sees. Validated before anything uses it."""

    category: str | None = None
    colors: list[str] = Field(default_factory=list, max_length=3)
    keywords: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("colors", "keywords", mode="before")
    @classmethod
    def drop_non_strings(cls, value):
        if not isinstance(value, list):
            raise ValueError("expected a list")
        return [item.strip()[:40] for item in value if isinstance(item, str) and item.strip()]


class VisualSearchResult(BaseModel):
    id: str
    name: str
    price: float
    image_url: str
    category: str
    matched: list[str]


class VisualSearchResponse(BaseModel):
    attributes: VisionAttributes
    results: list[VisualSearchResult]
