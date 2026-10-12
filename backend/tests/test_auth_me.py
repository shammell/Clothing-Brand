def test_me_returns_current_user_role(client, auth_headers):
    response = client.get("/auth/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["role"] == "customer"


def test_me_requires_authentication(client):
    response = client.get("/auth/me")
    assert response.status_code == 401
