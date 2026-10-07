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
    product_id = seed_product(stock=10)
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
