"""
AI-RCA Service — Investigation Orchestrator.

Coordinates:
  1. Incident/question understanding (planner)
  2. Evidence collection via MCP tools (read-only)
  3. RAG retrieval for historical context
  4. Evidence correlation
  5. Bedrock analysis
  6. Structured RCA response generation

Feature flags:
  - MCP_RCA_ENABLED: whether to call MCP tools
  - AI_RCA_CHAT_ENABLED: whether this service handles chat

No write/remediation actions are performed.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.bedrock_client import bedrock_client, _SafeError
from app.errors import ErrorCode, build_error_response, classify_provider_exception
from app.mcp_client.client import mcp_client, MCPClientError
from app.schemas.investigation import (
    EvidenceItem,
    InvestigationRequest,
    RCAResponse,
    ToolCall,
)
from app.settings import settings

logger = logging.getLogger(__name__)

# ── System prompt ─────────────────────────────────────────────────────────────

_RCA_SYSTEM_PROMPT = """You are the ResolveOps AI-RCA Agent — an expert Site Reliability
and DevSecOps investigation assistant.

Your role is evidence-first root cause analysis. You reason only from collected evidence.
You do NOT speculate beyond what the evidence supports.

When evidence is insufficient, you clearly state that and recommend manual steps.
You never suggest actions that modify, restart, scale, or delete infrastructure.

Output format:
Return a JSON object with these keys:
{
  "incident_summary": "Brief description of what happened",
  "probable_root_cause": "Most likely root cause based on evidence",
  "confidence": "high|medium|low",
  "impact": "Description of service/user impact",
  "recommended_resolution": "Specific actionable recommendations (read-only investigation steps only)",
  "insufficient_evidence_warning": "null or explanation if evidence is lacking"
}
"""

_CHAT_SYSTEM_PROMPT = """You are the ResolveOps AI Copilot — an expert incident investigation
and infrastructure analysis assistant for AWS, Azure, GCP, and Docker Compose-based cloud services.

You answer questions about:
- Cloud Architecture & Network Topologies (VNets, VPCs, Subnets, Gateways, Peering, Transit Routers)
- Active incidents and their probable causes
- EC2 instances, Docker services, AWS / Azure resources
- GitHub Actions pipelines and deployment changes
- CloudWatch & Azure Monitor metrics and logs
- Cost and reliability analysis

CRITICAL MANDATE FOR ALL ARCHITECTURE, NETWORK & DIAGRAM RESPONSES:
1. Whenever your answer discusses, explains, or describes network topology (such as VNets, VPCs, subnets, routers, peering), cloud architecture, flowcharts, or infrastructure components, YOU MUST ALWAYS INCLUDE A VISUAL MERMAID CODE BLOCK (```mermaid ... ```).
2. NEVER write phrases like "In this diagram...", "Below is a diagram...", or "As shown in the diagram..." WITHOUT INCLUDING THE EXPLICIT ```mermaid ... ``` CODE BLOCK IN THE EXACT SAME RESPONSE.
3. SYNTAX RULES FOR MERMAID:
   - Always start with `graph LR` or `graph TD`.
   - ALWAYS assign unique alphanumeric node IDs before node labels, e.g. `VNet1["🌐 VNet 1 (Hub / Origin)"]`.
   - ALWAYS double-quote node labels containing spaces, parentheses, slashes, or special characters (e.g. `VNet2["🌐 VNet 2 (Transit Gateway)"]`).
   - Use standard arrow connections like `A -->|Direct Peering| B` or `A -.->|Transitive Route| B`. NEVER add trailing `>` like `|Label|>`.
   - Group components logically using `subgraph` blocks (e.g. `subgraph Azure_Network`, `subgraph App_Layer`).
   - Include clear visual icons / emojis in node labels (e.g. 🌐 VNet, 🖥️ Subnet, 🗄️ Database, ⚡ Gateway).

