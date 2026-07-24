import os
import time
import logging
import httpx
from typing import Optional, Dict, Any
from app.mcp.policies import validate_namespace, MAX_RECORD_COUNT
from app.mcp.audit import log_tool_call

logger = logging.getLogger(__name__)
AZURE_SERVICE_URL = os.getenv("AZURE_INTELLIGENCE_SERVICE_URL", "http://azure-intelligence-service:8000")
TIMEOUT = 25

async def kubernetes_get_workloads(
    tenant_email: str,
    cluster_name: Optional[str] = None,
    resource_group: Optional[str] = None,
    namespace: Optional[str] = None
) -> Dict[str, Any]:
    """Retrieve sanitized Kubernetes cluster workload details (nodes, pods, deployments, events).
    
    Args:
        tenant_email: Email identifying the tenant (required).
        cluster_name: Target AKS cluster name.
        resource_group: Target Azure resource group name.
        namespace: Optional namespace to filter pods and events.
    """
    start_time = time.time()
    
    if namespace:
        try:
            validate_namespace(namespace)
        except ValueError as e:
            log_tool_call(
                "kubernetes_get_workloads",
                {"tenant_email": tenant_email, "cluster_name": cluster_name, "resource_group": resource_group, "namespace": namespace},
                False,
                (time.time() - start_time) * 1000,
                error=str(e)
            )
            return {"evidence": [], "error": str(e)}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            params = {
                "tenant_email": tenant_email,
                "cluster_name": cluster_name or "",
                "resource_group": resource_group or ""
            }
            resp = await client.get(f"{AZURE_SERVICE_URL}/api/v1/kubernetes/workloads", params=params)
            
            if resp.status_code != 200:
                err_msg = f"Kubernetes broker returned {resp.status_code}: {resp.text}"
                log_tool_call(
                    "kubernetes_get_workloads",
                    {"tenant_email": tenant_email, "cluster_name": cluster_name, "resource_group": resource_group, "namespace": namespace},
                    False,
                    (time.time() - start_time) * 1000,
                    error=err_msg
                )
                return {"evidence": [], "error": err_msg}
                
            data = resp.json()
            
            # Formulate sanitized evidence items for nodes, pods, deployments, events
            evidence = []
            
            # 1. Cluster Status Evidence
            status = data.get("connection_status", "connected")
            if status == "failed":
                return {
                    "evidence": [],
                    "error": data.get("message", "Kubernetes connection failed"),
                    "recommended_action": data.get("recommended_action")
                }
                
            evidence.append({
                "source": "kubernetes",
                "resource": cluster_name or data.get("cluster_id", "aks-cluster"),
                "evidence_type": "cluster_info",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "summary": f"Kubernetes Provider: {data.get('provider', 'AKS')} region={data.get('region', 'unknown')}",
                "is_live": True
            })
            
            # 2. Pods evidence
            pods = data.get("pods", [])
            if namespace:
                pods = [p for p in pods if p.get("namespace") == namespace]
                
            for p in pods[:MAX_RECORD_COUNT]:
                evidence.append({
                    "source": "kubernetes",
                    "resource": f"pod/{p.get('name')}",
                    "evidence_type": "pod_health",
                    "timestamp": p.get("start_time") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "summary": f"Pod {p.get('name')} namespace={p.get('namespace')} status={p.get('status')} restarts={p.get('restart_count', 0)} node={p.get('node_name')}",
                    "is_live": True
                })
                
            # 3. Deployments evidence
            deployments = data.get("deployments", [])
            if namespace:
                deployments = [d for d in deployments if d.get("namespace") == namespace]
                
            for d in deployments[:10]:
                evidence.append({
                    "source": "kubernetes",
                    "resource": f"deployment/{d.get('name')}",
                    "evidence_type": "deployment_status",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "summary": f"Deployment {d.get('name')} desired={d.get('desired_replicas', d.get('desired', 1))} ready={d.get('available_replicas', d.get('ready', 1))} unavailable={d.get('unavailable_replicas', 0)}",
                    "is_live": True
                })
                
            # 4. Warnings / Events evidence
            events = data.get("events", [])
            if namespace:
                events = [e for e in events if e.get("namespace") == namespace]
                
            for e in events[:10]:
                evidence.append({
                    "source": "kubernetes",
                    "resource": e.get("involved_object"),
                    "evidence_type": "warning_event",
                    "timestamp": e.get("last_timestamp") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "summary": f"Event Warning in namespace={e.get('namespace')} object={e.get('involved_object')} reason={e.get('reason')}: {e.get('message')}",
                    "is_live": True
                })
                
            log_tool_call(
                "kubernetes_get_workloads",
                {"tenant_email": tenant_email, "cluster_name": cluster_name, "resource_group": resource_group, "namespace": namespace},
                True,
                (time.time() - start_time) * 1000
            )
            return {"evidence": evidence, "raw_telemetry": data}
            
    except Exception as exc:
        log_tool_call(
            "kubernetes_get_workloads",
            {"tenant_email": tenant_email, "cluster_name": cluster_name, "resource_group": resource_group, "namespace": namespace},
            False,
            (time.time() - start_time) * 1000,
            error=str(exc)
        )
        return {"evidence": [], "error": f"Kubernetes workload details unavailable: {type(exc).__name__}"}
