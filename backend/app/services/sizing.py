from typing import Any

from app.data.size_charts import (
    CHART_NOTE,
    SHORT_CM,
    SHOE_CHART,
    TALL_CM,
    chart_type_for,
    weight_chart,
)

FIT_SHIFT = {"snug": -1, "regular": 0, "relaxed": 1}
# Within this distance of a size boundary the answer could reasonably go either way.
BOUNDARY_TOLERANCE_KG = 1.0
BOUNDARY_TOLERANCE_CM = 1.0


def size_guide(product: dict[str, Any]) -> dict[str, Any]:
    """The chart a shopper can read for this product, trimmed to the sizes it offers."""
    chart_type = chart_type_for(product["category"])
    if chart_type == "shoe":
        rows = [{"size": size, "foot_length": length} for size, length in SHOE_CHART if size in product["sizes"]]
    else:
        chart = weight_chart(chart_type)
        rows, lower = [], 0.0
        for size, upper in chart:
            if size in product["sizes"]:
                rows.append({"size": size, "weight_kg": f"{lower:g}+" if upper == float("inf") else f"{lower:g}-{upper:g}"})
            lower = upper
    return {"chart_type": chart_type, "rows": rows, "note": CHART_NOTE}


def _in_stock_sizes(product: dict[str, Any]) -> set[str]:
    return {v["size"] for v in product["variants"] if v["stock"] > 0}


def _nearest(chart_sizes: list[str], target: str, candidates: set[str]) -> str | None:
    """Closest candidate to target along the chart; a tie goes to the larger size."""
    usable = [size for size in chart_sizes if size in candidates]
    if not usable:
        return None
    target_index = chart_sizes.index(target)
    return min(usable, key=lambda size: (abs(chart_sizes.index(size) - target_index), -chart_sizes.index(size)))


def recommend_size(product: dict[str, Any], height_cm: float, weight_kg: float, fit: str) -> dict[str, Any]:
    """Deterministic size pick from a weight chart, nudged by height and fit preference.

    Expects a product with variants already ensured. Shoes and products whose
    sizes are not on the chart get the chart and no recommendation.
    """
    chart_type = chart_type_for(product["category"])
    result: dict[str, Any] = {"chart_type": chart_type, "recommendation": None}
    if chart_type == "shoe":
        return result

    chart = weight_chart(chart_type)
    chart_sizes = [size for size, _ in chart]
    offered = {size for size in product["sizes"] if size in chart_sizes}
    if not offered:
        return result

    index = next(i for i, (_, upper) in enumerate(chart) if weight_kg <= upper)
    medium = any(
        abs(weight_kg - upper) <= BOUNDARY_TOLERANCE_KG for _, upper in chart[:-1]
    )
    if chart_type == "alpha":
        if height_cm >= TALL_CM:
            index += 1
        elif height_cm <= SHORT_CM:
            index -= 1
        medium = medium or abs(height_cm - TALL_CM) <= BOUNDARY_TOLERANCE_CM or abs(height_cm - SHORT_CM) <= BOUNDARY_TOLERANCE_CM
    index += FIT_SHIFT[fit]
    index = max(0, min(len(chart) - 1, index))

    picked = _nearest(chart_sizes, chart_sizes[index], offered)
    in_stock_sizes = _in_stock_sizes(product)
    in_stock = picked in in_stock_sizes
    alternative = None if in_stock else _nearest(chart_sizes, picked, offered & in_stock_sizes)
    result["recommendation"] = {
        "size": picked,
        "confidence": "medium" if medium or picked != chart_sizes[index] else "high",
        "in_stock": in_stock,
        "alternative_size": alternative,
        "reason": f"Based on {weight_kg:g} kg, {height_cm:g} cm and a {fit} fit.",
    }
    return result
