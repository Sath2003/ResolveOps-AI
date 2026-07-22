"""
AI-RCA Service — Structured JSON logging configuration.

Configures Python logging to emit structured JSON lines.
Sensitive fields (credentials, tokens, keys) must never be logged.
"""
import logging
import json
import time
import uuid
from typing import Any


class JsonFormatter(logging.Formatter):
    """Emit log records as single-line JSON objects."""

    # Fields that must never appear in logs
    _REDACTED_KEYS = frozenset(
        {
            "password", "secret", "token", "api_key", "access_key",
            "secret_access_key", "session_token", "authorization",
            "db_password", "smtp_password", "mcp_service_token",
        }
    )

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "service": "ai-rca-service",
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Attach extra fields supplied by the caller
        for key, val in record.__dict__.items():
            if key.startswith("_") or key in logging.LogRecord.__dict__:
                continue
            if key in {
                "args", "exc_info", "exc_text", "msg",
                "levelno", "lineno", "funcName", "filename",
                "module", "pathname", "processName", "process",
                "thread", "threadName", "stack_info",
            }:
                continue
            low = key.lower()
            if any(bad in low for bad in self._REDACTED_KEYS):
                payload[key] = "[REDACTED]"
            else:
                payload[key] = val

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO") -> None:
    """Call once at service startup."""
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove any existing handlers added by uvicorn or pytest
    root.handlers.clear()

    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)

    # Silence noisy third-party loggers
    for noisy in ("botocore", "boto3", "urllib3", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
