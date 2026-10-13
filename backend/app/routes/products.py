from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.database import get_database
from app.core.limiter import limiter
from app.models.product import ProductCreate, ProductResponse, SizeRecommendationRequest
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


@router.get("/", response_model=list[ProductResponse])
async def get_products(category: Optional[str] = None):
    normalized_category = category.strip() if category else None
    query = {"category": normalized_category} if normalized_category else {}
    products = (
        await get_database()["products"]
        .find(query)
        .sort("name", 1)
        .to_list(length=100)
    )
    return [serialize_product(product) for product in products]


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
