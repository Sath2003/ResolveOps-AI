"""
AI-RCA Service — FastAPI entrypoint.

Responsibilities:
  - Incident investigation (POST /api/v1/rca/investigate)  ← new MCP-powered flow
  - Chat handling (POST /api/v1/rca/chat)                  ← new, when AI_RCA_CHAT_ENABLED
  - Legacy analyze endpoint (POST /api/v1/rca/analyze)     ← preserved, feature-flag fallback
  - Provider status (GET  /api/v1/ai/provider-status)      ← new
  - Health check  (GET  /health)

Feature flags (all env-var controlled):
  MCP_RCA_ENABLED          – use MCP tools for investigation
  AI_RCA_CHAT_ENABLED      – this service handles chat requests from API Gateway
  LEGACY_GATEWAY_RAG_ENABLED – legacy RAG path (controlled in api-gateway-service)
"""
import logging
import sys

# ── Logging must be configured before any other imports ──────────────────────
from app.logging_config import configure_logging
from app.settings import settings
configure_logging(settings.LOG_LEVEL)

logger = logging.getLogger(__name__)

import os
import re
import json
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from app.settings import settings
from app.errors import (
    ErrorCode,
    build_error_response,
    classify_provider_exception,
)
from app.bedrock_client import bedrock_client, _SafeError
from app.agent.orchestrator import orchestrator
from app.schemas.investigation import InvestigationRequest, ChatRequest


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — validate configuration and log effective settings
    warnings = settings.validate()
    for w in warnings:
        logger.warning("Configuration warning", extra={"detail": w})

    openai_key_configured = bool(settings.OPENAI_API_KEY)
    logger.info(
        "AI-RCA service starting",
        extra={
            "provider": settings.AI_PROVIDER,
            "model": settings.OPENAI_MODEL if settings.AI_PROVIDER == "openai" else settings.BEDROCK_MODEL_ID,
            "openai_api_key_configured": openai_key_configured,
            "mcp_enabled": settings.MCP_RCA_ENABLED,
            "chat_via_rca": settings.AI_RCA_CHAT_ENABLED,
            "fallback_enabled": settings.OPENAI_FALLBACK_ENABLED,
            "rag_provider": settings.RAG_PROVIDER,
        },
    )
    yield
    logger.info("AI-RCA service shutting down")


app = FastAPI(title="ai-rca-service", lifespan=lifespan)


# ── Health + Status ───────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ai-rca-service",
        "provider": settings.AI_PROVIDER,
        "mcp_enabled": settings.MCP_RCA_ENABLED,
        "chat_enabled": settings.AI_RCA_CHAT_ENABLED,
    }


@app.get("/api/v1/ai/provider-status")
def get_provider_status():
    """
    Returns safe, user-facing provider status.
    Never exposes: credentials, API keys, account IDs, internal exceptions.
    """
    return settings.provider_status_dict()


# ── New: Structured Investigation Endpoint ────────────────────────────────────

@app.post("/api/v1/rca/investigate")
async def investigate(req: InvestigationRequest, request: Request):
    """
    MCP-powered incident investigation.

    Accepts: incident_id, service, question, time_window_minutes
    Returns: structured RCA with live evidence, tools used, confidence.

    Execution path: mcp_rca (when MCP_RCA_ENABLED=true)
                    direct_bedrock (when MCP_RCA_ENABLED=false)
    """
    if not req.incident_id and not req.service and not req.question:
        raise HTTPException(
            status_code=400,
            detail="At least one of incident_id, service, or question is required.",
        )

    result = await orchestrator.investigate(req)

    # If the orchestrator returned an error response, preserve the structure
    if result.get("status") == "error":
        return JSONResponse(status_code=200, content=result)

    return result


# ── New: Chat Endpoint (AI_RCA_CHAT_ENABLED) ─────────────────────────────────

@app.post("/api/v1/rca/chat")
async def chat(req: ChatRequest):
    """
    Chat handler for AI-RCA — called by API Gateway when AI_RCA_CHAT_ENABLED=true.
    Returns a structured response with execution_path for frontend audit.
    """
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    result = await orchestrator.chat(
        message=req.message,
        session_id=req.session_id,
        tenant_id=req.tenant_id,
        previous_visual_spec=req.previous_visual_spec,
    )
    return result


# ── Legacy: /api/v1/rca/analyze (preserved, feature-flag fallback) ────────────

class AnalyzeRequest(BaseModel):
    source: str
    context: str
    logs: str


@app.post("/api/v1/rca/analyze")
def analyze_rca(req: AnalyzeRequest):
    """
    Legacy analyze endpoint — preserved for backwards compatibility.
    Called by github-intelligence-service and legacy API Gateway path.

    Uses the centralised bedrock_client (not raw boto3).
    Never exposes raw provider exceptions.
    """
    request_id = str(uuid.uuid4())

    prompt = (
        "You are an expert DevSecOps SRE Assistant.\n"
        "Analyze the following logs for root cause analysis.\n"
        f"Context: {req.context}\n"
        f"Logs:\n{req.logs}\n\n"
        "Return a JSON object with keys: summary, probable_root_cause, "
        "recommended_fix (array), evidence (array)."
    )

    try:
        raw = bedrock_client.invoke(
            prompt=prompt,
            system_prompt="You are a helpful AI that returns strictly valid JSON.",
            max_tokens=2048,
            temperature=0.1,
            request_id=request_id,
        )

        # Extract JSON
        json_match = re.search(r"(\{.*\})", raw, re.DOTALL)
        if json_match:
            raw = json_match.group(1)
        parsed = json.loads(raw)

        return {
            "status": "success",
            "execution_path": "legacy_analyze",
            "request_id": request_id,
            "analysis": {
                "status": "ai_generated",
                "provider": settings.AI_PROVIDER,
                "summary": parsed.get("summary", "Analysis"),
                "probable_root_cause": parsed.get("probable_root_cause", ""),
                "recommended_fix": parsed.get("recommended_fix", []),
                "evidence": parsed.get("evidence", []),
                "ai_provider_status": "available",
            },
        }

    except _SafeError as exc:
        # Return safe error structure — never HTTP 500 with raw detail
        logger.error(
            "Legacy analyze failed",
            extra={"request_id": request_id, "error_code": exc.response["error"]["code"]},
        )
        return JSONResponse(
            status_code=200,
            content={
                "status": "error",
                "execution_path": "legacy_analyze",
                "request_id": request_id,
                **exc.response,
            },
        )

    except (json.JSONDecodeError, ValueError):
        # Bedrock returned text but not valid JSON — return raw text with degraded status
        return {
            "status": "success",
            "execution_path": "legacy_analyze",
            "request_id": request_id,
            "analysis": {
                "status": "ai_generated",
                "provider": settings.AI_PROVIDER,
                "summary": "Analysis (unstructured)",
                "probable_root_cause": raw[:2000] if isinstance(raw, str) else str(raw)[:2000],
                "recommended_fix": [],
                "evidence": [],
                "ai_provider_status": "available",
            },
        }

    except Exception as exc:
        code = classify_provider_exception(exc)
        logger.error(
            "Legacy analyze unexpected error",
            extra={"request_id": request_id, "exc_type": type(exc).__name__, "error_code": code},
        )
        err = build_error_response(code, request_id)
        return JSONResponse(
            status_code=200,
            content={
                "status": "error",
                "execution_path": "legacy_analyze",
                "request_id": request_id,
                **err,
            },
        )
