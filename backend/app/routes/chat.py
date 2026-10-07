from fastapi import APIRouter, HTTPException, Request

from app.core.limiter import limiter
from app.models.chat import ChatMessageRequest, ChatResponse
from app.services.chat_services import get_chat_response


router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/", response_model=ChatResponse)
@limiter.limit("15/minute")
# This endpoint is intentionally unauthenticated (anonymous visitors should be
# able to ask the style assistant before creating an account) and forwards
# every call to a paid Groq API request. The per-IP limit above is trivial to
# bypass with multiple IPs/proxies, so this shared limit caps total spend
# across ALL callers combined as a hard ceiling, independent of IP.
@limiter.shared_limit("120/minute", scope="chat_global")
async def chat(request: Request, chat_request: ChatMessageRequest):
    try:
        reply = await get_chat_response(chat_request.message, chat_request.history)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return ChatResponse(reply=reply)
