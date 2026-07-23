"""
Visual Planner — ResolveOps AI.

Stage A: Uses the LLM to convert the user's message into a structured VisualSpec.
Stage B: Validates the spec and retries once with a correction prompt if invalid.

The planner is generic — it never hardcodes architecture components.
The LLM receives the user's actual question and produces a spec
dynamically tailored to that specific topic.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Callable, List, Optional, Tuple

from app.visual.schemas import (
    ExplanationSection,
    RenderEngine,
    ResponseIntent,
    VisualComponent,
    VisualRelationship,
    VisualSection,
    VisualSpec,
)
from app.visual.validator import build_correction_prompt, validate_spec

logger = logging.getLogger(__name__)

# ── Planner system prompt ─────────────────────────────────────────────────────

_PLANNER_SYSTEM_PROMPT = """You are a visual architecture planner for ResolveOps AI.

Your job is to convert the user's request into a structured JSON visual specification.

The specification must:
1. Be specific to the user's EXACT topic — do not reuse generic templates
2. Include all meaningful components for the requested subject
3. Define clear sections/groups (e.g. "Control Plane", "Worker Nodes", "Client")
4. Define explicit relationships between named components
5. Include a clear explanation structure
6. Use short, precise labels (no vague terms like "Layer", "Component", "Box")

Return ONLY a valid JSON object matching this schema exactly:

{
  "response_type": "MIXED_VISUAL_RESPONSE",  // or GENERATED_IMAGE, STRUCTURED_DIAGRAM
  "render_engine": "image",                  // "image" | "structured" | "mermaid"
  "title": "Short descriptive title",
  "purpose": "What this visual explains",
  "audience": "DevOps engineer",
  "orientation": "landscape",
  "style": "professional enterprise cloud architecture",
  "sections": [
    {
      "id": "section-id",
      "label": "Section Display Name",
      "components": [
        {
          "id": "unique-component-id",
          "label": "Component Display Name",
          "type": "service|database|client|gateway|storage|queue|loadbalancer|network|container|pod|node",
          "description": "One-line description of this component's role"
        }
      ]
    }
  ],
  "relationships": [
    {
      "source": "source-component-id",
      "target": "target-component-id",
      "label": "Short connection label",
      "direction": "forward"
    }
  ],
  "important_labels": ["Label1", "Label2"],
  "explanation_sections": [
    {
      "heading": "Section heading",
      "content": "Paragraph explaining this section",
      "component_ids": ["id1", "id2"]
    }
  ],
  "key_takeaway": "One sentence key insight",
  "alt_text": "Accessibility description of the visual"
}

Rules:
- Component IDs must be unique, alphanumeric with hyphens only (e.g. "api-server", "etcd-db")
- Labels must be specific to the topic — no "Component", "Service", "Layer" alone
- Include at least 4 components for any architecture topic
- Every section must have at least 1 component
- Every relationship must reference existing component IDs
- Do NOT self-reference (source == target)
- Do NOT invent components not related to the user's question
- Render engine selection:
  * "image" for polished/professional/presentation-quality requests
  * "structured" for exact connections, editable, precise technical diagrams
  * "mermaid" ONLY when explicitly requested
