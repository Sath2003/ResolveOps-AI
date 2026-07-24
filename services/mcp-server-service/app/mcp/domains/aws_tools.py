import os
import time
import logging
import httpx
from typing import Optional, Dict, Any
from app.mcp.policies import validate_region, validate_log_group, MAX_LOG_CHARACTERS, MAX_RECORD_COUNT
from app.mcp.audit import log_tool_call

logger = logging.getLogger(__name__)
AWS_SERVICE_URL = os.getenv("AWS_INTELLIGENCE_SERVICE_URL", "http://aws-intelligence-service:8000")
TIMEOUT = 20

def get_evidence_item(source: str, resource: Optional[str], evidence_type: str, summary: str, is_live: bool = True, raw_preview: Optional[str] = None) -> Dict[str, Any]:
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

async def aws_get_ec2_instance_health(instance_id: Optional[str] = None, region: Optional[str] = None) -> Dict[str, Any]:
    """Fetch EC2 instance health and status checks.
    
    Args:
        instance_id: Optional ID or name of the EC2 instance.
        region: Optional AWS region.
    """
    start_time = time.time()
    if region:
        try:
            validate_region(region)
        except ValueError as e:
            log_tool_call("aws_get_ec2_instance_health", {"instance_id": instance_id, "region": region}, False, (time.time() - start_time) * 1000, error=str(e))
            return {"evidence": [], "error": str(e)}
            
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            params = {}
            if region:
                params["region"] = region
            url = f"{AWS_SERVICE_URL}/api/v1/aws/resources"
            resp = await client.get(url, params=params)
            
            if resp.status_code != 200:
                err_msg = f"AWS service returned {resp.status_code}"
                log_tool_call("aws_get_ec2_instance_health", {"instance_id": instance_id, "region": region}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

            resources = resp.json()
            ec2 = [r for r in resources if "EC2" in r.get("resource_type", "")]
            if instance_id:
                ec2 = [r for r in ec2 if instance_id in (r.get("resource_id", "") + r.get("name", ""))]

            evidence = []
            for r in ec2[:MAX_RECORD_COUNT]:
                evidence.append(get_evidence_item(
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
            log_tool_call("aws_get_ec2_instance_health", {"instance_id": instance_id, "region": region}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence, "total_instances": len(ec2)}
    except Exception as exc:
        log_tool_call("aws_get_ec2_instance_health", {"instance_id": instance_id, "region": region}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"Could not retrieve EC2 health: {type(exc).__name__}"}

async def aws_get_cloudwatch_log_evidence(service_name: Optional[str] = None, log_group: Optional[str] = None, time_window_minutes: int = 60) -> Dict[str, Any]:
    """Fetch recent CloudWatch log evidence for a service.
    
    Args:
        service_name: Optional name of the service to retrieve logs for.
        log_group: Optional CloudWatch log group.
        time_window_minutes: Time window in minutes.
    """
    start_time = time.time()
    if log_group:
        try:
            validate_log_group(log_group)
        except ValueError as e:
            log_tool_call("aws_get_cloudwatch_log_evidence", {"service_name": service_name, "log_group": log_group, "time_window_minutes": time_window_minutes}, False, (time.time() - start_time) * 1000, error=str(e))
            return {"evidence": [], "error": str(e)}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            params = {"time_window_minutes": time_window_minutes}
            if service_name:
                params["service_name"] = service_name
            if log_group:
                params["log_group"] = log_group

            resp = await client.get(f"{AWS_SERVICE_URL}/api/v1/aws/cloudwatch/logs", params=params)
            if resp.status_code != 200:
                err_msg = f"CloudWatch logs unavailable ({resp.status_code})"
                log_tool_call("aws_get_cloudwatch_log_evidence", {"service_name": service_name, "log_group": log_group, "time_window_minutes": time_window_minutes}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

            logs = resp.json()
            evidence = []
            for log in logs[:MAX_RECORD_COUNT]:
                msg = log.get("message", "")
                evidence.append(get_evidence_item(
                    source="cloudwatch",
                    resource=log.get("log_group") or log.get("resource_id"),
                    evidence_type="log",
                    summary=msg[:300],
                    is_live=True,
                    raw_preview=msg[:MAX_LOG_CHARACTERS] if msg else None,
                ))
            log_tool_call("aws_get_cloudwatch_log_evidence", {"service_name": service_name, "log_group": log_group, "time_window_minutes": time_window_minutes}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence, "log_count": len(logs)}
    except Exception as exc:
        log_tool_call("aws_get_cloudwatch_log_evidence", {"service_name": service_name, "log_group": log_group, "time_window_minutes": time_window_minutes}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"CloudWatch logs unavailable: {type(exc).__name__}"}

async def aws_get_cloudwatch_metric_evidence(resource_arn: Optional[str] = None, resource_type: Optional[str] = None, region: Optional[str] = None) -> Dict[str, Any]:
    """Fetch CloudWatch metric evidence for a resource.
    
    Args:
        resource_arn: Optional resource ARN.
        resource_type: Optional resource type (e.g. EC2, RDS).
        region: Optional AWS region.
    """
    start_time = time.time()
    if region:
        try:
            validate_region(region)
        except ValueError as e:
            log_tool_call("aws_get_cloudwatch_metric_evidence", {"resource_arn": resource_arn, "resource_type": resource_type, "region": region}, False, (time.time() - start_time) * 1000, error=str(e))
            return {"evidence": [], "error": str(e)}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            params = {}
            if resource_arn:
                params["resource_arn"] = resource_arn
            if resource_type:
                params["resource_type"] = resource_type
            if region:
                params["region"] = region

            resp = await client.get(f"{AWS_SERVICE_URL}/api/v1/aws/metrics", params=params)
            if resp.status_code != 200:
                err_msg = f"CloudWatch metrics unavailable ({resp.status_code})"
                log_tool_call("aws_get_cloudwatch_metric_evidence", {"resource_arn": resource_arn, "resource_type": resource_type, "region": region}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

            metrics = resp.json()
            evidence = []
            for m in metrics[:MAX_RECORD_COUNT]:
                evidence.append(get_evidence_item(
                    source="cloudwatch",
                    resource=resource_arn or resource_type,
                    evidence_type="metric",
                    summary=(
                        f"{m.get('name')}: current={m.get('current_value')} "
                        f"unit={m.get('unit', '')}"
                    ),
                    is_live=True,
                ))
            log_tool_call("aws_get_cloudwatch_metric_evidence", {"resource_arn": resource_arn, "resource_type": resource_type, "region": region}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence}
    except Exception as exc:
        log_tool_call("aws_get_cloudwatch_metric_evidence", {"resource_arn": resource_arn, "resource_type": resource_type, "region": region}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"CloudWatch metrics unavailable: {type(exc).__name__}"}

async def aws_get_cloudtrail_changes(time_window_minutes: int = 60, resource_name: Optional[str] = None) -> Dict[str, Any]:
    """Fetch recent infrastructure change events from CloudTrail.
    
    Args:
        time_window_minutes: Time window in minutes.
        resource_name: Optional target resource name.
    """
    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            params = {"time_window_minutes": time_window_minutes}
            if resource_name:
                params["resource_name"] = resource_name

            resp = await client.get(f"{AWS_SERVICE_URL}/api/v1/aws/cloudtrail/events", params=params)
            if resp.status_code != 200:
                err_msg = f"CloudTrail unavailable ({resp.status_code})"
                log_tool_call("aws_get_cloudtrail_changes", {"time_window_minutes": time_window_minutes, "resource_name": resource_name}, False, (time.time() - start_time) * 1000, error=err_msg)
                return {"evidence": [], "error": err_msg}

            events = resp.json()
            evidence = []
            for ev in events[:MAX_RECORD_COUNT]:
                evidence.append(get_evidence_item(
                    source="cloudtrail",
                    resource=ev.get("resource_name") or ev.get("resource_arn"),
                    evidence_type="infrastructure_change",
                    summary=(
                        f"{ev.get('event_name')} by {ev.get('username', 'unknown')} "
                        f"at {ev.get('event_time', 'unknown')}"
                    ),
                    is_live=True,
                ))
            log_tool_call("aws_get_cloudtrail_changes", {"time_window_minutes": time_window_minutes, "resource_name": resource_name}, True, (time.time() - start_time) * 1000)
            return {"evidence": evidence, "event_count": len(events)}
    except Exception as exc:
        log_tool_call("aws_get_cloudtrail_changes", {"time_window_minutes": time_window_minutes, "resource_name": resource_name}, False, (time.time() - start_time) * 1000, error=str(exc))
        return {"evidence": [], "error": f"CloudTrail unavailable: {type(exc).__name__}"}
