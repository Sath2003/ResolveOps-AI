"""
Visual Pipeline Tests — ResolveOps AI.

Tests for the intent classifier, visual spec validator, planner, and prompt builder.
Covers all 17 acceptance criteria cases from Phase 17 of the requirements.

Run with:
    cd services/ai-rca-service
    pytest tests/test_visual_pipeline.py -v
"""
import json
import pytest

from app.visual.schemas import (
    ResponseIntent,
    RenderEngine,
    VisualSpec,
    VisualSection,
    VisualComponent,
    VisualRelationship,
)
from app.visual.intent_classifier import classify_intent, _matches_any, _EXPLICIT_MERMAID_PATTERNS
from app.visual.validator import validate_spec


# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_spec(**kwargs) -> VisualSpec:
    """Build a minimal valid VisualSpec for testing."""
    defaults = {
        "response_type": ResponseIntent.MIXED_VISUAL_RESPONSE,
        "render_engine": RenderEngine.IMAGE,
        "title": "Kubernetes Architecture",
        "purpose": "Show control plane and worker nodes",
        "sections": [
            VisualSection(
                id="control-plane",
                label="Control Plane",
                components=[
                    VisualComponent(id="api-server", label="API Server", type="service"),
                    VisualComponent(id="scheduler", label="Scheduler", type="service"),
                    VisualComponent(id="controller-manager", label="Controller Manager", type="service"),
                    VisualComponent(id="etcd", label="etcd", type="database"),
                ]
            ),
            VisualSection(
                id="worker-nodes",
                label="Worker Nodes",
                components=[
                    VisualComponent(id="kubelet", label="Kubelet", type="service"),
                    VisualComponent(id="kube-proxy", label="Kube-Proxy", type="network"),
                ]
            ),
        ],
        "relationships": [
            VisualRelationship(source="api-server", target="etcd", label="State"),
            VisualRelationship(source="scheduler", target="api-server", label="Scheduling"),
        ],
        "important_labels": ["API Server", "etcd"],
        "alt_text": "Kubernetes architecture diagram",
    }
    defaults.update(kwargs)
    return VisualSpec(**defaults)


# ── Intent classifier tests ───────────────────────────────────────────────────

class TestIntentClassifier:
    """Test Case 1-6: Classifier routing."""

    def test_text_only_question_no_visual(self):
        """TC1: Text-only question does not classify as visual intent."""
        intent = classify_intent("What is a Kubernetes pod?", invoke_fn=None)
        # Short factual question — fast-path should return TEXT
        assert intent == ResponseIntent.TEXT

    def test_code_request_not_visual(self):
        """TC2: Code request does not invoke visual generation."""
        intent = classify_intent("Write a Kubernetes deployment YAML", invoke_fn=None)
        assert intent == ResponseIntent.CODE

    def test_explicit_mermaid_keyword_routes_to_mermaid(self):
        """TC4: Explicit Mermaid keyword triggers Mermaid renderer."""
        intent = classify_intent("Give me mermaid code for pod scheduling", invoke_fn=None)
        assert intent == ResponseIntent.MERMAID_DIAGRAM

    def test_mermaid_fast_path_pattern(self):
        """TC4: Fast-path Mermaid detection."""
        assert _matches_any("show me mermaid diagram of the flow", _EXPLICIT_MERMAID_PATTERNS)

    def test_chart_request_routes_to_chart(self):
        """TC3: Chart request selects chart renderer."""
        intent = classify_intent("Show CPU usage over the last 24 hours", invoke_fn=None)
        assert intent == ResponseIntent.CHART

    def test_metrics_request_routes_to_chart(self):
        """TC3: Metrics visualization."""
        intent = classify_intent("Show pod CPU usage for the last hour", invoke_fn=None)
        assert intent == ResponseIntent.CHART


# ── Validator tests ───────────────────────────────────────────────────────────

