from typing import Optional

from pydantic import BaseModel, Field, model_validator

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
    variants: Optional[list[Variant]] = Field(default=None, min_length=1)
    sizes: Optional[list[str]] = Field(default=None, min_length=1)
    colors: Optional[list[str]] = Field(default=None, min_length=1)
    stock: Optional[int] = Field(default=None, ge=0)

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

    model_config = {"from_attributes": True}
