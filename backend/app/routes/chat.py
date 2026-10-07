from fastapi import APIRouter, HTTPException, Request

from app.core.config import settings
from app.core.limiter import limiter
from app.models.chat import ChatMessageRequest, ChatResponse
from app.services.chat_services import get_chat_response


router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/", response_model=ChatResponse)
@limiter.limit("15/minute")
# This endpoint is intentionally unauthenticated (anonymous visitors should be
# able to ask the style assistant before creating an account) and forwards
# every call to a paid Groq API request. The per-IP limit above stops any one
# IP from exceeding 15/min, but two global caps bound the worst case where
# that's bypassed with a handful of proxy IPs - see CHAT_GLOBAL_BURST_RATE_LIMIT
# and CHAT_GLOBAL_SUSTAINED_RATE_LIMIT in config.py for why it's two windows,
# not one.
# key_func must return a constant, not the default remote-address lookup -
# without it these decorators are keyed per-IP too, making them a strictly
# looser duplicate of the limit above that never actually triggers: a
# security-control no-op, not a global cap.
@limiter.shared_limit(settings.CHAT_GLOBAL_BURST_RATE_LIMIT, scope="chat_global_burst", key_func=lambda: "global")
@limiter.shared_limit(settings.CHAT_GLOBAL_SUSTAINED_RATE_LIMIT, scope="chat_global_sustained", key_func=lambda: "global")
async def chat(request: Request, chat_request: ChatMessageRequest):
    try:
        reply = await get_chat_response(chat_request.message, chat_request.history)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return ChatResponse(reply=reply)
