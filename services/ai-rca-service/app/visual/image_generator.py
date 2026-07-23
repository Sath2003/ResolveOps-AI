"""
Image Generator — ResolveOps AI.

Calls OpenAI DALL-E 3 to generate architecture images from a validated prompt.
Saves the result to the configured storage backend.
Returns a VisualMetadata record (never the raw base64 string or API key).

Security:
  - OPENAI_API_KEY is read from settings only; never logged or returned.
  - Storage paths are not exposed in API responses.
  - File names are random UUIDs (non-guessable).
  - MIME type is set by the server, not the requester.
"""
from __future__ import annotations

import base64
import logging
import os
import time
import uuid
from typing import Optional

from app.settings import settings
from app.visual.schemas import VisualMetadata, VisualStatus

logger = logging.getLogger(__name__)

# ── Storage configuration ─────────────────────────────────────────────────────
_VISUALS_DIR = os.getenv("VISUAL_STORAGE_DIR", "/app/data/visuals")


def _ensure_storage_dir() -> None:
    os.makedirs(_VISUALS_DIR, exist_ok=True)


def _get_openai_client():
    """Lazy singleton for the OpenAI client.  Key is read from settings only."""
    from openai import OpenAI  # type: ignore
    return OpenAI(api_key=settings.OPENAI_API_KEY)


