"""Size charts per category type.

PLACEHOLDER NUMBERS: these are generic starting values, not Thread&Co's real
measurements. The merchant must review them before launch.

Each row is (size, max_weight_kg). A shopper falls in the first row whose
max_weight_kg is at or above their weight; the last row is open-ended.
"""

CHART_NOTE = "Placeholder chart for review before launch. Sizes are a guide, not a guarantee."

ALPHA_CHART: list[tuple[str, float]] = [
    ("XS", 55),
    ("S", 65),
    ("M", 75),
    ("L", 85),
    ("XL", 95),
    ("XXL", float("inf")),
]

WAIST_CHART: list[tuple[str, float]] = [
    ("28", 60),
    ("30", 70),
    ("32", 80),
    ("34", 90),
    ("36", 100),
    ("38", float("inf")),
]

# Shoe size depends on foot length, which height and weight do not predict, so
# there is a chart to read but never an automatic recommendation.
SHOE_CHART: list[tuple[str, str]] = [
    ("7", "25.0 cm"),
    ("8", "25.8 cm"),
    ("9", "26.7 cm"),
    ("10", "27.5 cm"),
    ("11", "28.3 cm"),
]

CATEGORY_CHART_TYPES: dict[str, str] = {
    "t-shirts": "alpha",
    "shirts": "alpha",
    "hoodies": "alpha",
    "dresses": "alpha",
    "jeans": "waist",
    "shoes": "shoe",
}

# Height nudges the alpha size one step either way (alpha charts only).
TALL_CM = 188
SHORT_CM = 160


def chart_type_for(category: str) -> str:
    return CATEGORY_CHART_TYPES.get(category.strip().lower(), "alpha")


def weight_chart(chart_type: str) -> list[tuple[str, float]]:
    return WAIST_CHART if chart_type == "waist" else ALPHA_CHART
