import json

import httpx
import pytest

from app.services import chat_services
from app.services.chat_tools import clear_search_cache


def _tool_call(name, arguments, call_id="call_1"):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": arguments}}


def _reply(content=None, tool_calls=None):
    message = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return httpx.Response(200, json={"choices": [{"message": message}]})


@pytest.fixture
def provider(monkeypatch):
    """Scripted provider: each call pops the next response; requests are recorded."""
    clear_search_cache()
    state = {"responses": [], "requests": []}

    def handler(request: httpx.Request) -> httpx.Response:
        state["requests"].append(json.loads(request.content))
        response = state["responses"].pop(0)
        return response(request) if callable(response) else response

    monkeypatch.setattr(chat_services, "_TRANSPORT", httpx.MockTransport(handler))
    monkeypatch.setattr(chat_services.settings, "GROQ_API_KEY", "test-key")
    yield state
    clear_search_cache()


def _ask(client, **extra):
    return client.post("/chat/", json={"message": "Do you have a black hoodie in M?", **extra})


def test_tool_round_trip_returns_reply_and_catalog_products(client, provider, seed_product):
    hoodie_id = seed_product(name="Zip Hoodie", category="Hoodies", colors=["Black"], sizes=["M"], stock=4)
    provider["responses"] = [
        _reply(tool_calls=[_tool_call("search_products", json.dumps({"query": "hoodie", "color": "black"}))]),
        _reply("Yes, the Zip Hoodie in Black is available in M."),
    ]
    response = _ask(client)
    assert response.status_code == 200
    body = response.json()
    assert body["reply"].startswith("Yes, the Zip Hoodie")
    assert [p["id"] for p in body["products"]] == [hoodie_id]
    assert body["size_recommendation"] is None
    # Second provider call carries the tool result and the tool list on round one only.
    assert "tools" in provider["requests"][0]
    assert provider["requests"][1]["messages"][-1]["role"] == "tool"


def test_nothing_stocked_returns_empty_products(client, provider, seed_product):
    seed_product(name="Zip Hoodie", category="Hoodies", stock=0)
    provider["responses"] = [
        _reply(tool_calls=[_tool_call("search_products", json.dumps({"query": "hoodie"}))]),
        _reply("Sorry, we don't have that in stock right now."),
    ]
    body = _ask(client).json()
    assert body["products"] == []


def test_tool_rounds_are_capped_at_two(client, provider, seed_product):
    seed_product()
    call = _tool_call("search_products", json.dumps({"query": "tee"}))
    provider["responses"] = [_reply(tool_calls=[call]), _reply(tool_calls=[call]), _reply("Here you go.")]
    assert _ask(client).status_code == 200
    assert len(provider["requests"]) == 3
    assert "tools" not in provider["requests"][2]


def test_hallucinated_product_ids_in_reply_are_never_returned(client, provider, seed_product):
    seed_product(name="Real Tee", stock=3)
    provider["responses"] = [_reply("Try product 64b000000000000000000000, it's great!")]
    assert _ask(client).json()["products"] == []


def test_malformed_tool_arguments_do_not_500(client, provider, seed_product):
    seed_product()
    provider["responses"] = [
        _reply(tool_calls=[_tool_call("search_products", "{not json", "a"), _tool_call("get_variant_availability", '{"product_id": 5}', "b")]),
        _reply("I couldn't look that up."),
    ]
    response = _ask(client)
    assert response.status_code == 200
    tool_messages = [m for m in provider["requests"][1]["messages"] if m["role"] == "tool"]
    assert all("error" in json.loads(m["content"]) for m in tool_messages)


def test_falls_back_to_plain_reply_when_tools_unsupported(client, provider):
    provider["responses"] = [httpx.Response(400, json={"error": "tools unsupported"}), _reply("Happy to help!")]
    body = _ask(client).json()
    assert body == {"reply": "Happy to help!", "products": [], "size_recommendation": None}
    assert "tools" not in provider["requests"][1]


def test_provider_rate_limit_maps_to_503_with_retry_after(client, provider):
    provider["responses"] = [httpx.Response(429, headers={"retry-after": "12"}, json={})]
    response = _ask(client)
    assert response.status_code == 503
    assert response.headers["retry-after"] == "12"


def test_provider_failure_still_502(client, provider):
    provider["responses"] = [httpx.Response(500, json={})]
    assert _ask(client).status_code == 502


def test_old_request_shape_still_works(client, provider):
    provider["responses"] = [_reply("Hello!")]
    response = client.post("/chat/", json={"message": "hi", "history": [{"role": "user", "content": "yo"}]})
    assert response.status_code == 200
    assert response.json()["reply"] == "Hello!"


def test_tool_calls_per_round_and_search_cache_are_bounded(client, provider, seed_product):
    from app.services import chat_tools

    seed_product()
    many = [_tool_call("search_products", json.dumps({"query": f"q{i}"}), str(i)) for i in range(10)]
    provider["responses"] = [_reply(tool_calls=many), _reply("Done.")]
    assert _ask(client).status_code == 200
    tool_messages = [m for m in provider["requests"][1]["messages"] if m["role"] == "tool"]
    assert len(tool_messages) == chat_services.MAX_CALLS_PER_ROUND
    for i in range(chat_tools.MAX_CACHE_ENTRIES + 20):
        chat_tools._search_cache[f"k{i}"] = (0.0, {})
    assert len(chat_tools._search_cache) > chat_tools.MAX_CACHE_ENTRIES
