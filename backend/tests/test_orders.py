SAMPLE_ADDRESS = {
    "full_name": "Jane Doe",
    "address_line1": "123 Main St",
    "city": "Springfield",
    "state": "IL",
    "postal_code": "62704",
    "country": "USA",
}


def test_create_order_requires_auth(client, seed_product):
    product_id = seed_product()
    response = client.post(
        "/orders/",
        json={
            "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )
    assert response.status_code == 401


def test_create_order_requires_shipping_address(client, auth_headers, seed_product):
    product_id = seed_product(stock=10)
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={"items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}]},
    )
    assert response.status_code == 422


def test_create_order_succeeds_and_decrements_stock(client, auth_headers, seed_product):
    product_id = seed_product(stock=10, price=20.0)

    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 2, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["total"] == 40.0
    assert body["items"][0]["size"] == "S"
    assert body["items"][0]["color"] == "Black"
    assert body["items"][0]["quantity"] == 2
    assert body["shipping_address"]["full_name"] == "Jane Doe"
    assert body["status"] == "placed"

    product_response = client.get(f"/products/{product_id}")
    assert product_response.json()["stock"] == 8


def test_create_order_merges_same_variant_lines(client, auth_headers, seed_product):
    product_id = seed_product(stock=10)

    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [
                {"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"},
                {"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"},
            ],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )
    assert response.status_code == 201
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["quantity"] == 2


def test_create_order_keeps_different_variants_separate(client, auth_headers, seed_product):
    product_id = seed_product(stock=10, sizes=["S", "M"])

    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [
                {"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"},
                {"product_id": product_id, "quantity": 1, "size": "M", "color": "Black"},
            ],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )
    assert response.status_code == 201
    items = response.json()["items"]
    assert len(items) == 2
    assert response.json()["total"] == sum(item["subtotal"] for item in items)


def test_create_order_rejects_unavailable_size(client, auth_headers, seed_product):
    product_id = seed_product(sizes=["S", "M"])
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 1, "size": "XXL", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )
    assert response.status_code == 400


def test_create_order_rejects_insufficient_stock(client, auth_headers, seed_product):
    product_id = seed_product(stock=1)
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 5, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )
    assert response.status_code == 409

    # Stock must not have been touched by the rejected order.
    product_response = client.get(f"/products/{product_id}")
    assert product_response.json()["stock"] == 1


def test_create_order_rejects_unknown_product(client, auth_headers):
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": "64b1f0f0f0f0f0f0f0f0f0f0", "quantity": 1, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )
    assert response.status_code == 404


def test_list_my_orders_returns_only_own_orders(client, register_user, seed_product):
    product_id = seed_product(stock=10)

    alice_token = register_user(username="Alice", email="alice@example.com", password="alicepass1").json()["access_token"]
    bob_token = register_user(username="Bob", email="bob@example.com", password="bobpass123").json()["access_token"]

    client.post(
        "/orders/",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={
            "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )

    alice_orders = client.get("/orders/me", headers={"Authorization": f"Bearer {alice_token}"})
    bob_orders = client.get("/orders/me", headers={"Authorization": f"Bearer {bob_token}"})

    assert len(alice_orders.json()) == 1
    assert len(bob_orders.json()) == 0


def test_list_all_orders_requires_admin(client, auth_headers):
    response = client.get("/orders/", headers=auth_headers)
    assert response.status_code == 403


def test_list_all_orders_returns_every_customers_orders(client, register_user, admin_headers, seed_product):
    product_id = seed_product(stock=10)
    alice_token = register_user(username="Alice", email="alice2@example.com", password="alicepass1").json()["access_token"]
    client.post(
        "/orders/",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={
            "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )

    response = client.get("/orders/", headers=admin_headers)
    assert response.status_code == 200
    assert len(response.json()) == 1


def test_update_order_status_requires_admin(client, auth_headers, seed_product):
    product_id = seed_product(stock=10)
    order = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    ).json()

    response = client.patch(f"/orders/{order['id']}/status", headers=auth_headers, json={"status": "shipped"})
    assert response.status_code == 403


def test_admin_can_update_order_status(client, auth_headers, admin_headers, seed_product):
    product_id = seed_product(stock=10)
    order = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    ).json()

    response = client.patch(f"/orders/{order['id']}/status", headers=admin_headers, json={"status": "shipped"})
    assert response.status_code == 200
    assert response.json()["status"] == "shipped"


def test_update_order_status_rejects_unknown_value(client, admin_headers, auth_headers, seed_product):
    product_id = seed_product(stock=10)
    order = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    ).json()

    response = client.patch(f"/orders/{order['id']}/status", headers=admin_headers, json={"status": "teleported"})
    assert response.status_code == 422


def test_cancelling_order_restores_stock(client, auth_headers, admin_headers, seed_product):
    product_id = seed_product(stock=10, variants=[{"sku": "X", "size": "S", "color": "Black", "stock": 10}], sizes=["S"], colors=["Black"])
    order = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 3, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    ).json()
    assert client.get(f"/products/{product_id}").json()["stock"] == 7

    response = client.patch(f"/orders/{order['id']}/status", headers=admin_headers, json={"status": "cancelled"})
    assert response.status_code == 200
    assert client.get(f"/products/{product_id}").json()["stock"] == 10


