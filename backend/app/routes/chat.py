from fastapi import APIRouter, HTTPException, Request

from app.core.config import settings
from app.core.limiter import limiter
from app.models.chat import ChatMessageRequest, ChatResponse
from app.services.chat_services import ProviderBusyError, get_chat_response


router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("/", response_model=ChatResponse)
@limiter.limit(settings.CHAT_IP_RATE_LIMIT)
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
        result = await get_chat_response(
            chat_request.message,
            chat_request.history,
            product_id=chat_request.product_id,
            fit_profile=chat_request.fit_profile.model_dump() if chat_request.fit_profile else None,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ProviderBusyError as error:
        # Free-tier provider limit: an expected state, not a failure.
        raise HTTPException(
            status_code=503,
            detail=str(error),
            headers={"Retry-After": str(error.retry_after)},
        ) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return ChatResponse(
        reply=result.reply,
        products=result.products,
        size_recommendation=result.size_recommendation,
    )
