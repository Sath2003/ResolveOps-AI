"""
MCP Server Service — GitHub tools.

Read-only evidence from GitHub Intelligence Service.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional
import datetime

import httpx

logger = logging.getLogger(__name__)
_GH_SVC_URL = os.getenv("GITHUB_INTELLIGENCE_SERVICE_URL", "http://github-intelligence-service:8000")
_TIMEOUT = 20


def _evidence_item(source, resource, evidence_type, summary, raw_preview=None):
    return {
        "source": source,
        "resource": resource,
        "evidence_type": evidence_type,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "summary": summary,
        "is_live": True,
        "raw_preview": raw_preview,
    }


async def github_get_failed_workflow_evidence(
    repository: Optional[str] = None,
    workflow_run_id: Optional[str] = None,
    **_: Any,
) -> Dict[str, Any]:
    """Get failed workflow logs and job details as evidence."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            params: Dict[str, Any] = {}
            if repository:
                params["repository"] = repository
            if workflow_run_id:
                params["run_id"] = workflow_run_id

            resp = await client.get(f"{_GH_SVC_URL}/api/v1/github/runs", params=params)
            if resp.status_code != 200:
                return {"evidence": [], "error": f"GitHub service returned {resp.status_code}"}

            runs = resp.json() if isinstance(resp.json(), list) else resp.json().get("runs", [])
            evidence = []
            for run in runs[:5]:
                if run.get("conclusion") == "failure":
                    evidence.append(_evidence_item(
                        source="github",
                        resource=f"{run.get('repository', repository)}/{run.get('workflow_name')}",
                        evidence_type="pipeline_failure",
                        summary=(
                            f"Workflow '{run.get('workflow_name')}' failed "
                            f"on branch {run.get('head_branch', 'unknown')} "
                            f"at {run.get('updated_at', run.get('created_at', 'unknown'))}"
                        ),
                    ))
            return {"evidence": evidence, "total_runs_checked": len(runs)}
    except Exception as exc:
        logger.warning("github_get_failed_workflow_evidence failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"GitHub unavailable: {type(exc).__name__}"}


async def github_get_recent_deployment_change(
    repository: Optional[str] = None,
    time_window_minutes: int = 60,
    **_: Any,
) -> Dict[str, Any]:
    """Get recent deployment changes correlated with the incident window."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            params: Dict[str, Any] = {}
            if repository:
                params["repository"] = repository

            resp = await client.get(f"{_GH_SVC_URL}/api/v1/github/deployments", params=params)
            if resp.status_code != 200:
                return {"evidence": [], "error": f"GitHub service returned {resp.status_code}"}

            deployments = resp.json() if isinstance(resp.json(), list) else []
            evidence = []
            for dep in deployments[:5]:
                evidence.append(_evidence_item(
                    source="github",
                    resource=dep.get("repository"),
                    evidence_type="deployment",
                    summary=(
                        f"Deployment by {dep.get('author', 'unknown')}: "
                        f"'{dep.get('commit_msg', '')[:100]}' "
                        f"at {dep.get('timestamp', 'unknown')} "
                        f"(conclusion: {dep.get('conclusion', 'unknown')})"
                    ),
                ))
            return {"evidence": evidence}
    except Exception as exc:
        logger.warning("github_get_recent_deployment_change failed", extra={"exc": type(exc).__name__})
        return {"evidence": [], "error": f"GitHub unavailable: {type(exc).__name__}"}
