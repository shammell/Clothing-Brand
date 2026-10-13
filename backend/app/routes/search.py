from fastapi import APIRouter, HTTPException, Request

from app.core.config import settings
from app.core.limiter import limiter
from app.models.search import VisualSearchResponse
from app.services.visual_search import (
    ALLOWED_TYPES,
    MAX_IMAGE_BYTES,
    ProviderBusyError,
    ProviderRequestError,
    UnreadablePhotoError,
    visual_search,
)

router = APIRouter(prefix="/search", tags=["Search"])


async def read_limited_body(request: Request) -> bytes:
    """Read the request body, refusing to buffer more than the image cap."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="That photo is too large (4 MB max)")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="That photo is too large (4 MB max)")
    return bytes(body)


@router.post("/visual", response_model=VisualSearchResponse)
@limiter.limit("5/minute")
# Anonymous endpoint that forwards to a paid, rate-limited vision model, so it
# carries the same two global caps as /chat/ (constant key, not per-IP).
@limiter.shared_limit(settings.VISUAL_SEARCH_GLOBAL_BURST_RATE_LIMIT, scope="visual_global_burst", key_func=lambda: "global")
@limiter.shared_limit(settings.VISUAL_SEARCH_GLOBAL_SUSTAINED_RATE_LIMIT, scope="visual_global_sustained", key_func=lambda: "global")
async def search_by_photo(request: Request):
    """Body is the raw image (Content-Type image/jpeg, image/png or image/webp)."""
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG or WebP photo")
    image = await read_limited_body(request)
    if not image:
        raise HTTPException(status_code=400, detail="No photo received")
    try:
        attributes, results = await visual_search(image, content_type)
    except UnreadablePhotoError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ProviderBusyError as error:
        raise HTTPException(
            status_code=503,
            detail="Photo search is busy, try again shortly",
            headers={"Retry-After": str(error.retry_after)},
        ) from error
    except (ProviderRequestError, RuntimeError) as error:
        raise HTTPException(status_code=502, detail="Photo search is unavailable right now") from error
    return VisualSearchResponse(attributes=attributes, results=results)
