"""
MCP Server Service — Docker evidence tool.

Calls the docker-evidence-adapter (which has Docker socket access).
MCP Server itself NEVER has Docker socket access.
Docker socket is mounted ONLY in docker-evidence-adapter.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional
import datetime

import httpx

from app.policies import validate_docker_service

logger = logging.getLogger(__name__)
_DOCKER_ADAPTER_URL = os.getenv("DOCKER_EVIDENCE_ADAPTER_URL", "http://docker-evidence-adapter:8000")
_TIMEOUT = 20


async def docker_get_service_evidence(
    service_name: Optional[str] = None,
    tail_lines: int = 50,
    **_: Any,
) -> Dict[str, Any]:
    """
    Retrieve recent logs and status for an allowed Docker Compose service.
    Service name is validated against the allow-list before being forwarded.
    Container IDs are never accepted directly.
    """
    if not service_name:
        return {"evidence": [], "error": "service_name is required"}

    try:
        # Validate against allow-list — raises ValueError for unknown services
        resolved_name = validate_docker_service(service_name)
    except ValueError as exc:
        return {"evidence": [], "error": str(exc)}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{_DOCKER_ADAPTER_URL}/api/v1/docker/service/evidence",
                params={"service_name": resolved_name, "tail_lines": min(tail_lines, 100)},
            )
            if resp.status_code == 404:
                return {"evidence": [], "error": f"Service '{resolved_name}' not found or not running"}
            if resp.status_code != 200:
                return {"evidence": [], "error": f"Docker adapter returned {resp.status_code}"}

            data = resp.json()
            evidence = []
            if data.get("status"):
                evidence.append({
                    "source": "docker",
                    "resource": resolved_name,
                    "evidence_type": "container_status",
                    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                    "summary": (
                        f"Service '{resolved_name}' status={data['status']} "
                        f"image={data.get('image', 'unknown')} "
                        f"uptime={data.get('uptime', 'unknown')}"
                    ),
                    "is_live": True,
                })
            if data.get("logs"):
                log_text = "\n".join(data["logs"][-50:])
                evidence.append({
                    "source": "docker",
                    "resource": resolved_name,
                    "evidence_type": "container_logs",
                    "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
                    "summary": f"Recent logs for '{resolved_name}' ({len(data['logs'])} lines)",
                    "is_live": True,
                    "raw_preview": log_text[:1000],
                })
            return {"evidence": evidence}
    except Exception as exc:
        logger.warning("docker_get_service_evidence failed", extra={"exc": type(exc).__name__, "service": service_name})
        return {"evidence": [], "error": f"Docker evidence unavailable: {type(exc).__name__}"}
