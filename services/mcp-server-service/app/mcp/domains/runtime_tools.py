import os
import time
import logging
import httpx
import datetime
from typing import Optional, Dict, Any
from app.mcp.policies import validate_docker_service, MAX_LOG_CHARACTERS
from app.mcp.audit import log_tool_call

logger = logging.getLogger(__name__)
DOCKER_ADAPTER_URL = os.getenv("DOCKER_EVIDENCE_ADAPTER_URL", "http://docker-evidence-adapter:8000")
TIMEOUT = 20

async def docker_get_service_evidence(service_name: Optional[str] = None, tail_lines: int = 50) -> Dict[str, Any]:
    """Retrieve recent logs and status for an allowed Docker Compose service.
    
    Args:
        service_name: Name of the Docker Compose service to inspect (e.g. api-gateway-service).
        tail_lines: Number of log lines to retrieve (max 100).
    """
    start_time = time.time()
    if not service_name:
        log_tool_call("docker_get_service_evidence", {"service_name": service_name, "tail_lines": tail_lines}, False, (time.time() - start_time) * 1000, error="service_name is required")
        return {"evidence": [], "error": "service_name is required"}

    try:
        resolved_name = validate_docker_service(service_name)
    except ValueError as exc:
        log_tool_call("docker_get_service_evidence", {"service_name": service_name, "tail_lines": tail_lines}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": str(exc)}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{DOCKER_ADAPTER_URL}/api/v1/docker/service/evidence",
                params={"service_name": resolved_name, "tail_lines": min(tail_lines, 100)},
            )
            if resp.status_code == 404:
                err_msg = f"Service '{resolved_name}' not found or not running"
                log_tool_call("docker_get_service_evidence", {"service_name": service_name, "tail_lines": tail_lines}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}
            if resp.status_code != 200:
                err_msg = f"Docker adapter returned {resp.status_code}"
                log_tool_call("docker_get_service_evidence", {"service_name": service_name, "tail_lines": tail_lines}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

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
                    "raw_preview": log_text[:MAX_LOG_CHARACTERS],
                })
            log_tool_call("docker_get_service_evidence", {"service_name": service_name, "tail_lines": tail_lines}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence}
    except Exception as exc:
        log_tool_call("docker_get_service_evidence", {"service_name": service_name, "tail_lines": tail_lines}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"Docker evidence unavailable: {type(exc).__name__}"}
