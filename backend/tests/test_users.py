def test_list_users_requires_admin(client, auth_headers):
    response = client.get("/users/", headers=auth_headers)
    assert response.status_code == 403


def test_admin_can_list_users(client, admin_headers, register_user):
    register_user(username="Someone", email="someone@example.com", password="somepass123")
    response = client.get("/users/", headers=admin_headers)
    assert response.status_code == 200
    emails = [user["email"] for user in response.json()]
    assert "someone@example.com" in emails
    assert "admin@example.com" in emails


def test_admin_can_promote_customer_to_lister(client, admin_headers, register_user):
    register_user(username="Promote Me", email="promoteme@example.com", password="promotepass1")
    users = client.get("/users/", headers=admin_headers).json()
    target_id = next(u["id"] for u in users if u["email"] == "promoteme@example.com")

    response = client.patch(f"/users/{target_id}/role", headers=admin_headers, json={"role": "lister"})
    assert response.status_code == 200
    assert response.json()["role"] == "lister"


def test_admin_cannot_demote_self(client, admin_headers):
    users = client.get("/users/", headers=admin_headers).json()
    self_id = next(u["id"] for u in users if u["email"] == "admin@example.com")

    response = client.patch(f"/users/{self_id}/role", headers=admin_headers, json={"role": "customer"})
    assert response.status_code == 400


def test_admin_can_demote_a_different_admin(client, admin_headers, register_user, make_admin):
    register_user(username="Other Admin", email="otheradmin@example.com", password="otherpass123")
    make_admin("otheradmin@example.com")
    users = client.get("/users/", headers=admin_headers).json()
    other_id = next(u["id"] for u in users if u["email"] == "otheradmin@example.com")

    # Intentional per spec: only SELF-demotion is blocked. A different
    # admin demoting another admin (even the last other one) is allowed.
    response = client.patch(f"/users/{other_id}/role", headers=admin_headers, json={"role": "customer"})
    assert response.status_code == 200
    assert response.json()["role"] == "customer"


def test_admin_can_block_and_unblock_user(client, admin_headers, register_user):
    register_user(username="Block Me", email="blockme@example.com", password="blockpass123")
    users = client.get("/users/", headers=admin_headers).json()
    target_id = next(u["id"] for u in users if u["email"] == "blockme@example.com")

    block = client.patch(f"/users/{target_id}/block", headers=admin_headers, json={"is_blocked": True})
    assert block.status_code == 200
    assert block.json()["is_blocked"] is True

    unblock = client.patch(f"/users/{target_id}/block", headers=admin_headers, json={"is_blocked": False})
    assert unblock.json()["is_blocked"] is False


def test_admin_cannot_block_self(client, admin_headers):
    users = client.get("/users/", headers=admin_headers).json()
    self_id = next(u["id"] for u in users if u["email"] == "admin@example.com")

    response = client.patch(f"/users/{self_id}/block", headers=admin_headers, json={"is_blocked": True})
    assert response.status_code == 400


def test_admin_cannot_demote_self_with_uppercase_id(client, admin_headers):
    # ObjectId is case-insensitive on its hex string (ObjectId(s.upper()) ==
    # ObjectId(s)), but the self-demote guard must not compare the raw id
    # strings before parsing - otherwise an admin could send their own id
    # with different casing to slip past the guard and demote themselves.
    users = client.get("/users/", headers=admin_headers).json()
    self_id = next(u["id"] for u in users if u["email"] == "admin@example.com")

    response = client.patch(
        f"/users/{self_id.upper()}/role", headers=admin_headers, json={"role": "customer"}
    )
    assert response.status_code == 400


def test_admin_cannot_block_self_with_uppercase_id(client, admin_headers):
    users = client.get("/users/", headers=admin_headers).json()
    self_id = next(u["id"] for u in users if u["email"] == "admin@example.com")

    response = client.patch(
        f"/users/{self_id.upper()}/block", headers=admin_headers, json={"is_blocked": True}
    )
    assert response.status_code == 400
