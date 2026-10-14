from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.database import get_database
from app.models.order import OrderCreate, OrderItemResponse, OrderResponse, OrderStatusUpdate
from app.services.auth_service import CurrentUser, get_current_user, require_admin
from app.services.email_service import send_email
from app.services.variants import ensure_variants

router = APIRouter(prefix="/orders", tags=["Orders"])


def serialize_order(order: dict) -> dict:
    return {
        key: value for key, value in order.items() if key != "_id"
    } | {"id": str(order["_id"])}


async def release_variant_stock(
    products_collection, object_id: ObjectId, size: str, color: str, quantity: int
) -> None:
    """Give stock back to one variant (and the product total).

    Falls back to the product total alone when the variant no longer exists
    (admin removed it) or the order line predates variants.
    """
    if size and color:
        result = await products_collection.update_one(
            {"_id": object_id, "variants": {"$elemMatch": {"size": size, "color": color}}},
            {"$inc": {"variants.$.stock": quantity, "stock": quantity}},
        )
        if result.modified_count:
            return
    await products_collection.update_one({"_id": object_id}, {"$inc": {"stock": quantity}})


async def release_all(products_collection, reserved: list[tuple[ObjectId, str, str, int]]) -> None:
    for object_id, size, color, quantity in reserved:
        await release_variant_stock(products_collection, object_id, size, color, quantity)


@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order: OrderCreate,
    background_tasks: BackgroundTasks,
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

    raw_products = await products_collection.find({"_id": {"$in": object_ids}}).to_list(length=len(object_ids))
    unmigrated_ids = {product["_id"] for product in raw_products if not product.get("variants")}
    products_by_id = {str(product["_id"]): ensure_variants(product) for product in raw_products}

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
        if not any(v["size"] == item.size and v["color"] == item.color for v in product["variants"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{product['name']} is not available in {item.size} / {item.color}",
            )
        variant_key = (item.product_id, item.size, item.color)
        requested_variants[variant_key] = requested_variants.get(variant_key, 0) + item.quantity

    for (product_id, size, color), quantity in requested_variants.items():
        product = products_by_id[product_id]
        variant = next(v for v in product["variants"] if v["size"] == size and v["color"] == color)
        if variant["stock"] < quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Not enough stock for {product['name']} in {size} / {color}",
            )

    # Products that predate variants get their synthesised variants saved
    # first. Guarded so a concurrent order or admin save that already wrote
    # real variants is never overwritten.
    for product_id in {key[0] for key in requested_variants}:
        object_id = ObjectId(product_id)
        if object_id in unmigrated_ids:
            await products_collection.update_one(
                {"_id": object_id, "variants": {"$exists": False}},
                {"$set": {"variants": products_by_id[product_id]["variants"]}},
            )

    decremented: list[tuple[ObjectId, str, str, int]] = []
    try:
        for (product_id, size, color), quantity in requested_variants.items():
            product = products_by_id[product_id]
            object_id = ObjectId(product_id)
            result = await products_collection.update_one(
                {
                    "_id": object_id,
                    "variants": {"$elemMatch": {"size": size, "color": color, "stock": {"$gte": quantity}}},
                },
                {"$inc": {"variants.$.stock": -quantity, "stock": -quantity}},
            )
            if result.modified_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Not enough stock for {product['name']} in {size} / {color}",
                )
            decremented.append((object_id, size, color, quantity))

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
    except BaseException:
        # Not just HTTPException: a Mongo error or any other failure partway
        # through the loop would otherwise leave earlier lines' stock
        # decremented with no order to show for it.
        await release_all(products_collection, decremented)
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
        await release_all(products_collection, decremented)
        winning_order = await db["orders"].find_one(
            {"user_id": current_user["user_id"], "idempotency_key": idempotency_key}
        )
        if winning_order:
            return serialize_order(winning_order)
        raise
    except BaseException:
        await release_all(products_collection, decremented)
        raise
    order_doc["_id"] = result.inserted_id
    # Backgrounded, not called inline - send_email() makes a blocking HTTP
    # call to Resend's API, and calling it directly in this async handler
    # would block the single-threaded event loop for every concurrent
    # checkout for however long that call takes.
    background_tasks.add_task(
        send_email,
        to=current_user["email"],
        subject=f"Order confirmed — #{str(order_doc['_id'])[-8:]}",
        html=f"<p>Thanks for your order! Total: ${total:.2f}.</p>",
    )
    return serialize_order(order_doc)


@router.get("/me", response_model=list[OrderResponse])
async def list_my_orders(current_user: CurrentUser = Depends(get_current_user)):
    db = get_database()
    orders = await db["orders"].find({"user_id": current_user["user_id"]}).sort("created_at", -1).to_list(length=100)
    return [serialize_order(order) for order in orders]


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, current_user: CurrentUser = Depends(get_current_user)):
    """One order, for its owner or an admin. Anyone else gets 404, not 403, so
    order ids can't be probed for existence."""
    try:
        object_id = ObjectId(order_id)
    except InvalidId as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found") from error
    query = {"_id": object_id}
    if current_user["role"] != "admin":
        query["user_id"] = current_user["user_id"]
    order = await get_database()["orders"].find_one(query)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return serialize_order(order)


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

    # Cancelling is one-way. Stock was reserved at order creation and is given
    # back on cancel; reopening would need re-reserving stock that may be gone,
    # and a second cancel would credit it twice. The status change is claimed
    # atomically (filter on "not already cancelled"), so of two concurrent
    # requests only one wins and only the winner releases stock. A crash
    # between claim and release under-counts stock rather than over-counting.
    orders_collection = db["orders"]
    claimed = await orders_collection.find_one_and_update(
        {"_id": object_id, "status": {"$ne": "cancelled"}},
        {"$set": {"status": update.status}},
        return_document=ReturnDocument.AFTER,
    )
    if claimed is None:
        existing = await orders_collection.find_one({"_id": object_id})
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found",
            )
        if update.status == "cancelled":
            return serialize_order(existing)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled orders cannot be reopened",
        )

    if update.status == "cancelled":
        products_collection = db["products"]
        for item in claimed.get("items", []):
            try:
                product_object_id = ObjectId(item["product_id"])
            except InvalidId:
                continue
            await release_variant_stock(
                products_collection,
                product_object_id,
                item.get("size") or "",
                item.get("color") or "",
                item["quantity"],
            )
    return serialize_order(claimed)