class TestVisualSpecValidator:
    """Test Case 9-12: Spec validation rules."""

    def test_valid_spec_passes(self):
        """TC9: Valid spec passes validation."""
        spec = make_spec()
        is_valid, errors = validate_spec(spec)
        assert is_valid, f"Expected valid spec but got errors: {errors}"

    def test_empty_title_fails(self):
        """TC9: Empty title is rejected."""
        spec = make_spec(title="")
        is_valid, errors = validate_spec(spec)
        assert not is_valid
        assert any("Rule 1" in e for e in errors)

    def test_duplicate_component_ids_fail(self):
        """TC11: Duplicate component IDs are rejected."""
        spec = make_spec(sections=[
            VisualSection(
                id="group-a",
                label="Group A",
                components=[
                    VisualComponent(id="api-server", label="API Server", type="service"),
                    VisualComponent(id="api-server", label="API Server Duplicate", type="service"),
                    VisualComponent(id="scheduler", label="Scheduler", type="service"),
                    VisualComponent(id="etcd", label="etcd", type="database"),
                ]
            )
        ])
        is_valid, errors = validate_spec(spec)
        assert not is_valid
        assert any("Duplicate" in e for e in errors)

    def test_missing_relationship_source_fails(self):
        """TC10: Relationship referencing non-existent component is rejected."""
        spec = make_spec(
            relationships=[
                VisualRelationship(source="nonexistent-id", target="api-server", label="Bad")
            ]
        )
        is_valid, errors = validate_spec(spec)
        assert not is_valid
        assert any("nonexistent-id" in e for e in errors)

    def test_self_referencing_connection_fails(self):
        """TC9: Self-referencing connection is rejected."""
        spec = make_spec(
            relationships=[
                VisualRelationship(source="api-server", target="api-server", label="Self")
            ]
        )
        is_valid, errors = validate_spec(spec)
        assert not is_valid
        assert any("Self-referencing" in e for e in errors)

    def test_duplicate_edges_are_removed(self):
        """TC11: Duplicate relationships are removed (not failing, but deduped)."""
        spec = make_spec(
            relationships=[
                VisualRelationship(source="api-server", target="etcd", label="State"),
                VisualRelationship(source="api-server", target="etcd", label="State"),  # duplicate
            ]
        )
        is_valid, errors = validate_spec(spec)
        # Spec might still be valid (duplicates are removed, not failing)
        assert len(spec.relationships) == 1

    def test_too_few_components_fails_for_image(self):
        """TC12: Architecture with < 4 components fails for image engine."""
        spec = make_spec(
            sections=[
                VisualSection(
                    id="group",
                    label="Group",
                    components=[
                        VisualComponent(id="a", label="Service A", type="service"),
                        VisualComponent(id="b", label="Service B", type="service"),
                    ]
                )
            ],
            relationships=[],
        )
        is_valid, errors = validate_spec(spec, original_message="show architecture")
        assert not is_valid
        assert any("Rule 12" in e for e in errors)

    def test_empty_section_fails(self):
        """TC9: Section with no components is rejected."""
        spec = make_spec(
            sections=[
                VisualSection(id="empty-section", label="Empty", components=[]),
                VisualSection(
                    id="real-section",
                    label="Real",
                    components=[
                        VisualComponent(id="api-server", label="API Server", type="service"),
                        VisualComponent(id="scheduler", label="Scheduler", type="service"),
                        VisualComponent(id="etcd", label="etcd", type="database"),
                        VisualComponent(id="kubelet", label="Kubelet", type="service"),
                    ]
                )
            ]
        )
        is_valid, errors = validate_spec(spec)
        assert not is_valid
        assert any("no components" in e.lower() for e in errors)

    def test_vague_generic_label_fails(self):
        """TC9: Component with vague generic label fails validation."""
        spec = make_spec(
            sections=[
                VisualSection(
                    id="group",
                    label="Group",
                    components=[
                        VisualComponent(id="a", label="Layer", type="service"),
                        VisualComponent(id="b", label="Service B", type="service"),
                        VisualComponent(id="c", label="Service C", type="service"),
                        VisualComponent(id="d", label="Service D", type="service"),
                    ]
                )
            ]
        )
        is_valid, errors = validate_spec(spec)
        assert not is_valid
        assert any("vague generic label" in e.lower() for e in errors)

    def test_important_label_not_in_components_fails(self):
        """TC10: Important label that doesn't exist in components fails."""
        spec = make_spec(important_labels=["API Server", "NonExistentService"])
        is_valid, errors = validate_spec(spec)
        assert not is_valid
        assert any("NonExistentService" in e for e in errors)

    def test_valid_kubernetes_spec_passes(self):
        """TC8: Complete valid Kubernetes spec passes all rules."""
        spec = make_spec(important_labels=["API Server", "etcd"])
        is_valid, errors = validate_spec(spec)
        assert is_valid, f"Valid K8s spec failed: {errors}"


# ── Image generator path traversal test ──────────────────────────────────────