def test_create_order_with_same_idempotency_key_returns_same_order(client, auth_headers, seed_product):
    product_id = seed_product(stock=10)
    headers = {**auth_headers, "Idempotency-Key": "test-key-123"}
    payload = {
        "items": [{"product_id": product_id, "quantity": 2, "size": "S", "color": "Black"}],
        "shipping_address": SAMPLE_ADDRESS,
    }

    first = client.post("/orders/", headers=headers, json=payload)
    second = client.post("/orders/", headers=headers, json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]

    # Stock decremented only once - the second call returned the first
    # order instead of placing a new one.
    assert client.get(f"/products/{product_id}").json()["stock"] == 8


def test_create_order_without_idempotency_key_allows_separate_orders(client, auth_headers, seed_product):
    product_id = seed_product(stock=10)
    payload = {
        "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
        "shipping_address": SAMPLE_ADDRESS,
    }

    first = client.post("/orders/", headers=auth_headers, json=payload)
    second = client.post("/orders/", headers=auth_headers, json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert client.get(f"/products/{product_id}").json()["stock"] == 8


def test_idempotency_key_is_scoped_per_user(client, register_user, seed_product):
    product_id = seed_product(stock=10)
    alice_token = register_user(username="Alice", email="alice-idem@example.com", password="alicepass1").json()["access_token"]
    bob_token = register_user(username="Bob", email="bob-idem@example.com", password="bobpass123").json()["access_token"]
    payload = {
        "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
        "shipping_address": SAMPLE_ADDRESS,
    }

    alice_response = client.post(
        "/orders/",
        headers={"Authorization": f"Bearer {alice_token}", "Idempotency-Key": "shared-key"},
        json=payload,
    )
    bob_response = client.post(
        "/orders/",
        headers={"Authorization": f"Bearer {bob_token}", "Idempotency-Key": "shared-key"},
        json=payload,
    )

    assert alice_response.status_code == 201
    assert bob_response.status_code == 201
    assert alice_response.json()["id"] != bob_response.json()["id"]


def test_cancelling_twice_does_not_double_restore_stock(client, auth_headers, admin_headers, seed_product):
    product_id = seed_product(stock=10)
    order = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 2, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    ).json()

    client.patch(f"/orders/{order['id']}/status", headers=admin_headers, json={"status": "cancelled"})
    client.patch(f"/orders/{order['id']}/status", headers=admin_headers, json={"status": "cancelled"})

    assert client.get(f"/products/{product_id}").json()["stock"] == 10


