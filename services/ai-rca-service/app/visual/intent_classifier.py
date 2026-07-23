"""
Visual Intent Classifier — ResolveOps AI.

Uses the AI provider (OpenAI / Bedrock) to classify every user message
into a ResponseIntent.  Never uses hardcoded keyword lists as the sole
classification mechanism.

Classification logic is driven by a structured LLM prompt that returns JSON.
Keywords are only used as a secondary fast-path when the message is
unambiguously code-only or text-only to avoid unnecessary LLM calls.
"""
from __future__ import annotations

import json
import logging
import re
from typing import List, Optional

from app.visual.schemas import ResponseIntent

logger = logging.getLogger(__name__)


# ── Fast-path heuristics (used ONLY to avoid unnecessary LLM calls) ──────────

_EXPLICIT_MERMAID_PATTERNS = [
    r"\bmermaid\b",
    r"\bgraph\s+(TD|LR|TB|RL)\b",
    r"\bflowchart\s+(TD|LR|TB|RL)\b",
    r"\bgive me mermaid\b",
    r"\bmermaid code\b",
    r"\bmermaid diagram\b",
]

_EXPLICIT_CODE_PATTERNS = [
    r"\bwrite.*\bya?ml\b",
    r"\bgenerate.*\bya?ml\b",
    r"\bdeployment yaml\b",
    r"\bdockerfile\b",
    r"\bwrite a script\b",
    r"\bwrite.*code\b",
    r"\bcode snippet\b",
    r"\bsample code\b",
    r"\bkubectl.*command\b",
]

_EXPLICIT_CHART_PATTERNS = [
    r"\bcpu usage\b",
    r"\bmemory usage\b",
    r"\bshow.*metrics?\b",
    r"\bplot.*\b",
    r"\btrend.*over.*hour\b",
    r"\bgraph of\b",
    r"\btime series\b",
]


def _matches_any(text: str, patterns: List[str]) -> bool:
    for pat in patterns:
        if re.search(pat, text, re.IGNORECASE):
            return True
    return False


# ── LLM-based classifier ─────────────────────────────────────────────────────

_CLASSIFIER_SYSTEM_PROMPT = """You are a response-type classifier for the ResolveOps AI system.
Classify the user's message into exactly ONE of these types:

- TEXT: General explanation, question answering, or concept description (no visual needed)
- CODE: Request for YAML, Dockerfile, script, command, or code snippet
- TABLE: Request for structured tabular data (comparison, list of resources, etc.)
- CHART: Request for metrics visualization, time series, usage graphs
- MERMAID_DIAGRAM: Explicit request for Mermaid code or Mermaid diagram syntax
- STRUCTURED_DIAGRAM: Request for exact editable technical diagram with named components and connections
- GENERATED_IMAGE: Request for polished, presentation-quality architecture image or infographic
- MIXED_VISUAL_RESPONSE: Request for architecture explanation WITH a professional visual

Classification rules:
1. "Explain X" alone → TEXT (no visual unless also asking for diagram/image)
2. "Write a YAML / script / code" → CODE
3. "Show CPU/memory usage over time" → CHART
4. "Give me mermaid code for X" or "mermaid diagram of X" → MERMAID_DIAGRAM
5. "Show exact connections between service A, B, C" or "editable diagram" or "precise architecture I can edit" → STRUCTURED_DIAGRAM
6. "Create a polished/presentation-quality/professional image/infographic of X" → GENERATED_IMAGE
7. "Explain X with a diagram/architecture visual" or "show X architecture" → MIXED_VISUAL_RESPONSE
8. "Show X architecture" without explicit format → MIXED_VISUAL_RESPONSE
9. Do NOT classify as GENERATED_IMAGE just because words like "diagram" or "architecture" appear
10. Do NOT classify as MERMAID_DIAGRAM unless Mermaid is explicitly mentioned

Respond with ONLY a valid JSON object:
{"intent": "<ONE_OF_THE_TYPES_ABOVE>", "reasoning": "<one sentence>"}
"""


def classify_intent(
    message: str,
    history_summary: Optional[str] = None,
    invoke_fn=None,
) -> ResponseIntent:
    """
    Classify the user message into a ResponseIntent.

    Args:
        message: The current user message.
        history_summary: Optional brief summary of recent conversation (for context).
        invoke_fn: Callable that takes (prompt, system_prompt) and returns str.
                   Must be provided; injected by the orchestrator.

    Returns:
        ResponseIntent enum value.
    """
    msg_lower = message.strip().lower()

    # ── Fast-path: explicit Mermaid ───────────────────────────────────────────
    if _matches_any(msg_lower, _EXPLICIT_MERMAID_PATTERNS):
        logger.info("Intent fast-path: MERMAID_DIAGRAM (explicit mermaid keyword)")
        return ResponseIntent.MERMAID_DIAGRAM

    # ── Fast-path: explicit chart/metrics ────────────────────────────────────
    if _matches_any(msg_lower, _EXPLICIT_CHART_PATTERNS):
        logger.info("Intent fast-path: CHART")
        return ResponseIntent.CHART

    # ── Fast-path: explicit code ──────────────────────────────────────────────
    if _matches_any(msg_lower, _EXPLICIT_CODE_PATTERNS):
        logger.info("Intent fast-path: CODE")
        return ResponseIntent.CODE

    # ── Short greeting / simple factual question → TEXT ──────────────────────
    if len(msg_lower.split()) <= 6 and not any(
        kw in msg_lower for kw in ["diagram", "image", "architecture", "visual", "chart", "show", "draw"]
    ):
        logger.info("Intent fast-path: TEXT (short message, no visual keywords)")
        return ResponseIntent.TEXT

    # ── LLM classification ────────────────────────────────────────────────────
    if invoke_fn is None:
        logger.warning("No invoke_fn provided to classify_intent; defaulting to MIXED_VISUAL_RESPONSE")
        return ResponseIntent.MIXED_VISUAL_RESPONSE

    context = f"User message: {message}"
    if history_summary:
        context += f"\n\nRecent conversation context: {history_summary}"

    try:
        raw = invoke_fn(
            prompt=context,
            system_prompt=_CLASSIFIER_SYSTEM_PROMPT,
            max_tokens=200,
            temperature=0.0,
        )
        # Parse JSON from response
        match = re.search(r'\{[^}]+\}', raw, re.DOTALL)
        if match:
            data = json.loads(match.group())
            intent_str = data.get("intent", "MIXED_VISUAL_RESPONSE")
            reasoning = data.get("reasoning", "")
            logger.info(
                "Intent classified by LLM",
                extra={"intent": intent_str, "reasoning": reasoning}
            )
            try:
                return ResponseIntent(intent_str)
            except ValueError:
                logger.warning(f"LLM returned unknown intent '{intent_str}', defaulting to MIXED_VISUAL_RESPONSE")
                return ResponseIntent.MIXED_VISUAL_RESPONSE
    except Exception as exc:
        logger.warning(f"Intent classification LLM call failed: {exc}; defaulting to MIXED_VISUAL_RESPONSE")

    return ResponseIntent.MIXED_VISUAL_RESPONSE
