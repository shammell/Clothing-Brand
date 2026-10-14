from app.core.config import settings
from app.services import email_service


def test_send_email_returns_false_and_logs_when_key_unset(monkeypatch, caplog):
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    with caplog.at_level("WARNING"):
        result = email_service.send_email("a@shop.io", "Subject", "<p>hi</p>")
    assert result is False
    assert "RESEND_API_KEY not set" in caplog.text


def test_send_email_calls_resend_and_returns_true(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")
    calls = []
    monkeypatch.setattr(email_service.resend.Emails, "send", lambda payload: calls.append(payload))
    result = email_service.send_email("a@shop.io", "Subject", "<p>hi</p>")
    assert result is True
    assert calls[0]["to"] == "a@shop.io"
    assert calls[0]["subject"] == "Subject"


def test_send_email_returns_false_on_resend_error(monkeypatch, caplog):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "test-key")

    def _raise(payload):
        raise RuntimeError("boom")

    monkeypatch.setattr(email_service.resend.Emails, "send", _raise)
    with caplog.at_level("ERROR"):
        result = email_service.send_email("a@shop.io", "Subject", "<p>hi</p>")
    assert result is False


def test_send_email_skips_reserved_domains(monkeypatch):
    monkeypatch.setattr(email_service.settings, "RESEND_API_KEY", "re_test")
    calls = []
    monkeypatch.setattr(email_service.resend.Emails, "send", lambda payload: calls.append(payload))
    assert email_service.send_email("a@example.com", "Subject", "<p>hi</p>") is False
    assert email_service.send_email("a@foo.test", "Subject", "<p>hi</p>") is False
    assert calls == []
