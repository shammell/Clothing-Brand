from fastapi import APIRouter, HTTPException, Request

from app.core.config import settings
from app.core.limiter import consume_global, limiter
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
@limiter.limit(settings.VISUAL_SEARCH_IP_RATE_LIMIT)
# Anonymous endpoint that forwards to a paid, rate-limited vision model. The global
# caps are charged below, after validation, so junk uploads cannot drain them.
async def search_by_photo(request: Request):
    """Body is the raw image (Content-Type image/jpeg, image/png or image/webp)."""
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG or WebP photo")
    image = await read_limited_body(request)
    if not image:
        raise HTTPException(status_code=400, detail="No photo received")
    consume_global("visual_global_burst", settings.VISUAL_SEARCH_GLOBAL_BURST_RATE_LIMIT)
    consume_global("visual_global_sustained", settings.VISUAL_SEARCH_GLOBAL_SUSTAINED_RATE_LIMIT)
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
