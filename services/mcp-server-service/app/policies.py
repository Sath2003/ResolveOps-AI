"""
MCP Server Service — Tool policy (allow-list).

Defines which tools exist, their input schemas, and read-only enforcement.
No write, restart, delete, or remediation tools are permitted.
"""
from __future__ import annotations
import os
from typing import Any, Dict

# ── Allowed tool names ─────────────────────────────────────────────────────────
ALLOWED_TOOLS: frozenset[str] = frozenset(
    {
        "aws_get_ec2_instance_health",
        "aws_get_cloudwatch_log_evidence",
        "aws_get_cloudwatch_metric_evidence",
        "aws_get_cloudtrail_changes",
        "github_get_failed_workflow_evidence",
        "github_get_recent_deployment_change",
        "resolveops_get_incident",
        "resolveops_get_recent_incidents",
        "resolveops_get_service_health",
        "docker_get_service_evidence",
    }
)

# ── Allowed Docker service names ──────────────────────────────────────────────
# Service names are resolved here — the model never specifies arbitrary container IDs.
ALLOWED_DOCKER_SERVICES: frozenset[str] = frozenset(
    filter(
        None,
        os.getenv(
            "ALLOWED_DOCKER_SERVICES",
            "api-gateway-service,ai-rca-service,aws-intelligence-service,"
            "github-intelligence-service,mcp-server-service,docker-evidence-adapter,"
            "frontend,auth-service,notification-service",
        ).split(","),
    )
)

# ── Allowed CloudWatch log groups ─────────────────────────────────────────────
ALLOWED_CLOUDWATCH_LOG_GROUPS: frozenset[str] = frozenset(
    filter(
        None,
        os.getenv("ALLOWED_CLOUDWATCH_LOG_GROUPS", "").split(","),
    )
)

# ── Tool timeout (seconds) ────────────────────────────────────────────────────
TOOL_TIMEOUT_SECONDS: int = int(os.getenv("MCP_TOOL_TIMEOUT_SECONDS", "25"))

# ── Result limits ─────────────────────────────────────────────────────────────
MAX_LOG_CHARACTERS: int = int(os.getenv("MCP_MAX_LOG_CHARACTERS", "15000"))
MAX_EVENTS: int = int(os.getenv("MCP_MAX_EVENTS", "20"))


def validate_tool_name(tool_name: str) -> None:
    """Raise ValueError if the tool is not in the allow-list."""
    if tool_name not in ALLOWED_TOOLS:
        raise ValueError(
            f"Tool '{tool_name}' is not in the allowed tool list. "
            f"Allowed: {sorted(ALLOWED_TOOLS)}"
        )


def validate_docker_service(service_name: str) -> str:
    """
    Resolve a requested service name against the allowed list.
    Raises ValueError if not allowed — never accepts arbitrary container IDs.
    """
    # Strip whitespace and normalise
    name = service_name.strip().lower()
    if name not in {s.lower() for s in ALLOWED_DOCKER_SERVICES}:
        raise ValueError(
            f"Docker service '{service_name}' is not in the allowed service list. "
            "Contact the administrator to add new services."
        )
    return name
