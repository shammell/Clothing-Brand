import asyncio
import importlib.util
from pathlib import Path

from app.services.companions import harmony_score, rank_companions


def _p(pid, name, category, colors, stock=5):
    return {"_id": pid, "name": name, "category": category, "colors": colors, "stock": stock}


def test_rules_pick_complementary_in_stock_products_best_harmony_first():
    tee = _p(1, "Red Tee", "T-Shirts", ["Red"])
    candidates = [
        _p(2, "Black Jeans", "Jeans", ["Black"]),
        _p(3, "Red Sneakers", "Shoes", ["Red"]),
        _p(4, "Green Jeans", "Jeans", ["Green"]),
        _p(5, "Sold Out Jeans", "Jeans", ["Black"], stock=0),
        _p(6, "Other Tee", "T-Shirts", ["Red"]),  # same category: not complementary
        tee,
    ]
    ranked = [c["name"] for c in rank_companions(tee, candidates)]
    assert ranked == ["Red Sneakers", "Black Jeans", "Green Jeans"]


def test_harmony_levels():
    assert harmony_score(_p(1, "a", "x", ["Red"]), _p(2, "b", "x", ["Red"])) == 3
    assert harmony_score(_p(1, "a", "x", ["Red"]), _p(2, "b", "x", ["Black"])) == 2
    assert harmony_score(_p(1, "a", "x", ["Blue"]), _p(2, "b", "x", ["Green"])) == 1
    assert harmony_score(_p(1, "a", "x", ["Red"]), _p(2, "b", "x", ["Green"])) == 0


def test_companions_capped_at_four():
    tee = _p(1, "Tee", "T-Shirts", ["Black"])
    many = [_p(10 + i, f"Jeans {i}", "Jeans", ["Black"]) for i in range(8)]
    assert len(rank_companions(tee, many)) == 4


def test_self_and_duplicate_companions_rejected(client, admin_headers, seed_product):
    a, b = seed_product(name="A"), seed_product(name="B")
    payload = {
        "name": "A", "price": 5, "category": "T-Shirts", "brand": "x", "image_url": "/x",
        "sizes": ["S"], "colors": ["Black"], "stock": 3, "stock_rev": 0,
    }
    assert client.put(f"/products/{a}", json={**payload, "companions": [a]}, headers=admin_headers).status_code == 422
    assert client.put(f"/products/{a}", json={**payload, "companions": [b, b]}, headers=admin_headers).status_code == 422
    assert client.put(f"/products/{a}", json={**payload, "companions": ["64b000000000000000000000"]}, headers=admin_headers).status_code == 422
    ok = client.put(f"/products/{a}", json={**payload, "companions": [b]}, headers=admin_headers)
    assert ok.status_code == 200
    assert ok.json()["companions"] == [b] and ok.json()["companions_source"] == "manual"


def test_update_without_companions_keeps_the_stored_list(client, admin_headers, seed_product):
    b = seed_product(name="B")
    a = seed_product(name="A", companions=[b], companions_source="generated")
    payload = {
        "name": "A2", "price": 5, "category": "T-Shirts", "brand": "x", "image_url": "/x",
        "sizes": ["S"], "colors": ["Black"], "stock": 3, "stock_rev": 0,
    }
    body = client.put(f"/products/{a}", json=payload, headers=admin_headers).json()
    assert body["companions"] == [b] and body["companions_source"] == "generated"


def test_endpoint_filters_self_deleted_and_sold_out(client, seed_product):
    live = seed_product(name="Live", stock=4)
    sold_out = seed_product(name="Gone", stock=0)
    a = seed_product(name="A")
    # a self-reference and a deleted id slipped into stored data
    a = seed_product(name="Main", companions=[live, sold_out, "64b000000000000000000000"])
    body = client.get(f"/products/{a}/companions").json()
    assert [p["name"] for p in body] == ["Live"]


def _load_script():
    path = Path(__file__).resolve().parent.parent / "scripts" / "generate_companions.py"
    spec = importlib.util.spec_from_file_location("generate_companions", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_script_fills_skips_manual_and_is_idempotent(client, seed_product):
    tee = seed_product(name="Tee", category="T-Shirts", colors=["Black"], stock=5)
    jeans = seed_product(name="Jeans", category="Jeans", colors=["Black"], stock=5)
    manual = seed_product(name="Hoodie", category="Hoodies", colors=["Black"], stock=5, companions=[tee], companions_source="manual")
    script = _load_script()

    asyncio.run(script.generate(dry_run=True, overwrite=False, use_llm=False))
    assert client.get(f"/products/{tee}").json()["companions"] == []

    asyncio.run(script.generate(dry_run=False, overwrite=False, use_llm=False))
    first = client.get(f"/products/{tee}").json()
    assert jeans in first["companions"] and first["companions_source"] == "generated"
    assert client.get(f"/products/{manual}").json()["companions"] == [tee]

    asyncio.run(script.generate(dry_run=False, overwrite=False, use_llm=False))
    assert client.get(f"/products/{tee}").json()["companions"] == first["companions"]


def test_looks_use_one_companion_query_however_many_looks(client, seed_product, monkeypatch):
    from app.routes import products as products_module

    shared = [seed_product(name=f"Piece {i}", stock=5) for i in range(3)]
    gone = seed_product(name="Gone", stock=0)
    for index in range(4):
        seed_product(name=f"Main {index}", companions=[shared[0], gone, shared[1], shared[2]])

    calls = {"find": 0}
    real_get_database = products_module.get_database

    class CountingCollection:
        def __init__(self, collection):
            self._collection = collection

        def find(self, *args, **kwargs):
            calls["find"] += 1
            return self._collection.find(*args, **kwargs)

        def __getattr__(self, name):
            return getattr(self._collection, name)

    class CountingDatabase:
        def __init__(self, database):
            self._database = database

        def __getitem__(self, name):
            return CountingCollection(self._database[name])

    monkeypatch.setattr(products_module, "get_database", lambda: CountingDatabase(real_get_database()))
    looks = client.get("/products/looks").json()

    # 4 mains (shared pieces have no companions of their own): one query for
    # the products, one for all their companions.
    assert calls["find"] == 2
    assert len(looks) == 4
    for look in looks:
        assert [c["name"] for c in look["companions"]] == ["Piece 0", "Piece 1", "Piece 2"]