"""


def plan_visual_spec(
    message: str,
    intent: ResponseIntent,
    invoke_fn: Callable,
    history_summary: Optional[str] = None,
    previous_spec: Optional[VisualSpec] = None,
) -> Tuple[Optional[VisualSpec], List[str]]:
    """
    Two-stage visual planning pipeline.

    Stage A: Generate spec from the user's message.
    Stage B: Validate, and retry once with a correction prompt if invalid.

    Args:
        message: Current user message.
        intent: Classified ResponseIntent.
        invoke_fn: LLM invocation callable.
        history_summary: Brief summary of prior conversation.
        previous_spec: Previous VisualSpec for edit requests.

    Returns:
        (VisualSpec, []) on success.
        (None, [error messages]) on failure after retry.
    """
    # ── Build planning prompt ────────────────────────────────────────────────
    context_parts = [f"User request: {message}"]
    if history_summary:
        context_parts.append(f"Conversation context: {history_summary}")
    if previous_spec:
        context_parts.append(
            f"Previous visual specification (for edit requests):\n"
            f"Title: {previous_spec.title}\n"
            f"Components: {', '.join(c.label for c in previous_spec.all_components())}"
        )
    if intent == ResponseIntent.STRUCTURED_DIAGRAM:
        context_parts.append("NOTE: User wants an EDITABLE structured diagram. Use render_engine='structured'.")
    elif intent == ResponseIntent.GENERATED_IMAGE:
        context_parts.append("NOTE: User wants a polished AI-generated IMAGE. Use render_engine='image'.")
    elif intent == ResponseIntent.MIXED_VISUAL_RESPONSE:
        context_parts.append("NOTE: Use render_engine='image' for a professional visual with explanation.")

    planning_prompt = "\n\n".join(context_parts)

    # ── Stage A: Generate spec ───────────────────────────────────────────────
    spec, errors = _generate_spec(planning_prompt, invoke_fn, message)
    if spec is None:
        return None, errors

    is_valid, validation_errors = validate_spec(spec, original_message=message)
    if is_valid:
        return spec, []

    # ── Stage B: Retry with correction prompt ────────────────────────────────
    logger.warning(
        "Visual spec validation failed on first attempt; retrying with correction",
        extra={"error_count": len(validation_errors)}
    )
    correction = build_correction_prompt(
        errors=validation_errors,
        original_message=message,
        spec_json=spec.model_dump_json(indent=2),
    )
    spec2, errors2 = _generate_spec(correction, invoke_fn, message)
    if spec2 is None:
        return None, errors2

    is_valid2, validation_errors2 = validate_spec(spec2, original_message=message)
    if is_valid2:
        return spec2, []

    logger.error(
        "Visual spec still invalid after retry",
        extra={"error_count": len(validation_errors2)}
    )
    return None, validation_errors2


def _generate_spec(
    prompt: str,
    invoke_fn: Callable,
    original_message: str,
) -> Tuple[Optional[VisualSpec], List[str]]:
    """Call the LLM and parse the VisualSpec from the response."""
    try:
        raw = invoke_fn(
            prompt=prompt,
            system_prompt=_PLANNER_SYSTEM_PROMPT,
            max_tokens=3000,
            temperature=0.2,
        )
    except Exception as exc:
        logger.error("LLM call failed in visual planner", extra={"error": type(exc).__name__})
        return None, [f"LLM invocation failed: {type(exc).__name__}"]

    # Parse JSON from response
    try:
        # Try to extract JSON block
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', raw, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Find outermost { ... }
            brace_match = re.search(r'(\{.*\})', raw, re.DOTALL)
            if brace_match:
                json_str = brace_match.group(1)
            else:
                return None, ["LLM returned no JSON object in visual plan response."]

        data = json.loads(json_str)
    except (json.JSONDecodeError, AttributeError) as exc:
        return None, [f"Could not parse visual spec JSON: {exc}"]

    # ── Deserialise into VisualSpec ───────────────────────────────────────────
    try:
        spec = _dict_to_spec(data)
        return spec, []
    except Exception as exc:
        return None, [f"Could not build VisualSpec from LLM output: {exc}"]


def _dict_to_spec(data: dict) -> VisualSpec:
    """Convert a raw LLM JSON dict into a VisualSpec object."""
    # Sections
    sections = []
    for s in data.get("sections", []):
        comps = []
        for c in s.get("components", []):
            comps.append(VisualComponent(
                id=str(c.get("id", "")).strip(),
                label=str(c.get("label", "")).strip(),
                type=str(c.get("type", "service")).strip(),
                description=c.get("description"),
                group_id=s.get("id"),
            ))
        sections.append(VisualSection(
            id=str(s.get("id", "")).strip(),
            label=str(s.get("label", "")).strip(),
            components=comps,
        ))

    # Relationships
    relationships = []
    for r in data.get("relationships", []):
        relationships.append(VisualRelationship(
            source=str(r.get("source", "")).strip(),
            target=str(r.get("target", "")).strip(),
            label=r.get("label"),
            direction=str(r.get("direction", "forward")),
        ))

    # Explanation sections
    explanation_sections = []
    for e in data.get("explanation_sections", []):
        explanation_sections.append(ExplanationSection(
            heading=str(e.get("heading", "")).strip(),
            content=str(e.get("content", "")).strip(),
            component_ids=e.get("component_ids", []),
        ))

    # Map render_engine string to enum
    engine_map = {
        "image": RenderEngine.IMAGE,
        "structured": RenderEngine.STRUCTURED,
        "mermaid": RenderEngine.MERMAID,
        "chart": RenderEngine.CHART,
        "table": RenderEngine.TABLE,
        "code": RenderEngine.CODE,
        "text": RenderEngine.TEXT,
    }
    render_engine = engine_map.get(
        str(data.get("render_engine", "image")).lower(),
        RenderEngine.IMAGE,
    )

    # Map response_type string to enum
    try:
        response_type = ResponseIntent(data.get("response_type", "MIXED_VISUAL_RESPONSE"))
    except ValueError:
        response_type = ResponseIntent.MIXED_VISUAL_RESPONSE

    return VisualSpec(
        response_type=response_type,
        render_engine=render_engine,
        title=str(data.get("title", "Architecture Diagram")).strip(),
        purpose=str(data.get("purpose", "")).strip(),
        audience=str(data.get("audience", "DevOps engineer")).strip(),
        orientation=str(data.get("orientation", "landscape")).strip(),
        style=str(data.get("style", "professional enterprise cloud architecture")).strip(),
        sections=sections,
        relationships=relationships,
        important_labels=data.get("important_labels", []),
        explanation_sections=explanation_sections,
        key_takeaway=data.get("key_takeaway"),
        alt_text=str(data.get("alt_text", "")).strip(),
    )
