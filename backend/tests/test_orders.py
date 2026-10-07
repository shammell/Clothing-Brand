def test_create_order_requires_auth(client, seed_product):
    product_id = seed_product()
    response = client.post(
        "/orders/",
        json={"items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}]},
    )
    assert response.status_code == 401


def test_create_order_succeeds_and_decrements_stock(client, auth_headers, seed_product):
    product_id = seed_product(stock=10, price=20.0)

    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={"items": [{"product_id": product_id, "quantity": 2, "size": "S", "color": "Black"}]},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["total"] == 40.0
    assert body["items"][0]["size"] == "S"
    assert body["items"][0]["color"] == "Black"
    assert body["items"][0]["quantity"] == 2

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
            ]
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
            ]
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
        json={"items": [{"product_id": product_id, "quantity": 1, "size": "XXL", "color": "Black"}]},
    )
    assert response.status_code == 400


def test_create_order_rejects_insufficient_stock(client, auth_headers, seed_product):
    product_id = seed_product(stock=1)
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={"items": [{"product_id": product_id, "quantity": 5, "size": "S", "color": "Black"}]},
    )
    assert response.status_code == 409

    # Stock must not have been touched by the rejected order.
    product_response = client.get(f"/products/{product_id}")
    assert product_response.json()["stock"] == 1


def test_create_order_rejects_unknown_product(client, auth_headers):
    response = client.post(
        "/orders/",
        headers=auth_headers,
        json={"items": [{"product_id": "64b1f0f0f0f0f0f0f0f0f0f0", "quantity": 1, "size": "S", "color": "Black"}]},
    )
    assert response.status_code == 404


def test_list_my_orders_returns_only_own_orders(client, register_user, seed_product):
    product_id = seed_product(stock=10)

    alice_token = register_user(username="Alice", email="alice@example.com", password="alicepass1").json()["access_token"]
    bob_token = register_user(username="Bob", email="bob@example.com", password="bobpass123").json()["access_token"]

    client.post(
        "/orders/",
        headers={"Authorization": f"Bearer {alice_token}"},
        json={"items": [{"product_id": product_id, "quantity": 1, "size": "S", "color": "Black"}]},
    )

    alice_orders = client.get("/orders/me", headers={"Authorization": f"Bearer {alice_token}"})
    bob_orders = client.get("/orders/me", headers={"Authorization": f"Bearer {bob_token}"})

    assert len(alice_orders.json()) == 1
    assert len(bob_orders.json()) == 0
