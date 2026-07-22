"""
Docker Evidence Adapter — FastAPI entrypoint.

The ONLY container with access to the Docker UNIX socket (/var/run/docker.sock).
Performs strict container allow-listing before reading logs or status.
All operations are strictly READ-ONLY. No start/stop/restart/delete allowed.
"""
from __future__ import annotations

import logging
import os
import re
from typing import List, Optional

import docker
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("docker-evidence-adapter")

app = FastAPI(title="docker-evidence-adapter", version="1.0.0")

# Allowed service names (env-var configurable)
_ALLOWED_SERVICES_RAW = os.getenv(
    "ALLOWED_DOCKER_SERVICES",
    "api-gateway-service,ai-rca-service,aws-intelligence-service,"
    "github-intelligence-service,mcp-server-service,docker-evidence-adapter,"
    "frontend,auth-service,notification-service",
)
ALLOWED_SERVICES = frozenset(s.strip().lower() for s in _ALLOWED_SERVICES_RAW.split(",") if s.strip())

_docker_client = None


def get_docker_client():
    global _docker_client
    if _docker_client is None:
        try:
            _docker_client = docker.from_env(timeout=10)
        except Exception as exc:
            logger.error(f"Failed to connect to Docker socket: {exc}")
            raise HTTPException(
                status_code=503,
                detail="Docker socket unavailable on host.",
            )
    return _docker_client


def validate_service_name(service_name: str) -> str:
    name = service_name.strip().lower()

    # Reject container IDs (hex strings, long hashes)
    if re.match(r"^[0-9a-f]{12,64}$", name):
        raise HTTPException(
            status_code=403,
            detail="Direct container ID access is disallowed. Use allowed service names.",
        )

    if name not in ALLOWED_SERVICES:
        raise HTTPException(
            status_code=403,
            detail=f"Service '{service_name}' is not in the allowed service list.",
        )

    return name


@app.get("/health")
def health_check():
    client_status = "connected"
    try:
        get_docker_client().ping()
    except Exception:
        client_status = "disconnected"

    return {
        "status": "healthy" if client_status == "connected" else "degraded",
        "service": "docker-evidence-adapter",
        "docker_socket": client_status,
        "allowed_services_count": len(ALLOWED_SERVICES),
    }


@app.get("/api/v1/docker/service/evidence")
def get_service_evidence(
    service_name: str = Query(..., description="Allowed service name"),
    tail_lines: int = Query(50, ge=1, le=200),
):
    """
    Fetch read-only logs and container status for an allowed Docker service.
    """
    name = validate_service_name(service_name)
    client = get_docker_client()

    try:
        containers = client.containers.list(all=True)
        # Match by service label or container name
        target = None
        for c in containers:
            c_name = c.name.lower()
            labels = c.labels or {}
            compose_service = labels.get("com.docker.compose.service", "").lower()

            if name in c_name or name == compose_service:
                target = c
                break

        if not target:
            raise HTTPException(status_code=404, detail=f"Container for service '{name}' not found.")

        # Read logs (read-only)
        logs_bytes = target.logs(stdout=True, stderr=True, tail=tail_lines)
        logs_str = logs_bytes.decode("utf-8", errors="replace")
        log_lines = [line for line in logs_str.splitlines() if line.strip()]

        # Redact any accidental tokens in logs
        sanitised_lines = []
        for line in log_lines:
            line_clean = re.sub(
                r"(?:password|secret|token|key)\s*[:=]\s*[\"']?([^\s\"']{8,})[\"']?",
                "[REDACTED]",
                line,
                flags=re.IGNORECASE,
            )
            sanitised_lines.append(line_clean)

        stats_summary = {
            "status": target.status,
            "created": target.attrs.get("Created"),
            "image": target.image.tags[0] if target.image.tags else str(target.image.id)[:12],
            "uptime": target.attrs.get("State", {}).get("StartedAt"),
        }

        return {
            "service_name": name,
            "container_name": target.name,
            "status": target.status,
            "image": stats_summary["image"],
            "uptime": stats_summary["uptime"],
            "logs": sanitised_lines,
            "log_count": len(sanitised_lines),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error reading docker container for '{name}': {exc}")
        raise HTTPException(status_code=500, detail=f"Docker adapter error: {type(exc).__name__}")
