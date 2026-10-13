import json

import pytest

from app.services.sizing import recommend_size, size_guide


def _product(category="T-Shirts", sizes=("XS", "S", "M", "L", "XL"), stock_by_size=None):
    stock_by_size = stock_by_size or {}
    variants = [{"size": s, "color": "Black", "stock": stock_by_size.get(s, 5)} for s in sizes]
    return {"_id": "x", "category": category, "sizes": list(sizes), "colors": ["Black"], "variants": variants,
            "stock": sum(v["stock"] for v in variants)}


@pytest.mark.parametrize(
    "height,weight,fit,expected",
    [
        (175, 70, "regular", "M"),
        (175, 60, "regular", "S"),
        (175, 80, "regular", "L"),
        (175, 70, "snug", "S"),
        (175, 70, "relaxed", "L"),
        (190, 70, "regular", "L"),    # tall nudges up
        (150, 70, "regular", "S"),    # short nudges down
        (175, 40, "snug", "XS"),      # clamped at the smallest size
        (175, 120, "relaxed", "XL"),  # product offers nothing above XL
    ],
)
def test_alpha_recommendation(height, weight, fit, expected):
    result = recommend_size(_product(), height, weight, fit)
    assert result["recommendation"]["size"] == expected


def test_same_inputs_same_answer():
    first = recommend_size(_product(), 172, 68, "regular")
    assert all(recommend_size(_product(), 172, 68, "regular") == first for _ in range(3))


def test_boundary_inputs_report_medium_confidence():
    assert recommend_size(_product(), 175, 75, "regular")["recommendation"]["confidence"] == "medium"
    assert recommend_size(_product(), 175, 70, "regular")["recommendation"]["confidence"] == "high"


def test_waist_chart_for_jeans():
    jeans = _product("Jeans", ("28", "30", "32", "34", "36"))
    assert recommend_size(jeans, 175, 75, "regular")["recommendation"]["size"] == "32"


def test_shoes_return_chart_and_no_recommendation():
    shoes = _product("Shoes", ("7", "8", "9"))
    assert recommend_size(shoes, 175, 70, "regular")["recommendation"] is None
    assert size_guide(shoes)["chart_type"] == "shoe"


def test_sold_out_pick_names_nearest_in_stock_alternative():
    product = _product(stock_by_size={"M": 0, "L": 3})
    recommendation = recommend_size(product, 175, 70, "regular")["recommendation"]
    assert recommendation["size"] == "M"
    assert recommendation["in_stock"] is False
    assert recommendation["alternative_size"] == "L"


def test_size_guide_endpoint_and_recommendation_endpoint(client, seed_product):
    product_id = seed_product(category="T-Shirts", sizes=["S", "M", "L"], colors=["Black"], stock=9)
    guide = client.get(f"/products/{product_id}/size-guide").json()
    assert [row["size"] for row in guide["rows"]] == ["S", "M", "L"]
    response = client.post(
        f"/products/{product_id}/size-recommendation",
        json={"height_cm": 175, "weight_kg": 70, "fit": "regular"},
    )
    assert response.status_code == 200
    assert response.json()["recommendation"]["size"] == "M"


def test_out_of_range_inputs_rejected(client, seed_product):
    product_id = seed_product()
    response = client.post(f"/products/{product_id}/size-recommendation", json={"height_cm": 20, "weight_kg": 70})
    assert response.status_code == 422


def test_chat_tool_sets_size_recommendation(client, seed_product, monkeypatch):
    import httpx
    from app.services import chat_services

    product_id = seed_product(sizes=["S", "M", "L"], colors=["Black"], stock=9)
    args = json.dumps({"product_id": product_id, "height_cm": 175, "weight_kg": 70, "fit": "regular"})
    replies = [
        {"choices": [{"message": {"role": "assistant", "content": None, "tool_calls": [
            {"id": "1", "type": "function", "function": {"name": "recommend_size", "arguments": args}}]}}]},
        {"choices": [{"message": {"role": "assistant", "content": "Go with a Medium."}}]},
    ]
    monkeypatch.setattr(chat_services, "_TRANSPORT", httpx.MockTransport(lambda r: httpx.Response(200, json=replies.pop(0))))
    monkeypatch.setattr(chat_services.settings, "GROQ_API_KEY", "test-key")
    body = client.post("/chat/", json={"message": "What size?"}).json()
    assert body["size_recommendation"] == {"product_id": product_id, "size": "M", "confidence": "high", "in_stock": True}
