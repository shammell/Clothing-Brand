from datetime import datetime

from pydantic import BaseModel, Field


class OrderItemRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=20)
    size: str = Field(min_length=1, max_length=50)
    color: str = Field(min_length=1, max_length=50)


class OrderCreate(BaseModel):
    items: list[OrderItemRequest] = Field(min_length=1, max_length=50)


class OrderItemResponse(BaseModel):
    product_id: str
    name: str
    price: float
    quantity: int
    subtotal: float
    # Defaulted, unlike OrderItemRequest's required fields: orders placed
    # before size/color existed are still sitting in the database without
    # them, and order history must keep rendering those, not 500 on them.
    size: str = ""
    color: str = ""


class OrderResponse(BaseModel):
    id: str
    items: list[OrderItemResponse]
    total: float
    status: str
    created_at: datetime
