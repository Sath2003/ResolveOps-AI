"""
MCP Server Service — Security module.

Validates the X-MCP-Service-Token header on every request.
The MCP server is internal only — not exposed on any public port.
Only AI-RCA service may call it.
"""
import os
import logging
from fastapi import Header, HTTPException, Depends
from typing import Optional

logger = logging.getLogger(__name__)

_MCP_SERVICE_TOKEN = os.getenv("MCP_SERVICE_TOKEN", "")


def verify_service_token(x_mcp_service_token: Optional[str] = Header(default=None)):
    """Require X-MCP-Service-Token on all tool-call endpoints."""
    if not _MCP_SERVICE_TOKEN:
        # Token not configured — allow in dev mode but warn loudly
        if os.getenv("APP_ENV", "dev") != "dev":
            logger.error("MCP_SERVICE_TOKEN not set in production mode")
            raise HTTPException(status_code=503, detail="MCP service token not configured")
        logger.warning("MCP_SERVICE_TOKEN not set — running without auth (dev mode only)")
        return True

    if not x_mcp_service_token:
        raise HTTPException(status_code=401, detail="Missing X-MCP-Service-Token header")

    if x_mcp_service_token != _MCP_SERVICE_TOKEN:
        logger.warning("Invalid MCP service token received")
        raise HTTPException(status_code=401, detail="Invalid service token")

    return True
