def test_list_products_empty(client):
    response = client.get("/products/")
    assert response.status_code == 200
    assert response.json() == []


def test_list_products_filters_by_category(client, seed_product):
    seed_product(name="Tee", category="T-Shirts")
    seed_product(name="Jeans", category="Jeans")

    response = client.get("/products/", params={"category": "Jeans"})
    assert response.status_code == 200
    names = [product["name"] for product in response.json()]
    assert names == ["Jeans"]


def test_get_product_by_id(client, seed_product):
    product_id = seed_product(name="Solo Tee")
    response = client.get(f"/products/{product_id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Solo Tee"


def test_get_product_not_found(client):
    response = client.get("/products/64b1f0f0f0f0f0f0f0f0f0f0")
    assert response.status_code == 404


def test_get_product_invalid_id(client):
    response = client.get("/products/not-an-object-id")
    assert response.status_code == 400


def test_create_product_requires_auth(client):
    response = client.post(
        "/products/",
        json={
            "name": "New Shirt",
            "price": 10.0,
            "category": "Shirts",
            "brand": "Brand",
            "sizes": ["S"],
            "colors": ["Black"],
            "image_url": "/products/no-image.svg",
            "stock": 5,
        },
    )
    assert response.status_code == 401


def test_create_product_requires_admin(client, auth_headers):
    response = client.post(
        "/products/",
        headers=auth_headers,
        json={
            "name": "New Shirt",
            "price": 10.0,
            "category": "Shirts",
            "brand": "Brand",
            "sizes": ["S"],
            "colors": ["Black"],
            "image_url": "/products/no-image.svg",
            "stock": 5,
        },
    )
    assert response.status_code == 403


def test_admin_can_create_update_and_delete_product(client, admin_headers):
    create_response = client.post(
        "/products/",
        headers=admin_headers,
        json={
            "name": "Admin Shirt",
            "price": 15.0,
            "category": "Shirts",
            "brand": "Brand",
            "sizes": ["S", "M"],
            "colors": ["Black"],
            "image_url": "/products/no-image.svg",
            "stock": 5,
        },
    )
    assert create_response.status_code == 201
    product_id = create_response.json()["id"]

    update_response = client.put(
        f"/products/{product_id}",
        headers=admin_headers,
        json={
            "name": "Admin Shirt",
            "price": 18.0,
            "category": "Shirts",
            "brand": "Brand",
            "sizes": ["S", "M", "L"],
            "colors": ["Black"],
            "image_url": "/products/no-image.svg",
            "stock": 8,
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["price"] == 18.0

    delete_response = client.delete(f"/products/{product_id}", headers=admin_headers)
    assert delete_response.status_code == 204

    get_response = client.get(f"/products/{product_id}")
    assert get_response.status_code == 404


def test_lister_can_create_product(client, lister_headers):
    response = client.post(
        "/products/",
        headers=lister_headers,
        json={
            "name": "Lister Tee", "price": 15.0, "category": "T-Shirts", "brand": "TestBrand",
            "sizes": ["S", "M"], "colors": ["Black"], "image_url": "/products/no-image.svg", "stock": 5,
        },
    )
    assert response.status_code == 201


def test_lister_can_update_and_delete_product(client, lister_headers, seed_product):
    product_id = seed_product()
    update = client.put(
        f"/products/{product_id}",
        headers=lister_headers,
        json={
            "name": "Updated Tee", "price": 25.0, "category": "T-Shirts", "brand": "TestBrand",
            "sizes": ["S"], "colors": ["Black"], "image_url": "/products/no-image.svg", "stock": 3,
        },
    )
    assert update.status_code == 200
    delete = client.delete(f"/products/{product_id}", headers=lister_headers)
    assert delete.status_code == 204


def test_customer_cannot_create_product(client, auth_headers):
    response = client.post(
        "/products/",
        headers=auth_headers,
        json={
            "name": "Customer Tee", "price": 15.0, "category": "T-Shirts", "brand": "TestBrand",
            "sizes": ["S"], "colors": ["Black"], "image_url": "/products/no-image.svg", "stock": 5,
        },
    )
    assert response.status_code == 403


LEGACY_PAYLOAD = {
    "name": "Legacy Tee",
    "price": 25.0,
    "category": "T-Shirts",
    "brand": "TestBrand",
    "sizes": ["S", "M"],
    "colors": ["Black", "White"],
    "image_url": "/products/no-image.svg",
    "stock": 9,
}


def test_create_product_with_variants_derives_fields(client, admin_headers):
    payload = {k: v for k, v in LEGACY_PAYLOAD.items() if k not in ("sizes", "colors", "stock")}
    payload["variants"] = [
        {"size": "S", "color": "Black", "stock": 5},
        {"size": "S", "color": "White", "stock": 4},
        {"size": "M", "color": "Black", "stock": 0},
    ]
    response = client.post("/products/", json=payload, headers=admin_headers)
    assert response.status_code == 201
    body = response.json()
    assert body["stock"] == 9
    assert body["sizes"] == ["S", "M"]
    assert body["colors"] == ["Black", "White"]
    assert body["variants"][0]["sku"] == f"{body['id'][-6:].upper()}-S-BLACK"
    assert [v["stock"] for v in body["variants"]] == [5, 4, 0]


def test_create_product_legacy_shape_synthesises_variants(client, admin_headers):
    response = client.post("/products/", json=LEGACY_PAYLOAD, headers=admin_headers)
    assert response.status_code == 201
    body = response.json()
    assert len(body["variants"]) == 4
    assert sum(v["stock"] for v in body["variants"]) == 9 == body["stock"]
    assert [v["stock"] for v in body["variants"]] == [3, 2, 2, 2]


def test_duplicate_variant_rejected(client, admin_headers):
    payload = {k: v for k, v in LEGACY_PAYLOAD.items() if k not in ("sizes", "colors", "stock")}
    payload["variants"] = [
        {"size": "S", "color": "Black", "stock": 1},
        {"size": "S", "color": "Black", "stock": 2},
    ]
    response = client.post("/products/", json=payload, headers=admin_headers)
    assert response.status_code == 422


def test_create_without_variants_or_legacy_fields_rejected(client, admin_headers):
    payload = {k: v for k, v in LEGACY_PAYLOAD.items() if k != "stock"}
    response = client.post("/products/", json=payload, headers=admin_headers)
    assert response.status_code == 422


def test_unmigrated_document_served_with_synthesised_variants(client, seed_product):
    product_id = seed_product(sizes=["S", "M"], colors=["Black"], stock=5)
    body = client.get(f"/products/{product_id}").json()
    assert [(v["size"], v["color"], v["stock"]) for v in body["variants"]] == [
        ("S", "Black", 3),
        ("M", "Black", 2),
    ]
    assert body["stock"] == 5
    assert client.get("/products/").json()[0]["variants"] == body["variants"]


def test_derived_fields_correct_after_update(client, admin_headers, seed_product):
    product_id = seed_product()
    payload = {k: v for k, v in LEGACY_PAYLOAD.items() if k not in ("sizes", "colors", "stock")}
    payload["variants"] = [
        {"size": "L", "color": "Navy", "stock": 2},
        {"size": "XL", "color": "Navy", "stock": 3},
    ]
    response = client.put(f"/products/{product_id}", json=payload, headers=admin_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["stock"] == 5
    assert body["sizes"] == ["L", "XL"]
    assert body["colors"] == ["Navy"]


def test_legacy_update_with_same_total_keeps_variant_stock(client, admin_headers, seed_product):
    variants = [
        {"sku": "A", "size": "S", "color": "Black", "stock": 0},
        {"sku": "B", "size": "M", "color": "Black", "stock": 9},
    ]
    product_id = seed_product(variants=variants, sizes=["S", "M"], colors=["Black"], stock=9)
    payload = {**LEGACY_PAYLOAD, "sizes": ["S", "M"], "colors": ["Black"], "stock": 9, "price": 30.0}
    body = client.put(f"/products/{product_id}", json=payload, headers=admin_headers).json()
    assert [v["stock"] for v in body["variants"]] == [0, 9]


def test_legacy_update_with_new_total_resplits(client, admin_headers, seed_product):
    product_id = seed_product(sizes=["S", "M"], colors=["Black"], stock=4)
    payload = {**LEGACY_PAYLOAD, "sizes": ["S", "M"], "colors": ["Black"], "stock": 10}
    body = client.put(f"/products/{product_id}", json=payload, headers=admin_headers).json()
    assert body["stock"] == 10


def test_oversized_size_color_matrix_rejected(client, admin_headers):
    payload = {**LEGACY_PAYLOAD, "sizes": [f"s{i}" for i in range(16)], "colors": ["Black"]}
    assert client.post("/products/", json=payload, headers=admin_headers).status_code == 422