def test_create_order_sends_confirmation_email(client, auth_headers, seed_product, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routes.orders.send_email",
        lambda to, subject, html: sent.append((to, subject, html)) or True,
    )
    product_id = seed_product(stock=5)
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={
            "items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}],
            "shipping_address": SAMPLE_ADDRESS,
        },
    )
    assert response.status_code == 201
    assert len(sent) == 1
    assert sent[0][0] == "test@example.com"


VARIANTS = [
    {"sku": "T-S-BLACK", "size": "S", "color": "Black", "stock": 1},
    {"sku": "T-M-BLACK", "size": "M", "color": "Black", "stock": 4},
    {"sku": "T-M-WHITE", "size": "M", "color": "White", "stock": 3},
]


def _variant_product(seed_product):
    return seed_product(variants=VARIANTS, sizes=["S", "M"], colors=["Black", "White"], stock=8)


def _line(product_id, size, color, quantity=1):
    return {"product_id": product_id, "quantity": quantity, "size": size, "color": color}


def _order(client, headers, *lines):
    return client.post("/orders/", headers=headers, json={"items": list(lines), "shipping_address": SAMPLE_ADDRESS})


def _variant_stock(client, product_id):
    body = client.get(f"/products/{product_id}").json()
    return {(v["size"], v["color"]): v["stock"] for v in body["variants"]}, body["stock"]


def test_last_unit_of_variant_only_affects_that_variant(client, auth_headers, seed_product):
    product_id = _variant_product(seed_product)
    assert _order(client, auth_headers, _line(product_id, "S", "Black")).status_code == 201

    second = _order(client, auth_headers, _line(product_id, "S", "Black"))
    assert second.status_code == 409
    assert "S / Black" in second.json()["detail"]

    stocks, total = _variant_stock(client, product_id)
    assert stocks == {("S", "Black"): 0, ("M", "Black"): 4, ("M", "White"): 3}
    assert total == 7


def test_failed_multi_line_order_restores_every_variant(client, auth_headers, seed_product):
    product_id = _variant_product(seed_product)
    response = _order(client, auth_headers, _line(product_id, "M", "Black", 2), _line(product_id, "S", "Black", 2))
    assert response.status_code == 409
    stocks, total = _variant_stock(client, product_id)
    assert stocks == {("S", "Black"): 1, ("M", "Black"): 4, ("M", "White"): 3}
    assert total == 8


def test_cancel_restores_variant_once(client, auth_headers, admin_headers, seed_product):
    product_id = _variant_product(seed_product)
    order = _order(client, auth_headers, _line(product_id, "M", "White", 2)).json()
    assert _variant_stock(client, product_id)[0][("M", "White")] == 1

    for _ in range(2):
        client.patch(f"/orders/{order['id']}/status", headers=admin_headers, json={"status": "cancelled"})
    stocks, total = _variant_stock(client, product_id)
    assert stocks[("M", "White")] == 3
    assert total == 8


def test_unmigrated_product_gets_variants_persisted_on_order(client, auth_headers, seed_product):
    product_id = seed_product(sizes=["S"], colors=["Black"], stock=5)
    assert _order(client, auth_headers, _line(product_id, "S", "Black", 2)).status_code == 201
    stocks, total = _variant_stock(client, product_id)
    assert stocks == {("S", "Black"): 3}
    assert total == 3


def test_order_for_nonexistent_variant_combination_rejected(client, auth_headers, seed_product):
    product_id = _variant_product(seed_product)
    response = _order(client, auth_headers, _line(product_id, "S", "White"))
    assert response.status_code == 400


def test_concurrent_orders_for_last_unit_only_one_wins(client, auth_headers, seed_product):
    from concurrent.futures import ThreadPoolExecutor

    product_id = _variant_product(seed_product)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: _order(client, auth_headers, _line(product_id, "S", "Black")).status_code, range(2)))
    assert sorted(results) == [201, 409]
    assert _variant_stock(client, product_id)[0][("S", "Black")] == 0
