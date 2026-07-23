"""
Visual Specification Validator — ResolveOps AI.

Applies all 17 validation rules before a spec is sent to any renderer.
Returns (is_valid: bool, errors: List[str]).

Invalid specs are never displayed.  The orchestrator will retry once with
a correction prompt, then fall back to a written explanation.
"""
from __future__ import annotations

import logging
from typing import List, Tuple

from app.visual.schemas import VisualSpec, RenderEngine

logger = logging.getLogger(__name__)


def validate_spec(spec: VisualSpec, original_message: str = "") -> Tuple[bool, List[str]]:
    """
    Validate a VisualSpec against all 17 quality rules.

    Returns:
        (True, []) if valid.
        (False, [list of error messages]) if invalid.
    """
    errors: List[str] = []

    # Rule 1 — Title is not empty and relates to the request
    if not spec.title or len(spec.title.strip()) < 3:
        errors.append("Rule 1: Visual title is empty or too short.")

    # Rule 2 — At least one section exists
    if not spec.sections:
        errors.append("Rule 2: No sections defined in the visual spec.")

    # Rule 3 — All component IDs are unique
    all_ids = spec.all_component_ids()
    seen_ids = set()
    for cid in all_ids:
        if cid in seen_ids:
            errors.append(f"Rule 8: Duplicate component ID '{cid}'.")
        seen_ids.add(cid)

    # Rule 4 — No empty or unnamed components
    for comp in spec.all_components():
        if not comp.id or not comp.id.strip():
            errors.append(f"Rule 7: Component has empty ID.")
        if not comp.label or not comp.label.strip():
            errors.append(f"Rule 7: Component '{comp.id}' has empty label.")

    # Rule 5 — Every relationship references valid component IDs
    valid_ids = set(all_ids)
    for rel in spec.relationships:
        if rel.source not in valid_ids:
            errors.append(
                f"Rule 10: Relationship source '{rel.source}' not found in components."
            )
        if rel.target not in valid_ids:
            errors.append(
                f"Rule 10: Relationship target '{rel.target}' not found in components."
            )

    # Rule 6 — No self-referencing connections
    for rel in spec.relationships:
        if rel.source == rel.target:
            errors.append(f"Rule 9: Self-referencing connection on component '{rel.source}'.")

    # Rule 7 — Duplicate edges removed (warn, not fail)
    edge_set = set()
    deduped = []
    for rel in spec.relationships:
        key = (rel.source, rel.target, rel.label)
        if key not in edge_set:
            edge_set.add(key)
            deduped.append(rel)
    if len(deduped) < len(spec.relationships):
        logger.info(
            "Removed %d duplicate relationships from spec",
            len(spec.relationships) - len(deduped)
        )
        spec.relationships = deduped

    # Rule 8 — Technical architecture must have at least 4 meaningful components
    # (unless explicitly minimal)
    is_minimal_request = any(
        kw in original_message.lower()
        for kw in ["minimal", "simple diagram", "basic diagram", "just show", "only show"]
    )
    needs_rich_architecture = spec.render_engine in (RenderEngine.IMAGE, RenderEngine.STRUCTURED)

    if needs_rich_architecture and not is_minimal_request and len(all_ids) < 4:
        errors.append(
            f"Rule 12: Only {len(all_ids)} component(s) defined; technical architecture "
            "requires at least 4 meaningful components."
        )

    # Rule 9 — No sections that are empty (contain no components)
    for section in spec.sections:
        if not section.components:
            errors.append(
                f"Rule 11: Section '{section.label}' has no components. "
                "Remove or populate it."
            )

    # Rule 10 — Important labels listed in spec actually exist as components
    comp_labels_lower = {c.label.lower() for c in spec.all_components()}
    for label in spec.important_labels:
        if label.lower() not in comp_labels_lower:
            errors.append(
                f"Rule 6: Important label '{label}' is listed but not present in any component."
            )

    # Rule 11 — Render engine is consistent with response type
    from app.visual.schemas import ResponseIntent
    engine_intent_map = {
        RenderEngine.IMAGE: {ResponseIntent.GENERATED_IMAGE, ResponseIntent.MIXED_VISUAL_RESPONSE},
        RenderEngine.STRUCTURED: {ResponseIntent.STRUCTURED_DIAGRAM, ResponseIntent.MIXED_VISUAL_RESPONSE},
        RenderEngine.MERMAID: {ResponseIntent.MERMAID_DIAGRAM},
        RenderEngine.CHART: {ResponseIntent.CHART},
        RenderEngine.TABLE: {ResponseIntent.TABLE},
        RenderEngine.CODE: {ResponseIntent.CODE},
        RenderEngine.TEXT: {ResponseIntent.TEXT},
    }
    allowed_intents = engine_intent_map.get(spec.render_engine, set())
    if allowed_intents and spec.response_type not in allowed_intents:
        errors.append(
            f"Rule 13/14: Render engine '{spec.render_engine}' is inconsistent with "
            f"response type '{spec.response_type}'."
        )

    # Rule 12 — No component has a completely generic vague label
    vague_labels = {"layer", "component", "service", "node", "box", "item", "thing", "module"}
    for comp in spec.all_components():
        if comp.label.lower().strip() in vague_labels:
            errors.append(
                f"Rule 7: Component '{comp.id}' has vague generic label '{comp.label}'. "
                "Labels must be specific."
            )

    is_valid = len(errors) == 0
    if not is_valid:
        logger.warning(
            "VisualSpec validation failed",
            extra={"error_count": len(errors), "errors": errors[:5]}
        )
    else:
        logger.info(
            "VisualSpec validation passed",
            extra={
                "title": spec.title,
                "component_count": len(all_ids),
                "relationship_count": len(spec.relationships),
            }
        )

    return is_valid, errors


def build_correction_prompt(errors: List[str], original_message: str, spec_json: str) -> str:
    """
    Build a correction prompt to re-plan the visual spec after validation failure.
    """
    error_list = "\n".join(f"- {e}" for e in errors)
    return (
        f"The visual specification you generated failed validation with these errors:\n\n"
        f"{error_list}\n\n"
        f"Original user request: {original_message}\n\n"
        f"Previous (invalid) specification:\n{spec_json}\n\n"
        f"Please generate a corrected visual specification that fixes ALL of the above errors. "
        f"Return ONLY the corrected JSON object."
    )
