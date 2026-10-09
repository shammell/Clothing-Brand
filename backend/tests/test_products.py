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