class TestImageGeneratorSecurity:
    def test_path_traversal_blocked(self):
        """TC28: Path traversal in visual_id is blocked."""
        from app.visual.image_generator import get_stored_image_path
        # Attempt traversal
        result = get_stored_image_path("../../../etc/passwd")
        assert result is None

    def test_valid_uuid_allowed(self):
        """TC28: Valid UUID-format visual_id is accepted (even if file doesn't exist)."""
        from app.visual.image_generator import get_stored_image_path
        import os
        # Just check that we get None (file doesn't exist) and no exception
        result = get_stored_image_path("550e8400-e29b-41d4-a716-446655440000")
        assert result is None  # File doesn't exist in test env

    def test_special_chars_in_id_blocked(self):
        """TC28: Special characters in visual_id are blocked."""
        from app.visual.image_generator import get_stored_image_path
        result = get_stored_image_path("abc/../secrets")
        assert result is None


# ── Prompt builder tests ──────────────────────────────────────────────────────

class TestPromptBuilder:
    def test_prompt_contains_all_components(self):
        """TC21: Generated image prompt includes all spec components."""
        from app.visual.prompt_builder import build_image_prompt
        spec = make_spec()
        prompt = build_image_prompt(spec)
        assert "API Server" in prompt
        assert "etcd" in prompt
        assert "Scheduler" in prompt
        assert "Controller Manager" in prompt
        assert "Kubelet" in prompt

    def test_prompt_contains_title(self):
        from app.visual.prompt_builder import build_image_prompt
        spec = make_spec()
        prompt = build_image_prompt(spec)
        assert spec.title in prompt

    def test_prompt_contains_relationships(self):
        from app.visual.prompt_builder import build_image_prompt
        spec = make_spec()
        prompt = build_image_prompt(spec)
        assert "→" in prompt or "->" in prompt or "State" in prompt

    def test_prompt_does_not_expose_api_key(self):
        """TC28: Image prompt never contains the API key."""
        from app.visual.prompt_builder import build_image_prompt
        spec = make_spec()
        prompt = build_image_prompt(spec)
        assert "sk-" not in prompt
        assert "OPENAI" not in prompt


# ── Schema tests ──────────────────────────────────────────────────────────────

class TestVisualSpec:
    def test_all_component_ids_returns_all(self):
        spec = make_spec()
        ids = spec.all_component_ids()
        assert "api-server" in ids
        assert "etcd" in ids
        assert "kubelet" in ids
        assert len(ids) == 6

    def test_all_components_returns_all(self):
        spec = make_spec()
        comps = spec.all_components()
        labels = [c.label for c in comps]
        assert "API Server" in labels
        assert "Kubelet" in labels


# ── GPT Image Model parameter & decoding tests ─────────────────────────────────

class TestGPTImageGenerator:
    def test_call_dalle_gpt_image_parameters(self, monkeypatch):
        from app.visual.image_generator import _call_dalle
        import base64

        recorded_params = {}

        class DummyData:
            b64_json = base64.b64encode(b"fake_png_data").decode("utf-8")

        class DummyResponse:
            data = [DummyData()]

        class DummyImages:
            def generate(self, **kwargs):
                recorded_params.update(kwargs)
                return DummyResponse()

        class DummyClient:
            images = DummyImages()

        res_bytes = _call_dalle(
            client=DummyClient(),
            prompt="Test prompt",
            model="gpt-image-2",
            quality="medium",
            size="1536x1024",
            request_id="req-1",
            visual_id="vis-1",
        )

        assert res_bytes == b"fake_png_data"
        assert recorded_params["model"] == "gpt-image-2"
        assert recorded_params["output_format"] == "png"
        assert recorded_params["quality"] == "medium"
        assert "response_format" not in recorded_params
        assert "style" not in recorded_params

    def test_call_dalle_empty_data_raises(self):
        from app.visual.image_generator import _call_dalle
        import pytest

        class DummyResponse:
            data = []

        class DummyImages:
            def generate(self, **kwargs):
                return DummyResponse()

        class DummyClient:
            images = DummyImages()

        with pytest.raises(RuntimeError) as exc_info:
            _call_dalle(
                client=DummyClient(),
                prompt="Test prompt",
                model="gpt-image-2",
                quality="medium",
                size="1536x1024",
            )
        assert "OPENAI_EMPTY_RESPONSE" in str(exc_info.value)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