async def generate_and_store_image(
    image_prompt: str,
    visual_id: str,
    request_id: str,
    session_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    original_message: str = "",
    title: str = "",
) -> VisualMetadata:
    """
    Generate an image via DALL-E 3 and persist it to local storage.

    Args:
        image_prompt: The fully constructed image generation prompt.
        visual_id: Pre-allocated unique ID for this visual.
        request_id: Current request ID for logging.
        session_id: Chat session ID.
        tenant_id: User tenant ID.
        original_message: Original user message (for metadata only).
        title: Visual title (for metadata only).

    Returns:
        VisualMetadata with status=READY on success, status=FAILED on error.
    """
    _ensure_storage_dir()

    model = settings.OPENAI_IMAGE_MODEL
    quality = settings.OPENAI_IMAGE_QUALITY
    size = settings.OPENAI_IMAGE_SIZE

    meta = VisualMetadata(
        visual_id=visual_id,
        session_id=session_id,
        tenant_id=tenant_id,
        request_id=request_id,
        original_message=original_message[:500],  # cap length in metadata
        title=title,
        render_engine="image",
        status=VisualStatus.GENERATING,
        mime_type="image/png",
        width=int(size.split("x")[0]) if "x" in size else 1792,
        height=int(size.split("x")[1]) if "x" in size else 1024,
        created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    logger.info(
        "visual_generation_stage",
        extra={
            "request_id": request_id,
            "visual_id": visual_id,
            "stage": "visual_generation_init",
            "status": "started",
            "model": model,
            "quality": quality,
            "size": size,
        },
    )

    if not settings.VISUAL_GENERATION_ENABLED:
        logger.info(
            "visual_generation_stage",
            extra={
                "request_id": request_id,
                "visual_id": visual_id,
                "stage": "visual_generation_disabled",
                "status": "failed",
            },
        )
        meta.status = VisualStatus.FAILED
        meta.error_code = "visual_generation_disabled"
        return meta

    if not settings.OPENAI_API_KEY:
        logger.error(
            "visual_generation_stage",
            extra={
                "request_id": request_id,
                "visual_id": visual_id,
                "stage": "check_api_key",
                "status": "failed",
                "error": "OPENAI_API_KEY not set",
            },
        )
        meta.status = VisualStatus.FAILED
        meta.error_code = "missing_api_key"
        return meta

    start_time = time.monotonic()

    try:
        import asyncio
        client = _get_openai_client()

        logger.info(
            "visual_generation_stage",
            extra={
                "request_id": request_id,
                "visual_id": visual_id,
                "stage": "image_provider_request",
                "status": "started",
                "model": model,
                "prompt_length": len(image_prompt),
            },
        )

        response = await asyncio.wait_for(
            asyncio.to_thread(
                _call_dalle,
                client=client,
                prompt=image_prompt,
                model=model,
                quality=quality,
                size=size,
                request_id=request_id,
                visual_id=visual_id,
            ),
            timeout=settings.VISUAL_GENERATION_TIMEOUT_SECONDS,
        )

        if response is None:
            raise ValueError("Empty response or null data returned from OpenAI Image API")

        logger.info(
            "visual_generation_stage",
            extra={
                "request_id": request_id,
                "visual_id": visual_id,
                "stage": "image_provider_response",
                "status": "success",
                "bytes_received": len(response),
            },
        )

        # Decode and save to disk
        filename = f"{visual_id}.png"
        file_path = os.path.join(_VISUALS_DIR, filename)

        logger.info(
            "visual_generation_stage",
            extra={
                "request_id": request_id,
                "visual_id": visual_id,
                "stage": "image_storage_save",
                "status": "started",
                "target_path": file_path,
            },
        )

        with open(file_path, "wb") as f:
            f.write(response)

        elapsed = round(time.monotonic() - start_time, 2)
        logger.info(
            "visual_generation_stage",
            extra={
                "request_id": request_id,
                "visual_id": visual_id,
                "stage": "image_storage_save",
                "status": "success",
                "duration_seconds": elapsed,
                "size_bytes": len(response),
                "file_path": file_path,
            },
        )

        meta.status = VisualStatus.READY
        meta.storage_path = file_path
        meta.url_path = f"/api/visuals/{visual_id}"
        return meta

    except asyncio.TimeoutError:
        logger.error(
            "visual_generation_stage",
            extra={
                "request_id": request_id,
                "visual_id": visual_id,
                "stage": "image_provider_request",
                "status": "failed",
                "error_code": "generation_timeout",
                "timeout_seconds": settings.VISUAL_GENERATION_TIMEOUT_SECONDS,
            },
        )
        meta.status = VisualStatus.FAILED
        meta.error_code = "generation_timeout"
        return meta

    except Exception as exc:
        error_type = type(exc).__name__
        error_msg = str(exc)
        error_code = _classify_openai_error(exc)
        logger.error(
            "visual_generation_stage",
            extra={
                "request_id": request_id,
                "visual_id": visual_id,
                "stage": "image_provider_request",
                "status": "failed",
                "error_type": error_type,
                "error_message": error_msg,
                "error_code": error_code,
            },
        )
        meta.status = VisualStatus.FAILED
        meta.error_code = f"{error_code}: {error_type} - {error_msg}"
        return meta


def _call_dalle(
    client,
    prompt: str,
    model: str,
    quality: str,
    size: str,
    request_id: str = "",
    visual_id: str = "",
) -> Optional[bytes]:
    """Synchronous DALL-E call (run in thread). Returns raw PNG bytes or None."""
    logger.info(
        "visual_generation_stage",
        extra={
            "request_id": request_id,
            "visual_id": visual_id,
            "stage": "dalle_sdk_invoke",
            "status": "executing",
            "model": model,
        },
    )
    response = client.images.generate(
        model=model,
        prompt=prompt,
        size=size,
        quality=quality,
        response_format="b64_json",
        n=1,
    )
    if response.data:
        b64_data = response.data[0].b64_json
        if b64_data:
            return base64.b64decode(b64_data)
    return None


def _classify_openai_error(exc: Exception) -> str:
    """Map OpenAI exceptions to safe error codes without exposing raw messages."""
    exc_str = type(exc).__name__.lower()
    exc_msg = str(exc).lower()

    if "content_policy" in exc_msg or "safety" in exc_msg or "violated" in exc_msg:
        return "content_policy_rejection"
    if "rate_limit" in exc_msg or "ratelimit" in exc_str:
        return "rate_limit_exceeded"
    if "quota" in exc_msg or "billing" in exc_msg:
        return "quota_exceeded"
    if "timeout" in exc_str or "timeout" in exc_msg:
        return "provider_timeout"
    if "authentication" in exc_msg or "invalid_api_key" in exc_msg:
        return "invalid_api_key"
    if "connection" in exc_str:
        return "provider_connection_error"
    return "image_generation_failed"


def get_stored_image_path(visual_id: str) -> Optional[str]:
    """
    Return the filesystem path for a stored visual, or None if not found.
    Validates that the path stays within VISUALS_DIR (prevents traversal).
    """
    # Sanitize: only allow alphanumeric + hyphens in visual_id
    safe_id = "".join(c for c in visual_id if c.isalnum() or c == "-")
    if safe_id != visual_id:
        logger.warning("Invalid visual_id rejected", extra={"visual_id": visual_id[:50]})
        return None

    file_path = os.path.join(_VISUALS_DIR, f"{safe_id}.png")
    # Verify the resolved path is still inside VISUALS_DIR
    real_visuals = os.path.realpath(_VISUALS_DIR)
    real_file = os.path.realpath(file_path)
    if not real_file.startswith(real_visuals):
        logger.error("Path traversal attempt blocked", extra={"visual_id": visual_id})
        return None

    if os.path.isfile(file_path):
        return file_path
    return None
