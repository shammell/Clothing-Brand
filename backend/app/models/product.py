from typing import Literal, Optional

from bson import ObjectId
from pydantic import BaseModel, Field, field_validator, model_validator

# sizes x colors is expanded into one variant each, so both lists are capped
# to keep a single request from generating an enormous document.
MAX_OPTIONS = 15
MAX_VARIANTS = 200
MAX_COMPANIONS = 4


class Variant(BaseModel):
    sku: str = ""
    size: str = Field(min_length=1, max_length=50)
    color: str = Field(min_length=1, max_length=50)
    stock: int = Field(ge=0)


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    price: float = Field(gt=0)
    category: str = Field(min_length=1, max_length=100)
    brand: str = Field(min_length=1, max_length=100)
    image_url: str = Field(min_length=1, max_length=2_000)
    rating: float = Field(default=0.0, ge=0, le=5)

class ProductCreate(ProductBase):
    # Either send variants (sizes, colors and stock are then derived by the
    # server) or the legacy sizes + colors + stock trio.
    variants: Optional[list[Variant]] = Field(default=None, min_length=1, max_length=MAX_VARIANTS)
    sizes: Optional[list[str]] = Field(default=None, min_length=1, max_length=MAX_OPTIONS)
    colors: Optional[list[str]] = Field(default=None, min_length=1, max_length=MAX_OPTIONS)
    stock: Optional[int] = Field(default=None, ge=0)
    # None means "leave the stored list alone" (the older admin form never sends it).
    # Sending a list, even an empty one, marks it as set by hand.
    companions: Optional[list[str]] = Field(default=None, max_length=MAX_COMPANIONS)

    @field_validator("companions")
    @classmethod
    def check_companions(cls, value):
        if value is None:
            return value
        if len(value) != len(set(value)):
            raise ValueError("A product can be paired with another product only once")
        for companion_id in value:
            if not ObjectId.is_valid(companion_id):
                raise ValueError("Invalid companion product id")
        return value

    @model_validator(mode="after")
    def check_variants_or_legacy_fields(self):
        if self.variants is not None:
            pairs = [(v.size, v.color) for v in self.variants]
            if len(pairs) != len(set(pairs)):
                raise ValueError("Each size and color combination may appear only once")
        elif self.sizes is None or self.colors is None or self.stock is None:
            raise ValueError("Provide variants, or sizes, colors and stock")
        return self


class ProductResponse(ProductBase):
    id: str
    variants: list[Variant]
    sizes: list[str]
    colors: list[str]
    stock: int
    companions: list[str] = Field(default_factory=list)
    companions_source: Optional[Literal["manual", "generated"]] = None

    model_config = {"from_attributes": True}


class SizeRecommendationRequest(BaseModel):
    height_cm: float = Field(ge=100, le=250)
    weight_kg: float = Field(ge=30, le=250)
    fit: Literal["snug", "regular", "relaxed"] = "regular"


class LookResponse(BaseModel):
    product: ProductResponse
    companions: list[ProductResponse]
