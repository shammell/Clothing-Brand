"""Rule-based "what goes with this" matching, shared by the generation script and the chat tool."""
from typing import Any

MAX_COMPANIONS = 4

COMPLEMENTARY_CATEGORIES: dict[str, list[str]] = {
    "t-shirts": ["Jeans", "Shoes", "Hoodies"],
    "shirts": ["Jeans", "Shoes"],
    "hoodies": ["Jeans", "Shoes", "T-Shirts"],
    "jeans": ["T-Shirts", "Shirts", "Hoodies", "Shoes"],
    "dresses": ["Shoes"],
    "shoes": ["Jeans", "T-Shirts", "Dresses", "Shirts", "Hoodies"],
}

# Neutrals pair with anything.
NEUTRALS = {"black", "white", "grey", "gray", "beige", "cream", "navy"}

# Colours that sit next to each other on the wheel read as harmonious.
ADJACENT_GROUPS = [
    {"blue", "navy", "green"},
    {"red", "pink", "orange"},
    {"brown", "beige", "cream", "orange"},
    {"yellow", "orange", "green"},
]


def _colors(product: dict[str, Any]) -> set[str]:
    return {color.lower() for color in product.get("colors", [])}


def harmony_score(a: dict[str, Any], b: dict[str, Any]) -> int:
    """0 = clashing, up to 3 = clearly harmonious."""
    colors_a, colors_b = _colors(a), _colors(b)
    score = 0
    if colors_a & colors_b:
        score = max(score, 3)
    if colors_a & NEUTRALS or colors_b & NEUTRALS:
        score = max(score, 2)
    if any(colors_a & group and colors_b & group for group in ADJACENT_GROUPS):
        score = max(score, 1)
    return score


def rank_companions(product: dict[str, Any], candidates: list[dict[str, Any]], limit: int = MAX_COMPANIONS) -> list[dict[str, Any]]:
    """In-stock products from complementary categories, best colour harmony first, ties by name."""
    wanted = {c.lower() for c in COMPLEMENTARY_CATEGORIES.get(product["category"].lower(), [])}
    scored = []
    for candidate in candidates:
        if candidate["_id"] == product["_id"] or candidate.get("stock", 0) <= 0:
            continue
        if candidate["category"].lower() not in wanted:
            continue
        scored.append((harmony_score(product, candidate), candidate))
    scored.sort(key=lambda item: (-item[0], item[1]["name"]))
    return [candidate for _, candidate in scored[:limit]]
