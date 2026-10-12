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


def test_contact_submission_escapes_html_in_name_and_message(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routes.contact.send_email",
        lambda to, subject, html: sent.append((to, subject, html)) or True,
    )
    response = client.post(
        "/contact/",
        json={
            "name": "<script>alert(1)</script>",
            "email": "jane@example.com",
            "message": "<img src=x onerror=alert(2)>",
        },
    )
    assert response.status_code == 202
    assert "<script>" not in sent[0][2]
    assert "&lt;script&gt;" in sent[0][2]
    assert "<img" not in sent[0][2]


def test_contact_submission_strips_crlf_from_subject(client, monkeypatch):
    sent = []
    monkeypatch.setattr(
        "app.routes.contact.send_email",
        lambda to, subject, html: sent.append((to, subject, html)) or True,
    )
    response = client.post(
        "/contact/",
        json={"name": "Jane\r\nBcc: victim@example.com", "email": "jane@example.com", "message": "hi"},
    )
    assert response.status_code == 202
    assert "\r" not in sent[0][1]
    assert "\n" not in sent[0][1]


def test_contact_submission_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr("app.routes.contact.send_email", lambda to, subject, html: True)
    for _ in range(5):
        client.post("/contact/", json={"name": "Jane", "email": "jane@example.com", "message": "hi"})
    response = client.post("/contact/", json={"name": "Jane", "email": "jane@example.com", "message": "hi"})
    assert response.status_code == 429
