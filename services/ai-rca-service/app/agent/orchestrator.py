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

Be precise, evidence-based, concise, and structured.
When returning a written explanation for an architecture topic, use clear sections with headings.
Do NOT embed Mermaid code blocks unless the user explicitly requests Mermaid.
The visual pipeline handles diagram and image generation separately.
"""

_EXPLANATION_SYSTEM_PROMPT = """You are a technical writer for ResolveOps AI.
You receive a VisualSpec JSON and the user's question.
Write a structured explanation matching the visual exactly.

Rules:
- Only mention components listed in the VisualSpec
- Use section headings matching the spec sections
- Describe flows and relationships clearly
- Keep the explanation concise and factual

Return ONLY a valid JSON object:
{
  "introduction": "One or two sentence introduction",
  "sections": [
    {"heading": "Section Name", "content": "Explanation paragraph", "component_ids": ["id1"]}
  ],
  "key_takeaway": "One sentence key insight"
}
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
        previous_visual_spec: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Handle a conversational chat request using the hybrid visual generation pipeline.

        Steps:
          1. Classify the request intent (TEXT, CODE, CHART, MERMAID, STRUCTURED, IMAGE, MIXED)
          2. For visual intents: plan a VisualSpec via two-stage planner
          3. Validate the spec
          4. Route to the correct renderer (image gen / structured diagram / mermaid / text)
          5. Generate a matching explanation
          6. Return a structured response the frontend can parse
        """
        import json as _json
        import re as _re

        from app.visual.intent_classifier import classify_intent
        from app.visual.planner import plan_visual_spec
        from app.visual.schemas import ResponseIntent, RenderEngine, VisualSpec

        request_id = str(uuid.uuid4())
        visual_id = str(uuid.uuid4())

        logger.info(
            "Chat request received",
            extra={"request_id": request_id, "session_id": session_id},
        )

        # ── Shared invoke wrapper ─────────────────────────────────────────────
        def _invoke(prompt: str, system_prompt: Optional[str] = None,
                    max_tokens: int = 2048, temperature: float = 0.3) -> str:
            return bedrock_client.invoke(
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                request_id=request_id,
            )

        # ── Step 1: Classify intent ────────────────────────────────────────────
        try:
            intent = classify_intent(message=message, invoke_fn=_invoke)
        except Exception as exc:
            logger.warning(f"Intent classification failed: {exc}; defaulting to TEXT")
            intent = ResponseIntent.TEXT

        logger.info("Intent classified", extra={"intent": intent, "request_id": request_id})

        # ── Step 2: Non-visual intents → plain LLM response ──────────────────
        non_visual_intents = {
            ResponseIntent.TEXT,
            ResponseIntent.CODE,
            ResponseIntent.TABLE,
            ResponseIntent.CHART,
        }

        if intent == ResponseIntent.MERMAID_DIAGRAM:
            # User explicitly asked for Mermaid — pass through to LLM with Mermaid instructions
            mermaid_system = (
                "You are a technical diagram assistant. "
                "Return a Mermaid diagram in a ```mermaid code block. "
                "Use graph TD or graph LR. Always quote labels with spaces. "
                "Do not add explanatory text outside the code block unless asked."
            )
            try:
                answer = await asyncio.to_thread(
                    _invoke, message, mermaid_system, 2048, 0.2
                )
            except _SafeError as exc:
                return self._chat_error_response(request_id, session_id, exc.response)
            except Exception as exc:
                code = classify_provider_exception(exc)
                return self._chat_error_response(
                    request_id, session_id, build_error_response(code, request_id)
                )
            return {
                "request_id": request_id,
                "session_id": session_id,
                "answer": answer,
                "execution_path": "mermaid_direct",
                "response_type": "MERMAID_DIAGRAM",
                "status": "success",
            }

        if intent in non_visual_intents:
            try:
                answer = await asyncio.to_thread(
                    _invoke, message, _CHAT_SYSTEM_PROMPT, 2048, 0.3
                )
            except _SafeError as exc:
                return self._chat_error_response(request_id, session_id, exc.response)
            except Exception as exc:
                code = classify_provider_exception(exc)
                return self._chat_error_response(
                    request_id, session_id, build_error_response(code, request_id)
                )
            return {
                "request_id": request_id,
                "session_id": session_id,
                "answer": answer,
                "execution_path": "text_chat",
                "response_type": intent.value,
                "status": "success",
            }

        # ── Step 3: Visual intents — plan visual spec ─────────────────────────
        prev_spec_obj: Optional[VisualSpec] = None
        if previous_visual_spec:
            try:
                from app.visual.planner import _dict_to_spec
                prev_spec_obj = _dict_to_spec(previous_visual_spec)
            except Exception:
                pass

        try:
            spec, plan_errors = await asyncio.to_thread(
                plan_visual_spec,
                message,
                intent,
                _invoke,
                None,
                prev_spec_obj,
            )
        except Exception as exc:
            logger.error("Visual planning raised exception", extra={"error": type(exc).__name__})
            spec, plan_errors = None, [str(exc)]

        if spec is None:
            # Planning failed — fall back to written explanation
            logger.warning("Visual planning failed; returning text fallback", extra={"errors": plan_errors})
            try:
                fallback_answer = await asyncio.to_thread(
                    _invoke,
                    message,
                    _CHAT_SYSTEM_PROMPT,
                    2048,
                    0.3,
                )
            except Exception:
                fallback_answer = (
                    "I couldn't generate a visual for this request. "
                    "Please try rephrasing or ask for a different format."
                )
            return {
                "request_id": request_id,
                "session_id": session_id,
                "answer": fallback_answer,
                "execution_path": "visual_fallback_text",
                "response_type": "TEXT",
                "status": "success",
                "visual_generation_error": "planning_failed",
            }

        render_engine = spec.render_engine

        # ── Step 4A: Structured diagram (Excalidraw) ──────────────────────────
        if render_engine == RenderEngine.STRUCTURED:
            # Build a lightweight node/edge JSON that the frontend Excalidraw component renders
            structured_payload = self._spec_to_structured_diagram(spec)
            explanation = await self._generate_explanation(spec, message, _invoke)

            return {
                "request_id": request_id,
                "session_id": session_id,
                "execution_path": "structured_diagram",
                "response_type": "STRUCTURED_DIAGRAM",
                "status": "success",
                "answer": _json.dumps({
                    "type": "visual_response",
                    "title": spec.title,
                    "introduction": explanation.get("introduction", ""),
                    "sections": explanation.get("sections", []),
                    "key_takeaway": explanation.get("key_takeaway", ""),
                    "visual": {
                        "kind": "structured_diagram",
                        "spec": structured_payload,
                        "alt": spec.alt_text,
                    }
                }),
            }

        # ── Step 4B: AI-generated image ───────────────────────────────────────
        if render_engine == RenderEngine.IMAGE:
            from app.visual.prompt_builder import build_image_prompt
            from app.visual.image_generator import generate_and_store_image

            image_prompt = build_image_prompt(spec)

            meta = await generate_and_store_image(
                image_prompt=image_prompt,
                visual_id=visual_id,
                request_id=request_id,
                session_id=session_id,
                tenant_id=tenant_id,
                original_message=message,
                title=spec.title,
            )

            explanation = await self._generate_explanation(spec, message, _invoke)

            if meta.status.value == "ready":
                visual_payload = {
                    "kind": "generated_image",
                    "visual_id": visual_id,
                    "url": f"/api/visuals/{visual_id}",
                    "mime_type": "image/png",
                    "width": meta.width,
                    "height": meta.height,
                    "alt": spec.alt_text,
                }
                response_body = {
                    "type": "visual_response",
                    "title": spec.title,
                    "introduction": explanation.get("introduction", ""),
                    "sections": explanation.get("sections", []),
                    "key_takeaway": explanation.get("key_takeaway", ""),
                    "visual": visual_payload,
                }
                return {
                    "request_id": request_id,
                    "session_id": session_id,
                    "execution_path": "generated_image",
                    "response_type": intent.value,
                    "status": "success",
                    "visual_id": visual_id,
                    "answer": _json.dumps(response_body),
                }
            else:
                # Image generation failed — return explanation with error
                error_body = {
                    "type": "visual_response",
                    "title": spec.title,
                    "introduction": explanation.get("introduction", ""),
                    "sections": explanation.get("sections", []),
                    "key_takeaway": explanation.get("key_takeaway", ""),
                    "visual": None,
                    "visual_error": {
                        "error_code": meta.error_code,
                        "message": "The architecture visual could not be generated. The written explanation is still available.",
                    }
                }
                return {
                    "request_id": request_id,
                    "session_id": session_id,
                    "execution_path": "generated_image_failed",
                    "response_type": intent.value,
                    "status": "success",
                    "answer": _json.dumps(error_body),
                }

        # ── Fallback: unknown engine → text ───────────────────────────────────
        try:
            answer = await asyncio.to_thread(_invoke, message, _CHAT_SYSTEM_PROMPT, 2048, 0.3)
        except Exception:
            answer = "Unable to process this request. Please try again."
        return {
            "request_id": request_id,
            "session_id": session_id,
            "answer": answer,
            "execution_path": "fallback_text",
            "response_type": "TEXT",
            "status": "success",
        }

    def _chat_error_response(
        self, request_id: str, session_id: Optional[str], error_payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        return {
            "request_id": request_id,
            "session_id": session_id,
            "answer": None,
            "execution_path": "ai_rca_chat",
            "status": "error",
            **error_payload,
        }

    def _spec_to_structured_diagram(self, spec) -> Dict[str, Any]:
        """Convert VisualSpec to the JSON format expected by StructuredDiagramCard."""
        nodes = []
        groups = []
        for section in spec.sections:
            groups.append({"id": section.id, "label": section.label})
            for comp in section.components:
                nodes.append({
                    "id": comp.id,
                    "label": comp.label,
                    "groupId": section.id,
                    "type": comp.type,
                    "description": comp.description or "",
                })
        edges = []
        for i, rel in enumerate(spec.relationships):
            edges.append({
                "id": f"edge-{i}",
                "source": rel.source,
                "target": rel.target,
                "label": rel.label or "",
                "direction": rel.direction,
            })
        return {
            "title": spec.title,
            "direction": "LR" if spec.orientation == "landscape" else "TB",
            "groups": groups,
            "nodes": nodes,
            "edges": edges,
        }

    async def _generate_explanation(
        self, spec, message: str, invoke_fn
    ) -> Dict[str, Any]:
        """Generate the matching written explanation for a visual spec."""
        import json as _json
        import re as _re

        spec_summary = {
            "title": spec.title,
            "purpose": spec.purpose,
            "sections": [
                {
                    "label": s.label,
                    "components": [{"label": c.label, "id": c.id, "type": c.type} for c in s.components]
                }
                for s in spec.sections
            ],
            "relationships": [
                {"source": r.source, "target": r.target, "label": r.label}
                for r in spec.relationships[:15]  # cap for prompt length
            ],
        }

        explanation_prompt = (
            f"User question: {message}\n\n"
            f"VisualSpec:\n{_json.dumps(spec_summary, indent=2)}"
        )

        try:
            raw = await asyncio.to_thread(
                invoke_fn,
                explanation_prompt,
                _EXPLANATION_SYSTEM_PROMPT,
                1500,
                0.3,
            )
            match = _re.search(r'\{.*\}', raw, _re.DOTALL)
            if match:
                return _json.loads(match.group())
        except Exception as exc:
            logger.warning(f"Explanation generation failed: {exc}")

        # Fallback: build simple explanation from spec
        intro = f"This visual shows the {spec.title} architecture."
        sections = [
            {"heading": s.label, "content": f"Contains: {', '.join(c.label for c in s.components)}.", "component_ids": [c.id for c in s.components]}
            for s in spec.sections
        ]
        return {"introduction": intro, "sections": sections, "key_takeaway": spec.key_takeaway or ""}



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
