from unittest.mock import MagicMock

from app.core import limiter as limiter_module


def _request(xff: str | None, direct_ip: str = "9.9.9.9"):
    req = MagicMock()
    req.headers = {"X-Forwarded-For": xff} if xff else {}
    req.client.host = direct_ip
    return req


def test_zero_trusted_hops_ignores_forwarded_header(monkeypatch):
    # Default posture: a direct (no reverse proxy) deployment must never
    # trust a client-suppliable header for its own rate-limit identity, or
    # any client could claim to be any IP and dodge per-IP limiting entirely.
    monkeypatch.setattr(limiter_module.settings, "TRUSTED_PROXY_HOPS", 0)
    request = _request(xff="1.2.3.4, 5.6.7.8", direct_ip="9.9.9.9")
    assert limiter_module.get_client_identity(request) == "9.9.9.9"


def test_trusted_hops_matches_legitimate_chain_length(monkeypatch):
    # Two trusted reverse proxies in front of the app, two X-Forwarded-For
    # entries (one appended per hop) - the real client is the FIRST entry,
    # since each proxy appends what it saw to the end of the header.
    monkeypatch.setattr(limiter_module.settings, "TRUSTED_PROXY_HOPS", 2)
    request = _request(xff="1.2.3.4, 5.6.7.8")
    assert limiter_module.get_client_identity(request) == "1.2.3.4"


def test_fewer_trusted_hops_than_header_entries_does_not_trust_earlier_entries(monkeypatch):
    # Only 1 trusted hop, but the header carries 2 entries: anything before
    # what that one trusted proxy itself appended could have been forged by
    # the untrusted sender before it ever reached that proxy. Only the last
    # entry (what the trusted proxy actually observed) is safe to trust.
    monkeypatch.setattr(limiter_module.settings, "TRUSTED_PROXY_HOPS", 1)
    request = _request(xff="1.2.3.4, 5.6.7.8")
    assert limiter_module.get_client_identity(request) == "5.6.7.8"


def test_trusted_hops_set_but_header_missing_falls_back_to_direct_peer(monkeypatch):
    monkeypatch.setattr(limiter_module.settings, "TRUSTED_PROXY_HOPS", 1)
    request = _request(xff=None, direct_ip="9.9.9.9")
    assert limiter_module.get_client_identity(request) == "9.9.9.9"


def test_global_budget_falls_back_to_the_strict_ceiling_when_storage_fails(monkeypatch):
    import pytest
    from fastapi import HTTPException
    from app.core.limiter import consume_global, limiter

    def broken(*args, **kwargs):
        raise ConnectionError("redis down")

    monkeypatch.setattr(limiter._limiter, "hit", broken)
    for _ in range(5):
        consume_global("outage_test", "1000/minute")
    with pytest.raises(HTTPException) as blocked:
        consume_global("outage_test", "1000/minute")
    assert blocked.value.status_code == 429


def test_outage_fallback_still_honours_a_stricter_configured_cap(monkeypatch):
    import pytest
    from fastapi import HTTPException
    from app.core.limiter import consume_global, limiter

    def broken(*args, **kwargs):
        raise ConnectionError("redis down")

    monkeypatch.setattr(limiter._limiter, "hit", broken)
    consume_global("outage_daily_test", "2/day")
    consume_global("outage_daily_test", "2/day")
    with pytest.raises(HTTPException) as blocked:
        consume_global("outage_daily_test", "2/day")
    assert blocked.value.status_code == 429
