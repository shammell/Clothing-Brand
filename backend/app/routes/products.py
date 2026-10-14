from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.database import get_database
from app.core.limiter import limiter
from app.models.product import LookResponse, ProductCreate, ProductResponse, SizeRecommendationRequest
from app.services.companions import MAX_COMPANIONS
from app.services.sizing import recommend_size, size_guide
from app.services.variants import build_update_document, build_product_document, ensure_variants
from app.services.auth_service import CurrentUser, require_role


router = APIRouter(prefix="/products", tags=["Products"])


def serialize_product(product: dict[str, Any]) -> dict[str, Any]:
    product = ensure_variants(product)
    return {
        key: value for key, value in product.items() if key != "_id"
    } | {"id": str(product["_id"])}


def parse_product_id(product_id: str) -> ObjectId:
    try:
        return ObjectId(product_id)
    except InvalidId as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid product id",
        ) from error


MAX_PAGE_SIZE = 200
MAX_LOOKS = 100


@router.get("/", response_model=list[ProductResponse])
async def get_products(
    category: Optional[str] = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=MAX_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
):
    """One page of the catalogue. A page shorter than `limit` is the last one."""
    normalized_category = category.strip() if category else None
    query = {"category": normalized_category} if normalized_category else {}
    # _id as a tiebreaker: equal names would otherwise page in unstable order.
    products = (
        await get_database()["products"]
        .find(query)
        .sort([("name", 1), ("_id", 1)])
        .skip(skip)
        .to_list(length=limit)
    )
    return [serialize_product(product) for product in products]


# Declared before "/{product_id}" so "looks" is not captured as a product id.
@router.get("/looks", response_model=list[LookResponse])
async def get_looks():
    """Outfits: in-stock products with two or more in-stock companions, companions expanded."""
    products = await get_database()["products"].find({"stock": {"$gt": 0}, "companions.1": {"$exists": True}}).sort("name", 1).to_list(length=MAX_LOOKS)
    companions_by_id = await load_companions_by_id(products)
    looks = []
    for product in products:
        companions = pick_companions(product, companions_by_id)
        if len(companions) >= 2:
            looks.append({"product": serialize_product(product), "companions": [serialize_product(c) for c in companions]})
    return looks


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str):
    object_id = parse_product_id(product_id)
    product = await get_database()["products"].find_one({"_id": object_id})
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    return serialize_product(product)


async def load_product(product_id: str) -> dict[str, Any]:
    product = await get_database()["products"].find_one({"_id": parse_product_id(product_id)})
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return ensure_variants(product)


async def validate_companions(companion_ids: list[str] | None, own_id: ObjectId | None) -> None:
    """Companions must be other products that exist."""
    if not companion_ids:
        return
    ids = [ObjectId(companion_id) for companion_id in companion_ids]
    if own_id is not None and own_id in ids:
        raise HTTPException(status_code=422, detail="A product cannot be paired with itself")
    found = await get_database()["products"].count_documents({"_id": {"$in": ids}})
    if found != len(ids):
        raise HTTPException(status_code=422, detail="One of the paired products does not exist")


def companion_object_ids(product: dict[str, Any]) -> list[ObjectId]:
    return [ObjectId(companion_id) for companion_id in product.get("companions", []) if ObjectId.is_valid(companion_id)]


async def load_companions_by_id(products: list[dict[str, Any]]) -> dict[ObjectId, dict[str, Any]]:
    """In-stock companions of all `products`, fetched with a single query."""
    ids = list({object_id for product in products for object_id in companion_object_ids(product)})
    if not ids:
        return {}
    found = await get_database()["products"].find({"_id": {"$in": ids}, "stock": {"$gt": 0}}).to_list(length=len(ids))
    return {document["_id"]: document for document in found}


def pick_companions(product: dict[str, Any], by_id: dict[ObjectId, dict[str, Any]]) -> list[dict[str, Any]]:
    """The product's companions that still exist and are in stock, in the stored order."""
    ids = companion_object_ids(product)
    return [by_id[object_id] for object_id in ids if object_id in by_id and object_id != product["_id"]][:MAX_COMPANIONS]


async def resolve_companions(product: dict[str, Any]) -> list[dict[str, Any]]:
    return pick_companions(product, await load_companions_by_id([product]))


@router.get("/{product_id}/companions", response_model=list[ProductResponse])
async def get_companions(product_id: str):
    product = await load_product(product_id)
    return [serialize_product(companion) for companion in await resolve_companions(product)]


@router.get("/{product_id}/size-guide")
async def get_size_guide(product_id: str):
    return size_guide(await load_product(product_id))


@router.post("/{product_id}/size-recommendation")
@limiter.limit("30/minute")
async def post_size_recommendation(request: Request, product_id: str, body: SizeRecommendationRequest):
    product = await load_product(product_id)
    return recommend_size(product, body.height_cm, body.weight_kg, body.fit)


@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(product: ProductCreate, _: CurrentUser = Depends(require_role("admin", "lister"))):
    db = get_database()
    await validate_companions(product.companions, None)
    object_id = ObjectId()
    document = build_product_document(str(object_id), product.model_dump())
    await db["products"].insert_one({"_id": object_id} | document)
    created = await db["products"].find_one({"_id": object_id})
    if created is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product was created but could not be retrieved",
        )
    return serialize_product(created)


@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, product: ProductCreate, _: CurrentUser = Depends(require_role("admin", "lister"))):
    object_id = parse_product_id(product_id)
    db = get_database()
    await validate_companions(product.companions, object_id)
    existing = await db["products"].find_one({"_id": object_id})
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
    await db["products"].update_one(
        {"_id": object_id},
        {"$set": build_update_document(str(object_id), product.model_dump(), ensure_variants(existing))},
    )
    updated = await db["products"].find_one({"_id": object_id})
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Product was updated but could not be retrieved",
        )
    return serialize_product(updated)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(product_id: str, _: CurrentUser = Depends(require_role("admin", "lister"))):
    object_id = parse_product_id(product_id)
    db = get_database()
    result = await db["products"].delete_one({"_id": object_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )
