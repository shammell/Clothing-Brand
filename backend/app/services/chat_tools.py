"""Catalog tools the style assistant can call. Every result comes from MongoDB.

Tool results never include raw stock counts, only availability states, and
every product the shopper is shown is collected here on the server, never
parsed out of the model's text.
"""
import json
import re
import time
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from app.core.database import get_database
from app.services.companions import rank_companions
from app.services.sizing import recommend_size
from app.services.variants import ensure_variants

MAX_RESULTS = 6
LOW_STOCK_THRESHOLD = 5
SEARCH_CACHE_SECONDS = 60
MAX_CACHE_ENTRIES = 100
MAX_COMPANION_RESULTS = 4

_search_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def clear_search_cache() -> None:
    _search_cache.clear()


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search the store catalog. Returns up to 6 matching products.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Words from the product name or description"},
                    "category": {"type": "string", "description": "Category such as Hoodies, Jeans, T-Shirts"},
                    "color": {"type": "string"},
                    "max_price": {"type": "number"},
                    "in_stock_only": {"type": "boolean", "description": "Defaults to true"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_variant_availability",
            "description": "Per size and colour availability (in_stock, low, sold_out) for one product.",
            "parameters": {
                "type": "object",
                "properties": {"product_id": {"type": "string"}},
                "required": ["product_id"],
            },
        },
    },
]


def _state(stock: int) -> str:
    if stock <= 0:
        return "sold_out"
    return "low" if stock < LOW_STOCK_THRESHOLD else "in_stock"


def _card(product: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(product["_id"]),
        "name": product["name"],
        "price": product["price"],
        "image_url": product["image_url"],
        "category": product["category"],
    }


class ToolContext:
    """Collects what the tools returned so the route can attach product cards."""

    def __init__(self) -> None:
        self.products: dict[str, dict[str, Any]] = {}
        self.size_recommendation: dict[str, Any] | None = None

    def add_product(self, product: dict[str, Any]) -> None:
        self.products[str(product["_id"])] = _card(product)

    def cards(self) -> list[dict[str, Any]]:
        return list(self.products.values())[-MAX_RESULTS:]


def _clean_text(value: Any, limit: int = 100) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()[:limit]
    return None


