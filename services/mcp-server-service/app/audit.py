"""
MCP Server Service — Structured audit logging.

Every tool call is logged with: tool_name, inputs (redacted), success, duration,
calling service. Sensitive values are redacted before logging.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("mcp.audit")

_REDACT_KEYS = frozenset(
    {"token", "secret", "password", "key", "api_key", "access_key", "session_token"}
)


def _redact(obj: Any, depth: int = 0) -> Any:
    if depth > 5:
        return obj
    if isinstance(obj, dict):
        return {
            k: "[REDACTED]" if any(r in k.lower() for r in _REDACT_KEYS) else _redact(v, depth + 1)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact(i, depth + 1) for i in obj]
    return obj


def log_tool_call(
    *,
    tool_name: str,
    inputs: Dict[str, Any],
    success: bool,
    duration_ms: int,
    request_id: Optional[str],
    error: Optional[str] = None,
) -> None:
    logger.info(
        "MCP tool call",
        extra={
            "tool": tool_name,
            "inputs": _redact(inputs),
            "success": success,
            "duration_ms": duration_ms,
            "request_id": request_id,
            "error": error,
        },
    )
