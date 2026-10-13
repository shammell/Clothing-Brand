import json

import httpx
import pytest

from app.services import chat_services, visual_search

JPEG = {"Content-Type": "image/jpeg"}
FAKE_IMAGE = b"\xff\xd8\xff\xe0fake-jpeg-bytes"


def _vision(content):
    return httpx.Response(200, json={"choices": [{"message": {"content": content if isinstance(content, str) else json.dumps(content)}}]})


@pytest.fixture
def vision(monkeypatch):
    state = {"responses": [], "requests": []}

    def handler(request):
        state["requests"].append(json.loads(request.content))
        return state["responses"].pop(0)

    monkeypatch.setattr(visual_search, "_TRANSPORT", httpx.MockTransport(handler))
    monkeypatch.setattr(chat_services.settings, "GROQ_API_KEY", "test-key")
    return state


def _post(client, body=FAKE_IMAGE, headers=JPEG):
    return client.post("/search/visual", content=body, headers=headers)


def test_blue_hoodie_ranks_hoodies_first_with_matched_attributes(client, vision, seed_product):
    seed_product(name="Zip Hoodie", category="Hoodies", colors=["Blue", "Grey"], stock=5)
    seed_product(name="Plain Tee", category="T-Shirts", colors=["Blue"], stock=5)
    seed_product(name="Black Jeans", category="Jeans", colors=["Black"], stock=5)
    vision["responses"] = [_vision({"category": "Hoodies", "colors": ["Blue"], "keywords": ["zip"]})]
    response = _post(client)
    assert response.status_code == 200
    results = response.json()["results"]
    assert [r["name"] for r in results] == ["Zip Hoodie", "Plain Tee"]
    assert results[0]["matched"] == ["Hoodies", "Blue", "zip"]
    assert results[1]["matched"] == ["Blue"]


def test_out_of_stock_products_are_never_returned(client, vision, seed_product):
    seed_product(name="Gone Hoodie", category="Hoodies", colors=["Blue"], stock=0)
    seed_product(name="Zip Hoodie", category="Hoodies", colors=["Blue"], stock=2)
    vision["responses"] = [_vision({"category": "Hoodies", "colors": ["Blue"], "keywords": []})]
    assert [r["name"] for r in _post(client).json()["results"]] == ["Zip Hoodie"]


def test_no_matches_returns_empty_results(client, vision, seed_product):
    seed_product(category="Jeans", colors=["Black"], stock=3)
    vision["responses"] = [_vision({"category": None, "colors": ["Pink"], "keywords": []})]
    assert _post(client).json()["results"] == []


def test_unparseable_model_output_is_422_with_friendly_message(client, vision, seed_product):
    seed_product()
    for bad in ["not json at all", {"category": "Hoodies", "colors": "blue", "keywords": []}]:
        vision["responses"] = [_vision(bad)]
        response = _post(client)
        assert response.status_code == 422
        assert response.json()["detail"] == "We couldn't read that photo"


def test_file_validation(client, vision):
    assert _post(client, headers={"Content-Type": "text/plain"}).status_code == 415
    assert _post(client, body=b"", headers=JPEG).status_code == 400
    too_big = b"0" * (visual_search.MAX_IMAGE_BYTES + 1)
    assert _post(client, body=too_big).status_code == 413
    assert vision["requests"] == []


def test_image_is_sent_to_the_model_but_never_persisted(client, vision, seed_product, tmp_path, monkeypatch):
    seed_product(category="Hoodies", colors=["Blue"], stock=3)
    vision["responses"] = [_vision({"category": "Hoodies", "colors": ["Blue"], "keywords": []})]
    monkeypatch.chdir(tmp_path)
    _post(client)
    assert list(tmp_path.iterdir()) == []
    content = vision["requests"][0]["messages"][0]["content"]
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_provider_busy_maps_to_503_and_other_failures_to_502(client, vision, seed_product):
    seed_product()
    vision["responses"] = [httpx.Response(429, headers={"retry-after": "9"}, json={})]
    busy = _post(client)
    assert busy.status_code == 503 and busy.headers["retry-after"] == "9"
    vision["responses"] = [httpx.Response(500, json={})]
    assert _post(client).status_code == 502


def test_per_ip_rate_limit_is_enforced(client, vision, seed_product):
    seed_product()
    for _ in range(3):
        vision["responses"].append(_vision({"category": None, "colors": [], "keywords": []}))
        assert _post(client).status_code == 200
    blocked = _post(client)
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "60"
    assert "slow down" in blocked.json()["detail"]
    assert len(vision["requests"]) == 3


def test_global_cap_blocks_before_the_provider_is_called(client, vision, seed_product, monkeypatch):
    seed_product()
    monkeypatch.setattr(visual_search.settings, "VISUAL_SEARCH_GLOBAL_BURST_RATE_LIMIT", "2/minute")
    for _ in range(2):
        vision["responses"].append(_vision({"category": None, "colors": [], "keywords": []}))
        assert _post(client).status_code == 200
    capped = _post(client)
    assert capped.status_code == 429 and capped.headers["retry-after"] == "60"
    assert "right now" in capped.json()["detail"]
    assert len(vision["requests"]) == 2


def test_bytes_that_are_not_the_claimed_image_type_never_reach_the_budget_or_provider(client, vision, seed_product, monkeypatch):
    seed_product()
    monkeypatch.setattr(visual_search.settings, "VISUAL_SEARCH_GLOBAL_BURST_RATE_LIMIT", "1/minute")
    assert _post(client, body=b"junk bytes, not an image").status_code == 415
    assert _post(client, body=FAKE_IMAGE, headers={"Content-Type": "image/png"}).status_code == 415
    assert vision["requests"] == []
    vision["responses"] = [_vision({"category": None, "colors": [], "keywords": []})]
    assert _post(client).status_code == 200


def test_rejected_uploads_do_not_spend_the_global_budget(client, vision, seed_product, monkeypatch):
    seed_product()
    monkeypatch.setattr(visual_search.settings, "VISUAL_SEARCH_GLOBAL_BURST_RATE_LIMIT", "1/minute")
    assert _post(client, headers={"content-type": "text/plain"}).status_code == 415
    assert _post(client, body=b"").status_code == 400
    vision["responses"] = [_vision({"category": None, "colors": [], "keywords": []})]
    assert _post(client).status_code == 200
