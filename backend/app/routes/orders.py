from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import PyMongoError

from app.core.database import get_database
from app.models.order import OrderCreate, OrderItemResponse, OrderResponse
from app.services.auth_service import CurrentUser, get_current_user

router = APIRouter(prefix="/orders", tags=["Orders"])


def serialize_order(order: dict) -> dict:
    return {
        key: value for key, value in order.items() if key != "_id"
    } | {"id": str(order["_id"])}


@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(order: OrderCreate, current_user: CurrentUser = Depends(get_current_user)):
    db = get_database()
    products_collection = db["products"]

    for item in order.items:
        try:
            ObjectId(item.product_id)
        except InvalidId as error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid product id: {item.product_id}",
            ) from error

    product_ids = {item.product_id for item in order.items}
    object_ids = [ObjectId(product_id) for product_id in product_ids]

    products_by_id = {
        str(product["_id"]): product
        for product in await products_collection.find({"_id": {"$in": object_ids}}).to_list(length=len(object_ids))
    }

    # Two request lines for the same product+size+color (e.g. the item was
    # added to the cart twice) collapse into one order line with a combined
    # quantity, same as before variants existed - only now the merge key
    # includes size/color so different variants of one product stay separate.
    requested_variants: dict[tuple[str, str, str], int] = {}
    for item in order.items:
        product = products_by_id.get(item.product_id)
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product not found: {item.product_id}",
            )
        if item.size not in product["sizes"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{product['name']} is not available in size {item.size}",
            )
        if item.color not in product["colors"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{product['name']} is not available in color {item.color}",
            )
        variant_key = (item.product_id, item.size, item.color)
        requested_variants[variant_key] = requested_variants.get(variant_key, 0) + item.quantity

    # Stock is tracked per product, not per size/color, so every variant of
    # the same product still draws from one pool.
    requested_quantities: dict[str, int] = {}
    for (product_id, _size, _color), quantity in requested_variants.items():
        requested_quantities[product_id] = requested_quantities.get(product_id, 0) + quantity

    for product_id, quantity in requested_quantities.items():
        product = products_by_id[product_id]
        if product["stock"] < quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Not enough stock for {product['name']}",
            )

    decremented: list[tuple[ObjectId, int]] = []
    try:
        for product_id, quantity in requested_quantities.items():
            product = products_by_id[product_id]
            object_id = ObjectId(product_id)
            result = await products_collection.update_one(
                {"_id": object_id, "stock": {"$gte": quantity}},
                {"$inc": {"stock": -quantity}},
            )
            if result.modified_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Not enough stock for {product['name']}",
                )
            decremented.append((object_id, quantity))

        order_items = [
            OrderItemResponse(
                product_id=product_id,
                name=products_by_id[product_id]["name"],
                price=products_by_id[product_id]["price"],
                quantity=quantity,
                subtotal=round(products_by_id[product_id]["price"] * quantity, 2),
                size=size,
                color=color,
            )
            for (product_id, size, color), quantity in requested_variants.items()
        ]
    except HTTPException:
        for object_id, quantity in decremented:
            await products_collection.update_one({"_id": object_id}, {"$inc": {"stock": quantity}})
        raise

    total = round(sum(line.subtotal for line in order_items), 2)
    order_doc = {
        "user_id": current_user["user_id"],
        "items": [line.model_dump() for line in order_items],
        "total": total,
        "status": "placed",
        "created_at": datetime.now(timezone.utc),
    }
    try:
        result = await db["orders"].insert_one(order_doc)
    except PyMongoError:
        for object_id, quantity in decremented:
            await products_collection.update_one(
                {"_id": object_id},
                {"$inc": {"stock": quantity}},
            )
        raise
    order_doc["_id"] = result.inserted_id
    return serialize_order(order_doc)


@router.get("/me", response_model=list[OrderResponse])
async def list_my_orders(current_user: CurrentUser = Depends(get_current_user)):
    db = get_database()
    orders = await db["orders"].find({"user_id": current_user["user_id"]}).sort("created_at", -1).to_list(length=100)
    return [serialize_order(order) for order in orders]
