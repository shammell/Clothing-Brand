import base64
import json
from typing import Any

import httpx
from pydantic import ValidationError

from app.core.config import settings
from app.core.database import get_database
from app.models.search import PALETTE, VisionAttributes
from app.services.chat_services import ProviderBusyError, ProviderRequestError, _post, _validate_settings
from app.services.variants import ensure_variants

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_RESULTS = 8

CATEGORY_POINTS = 3
COLOR_POINTS = 2
KEYWORD_POINTS = 1

# Tests swap this for an httpx.MockTransport.
_TRANSPORT: httpx.AsyncBaseTransport | None = None


class UnreadablePhotoError(ValueError):
    """The model's answer was not usable JSON in the expected shape."""


async def _store_categories() -> list[str]:
    categories = await get_database()["products"].distinct("category", {"stock": {"$gt": 0}})
    return sorted(str(category) for category in categories)


def _prompt(categories: list[str]) -> str:
    return (
        "Look at this clothing photo and describe the main garment. "
        "Reply with JSON only, in exactly this shape: "
        '{"category": string or null, "colors": [string], "keywords": [string]}. '
        f"category must be one of {json.dumps(categories)} or null if none fits. "
        f"colors: up to 3, each one of {json.dumps(PALETTE)}. "
        "keywords: up to 5 short lowercase words about style, fabric or fit."
    )


async def extract_attributes(image: bytes, content_type: str) -> VisionAttributes:
    """Ask the vision model what is in the photo. The image is never stored or logged."""
    _validate_settings()
    categories = await _store_categories()
    data_uri = f"data:{content_type};base64,{base64.b64encode(image).decode()}"
    payload = {
        "model": settings.GROQ_VISION_MODEL,
        "max_tokens": 300,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": _prompt(categories)},
                    {"type": "image_url", "image_url": {"url": data_uri}},
                ],
            }
        ],
    }
    async with httpx.AsyncClient(timeout=settings.GROQ_TIMEOUT_SECONDS, transport=_TRANSPORT) as client:
        data = await _post(client, payload)

    try:
        content = data["choices"][0]["message"]["content"]
        attributes = VisionAttributes.model_validate(json.loads(content))
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as error:
        raise UnreadablePhotoError("We couldn't read that photo") from error

    # Only categories and colours the store actually uses can match anything.
    if attributes.category not in categories:
        attributes.category = None
    attributes.colors = [color for color in attributes.colors if color in PALETTE]
    return attributes


def rank_products(products: list[dict[str, Any]], attributes: VisionAttributes) -> list[dict[str, Any]]:
    """Score in-stock products by attribute match; best first, ties by name."""
    ranked = []
    for product in products:
        product = ensure_variants(product)
        matched: list[str] = []
        score = 0
        if attributes.category and product["category"].lower() == attributes.category.lower():
            score += CATEGORY_POINTS
            matched.append(product["category"])
        product_colors = {color.lower(): color for color in product["colors"]}
        for color in attributes.colors:
            if color.lower() in product_colors:
                score += COLOR_POINTS
                matched.append(product_colors[color.lower()])
        haystack = f"{product['name']} {product.get('description') or ''}".lower()
        for keyword in attributes.keywords:
            if keyword.lower() in haystack:
                score += KEYWORD_POINTS
                matched.append(keyword)
        if score > 0:
            ranked.append((score, product, matched))
    ranked.sort(key=lambda item: (-item[0], item[1]["name"]))
    return [
        {
            "id": str(product["_id"]),
            "name": product["name"],
            "price": product["price"],
            "image_url": product["image_url"],
            "category": product["category"],
            "matched": matched,
        }
        for _, product, matched in ranked[:MAX_RESULTS]
    ]


async def visual_search(image: bytes, content_type: str) -> tuple[VisionAttributes, list[dict[str, Any]]]:
    attributes = await extract_attributes(image, content_type)
    in_stock = await get_database()["products"].find({"stock": {"$gt": 0}}).to_list(length=500)
    return attributes, rank_products(in_stock, attributes)

