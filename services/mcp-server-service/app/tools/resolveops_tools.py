"""
MCP Server Service — ResolveOps internal tools.

Read-only access to incidents, service health, and predictive risks
from the API Gateway database layer.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional
import datetime

import httpx

logger = logging.getLogger(__name__)
_GW_URL = os.getenv("API_GATEWAY_INTERNAL_URL", "http://api-gateway-service:8000")
_TIMEOUT = 15


def _ts() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"


async def resolveops_get_incident(
    incident_id: Optional[str] = None,
    tenant_id: Optional[str] = None,
    **_: Any,
) -> Dict[str, Any]:
    """Retrieve a specific incident from the ResolveOps incident store."""
    if not incident_id:
        return {"evidence": [], "error": "incident_id is required"}

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            # Internal call — no auth header needed if on same Docker network
            resp = await client.get(
                f"{_GW_URL}/api/v1/mcp/incidents/{incident_id}",
                params={"tenant_id": tenant_id} if tenant_id else {},
            )
            if resp.status_code == 404:
                return {"evidence": [], "error": f"Incident {incident_id} not found"}
            if resp.status_code != 200:
                return {"evidence": [], "error": f"Incidents unavailable ({resp.status_code})"}

            inc = resp.json()
            evidence = [{
                "source": "resolveops",
                "resource": incident_id,
                "evidence_type": "incident",
                "timestamp": inc.get("created_at", _ts()),
                "summary": (
                    f"Incident {incident_id} | service={inc.get('service')} "
                    f"severity={inc.get('severity')} status={inc.get('status')}"
                ),
                "is_live": False,
                "raw_preview": inc.get("rca_report", "")[:500] if inc.get("rca_report") else None,
            }]
            return {"evidence": evidence, "incident": inc}
    except Exception as exc:
        logger.warning("resolveops_get_incident failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"Incident data unavailable: {type(exc).__name__}"}


async def resolveops_get_recent_incidents(
    limit: int = 5,
    time_window_minutes: int = 1440,
    tenant_id: Optional[str] = None,
    **_: Any,
) -> Dict[str, Any]:
    """Retrieve recent incidents for correlation."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{_GW_URL}/api/v1/mcp/incidents",
                params={"limit": min(limit, 10), "tenant_id": tenant_id or ""},
            )
            if resp.status_code != 200:
                return {"evidence": [], "error": f"Incidents unavailable ({resp.status_code})"}

            incidents = resp.json() if isinstance(resp.json(), list) else []
            evidence = []
            for inc in incidents[:limit]:
                evidence.append({
                    "source": "resolveops",
                    "resource": inc.get("incident_id"),
                    "evidence_type": "incident",
                    "timestamp": inc.get("created_at", _ts()),
                    "summary": (
                        f"Incident {inc.get('incident_id')} | service={inc.get('service')} "
                        f"severity={inc.get('severity')} status={inc.get('status')}"
                    ),
                    "is_live": False,
                })
            return {"evidence": evidence, "total_incidents": len(incidents)}
    except Exception as exc:
        logger.warning("resolveops_get_recent_incidents failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"Incident data unavailable: {type(exc).__name__}"}


async def resolveops_get_service_health(
    service_name: Optional[str] = None,
    **_: Any,
) -> Dict[str, Any]:
    """Retrieve service health metrics (latency, error rate) from ingested logs."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{_GW_URL}/api/v1/mcp/service-health")
            if resp.status_code != 200:
                return {"evidence": [], "error": f"Service health unavailable ({resp.status_code})"}

            metrics = resp.json() if isinstance(resp.json(), list) else []
            if service_name:
                metrics = [m for m in metrics if m.get("service") == service_name]

            evidence = []
            for m in metrics[:5]:
                health_score = m.get("health_score", 100)
                severity = "critical" if health_score < 50 else "degraded" if health_score < 80 else "healthy"
                evidence.append({
                    "source": "resolveops",
                    "resource": m.get("service"),
                    "evidence_type": "service_health",
                    "timestamp": _ts(),
                    "summary": (
                        f"Service '{m.get('service')}' health={health_score} ({severity}) "
                        f"avg_latency={m.get('avg_latency', 0)}ms "
                        f"errors={m.get('errors', 0)} warnings={m.get('warnings', 0)}"
                    ),
                    "is_live": True,
                })
            return {"evidence": evidence}
    except Exception as exc:
        logger.warning("resolveops_get_service_health failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"Service health unavailable: {type(exc).__name__}"}
