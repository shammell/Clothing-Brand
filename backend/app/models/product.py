from typing import Optional

from pydantic import BaseModel, Field

class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    price: float = Field(gt=0)
    category: str = Field(min_length=1, max_length=100)
    brand: str = Field(min_length=1, max_length=100)
    sizes: list[str] = Field(min_length=1)
    colors: list[str] = Field(min_length=1)
    image_url: str = Field(min_length=1, max_length=2_000)
    stock: int = Field(ge=0)
    rating: float = Field(default=0.0, ge=0, le=5)

class ProductCreate(ProductBase):
    pass

class ProductResponse(ProductBase):
    id: str

    model_config = {"from_attributes": True}
