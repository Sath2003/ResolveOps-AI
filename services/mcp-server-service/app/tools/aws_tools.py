"""
MCP Server Service — AWS tools.

All tools are read-only. Evidence is collected from AWS Intelligence Service.
No write, delete, restart, or remediation actions are supported.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

_AWS_SVC_URL = os.getenv("AWS_INTELLIGENCE_SERVICE_URL", "http://aws-intelligence-service:8000")
_TIMEOUT = 20


def _evidence_item(
    source: str,
    resource: Optional[str],
    evidence_type: str,
    summary: str,
    is_live: bool = True,
    raw_preview: Optional[str] = None,
) -> Dict[str, Any]:
    import datetime
    return {
        "source": source,
        "resource": resource,
        "evidence_type": evidence_type,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "summary": summary,
        "is_live": is_live,
        "raw_preview": raw_preview,
    }


async def aws_get_ec2_instance_health(
    instance_id: Optional[str] = None,
    region: Optional[str] = None,
    **_: Any,
) -> Dict[str, Any]:
    """Fetch EC2 instance health and status checks."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            params: Dict[str, str] = {}
            if region:
                params["region"] = region
            url = f"{_AWS_SVC_URL}/api/v1/aws/resources"
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return {"evidence": [], "error": f"AWS service returned {resp.status_code}"}

            resources = resp.json()
            ec2 = [r for r in resources if "EC2" in r.get("resource_type", "")]
            if instance_id:
                ec2 = [r for r in ec2 if instance_id in (r.get("resource_id", "") + r.get("name", ""))]

            evidence = []
            for r in ec2[:5]:
                evidence.append(_evidence_item(
                    source="aws",
                    resource=r.get("resource_id") or r.get("name"),
                    evidence_type="ec2_health",
                    summary=(
                        f"EC2 instance {r.get('name', r.get('resource_id'))} "
                        f"state={r.get('state', 'unknown')} "
                        f"type={r.get('instance_type', 'unknown')} "
                        f"region={r.get('region', 'unknown')}"
                    ),
                    is_live=True,
                ))
            return {"evidence": evidence, "total_instances": len(ec2)}
    except Exception as exc:
        logger.warning("aws_get_ec2_instance_health failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"Could not retrieve EC2 health: {type(exc).__name__}"}


async def aws_get_cloudwatch_log_evidence(
    service_name: Optional[str] = None,
    log_group: Optional[str] = None,
    time_window_minutes: int = 60,
    **_: Any,
) -> Dict[str, Any]:
    """Fetch recent CloudWatch log evidence for a service."""
    from app.policies import ALLOWED_CLOUDWATCH_LOG_GROUPS

    # Validate log group against allow-list if explicitly specified
    if log_group and ALLOWED_CLOUDWATCH_LOG_GROUPS and log_group not in ALLOWED_CLOUDWATCH_LOG_GROUPS:
        return {
            "evidence": [],
            "error": f"Log group '{log_group}' is not in the allowed list.",
        }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            params: Dict[str, Any] = {"time_window_minutes": time_window_minutes}
            if service_name:
                params["service_name"] = service_name
            if log_group:
                params["log_group"] = log_group

            resp = await client.get(f"{_AWS_SVC_URL}/api/v1/aws/cloudwatch/logs", params=params)
            if resp.status_code != 200:
                return {"evidence": [], "error": f"CloudWatch logs unavailable ({resp.status_code})"}

            logs = resp.json()
            evidence = []
            for log in logs[:20]:
                evidence.append(_evidence_item(
                    source="cloudwatch",
                    resource=log.get("log_group") or log.get("resource_id"),
                    evidence_type="log",
                    summary=log.get("message", "")[:300],
                    is_live=True,
                    raw_preview=log.get("message", "")[:500] if log.get("message") else None,
                ))
            return {"evidence": evidence, "log_count": len(logs)}
    except Exception as exc:
        logger.warning("aws_get_cloudwatch_log_evidence failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"CloudWatch logs unavailable: {type(exc).__name__}"}


async def aws_get_cloudwatch_metric_evidence(
    resource_arn: Optional[str] = None,
    resource_type: Optional[str] = None,
    region: Optional[str] = None,
    **_: Any,
) -> Dict[str, Any]:
    """Fetch CloudWatch metric evidence for a resource."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            params: Dict[str, Any] = {}
            if resource_arn:
                params["resource_arn"] = resource_arn
            if resource_type:
                params["resource_type"] = resource_type
            if region:
                params["region"] = region

            resp = await client.get(f"{_AWS_SVC_URL}/api/v1/aws/metrics", params=params)
            if resp.status_code != 200:
                return {"evidence": [], "error": f"CloudWatch metrics unavailable ({resp.status_code})"}

            metrics = resp.json()
            evidence = []
            for m in metrics[:10]:
                evidence.append(_evidence_item(
                    source="cloudwatch",
                    resource=resource_arn or resource_type,
                    evidence_type="metric",
                    summary=(
                        f"{m.get('name')}: current={m.get('current_value')} "
                        f"unit={m.get('unit', '')}"
                    ),
                    is_live=True,
                ))
            return {"evidence": evidence}
    except Exception as exc:
        logger.warning("aws_get_cloudwatch_metric_evidence failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"CloudWatch metrics unavailable: {type(exc).__name__}"}


async def aws_get_cloudtrail_changes(
    time_window_minutes: int = 60,
    resource_name: Optional[str] = None,
    **_: Any,
) -> Dict[str, Any]:
    """Fetch recent infrastructure change events from CloudTrail."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            params: Dict[str, Any] = {"time_window_minutes": time_window_minutes}
            if resource_name:
                params["resource_name"] = resource_name

            resp = await client.get(f"{_AWS_SVC_URL}/api/v1/aws/cloudtrail/events", params=params)
            if resp.status_code != 200:
                return {"evidence": [], "error": f"CloudTrail unavailable ({resp.status_code})"}

            events = resp.json()
            evidence = []
            for ev in events[:15]:
                evidence.append(_evidence_item(
                    source="cloudtrail",
                    resource=ev.get("resource_name") or ev.get("resource_arn"),
                    evidence_type="infrastructure_change",
                    summary=(
                        f"{ev.get('event_name')} by {ev.get('username', 'unknown')} "
                        f"at {ev.get('event_time', 'unknown')}"
                    ),
                    is_live=True,
                ))
            return {"evidence": evidence, "event_count": len(events)}
    except Exception as exc:
        logger.warning("aws_get_cloudtrail_changes failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"CloudTrail unavailable: {type(exc).__name__}"}
