from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# A fixed progression, not free-form text: an admin picking from a known set
# keeps order history's status display and any future status-based logic
# (e.g. restocking on cancellation) from having to handle arbitrary strings.
ORDER_STATUSES = ("placed", "processing", "shipped", "delivered", "cancelled")
OrderStatus = Literal["placed", "processing", "shipped", "delivered", "cancelled"]


class ShippingAddress(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    address_line1: str = Field(min_length=1, max_length=200)
    address_line2: Optional[str] = Field(default=None, max_length=200)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    postal_code: str = Field(min_length=1, max_length=20)
    country: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=30)


class OrderItemRequest(BaseModel):
    product_id: str
    quantity: int = Field(gt=0, le=20)
    size: str = Field(min_length=1, max_length=50)
    color: str = Field(min_length=1, max_length=50)


class OrderCreate(BaseModel):
    items: list[OrderItemRequest] = Field(min_length=1, max_length=50)
    shipping_address: ShippingAddress


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


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
    # Defaulted for the same reason size/color are on OrderItemResponse:
    # orders placed before this field existed have no shipping_address in
    # the database, and order history must keep rendering those, not 500.
    shipping_address: Optional[ShippingAddress] = None
