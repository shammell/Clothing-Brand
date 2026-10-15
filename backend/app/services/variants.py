import re
from typing import Any, Iterable


def make_sku(product_id: str, size: str, color: str) -> str:
    raw = f"{product_id[-6:]}-{size}-{color}".upper()
    return re.sub(r"[^A-Z0-9]+", "-", raw).strip("-")


def split_stock(sizes: list[str], colors: list[str], stock: int) -> list[dict[str, Any]]:
    """Spread stock evenly across sizes x colors; the remainder goes one unit at a time from the first variant."""
    pairs = [(size, color) for size in sizes for color in colors]
    base, remainder = divmod(stock, len(pairs))
    return [
        {"size": size, "color": color, "stock": base + (1 if index < remainder else 0)}
        for index, (size, color) in enumerate(pairs)
    ]


def _ordered_unique(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(values))


def build_variant_fields(product_id: str, variants: list[dict[str, Any]]) -> dict[str, Any]:
    """Assign SKUs and compute the derived sizes, colors and stock from variants."""
    return {
        "variants": [
            {
                "sku": make_sku(product_id, variant["size"], variant["color"]),
                "size": variant["size"],
                "color": variant["color"],
                "stock": variant["stock"],
            }
            for variant in variants
        ],
        "sizes": _ordered_unique(variant["size"] for variant in variants),
        "colors": _ordered_unique(variant["color"] for variant in variants),
        "stock": sum(variant["stock"] for variant in variants),
    }


def build_product_document(product_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Turn a validated create/update payload into the stored document shape."""
    document = {
        key: value
        for key, value in payload.items()
        if key not in ("variants", "sizes", "colors", "stock", "stock_rev", "companions")
    }
    if payload.get("companions") is not None:
        document["companions"] = payload["companions"]
        document["companions_source"] = "manual"
    variants = payload.get("variants")
    if not variants:
        variants = split_stock(payload["sizes"], payload["colors"], payload["stock"])
    return document | build_variant_fields(product_id, variants)


def ensure_variants(product: dict[str, Any]) -> dict[str, Any]:
    """Synthesise variants in memory for a product that has not been migrated yet."""
    if product.get("variants"):
        return product
    variants = split_stock(product["sizes"], product["colors"], product["stock"])
    return product | build_variant_fields(str(product["_id"]), variants)


def build_update_document(
    product_id: str, payload: dict[str, Any], existing: dict[str, Any] | None
) -> dict[str, Any]:
    """Like build_product_document, but a legacy-shape update must not wipe real per-variant stock.

    If the payload only restates the product's current total, keep each retained
    variant's stock (new combinations start at 0). A different total is an
    explicit restock/correction and is re-split.
    """
    if (
        existing
        and not payload.get("variants")
        and payload["stock"] == existing["stock"]
    ):
        current = {(v["size"], v["color"]): v["stock"] for v in existing["variants"]}
        payload = payload | {
            "variants": [
                {"size": size, "color": color, "stock": current.get((size, color), 0)}
                for size in payload["sizes"]
                for color in payload["colors"]
            ]
        }
    return build_product_document(product_id, payload)
