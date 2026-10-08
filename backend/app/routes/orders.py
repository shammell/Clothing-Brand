from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pymongo.errors import DuplicateKeyError, PyMongoError

from app.core.database import get_database
from app.models.order import OrderCreate, OrderItemResponse, OrderResponse, OrderStatusUpdate
from app.services.auth_service import CurrentUser, get_current_user, require_admin

router = APIRouter(prefix="/orders", tags=["Orders"])


def serialize_order(order: dict) -> dict:
    return {
        key: value for key, value in order.items() if key != "_id"
    } | {"id": str(order["_id"])}


@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order: OrderCreate,
    current_user: CurrentUser = Depends(get_current_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    db = get_database()
    products_collection = db["products"]

    # A retried checkout (double-click, or the client re-sending after a
    # dropped response) carries the same key as the original attempt - if
    # that attempt already created an order, return it unchanged instead of
    # placing (and double-decrementing stock for) a second one. Scoped by
    # user_id, not just the key alone, so two different users can never
    # collide on the same client-generated key.
    if idempotency_key:
        existing_order = await db["orders"].find_one(
            {"user_id": current_user["user_id"], "idempotency_key": idempotency_key}
        )
        if existing_order:
            return serialize_order(existing_order)

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
        "shipping_address": order.shipping_address.model_dump(),
    }
    # Only set when provided, never to None/null - the partial unique index
    # on (user_id, idempotency_key) only covers documents where the field
    # exists, so a stored null here would start colliding across unrelated
    # no-key orders from the same user.
    if idempotency_key:
        order_doc["idempotency_key"] = idempotency_key
    try:
        result = await db["orders"].insert_one(order_doc)
    except DuplicateKeyError:
        # Lost a race against a concurrent request carrying the same key
        # (both passed the find_one check above before either had inserted).
        # The stock this call reserved was never actually used - release it
        # and hand back whichever order the winner created.
        for object_id, quantity in decremented:
            await products_collection.update_one(
                {"_id": object_id},
                {"$inc": {"stock": quantity}},
            )
        winning_order = await db["orders"].find_one(
            {"user_id": current_user["user_id"], "idempotency_key": idempotency_key}
        )
        if winning_order:
            return serialize_order(winning_order)
        raise
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


@router.get("/", response_model=list[OrderResponse])
async def list_all_orders(_: CurrentUser = Depends(require_admin)):
    db = get_database()
    orders = await db["orders"].find({}).sort("created_at", -1).to_list(length=200)
    return [serialize_order(order) for order in orders]


@router.patch("/{order_id}/status", response_model=OrderResponse)
async def update_order_status(
    order_id: str,
    update: OrderStatusUpdate,
    _: CurrentUser = Depends(require_admin),
):
    db = get_database()
    try:
        object_id = ObjectId(order_id)
    except InvalidId as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid order id",
        ) from error

    order = await db["orders"].find_one({"_id": object_id})
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )

    # Stock was reserved (decremented) at order creation. Cancelling an order
    # that wasn't already cancelled releases that stock back - skipped if
    # it's already cancelled, so saving the same status twice in a row can't
    # double-credit stock.
    if update.status == "cancelled" and order.get("status") != "cancelled":
        products_collection = db["products"]
        for item in order.get("items", []):
            try:
                product_object_id = ObjectId(item["product_id"])
            except InvalidId:
                continue
            await products_collection.update_one(
                {"_id": product_object_id},
                {"$inc": {"stock": item["quantity"]}},
            )

    await db["orders"].update_one({"_id": object_id}, {"$set": {"status": update.status}})
    updated = await db["orders"].find_one({"_id": object_id})
    return serialize_order(updated)
