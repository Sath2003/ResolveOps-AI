"""
AI-RCA Service — Structured error definitions.

All provider-specific exceptions are translated here into internal codes.
Raw provider errors must never reach the frontend.
"""
from __future__ import annotations

import uuid
from typing import Optional


# ── Error Codes ───────────────────────────────────────────────────────────────

class ErrorCode:
    AI_PROVIDER_UNAVAILABLE = "AI_PROVIDER_UNAVAILABLE"
    AI_PROVIDER_QUOTA_EXCEEDED = "AI_PROVIDER_QUOTA_EXCEEDED"
    AI_PROVIDER_RATE_LIMITED = "AI_PROVIDER_RATE_LIMITED"
    AI_PROVIDER_ACCESS_DENIED = "AI_PROVIDER_ACCESS_DENIED"
    AI_PROVIDER_CONFIGURATION_ERROR = "AI_PROVIDER_CONFIGURATION_ERROR"
    AI_RESPONSE_INVALID = "AI_RESPONSE_INVALID"
    MCP_SERVER_UNAVAILABLE = "MCP_SERVER_UNAVAILABLE"
    RAG_RETRIEVAL_UNAVAILABLE = "RAG_RETRIEVAL_UNAVAILABLE"
    INVESTIGATION_TIMEOUT = "INVESTIGATION_TIMEOUT"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"
    INTERNAL_SERVICE_ERROR = "INTERNAL_SERVICE_ERROR"


# ── User-safe messages ────────────────────────────────────────────────────────

_USER_MESSAGES: dict[str, str] = {
    ErrorCode.AI_PROVIDER_UNAVAILABLE: (
        "The AI analysis service is temporarily unavailable. "
        "Please retry in a few moments."
    ),
    ErrorCode.AI_PROVIDER_QUOTA_EXCEEDED: (
        "The AI service is temporarily unavailable because the configured "
        "provider quota has been reached. Please retry later or contact the administrator."
    ),
    ErrorCode.AI_PROVIDER_RATE_LIMITED: (
        "The AI service is temporarily rate-limited. Please wait a moment and retry."
    ),
    ErrorCode.AI_PROVIDER_ACCESS_DENIED: (
        "The AI service cannot process this request due to an access configuration "
        "issue. Please contact the administrator."
    ),
    ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR: (
        "The OpenAI provider is not configured correctly."
    ),
    ErrorCode.AI_RESPONSE_INVALID: (
        "The AI service returned an unexpected response. Please retry."
    ),
    ErrorCode.MCP_SERVER_UNAVAILABLE: (
        "The evidence collection layer is temporarily unavailable. "
        "Some live evidence may be missing from this investigation."
    ),
    ErrorCode.RAG_RETRIEVAL_UNAVAILABLE: (
        "Historical evidence retrieval is temporarily unavailable. "
        "The analysis will proceed with available live evidence only."
    ),
    ErrorCode.INVESTIGATION_TIMEOUT: (
        "The investigation took longer than expected and was stopped. "
        "Please retry with a narrower time window or fewer services."
    ),
    ErrorCode.INSUFFICIENT_EVIDENCE: (
        "The investigation did not collect enough evidence to generate "
        "a confident root-cause analysis. Manual investigation is recommended."
    ),
    ErrorCode.INTERNAL_SERVICE_ERROR: (
        "An unexpected internal error occurred. Please retry. "
        "If the issue persists, contact the administrator."
    ),
}

# ── Retryable errors ──────────────────────────────────────────────────────────

_RETRYABLE: set[str] = {
    ErrorCode.AI_PROVIDER_UNAVAILABLE,
    ErrorCode.AI_PROVIDER_RATE_LIMITED,
    ErrorCode.MCP_SERVER_UNAVAILABLE,
    ErrorCode.RAG_RETRIEVAL_UNAVAILABLE,
    ErrorCode.INVESTIGATION_TIMEOUT,
    ErrorCode.INTERNAL_SERVICE_ERROR,
}


# ── Error response builder ────────────────────────────────────────────────────

def build_error_response(
    code: str,
    request_id: Optional[str] = None,
    technical_detail: Optional[str] = None,
) -> dict:
    """
    Build a safe, user-facing error response.

    - ``code`` maps to a user-safe message.
    - ``technical_detail`` is NOT included in the response; it should be logged.
    - A ``request_id`` is generated if not provided.
    """
    rid = request_id or str(uuid.uuid4())
    return {
        "status": "error",
        "error": {
            "code": code,
            "message": _USER_MESSAGES.get(code, _USER_MESSAGES[ErrorCode.INTERNAL_SERVICE_ERROR]),
            "retryable": code in _RETRYABLE,
            "request_id": rid,
        },
    }


def classify_provider_exception(exc: Exception) -> str:
    """
    Translate a provider-specific exception into an internal error code.
    The raw exception is NOT propagated to the caller.
    """
    exc_str = str(exc).lower()
    exc_type = type(exc).__name__

    # OpenAI / HTTP quota errors
    if "insufficient_quota" in exc_str or "quota" in exc_str:
        return ErrorCode.AI_PROVIDER_QUOTA_EXCEEDED
    if "rate" in exc_str and "limit" in exc_str:
        return ErrorCode.AI_PROVIDER_RATE_LIMITED
    if "401" in exc_str or "unauthorized" in exc_str or "invalid api key" in exc_str:
        return ErrorCode.AI_PROVIDER_ACCESS_DENIED
    if "403" in exc_str or "access denied" in exc_str or "accessdeniedexception" in exc_type.lower():
        return ErrorCode.AI_PROVIDER_ACCESS_DENIED
    if "429" in exc_str or "throttl" in exc_str:
        return ErrorCode.AI_PROVIDER_RATE_LIMITED
    if "timeout" in exc_str or "timed out" in exc_str:
        return ErrorCode.AI_PROVIDER_UNAVAILABLE
    if "connection" in exc_str or "connect" in exc_str:
        return ErrorCode.AI_PROVIDER_UNAVAILABLE
    if "validationerror" in exc_type.lower() or "invalid model" in exc_str:
        return ErrorCode.AI_PROVIDER_CONFIGURATION_ERROR
    if "json" in exc_str or "parse" in exc_str:
        return ErrorCode.AI_RESPONSE_INVALID

    return ErrorCode.INTERNAL_SERVICE_ERROR