async def _search_products(args: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    query: dict[str, Any] = {}
    in_stock_only = args.get("in_stock_only", True) is not False
    if in_stock_only:
        query["stock"] = {"$gt": 0}
    if text := _clean_text(args.get("query")):
        pattern = {"$regex": re.escape(text), "$options": "i"}
        query["$or"] = [{"name": pattern}, {"description": pattern}]
    if category := _clean_text(args.get("category")):
        query["category"] = {"$regex": f"^{re.escape(category)}$", "$options": "i"}
    if color := _clean_text(args.get("color")):
        query["colors"] = {"$regex": f"^{re.escape(color)}$", "$options": "i"}
    max_price = args.get("max_price")
    if isinstance(max_price, (int, float)) and not isinstance(max_price, bool) and max_price > 0:
        query["price"] = {"$lte": max_price}

    cache_key = json.dumps(query, sort_keys=True, default=str)
    cached = _search_cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < SEARCH_CACHE_SECONDS:
        result = cached[1]
    else:
        documents = await get_database()["products"].find(query).sort("name", 1).to_list(length=MAX_RESULTS)
        products = [ensure_variants(document) for document in documents]
        result = {
            "products": [
                {
                    "id": str(product["_id"]),
                    "name": product["name"],
                    "price": product["price"],
                    "category": product["category"],
                    "colors": product["colors"],
                    "available_sizes": sorted(
                        {v["size"] for v in product["variants"] if v["stock"] > 0},
                        key=product["sizes"].index,
                    ),
                }
                for product in products
            ]
        }
        result["_documents"] = products
        # Keys come from model-chosen arguments, so bound the cache: drop expired
        # entries, then the oldest, before adding.
        now = time.monotonic()
        for key in [k for k, (stamp, _) in _search_cache.items() if now - stamp >= SEARCH_CACHE_SECONDS]:
            del _search_cache[key]
        while len(_search_cache) >= MAX_CACHE_ENTRIES:
            del _search_cache[next(iter(_search_cache))]
        _search_cache[cache_key] = (now, result)

    for product in result["_documents"]:
        context.add_product(product)
    return {"products": result["products"]}


def _parse_object_id(raw_id: Any) -> ObjectId | None:
    try:
        return ObjectId(raw_id) if isinstance(raw_id, str) else None
    except InvalidId:
        return None


async def _get_variant_availability(args: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    object_id = _parse_object_id(args.get("product_id"))
    if object_id is None:
        return {"error": "product_id is not a valid product id"}
    document = await get_database()["products"].find_one({"_id": object_id})
    if not document:
        return {"error": "Product not found"}
    product = ensure_variants(document)
    context.add_product(product)
    return {
        "product": product["name"],
        "variants": [
            {"size": v["size"], "color": v["color"], "availability": _state(v["stock"])}
            for v in product["variants"]
        ],
    }


async def _recommend_size(args: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    object_id = _parse_object_id(args.get("product_id"))
    height, weight, fit = args.get("height_cm"), args.get("weight_kg"), args.get("fit", "regular")
    numbers_ok = all(isinstance(n, (int, float)) and not isinstance(n, bool) for n in (height, weight))
    if object_id is None or not numbers_ok or fit not in ("snug", "regular", "relaxed"):
        return {"error": "Need a valid product_id, height_cm, weight_kg and fit"}
    if not (100 <= height <= 250 and 30 <= weight <= 250):
        return {"error": "height_cm or weight_kg is out of range"}
    document = await get_database()["products"].find_one({"_id": object_id})
    if not document:
        return {"error": "Product not found"}
    product = ensure_variants(document)
    context.add_product(product)
    result = recommend_size(product, height, weight, fit)
    recommendation = result["recommendation"]
    if recommendation:
        context.size_recommendation = {
            "product_id": str(product["_id"]),
            "size": recommendation["size"],
            "confidence": recommendation["confidence"],
            "in_stock": recommendation["in_stock"],
        }
    return result


async def _get_companions(args: dict[str, Any], context: ToolContext) -> dict[str, Any]:
    object_id = _parse_object_id(args.get("product_id"))
    if object_id is None:
        return {"error": "product_id is not a valid product id"}
    products = get_database()["products"]
    document = await products.find_one({"_id": object_id})
    if not document:
        return {"error": "Product not found"}
    # Stored pairings first, then the rules fill any gaps (still in stock only).
    stored_ids = [ObjectId(c) for c in document.get("companions", []) if ObjectId.is_valid(c)]
    stored = await products.find({"_id": {"$in": stored_ids}, "stock": {"$gt": 0}}).to_list(length=len(stored_ids) or 1) if stored_ids else []
    by_id = {c["_id"]: c for c in stored}
    chosen = [by_id[i] for i in stored_ids if i in by_id]
    if len(chosen) < MAX_COMPANION_RESULTS:
        pool = await products.find({"stock": {"$gt": 0}}).to_list(length=200)
        for candidate in rank_companions(document, pool):
            if all(candidate["_id"] != existing["_id"] for existing in chosen):
                chosen.append(candidate)
    chosen = chosen[:MAX_COMPANION_RESULTS]
    for companion in chosen:
        context.add_product(companion)
    return {
        "companions": [
            {"id": str(c["_id"]), "name": c["name"], "price": c["price"], "category": c["category"], "colors": c["colors"]}
            for c in chosen
        ]
    }


TOOL_DEFINITIONS.append(
    {
        "type": "function",
        "function": {
            "name": "get_companions",
            "description": "Up to 4 in-stock products that go well with the given product.",
            "parameters": {
                "type": "object",
                "properties": {"product_id": {"type": "string"}},
                "required": ["product_id"],
            },
        },
    }
)

TOOL_DEFINITIONS.append(
    {
        "type": "function",
        "function": {
            "name": "recommend_size",
            "description": "Recommend a size for a product from the shopper's height, weight and fit preference.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_id": {"type": "string"},
                    "height_cm": {"type": "number"},
                    "weight_kg": {"type": "number"},
                    "fit": {"type": "string", "enum": ["snug", "regular", "relaxed"]},
                },
                "required": ["product_id", "height_cm", "weight_kg", "fit"],
            },
        },
    }
)

_HANDLERS = {
    "search_products": _search_products,
    "get_variant_availability": _get_variant_availability,
    "recommend_size": _recommend_size,
    "get_companions": _get_companions,
}


def register_tool(definition: dict[str, Any], handler) -> None:
    """Let later features (sizing, companions) add their tools."""
    name = definition["function"]["name"]
    if name not in _HANDLERS:
        TOOL_DEFINITIONS.append(definition)
    _HANDLERS[name] = handler


async def execute_tool(name: str, raw_arguments: Any, context: ToolContext) -> dict[str, Any]:
    """Run one tool call. Malformed calls come back as an error result, never an exception."""
    handler = _HANDLERS.get(name)
    if handler is None:
        return {"error": f"Unknown tool: {name}"}
    try:
        arguments = json.loads(raw_arguments) if isinstance(raw_arguments, str) and raw_arguments.strip() else {}
    except json.JSONDecodeError:
        return {"error": "Tool arguments were not valid JSON"}
    if not isinstance(arguments, dict):
        return {"error": "Tool arguments must be an object"}
    try:
        return await handler(arguments, context)
    except Exception:  # a bad tool call must degrade the answer, not the request
        return {"error": "Tool failed"}
