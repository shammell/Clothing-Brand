def test_register_creates_user_and_returns_token(client):
    response = client.post(
        "/auth/register",
        json={"username": "Jane Doe", "email": "jane@example.com", "password": "strongpass1"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "jane@example.com"
    assert body["user"]["username"] == "Jane Doe"
    assert body["user"]["role"] == "customer"


def test_register_returns_role_not_is_admin(client):
    response = client.post(
        "/auth/register",
        json={"username": "Role Test", "email": "roletest@example.com", "password": "testpass123"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["role"] == "customer"
    assert "is_admin" not in body["user"]


def test_register_duplicate_email_rejected(register_user):
    register_user(email="dupe@example.com")
    response = register_user(username="Someone Else", email="dupe@example.com")
    assert response.status_code == 400


def test_register_rejects_short_password(client):
    response = client.post(
        "/auth/register",
        json={"username": "Jane Doe", "email": "jane2@example.com", "password": "short"},
    )
    assert response.status_code == 422


def test_login_success(client, register_user):
    register_user(email="login@example.com", password="correctpass1")
    response = client.post("/auth/login", json={"email": "login@example.com", "password": "correctpass1"})
    assert response.status_code == 200
    assert response.json()["access_token"]


def test_login_wrong_password_rejected(client, register_user):
    register_user(email="login2@example.com", password="correctpass1")
    response = client.post("/auth/login", json={"email": "login2@example.com", "password": "wrongpass1"})
    assert response.status_code == 401


def test_login_unknown_email_rejected(client):
    response = client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})
    assert response.status_code == 401


def test_email_is_case_insensitive(client, register_user):
    register_user(email="Mixed.Case@Example.com", password="correctpass1")
    response = client.post("/auth/login", json={"email": "mixed.case@example.com", "password": "correctpass1"})
    assert response.status_code == 200
