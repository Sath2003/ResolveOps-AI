"""
Visual Generation Schemas — ResolveOps AI.

Pydantic models for the full visual planning and rendering pipeline.
No raw provider data or secrets are stored in these models.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ── Response Intent ──────────────────────────────────────────────────────────

class ResponseIntent(str, Enum):
    TEXT = "TEXT"
    CODE = "CODE"
    TABLE = "TABLE"
    CHART = "CHART"
    MERMAID_DIAGRAM = "MERMAID_DIAGRAM"
    STRUCTURED_DIAGRAM = "STRUCTURED_DIAGRAM"
    GENERATED_IMAGE = "GENERATED_IMAGE"
    MIXED_VISUAL_RESPONSE = "MIXED_VISUAL_RESPONSE"


class RenderEngine(str, Enum):
    TEXT = "text"
    CODE = "code"
    MERMAID = "mermaid"
    STRUCTURED = "structured"
    IMAGE = "image"
    CHART = "chart"
    TABLE = "table"


# ── Visual Specification ──────────────────────────────────────────────────────

class VisualComponent(BaseModel):
    """A single component / node in the architecture."""
    id: str = Field(..., description="Unique alphanumeric identifier, e.g. 'api-server'")
    label: str = Field(..., description="Human-readable display name")
    type: str = Field("service", description="Component type: service, database, client, gateway, storage, queue, etc.")
    description: Optional[str] = None
    group_id: Optional[str] = None


class VisualSection(BaseModel):
    """A logical grouping of components (e.g. 'Control Plane', 'Worker Nodes')."""
    id: str
    label: str
    components: List[VisualComponent] = []


class VisualRelationship(BaseModel):
    """A directional connection between two components."""
    source: str = Field(..., description="Component ID of the source")
    target: str = Field(..., description="Component ID of the target")
    label: Optional[str] = None
    direction: str = Field("forward", description="forward | bidirectional")


class ExplanationSection(BaseModel):
    heading: str
    content: str
    component_ids: List[str] = []


class VisualSpec(BaseModel):
    """
    Complete visual specification produced by the two-stage planner.
    This is the canonical source of truth for both rendering and explanation.
    """
    response_type: ResponseIntent
    render_engine: RenderEngine
    title: str
    purpose: str
    audience: str = "DevOps engineer"
    orientation: str = "landscape"
    style: str = "professional enterprise cloud architecture"
    sections: List[VisualSection] = []
    relationships: List[VisualRelationship] = []
    important_labels: List[str] = []
    explanation_sections: List[ExplanationSection] = []
    key_takeaway: Optional[str] = None
    alt_text: str = ""
    image_prompt: str = ""  # Populated by prompt_builder

    def all_component_ids(self) -> List[str]:
        ids = []
        for section in self.sections:
            for comp in section.components:
                ids.append(comp.id)
        return ids

    def all_components(self) -> List[VisualComponent]:
        comps = []
        for section in self.sections:
            comps.extend(section.components)
        return comps


# ── Visual Metadata (storage record) ─────────────────────────────────────────

class VisualStatus(str, Enum):
    PENDING = "pending"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"


class VisualMetadata(BaseModel):
    """Metadata stored with each generated visual asset."""
    visual_id: str
    session_id: Optional[str] = None
    tenant_id: Optional[str] = None
    request_id: str
    original_message: str = ""
    title: str = ""
    render_engine: str = ""
    storage_path: Optional[str] = None     # local file path, never base64
    url_path: Optional[str] = None         # /api/visuals/{visual_id}
    mime_type: str = "image/png"
    width: int = 1792
    height: int = 1024
    status: VisualStatus = VisualStatus.PENDING
    error_code: Optional[str] = None
    parent_visual_id: Optional[str] = None  # for edits
    created_at: Optional[str] = None


# ── API Response models ───────────────────────────────────────────────────────

class VisualPayload(BaseModel):
    """Embedded in the chat response when a visual is included."""
    kind: str                       # "generated_image" | "structured_diagram" | "mermaid"
    visual_id: Optional[str] = None
    url: Optional[str] = None       # /api/visuals/{id}  — never a raw storage path
    mime_type: str = "image/png"
    width: int = 1792
    height: int = 1024
    alt: str = ""
    # For structured/mermaid diagrams returned inline
    spec: Optional[Dict[str, Any]] = None
    mermaid_code: Optional[str] = None


class VisualChatResponse(BaseModel):
    """Structured visual response embedded in the chat answer."""
    type: str = "visual_response"
    title: str
    introduction: str
    sections: List[ExplanationSection] = []
    key_takeaway: Optional[str] = None
    visual: Optional[VisualPayload] = None
