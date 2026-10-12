import html as html_lib

from fastapi import APIRouter, BackgroundTasks, Request, status

from app.core.limiter import limiter
from app.models.contact import ContactMessage
from app.services.email_service import send_email

router = APIRouter(prefix="/contact", tags=["Contact"])

# Replace with the real inbox once a verified sending domain is in place
# (see email_service.py's FROM_ADDRESS note).
SUPPORT_INBOX = "onboarding@resend.dev"


def sanitize_subject(value: str) -> str:
    # Strips CR/LF before the string ever reaches an email subject - even
    # though Resend's API is JSON, not raw SMTP, defense-in-depth against
    # header injection is cheap enough not to rely solely on the downstream
    # provider never treating a raw string as header text.
    return value.replace("\r", "").replace("\n", "")


@router.post("/", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def submit_contact_message(request: Request, message: ContactMessage, background_tasks: BackgroundTasks):
    # Backgrounded - see orders.py's create_order for why send_email is
    # never called inline from an async handler.
    background_tasks.add_task(
        send_email,
        to=SUPPORT_INBOX,
        subject=f"Contact form: {sanitize_subject(message.name)}",
        html=(
            f"<p>From: {html_lib.escape(message.name)} ({html_lib.escape(str(message.email))})</p>"
            f"<p>{html_lib.escape(message.message)}</p>"
        ),
    )
    return {"status": "received"}
