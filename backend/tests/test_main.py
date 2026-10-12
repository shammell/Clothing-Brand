def test_app_starts_and_health_check_works_without_sentry_dsn(client):
    # SENTRY_DSN is unset in the test environment (conftest.py doesn't set
    # it) - this pins that the conditional sentry_sdk.init() below never
    # runs during tests and never breaks app startup either way.
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
