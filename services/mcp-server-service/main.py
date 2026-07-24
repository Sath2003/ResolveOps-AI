"""
MCP Server Service — FastAPI entrypoint.

Internal-only microservice providing Model Context Protocol (MCP) tool execution.
All tool invocations are read-only, audited, and authenticated via service token.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.audit import log_tool_call
from app.policies import ALLOWED_TOOLS, validate_tool_name
from app.security import verify_service_token
from app.tools.aws_tools import (
    aws_get_cloudtrail_changes,
    aws_get_cloudwatch_log_evidence,
    aws_get_cloudwatch_metric_evidence,
    aws_get_ec2_instance_health,
)
from app.tools.docker_tools import docker_get_service_evidence
from app.tools.github_tools import (
    github_get_failed_workflow_evidence,
    github_get_recent_deployment_change,
)
from app.tools.resolveops_tools import (
    resolveops_get_incident,
    resolveops_get_recent_incidents,
    resolveops_get_service_health,
)

# FastMCP imports
from app.mcp.server import fastmcp_asgi_app
from app.mcp.auth import verify_mcp_auth

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mcp-server")

app = FastAPI(title="mcp-server-service", version="1.0.0")

# Security middleware for standards-compliant FastMCP endpoints mounted at /mcp
@app.middleware("http")
async def mcp_auth_middleware(request: Request, call_next):
    if request.url.path.startswith("/mcp"):
        try:
            await verify_mcp_auth(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)

# Mount FastMCP under /mcp
app.mount("/mcp", fastmcp_asgi_app)


# Dispatch map: tool_name -> async function
TOOL_DISPATCH = {
    "aws_get_ec2_instance_health": aws_get_ec2_instance_health,
    "aws_get_cloudwatch_log_evidence": aws_get_cloudwatch_log_evidence,
    "aws_get_cloudwatch_metric_evidence": aws_get_cloudwatch_metric_evidence,
    "aws_get_cloudtrail_changes": aws_get_cloudtrail_changes,
    "github_get_failed_workflow_evidence": github_get_failed_workflow_evidence,
    "github_get_recent_deployment_change": github_get_recent_deployment_change,
    "resolveops_get_incident": resolveops_get_incident,
    "resolveops_get_recent_incidents": resolveops_get_recent_incidents,
    "resolveops_get_service_health": resolveops_get_service_health,
    "docker_get_service_evidence": docker_get_service_evidence,
}


class ToolCallRequest(BaseModel):
    tool: str = Field(..., description="Tool name from allowed list")
    arguments: Dict[str, Any] = Field(default_factory=dict)
    request_id: Optional[str] = None


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "mcp-server-service",
        "allowed_tools_count": len(ALLOWED_TOOLS),
    }


@app.get("/tools/list", dependencies=[Depends(verify_service_token)])
def list_tools():
    """List available read-only MCP tools."""
    return {"tools": list(ALLOWED_TOOLS)}


@app.post("/tools/call", dependencies=[Depends(verify_service_token)])
async def call_tool(req: ToolCallRequest):
    """Execute a single read-only MCP tool."""
    tool_name = req.tool
    inputs = req.arguments or {}
    request_id = req.request_id

    # Validate against policy allow-list
    try:
        validate_tool_name(tool_name)
    except ValueError as val_err:
        log_tool_call(
            tool_name=tool_name,
            inputs=inputs,
            success=False,
            duration_ms=0,
            request_id=request_id,
            error=str(val_err),
        )
        raise HTTPException(status_code=403, detail=str(val_err))

    fn = TOOL_DISPATCH.get(tool_name)
    if not fn:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not implemented.")

    start_time = time.monotonic()
    try:
        result = await fn(**inputs)
        elapsed_ms = int((time.monotonic() - start_time) * 1000)

        log_tool_call(
            tool_name=tool_name,
            inputs=inputs,
            success=True,
            duration_ms=elapsed_ms,
            request_id=request_id,
        )

        return {
            "tool": tool_name,
            "success": True,
            "duration_ms": elapsed_ms,
            **result,
        }

    except Exception as exc:
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        logger.error(
            "MCP tool execution crashed",
            extra={"tool": tool_name, "request_id": request_id, "exc": type(exc).__name__},
        )
        log_tool_call(
            tool_name=tool_name,
            inputs=inputs,
            success=False,
            duration_ms=elapsed_ms,
            request_id=request_id,
            error=f"{type(exc).__name__}: {str(exc)}",
        )
        return JSONResponse(
            status_code=200,
            content={
                "tool": tool_name,
                "success": False,
                "duration_ms": elapsed_ms,
                "evidence": [],
                "error": f"Tool execution failed: {type(exc).__name__}",
            },
        )
