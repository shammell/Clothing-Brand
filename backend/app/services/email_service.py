import logging

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)

# Resend's sandbox sender - works without owning/verifying a domain, but
# only delivers to the Resend account's own verified address until a real
# domain is verified. Swap for a verified domain address before relying on
# delivery to arbitrary recipients in production.
FROM_ADDRESS = "Thread&Co <onboarding@resend.dev>"

# Resend rejects these with a 422; skipping them keeps seed/test accounts out of its logs.
RESERVED_DOMAINS = {"example.com", "example.org", "example.net", "test.com"}


def send_email(to: str, subject: str, html: str) -> bool:
    """Sends an email via Resend. Returns False (and logs) instead of
    raising - a failed notification email must never fail the request that
    triggered it (an order was still placed, a message was still received)
    even if Resend is down or RESEND_API_KEY isn't configured yet."""
    domain = to.rsplit("@", 1)[-1].lower()
    if domain in RESERVED_DOMAINS or domain.endswith((".test", ".invalid", ".example", ".localhost")):
        logger.info("Skipping email to reserved domain %s: %s", domain, subject)
        return False
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set - email to %s not sent: %s", to, subject)
        return False
    resend.api_key = settings.RESEND_API_KEY
    try:
        resend.Emails.send({"from": FROM_ADDRESS, "to": to, "subject": subject, "html": html})
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False