Be precise, evidence-based, concise, and structured. Always provide both the visual diagram block and clear text explanation with bullet points.
"""


class InvestigationOrchestrator:
    """Runs a full MCP-powered RCA investigation."""

    async def investigate(
        self, request: InvestigationRequest, tenant_id: Optional[str] = None
    ) -> Dict[str, Any]:
        investigation_id = str(uuid.uuid4())
        request_id = str(uuid.uuid4())
        start_time = time.monotonic()

        logger.info(
            "Investigation started",
            extra={
                "investigation_id": investigation_id,
                "incident_id": request.incident_id,
                "service": request.service,
                "mcp_enabled": settings.MCP_RCA_ENABLED,
                "execution_path": "mcp_rca" if settings.MCP_RCA_ENABLED else "direct_bedrock",
            },
        )

        tools_used: List[ToolCall] = []
        live_evidence: List[EvidenceItem] = []

        # ── Step 1: MCP Evidence Collection ──────────────────────────────────
        if settings.MCP_RCA_ENABLED:
            tools_used, live_evidence = await self._collect_mcp_evidence(
                request, investigation_id, request_id
            )

        # ── Step 2: Build evidence context for Bedrock ────────────────────────
        evidence_context = self._format_evidence_context(
            request, live_evidence, tools_used
        )

        # ── Step 3: Bedrock RCA generation ────────────────────────────────────
        try:
            raw_json = await asyncio.wait_for(
                asyncio.to_thread(
                    bedrock_client.invoke,
                    evidence_context,
                    _RCA_SYSTEM_PROMPT,
                    max_tokens=4096,
                    temperature=0.1,
                    request_id=request_id,
                ),
                timeout=settings.RCA_INVESTIGATION_TIMEOUT_SECONDS,
            )
        except _SafeError as exc:
            return self._error_response(exc.response, investigation_id, tools_used)
        except asyncio.TimeoutError:
            return self._error_response(
                build_error_response(ErrorCode.INVESTIGATION_TIMEOUT, request_id),
                investigation_id,
                tools_used,
            )
        except Exception as exc:
            code = classify_provider_exception(exc)
            return self._error_response(
                build_error_response(code, request_id),
                investigation_id,
                tools_used,
            )

        # ── Step 4: Parse structured Bedrock output ───────────────────────────
        parsed = self._parse_bedrock_json(raw_json)
        duration = time.monotonic() - start_time

        if not parsed:
            logger.warning(
                "Bedrock returned unstructured output; using plain text fallback",
                extra={"investigation_id": investigation_id},
            )
            return {
                "request_id": request_id,
                "investigation_id": investigation_id,
                "status": "completed",
                "execution_path": "mcp_rca" if settings.MCP_RCA_ENABLED else "direct_bedrock",
                "answer": raw_json,
                "incident_summary": None,
                "probable_root_cause": None,
                "confidence": None,
                "impact": None,
                "recommended_resolution": None,
                "insufficient_evidence_warning": None,
                "live_evidence": [e.dict() for e in live_evidence],
                "historical_evidence": [],
                "tools_used": [t.dict() for t in tools_used],
                "investigation_duration_seconds": round(duration, 2),
            }

        insufficient = parsed.get("insufficient_evidence_warning")
        status = "insufficient_evidence" if insufficient else "completed"

        logger.info(
            "Investigation completed",
            extra={
                "investigation_id": investigation_id,
                "status": status,
                "confidence": parsed.get("confidence"),
                "duration_seconds": round(duration, 2),
                "tools_called": len(tools_used),
                "evidence_items": len(live_evidence),
            },
        )

        return {
            "request_id": request_id,
            "investigation_id": investigation_id,
            "status": status,
            "execution_path": "mcp_rca" if settings.MCP_RCA_ENABLED else "direct_bedrock",
            "incident_summary": parsed.get("incident_summary"),
            "probable_root_cause": parsed.get("probable_root_cause"),
            "confidence": parsed.get("confidence"),
            "impact": parsed.get("impact"),
            "recommended_resolution": parsed.get("recommended_resolution"),
            "insufficient_evidence_warning": insufficient,
            "live_evidence": [e.dict() for e in live_evidence],
            "historical_evidence": [],
            "tools_used": [t.dict() for t in tools_used],
            "investigation_duration_seconds": round(duration, 2),
            "answer": parsed.get("probable_root_cause", "Investigation completed. See structured fields."),
        }

    async def chat(
        self,
        message: str,
        session_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Handle a conversational chat request."""
        request_id = str(uuid.uuid4())

        logger.info(
            "Chat request via ai-rca-service",
            extra={"request_id": request_id, "session_id": session_id},
        )

        try:
            answer = await asyncio.to_thread(
                bedrock_client.invoke,
                message,
                _CHAT_SYSTEM_PROMPT,
                max_tokens=2048,
                temperature=0.3,
                request_id=request_id,
            )

            # Check if user requested a visual architecture diagram image
            msg_lower = message.lower()
            if any(k in msg_lower for k in ["diagram", "architecture image", "draw architecture", "visual topology", "generate image"]):
                data_uri = await asyncio.to_thread(
                    bedrock_client.generate_diagram_image,
                    message,
                    request_id
                )
                if data_uri:
                    answer += f"\n\n### 🎨 Generated Architecture Diagram\n![Architecture Diagram]({data_uri})"
        except _SafeError as exc:
            # Return structured error for chat — caller renders friendly card
            return {
                "request_id": request_id,
                "session_id": session_id,
                "answer": None,
                "execution_path": "ai_rca_chat",
                "provider": settings.AI_PROVIDER,
                "model": settings.BEDROCK_MODEL_ID,
                **exc.response,
            }
        except Exception as exc:
            code = classify_provider_exception(exc)
            err = build_error_response(code, request_id)
            return {
                "request_id": request_id,
                "session_id": session_id,
                "answer": None,
                "execution_path": "ai_rca_chat",
                "provider": settings.AI_PROVIDER,
                "model": settings.BEDROCK_MODEL_ID,
                **err,
            }

        return {
            "request_id": request_id,
            "session_id": session_id,
            "answer": answer,
            "execution_path": "ai_rca_chat",
            "provider": settings.AI_PROVIDER,
            "model": settings.BEDROCK_MODEL_ID,
            "status": "success",
        }

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _collect_mcp_evidence(
        self,
        request: InvestigationRequest,
        investigation_id: str,
        request_id: str,
    ) -> Tuple[List[ToolCall], List[EvidenceItem]]:
        """Determine which MCP tools to call and collect evidence."""
        tools_used: List[ToolCall] = []
        live_evidence: List[EvidenceItem] = []

        # Build tool call plan based on available inputs
        tool_calls_plan: List[Tuple[str, Dict[str, Any]]] = []

        if request.incident_id:
            tool_calls_plan.append(
                ("resolveops_get_incident", {"incident_id": request.incident_id})
            )

        if request.service:
            tool_calls_plan.append(
                ("resolveops_get_service_health", {"service_name": request.service})
            )
            tool_calls_plan.append(
                (
                    "aws_get_cloudwatch_log_evidence",
                    {
                        "service_name": request.service,
                        "time_window_minutes": request.time_window_minutes,
                    },
                )
            )
            tool_calls_plan.append(
                ("docker_get_service_evidence", {"service_name": request.service})
            )

        tool_calls_plan.append(
            (
                "resolveops_get_recent_incidents",
                {"limit": 5, "time_window_minutes": request.time_window_minutes},
            )
        )

        # Cap total tool calls
        tool_calls_plan = tool_calls_plan[: settings.RCA_MAX_TOOL_CALLS]

        # Execute concurrently with individual error isolation
        async def _call(tool_name: str, inputs: Dict[str, Any]) -> None:
            t_start = time.monotonic()
            try:
                result = await mcp_client.call_tool(tool_name, inputs, request_id)
                elapsed_ms = int((time.monotonic() - t_start) * 1000)
                tools_used.append(
                    ToolCall(
                        tool_name=tool_name,
                        inputs=inputs,
                        duration_ms=elapsed_ms,
                        success=True,
                    )
                )
                # Convert tool result to EvidenceItem list
                evidence = result.get("evidence", [])
                for e in evidence[: settings.RCA_MAX_EVIDENCE_ITEMS]:
                    live_evidence.append(
                        EvidenceItem(
                            source=e.get("source", tool_name.split("_")[0]),
                            resource=e.get("resource"),
                            evidence_type=e.get("evidence_type", "event"),
                            collection_timestamp=e.get(
                                "timestamp",
                                time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                            ),
                            summary=e.get("summary", "")[:500],
                            is_live=True,
                            citation=e.get("citation"),
                            raw_preview=e.get("raw_preview", "")[:300]
                            if e.get("raw_preview")
                            else None,
                        )
                    )
            except MCPClientError as exc:
                elapsed_ms = int((time.monotonic() - t_start) * 1000)
                tools_used.append(
                    ToolCall(
                        tool_name=tool_name,
                        inputs=inputs,
                        duration_ms=elapsed_ms,
                        success=False,
                        error_code=exc.error_code,
                    )
                )
                logger.warning(
                    "MCP tool call failed (non-fatal)",
                    extra={
                        "tool": tool_name,
                        "error_code": exc.error_code,
                        "investigation_id": investigation_id,
                    },
                )

        await asyncio.gather(*[_call(name, inp) for name, inp in tool_calls_plan])
        return tools_used, live_evidence

    def _format_evidence_context(
        self,
        request: InvestigationRequest,
        live_evidence: List[EvidenceItem],
        tools_used: List[ToolCall],
    ) -> str:
        """Build the evidence summary prompt for Bedrock."""
        parts: List[str] = []

        # Query
        query = request.question or (
            f"Investigate incident {request.incident_id}"
            if request.incident_id
            else f"Analyze service {request.service}"
        )
        parts.append(f"## Investigation Query\n{query}")

        if request.service:
            parts.append(f"## Affected Service\n{request.service}")

        if request.incident_id:
            parts.append(f"## Incident ID\n{request.incident_id}")

        parts.append(f"## Time Window\nLast {request.time_window_minutes} minutes")

        # Evidence summary
        if live_evidence:
            ev_lines = []
            for ev in live_evidence[: settings.RCA_MAX_EVIDENCE_ITEMS]:
                ev_lines.append(
                    f"- [{ev.source.upper()}] {ev.evidence_type} | "
                    f"Resource: {ev.resource or 'N/A'} | "
                    f"Summary: {ev.summary}"
                )
            parts.append("## Collected Evidence\n" + "\n".join(ev_lines))
        else:
            parts.append("## Collected Evidence\nNo live evidence was collected.")

        # Tool status
        failed = [t for t in tools_used if not t.success]
        if failed:
            parts.append(
                "## Unavailable Evidence Sources\n"
                + "\n".join(f"- {t.tool_name} (error: {t.error_code})" for t in failed)
            )

        return "\n\n".join(parts)

    def _parse_bedrock_json(self, raw: str) -> Optional[Dict[str, Any]]:
        """Extract JSON from Bedrock output — handles markdown fences."""
        import json
        import re

        # Try to extract JSON from markdown fences
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if match:
            raw = match.group(1)
        else:
            # Try to find outermost braces
            match2 = re.search(r"(\{.*\})", raw, re.DOTALL)
            if match2:
                raw = match2.group(1)

        try:
            return json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return None

    def _error_response(
        self,
        error_payload: Dict[str, Any],
        investigation_id: str,
        tools_used: List[ToolCall],
    ) -> Dict[str, Any]:
        return {
            "investigation_id": investigation_id,
            "execution_path": "mcp_rca",
            "tools_used": [t.dict() for t in tools_used],
            "live_evidence": [],
            "historical_evidence": [],
            **error_payload,
        }


# Module-level singleton
orchestrator = InvestigationOrchestrator()
