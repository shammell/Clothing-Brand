def test_contact_submission_sends_email(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routes.contact.send_email",
        lambda to, subject, html: sent.append((to, subject, html)) or True,
    )
    response = client.post(
        "/contact/",
        json={"name": "Jane", "email": "jane@example.com", "message": "Hello there"},
    )
    assert response.status_code == 202
    assert len(sent) == 1
    assert "Jane" in sent[0][1]


def test_contact_submission_rejects_empty_message(client):
    response = client.post(
        "/contact/",
        json={"name": "Jane", "email": "jane@example.com", "message": ""},
    )
    assert response.status_code == 422


def test_contact_submission_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr("app.routes.contact.send_email", lambda to, subject, html: True)
    for _ in range(5):
        client.post("/contact/", json={"name": "Jane", "email": "jane@example.com", "message": "hi"})
    response = client.post("/contact/", json={"name": "Jane", "email": "jane@example.com", "message": "hi"})
    assert response.status_code == 429
