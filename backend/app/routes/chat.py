from fastapi import APIRouter, HTTPException, Request

from app.core.limiter import limiter
from app.models.chat import ChatMessageRequest, ChatResponse
from app.services.chat_services import get_chat_response


router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/", response_model=ChatResponse)
@limiter.limit("15/minute")
async def chat(request: Request, chat_request: ChatMessageRequest):
    try:
        reply = await get_chat_response(chat_request.message, chat_request.history)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return ChatResponse(reply=reply)
