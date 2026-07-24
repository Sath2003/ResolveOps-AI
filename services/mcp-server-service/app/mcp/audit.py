import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("mcp.audit")

_REDACT_KEYS = frozenset(
    {"token", "secret", "password", "key", "api_key", "access_key", "session_token", "pat", "authorization"}
)

def redact_secrets(obj: Any, depth: int = 0) -> Any:
    if depth > 5:
        return obj
    if isinstance(obj, dict):
        return {
            k: "[REDACTED]" if any(r in k.lower() for r in _REDACT_KEYS) else redact_secrets(v, depth + 1)
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [redact_secrets(i, depth + 1) for i in obj]
    return obj

def log_tool_call(
    tool_name: str,
    inputs: Dict[str, Any],
    success: bool,
    duration_ms: float,
    request_id: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    logger.info(
        "MCP tool call",
        extra={
            "tool": tool_name,
            "inputs": redact_secrets(inputs),
            "success": success,
            "duration_ms": round(duration_ms, 2),
            "request_id": request_id,
            "error": error,
        },
    )
