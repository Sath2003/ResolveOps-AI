"""
AI-RCA Service — MCP Client.

The AI-RCA service is the ONLY MCP client.  It calls MCP Server over
internal HTTP using a service token.  The API Gateway never calls MCP directly.

All tool names and inputs are validated against the allowed-tool list before
being sent to the MCP Server.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from app.settings import settings
from app.errors import ErrorCode, build_error_response

logger = logging.getLogger(__name__)

# Tools the AI-RCA orchestrator is allowed to call.
# The MCP server enforces this again on its side.
ALLOWED_TOOLS: frozenset[str] = frozenset(
    {
        # AWS Intelligence
        "aws_get_ec2_instance_health",
        "aws_get_cloudwatch_log_evidence",
        "aws_get_cloudwatch_metric_evidence",
        "aws_get_cloudtrail_changes",
        # GitHub Intelligence
        "github_get_failed_workflow_evidence",
        "github_get_recent_deployment_change",
        # ResolveOps Internal
        "resolveops_get_incident",
        "resolveops_get_recent_incidents",
        "resolveops_get_service_health",
        # Docker Evidence
        "docker_get_service_evidence",
    }
)


class MCPClientError(Exception):
    """Raised when the MCP server returns an error or is unreachable."""
    def __init__(self, error_code: str, message: str) -> None:
        self.error_code = error_code
        super().__init__(message)


class MCPClient:
    """HTTP client for the internal MCP Server."""

    def __init__(self) -> None:
        headers: Dict[str, str] = {"Content-Type": "application/json"}
        if settings.MCP_SERVICE_TOKEN:
            headers["X-MCP-Service-Token"] = settings.MCP_SERVICE_TOKEN

        self._http = httpx.AsyncClient(
            base_url=settings.MCP_SERVER_URL,
            headers=headers,
            timeout=settings.MCP_REQUEST_TIMEOUT_SECONDS,
        )

    async def call_tool(
        self,
        tool_name: str,
        inputs: Dict[str, Any],
        request_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Call a single MCP tool and return its structured evidence output.

        Raises MCPClientError on tool rejection or server error.
        """
        if tool_name not in ALLOWED_TOOLS:
            raise MCPClientError(
                ErrorCode.INTERNAL_SERVICE_ERROR,
                f"Tool '{tool_name}' is not in the allowed tool list.",
            )

        start = time.monotonic()
        try:
            resp = await self._http.post(
                "/tools/call",
                json={"tool": tool_name, "arguments": inputs, "request_id": request_id},
            )
            elapsed_ms = int((time.monotonic() - start) * 1000)

            if resp.status_code == 200:
                data = resp.json()
                logger.info(
                    "MCP tool call succeeded",
                    extra={
                        "tool": tool_name,
                        "duration_ms": elapsed_ms,
                        "request_id": request_id,
                    },
                )
                return data

            elif resp.status_code == 401:
                raise MCPClientError(ErrorCode.MCP_SERVER_UNAVAILABLE, "MCP auth failed")
            elif resp.status_code == 403:
                raise MCPClientError(ErrorCode.INTERNAL_SERVICE_ERROR, f"Tool '{tool_name}' denied by MCP policy")
            else:
                detail = resp.text[:200]
                raise MCPClientError(
                    ErrorCode.MCP_SERVER_UNAVAILABLE,
                    f"MCP returned {resp.status_code}: {detail}",
                )

        except httpx.TimeoutException:
            raise MCPClientError(
                ErrorCode.MCP_SERVER_UNAVAILABLE,
                f"MCP server timed out calling '{tool_name}'",
            )
        except httpx.RequestError as exc:
            raise MCPClientError(
                ErrorCode.MCP_SERVER_UNAVAILABLE,
                f"Cannot reach MCP server: {type(exc).__name__}",
            )

    async def list_tools(self) -> List[str]:
        """Return the list of available tools from the MCP server."""
        try:
            resp = await self._http.get("/tools/list")
            if resp.status_code == 200:
                return resp.json().get("tools", [])
        except Exception:
            pass
        return []

    async def health(self) -> Dict[str, Any]:
        """Check MCP server health — never raises."""
        try:
            resp = await self._http.get("/health", timeout=5)
            if resp.status_code == 200:
                return {"status": "available", "url": settings.MCP_SERVER_URL}
        except Exception as exc:
            logger.warning(
                "MCP health check failed",
                extra={"exc_type": type(exc).__name__},
            )
        return {"status": "unavailable", "url": settings.MCP_SERVER_URL}

    async def close(self) -> None:
        await self._http.aclose()


# Module-level singleton — shared across all requests
mcp_client = MCPClient()
