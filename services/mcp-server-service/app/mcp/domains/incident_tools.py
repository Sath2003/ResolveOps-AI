import os
import time
import logging
import httpx
import jwt
import datetime
from typing import Optional, Dict, Any
from app.mcp.audit import log_tool_call

logger = logging.getLogger(__name__)
GW_URL = os.getenv("API_GATEWAY_INTERNAL_URL", "http://api-gateway-service:8000")
TIMEOUT = 15

def get_service_auth_header(tenant_id: Optional[str] = None) -> Dict[str, str]:
    """
    Generates a secure service-to-service authorization header.
    Uses asymmetric JWT signature if private key is present, falling back to static tokens in dev.
    """
    app_env = os.getenv("APP_ENV", "dev")
    mcp_service_token = os.getenv("MCP_SERVICE_TOKEN", "")
    
    # 1. Dev fallback
    if app_env == "dev" and mcp_service_token:
        return {"X-MCP-Service-Token": mcp_service_token}
        
    # 2. Asymmetric RSA signature
    private_key = os.getenv("JWKS_PRIVATE_KEY_PEM", "")
    if private_key:
        try:
            payload = {
                "iss": "resolveops-mcp-server",
                "aud": "resolveops-api-gateway",
                "scopes": ["mcp:incidents:read", "mcp:runtime:read"],
                "tenant_id": tenant_id or "*",
                "exp": int(time.time()) + 60
            }
            # RS256 asymmetric signing
            token = jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": "mcp-server-kid"})
            return {"Authorization": f"Bearer {token}"}
        except Exception as e:
            logger.error(f"Failed to sign RS256 service JWT: {e}")
            
    # 3. Symmetric fallback (if private key not present, e.g. local testing)
    secret = os.getenv("JWT_SECRET", "thisisaverylongjwtsecrestthesecretisverysecretsokeepitsecret")
    payload = {
        "iss": "resolveops-mcp-server",
        "aud": "resolveops-api-gateway",
        "scopes": ["mcp:incidents:read", "mcp:runtime:read"],
        "tenant_id": tenant_id or "*",
        "exp": int(time.time()) + 60
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

def _ts() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"

async def resolveops_get_incident(incident_id: Optional[str] = None, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve a specific incident from the ResolveOps incident store.
    
    Args:
        incident_id: ID of the incident to fetch (e.g. INC-A1B2C3D4).
        tenant_id: Target tenant ID (optional).
    """
    start_time = time.time()
    if not incident_id:
        log_tool_call("resolveops_get_incident", {"incident_id": incident_id, "tenant_id": tenant_id}, False, (time.time() - start_time) * 1000, error="incident_id is required")
        return {"evidence": [], "error": "incident_id is required"}

    try:
        headers = get_service_auth_header(tenant_id)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{GW_URL}/api/v1/mcp/incidents/{incident_id}",
                params={"tenant_id": tenant_id} if tenant_id else {},
                headers=headers
            )
            if resp.status_code == 404:
                err_msg = f"Incident {incident_id} not found"
                log_tool_call("resolveops_get_incident", {"incident_id": incident_id, "tenant_id": tenant_id}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}
            if resp.status_code != 200:
                err_msg = f"Incidents unavailable ({resp.status_code}): {resp.text}"
                log_tool_call("resolveops_get_incident", {"incident_id": incident_id, "tenant_id": tenant_id}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

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
            log_tool_call("resolveops_get_incident", {"incident_id": incident_id, "tenant_id": tenant_id}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence, "incident": inc}
    except Exception as exc:
        log_tool_call("resolveops_get_incident", {"incident_id": incident_id, "tenant_id": tenant_id}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"Incident data unavailable: {type(exc).__name__}"}

async def resolveops_get_recent_incidents(limit: int = 5, time_window_minutes: int = 1440, tenant_id: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve recent incidents for correlation.
    
    Args:
        limit: Number of incidents to return (max 10).
        time_window_minutes: Time window in minutes.
        tenant_id: Target tenant ID (optional).
    """
    start_time = time.time()
    try:
        headers = get_service_auth_header(tenant_id)
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{GW_URL}/api/v1/mcp/incidents",
                params={"limit": min(limit, 10), "tenant_id": tenant_id or ""},
                headers=headers
            )
            if resp.status_code != 200:
                err_msg = f"Incidents unavailable ({resp.status_code}): {resp.text}"
                log_tool_call("resolveops_get_recent_incidents", {"limit": limit, "time_window_minutes": time_window_minutes, "tenant_id": tenant_id}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

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
            log_tool_call("resolveops_get_recent_incidents", {"limit": limit, "time_window_minutes": time_window_minutes, "tenant_id": tenant_id}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence, "total_incidents": len(incidents)}
    except Exception as exc:
        log_tool_call("resolveops_get_recent_incidents", {"limit": limit, "time_window_minutes": time_window_minutes, "tenant_id": tenant_id}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"Incident data unavailable: {type(exc).__name__}"}

async def resolveops_get_service_health(service_name: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve service health metrics (latency, error rate) from ingested logs.
    
    Args:
        service_name: Optional service name to retrieve health details.
    """
    start_time = time.time()
    try:
        headers = get_service_auth_header()
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(
                f"{GW_URL}/api/v1/mcp/service-health",
                params={"service_name": service_name} if service_name else {},
                headers=headers
            )
            if resp.status_code != 200:
                err_msg = f"Service health unavailable ({resp.status_code}): {resp.text}"
                log_tool_call("resolveops_get_service_health", {"service_name": service_name}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

            metrics = resp.json() if isinstance(resp.json(), list) else []
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
            log_tool_call("resolveops_get_service_health", {"service_name": service_name}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence}
    except Exception as exc:
        log_tool_call("resolveops_get_service_health", {"service_name": service_name}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"Service health unavailable: {type(exc).__name__}"}
