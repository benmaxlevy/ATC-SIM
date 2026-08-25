"""Path C /parse mock-mode contract (no GGUF download)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app import ParseRequest, create_app
from config import DEFAULT_PARSE_GGUF_FILE, DEFAULT_PARSE_MODEL_ID, Settings
from parse_engine import MOCK_PARSE_OK, validate_instruction, validate_parse_json


def _settings(*, parse_model_id: str | None, mock: bool = True) -> Settings:
    return Settings(
        host="127.0.0.1",
        port=8090,
        stt_model_id="mock",
        tts_voice="mock",
        parse_model_id=parse_model_id,
        parse_gguf_file=DEFAULT_PARSE_GGUF_FILE,
        cache_dir=Path("."),
        mock=mock,
        hf_token=None,
        cors_origins=(),
        stt_device=None,
        stt_compute_type=None,
        tts_voices=("mock",),
    )


def test_parse_request_schema_has_no_nbest_or_confidence() -> None:
    fields = set(ParseRequest.model_fields)
    assert fields == {"text", "source", "schemaVersion", "context"}
    assert "confidence" not in fields
    assert "nbest" not in fields
    assert "nBest" not in fields
    assert "n_best" not in fields


def test_unset_parse_model_unavailable_and_health_off() -> None:
    with TestClient(create_app(_settings(parse_model_id=None))) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["parse"] == "off"
        response = client.post(
            "/parse",
            json={
                "text": "delta one two three fly heading two seven zero",
                "source": "voice",
                "schemaVersion": "command-ir-v0",
            },
        )
        assert response.status_code == 503
        body = response.json()
        assert body["ok"] is False
        assert body["error"] == "UNAVAILABLE"
        assert "confidence" not in body
        assert "nbest" not in body


def test_mock_parse_json_shape_when_model_id_set() -> None:
    with TestClient(
        create_app(_settings(parse_model_id=DEFAULT_PARSE_MODEL_ID))
    ) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["parse"] == "ready"
        response = client.post(
            "/parse",
            json={
                "text": "salvage this heading",
                "source": "voice",
                "schemaVersion": "command-ir-v0",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
        assert body["callsignToken"] is None
        assert body["instructions"] == MOCK_PARSE_OK["instructions"]
        assert "confidence" not in body
        assert set(body.keys()) == {"ok", "callsignToken", "instructions"}


def test_mock_parse_schema_miss_on_prose_marker() -> None:
    with TestClient(
        create_app(_settings(parse_model_id=DEFAULT_PARSE_MODEL_ID))
    ) as client:
        response = client.post(
            "/parse",
            json={"text": "[SCHEMA] pizza the runway", "source": "text", "schemaVersion": "command-ir-v0"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body == {"ok": False, "error": "SCHEMA"}


def test_mock_parse_schema_on_chat_type_text() -> None:
    with TestClient(
        create_app(_settings(parse_model_id=DEFAULT_PARSE_MODEL_ID))
    ) as client:
        response = client.post(
            "/parse",
            json={"text": "CHAT with the pilot", "source": "voice", "schemaVersion": "command-ir-v0"},
        )
        assert response.json()["error"] == "SCHEMA"


def test_illegal_chat_instruction_is_schema() -> None:
    outcome = validate_parse_json(
        {
            "ok": True,
            "callsignToken": None,
            "instructions": [{"type": "CHAT", "text": "hi"}],
        }
    )
    assert outcome.ok is False
    assert outcome.error == "SCHEMA"
    assert validate_instruction({"type": "CHAT"}) is None


def test_readme_documents_path_c_salvage_and_small_default() -> None:
    text = (Path(__file__).resolve().parents[1] / "README.md").read_text(encoding="utf-8")
    lower = text.lower()
    assert "optional" in lower
    assert "default off" in lower
    assert "7110.65-complete nlu" in lower
    assert "salvage after typed" in lower
    assert DEFAULT_PARSE_MODEL_ID in text
    assert DEFAULT_PARSE_GGUF_FILE in text
    assert "2 GB RAM" in text
    assert "CPU OK" in text
    assert "slow OK" in text
    assert "not a 7B" in lower or "not a 7b" in lower
    assert "openai.com" in text
    assert "api.groq.com" in text
    assert "api-inference.huggingface.co" in text


def test_default_parse_model_is_small_instruct_not_7b() -> None:
    assert "1.5B" in DEFAULT_PARSE_MODEL_ID or "1.5b" in DEFAULT_PARSE_MODEL_ID.lower()
    assert "7B" not in DEFAULT_PARSE_MODEL_ID
    assert "7b" not in DEFAULT_PARSE_MODEL_ID.lower()
    assert "q4_k_m" in DEFAULT_PARSE_GGUF_FILE
    assert "Qwen" in DEFAULT_PARSE_MODEL_ID


def test_user_message_includes_on_frequency_roster() -> None:
    from parse_engine import build_parse_user_message, sanitize_parse_context

    assert sanitize_parse_context({"callsigns": ["swa204", "DAL123", "nope!"]}) == {
        "callsigns": ["SWA204", "DAL123"],
    }
    assert sanitize_parse_context({"fixes": ["semax", "C-Max", "FI27"]}) == {
        "callsigns": [],
        "fixes": ["SEMAX", "FI27"],
    }
    assert sanitize_parse_context(
        {"procedures": [{"id": "dem1", "name": "DEMO ONE"}, "NOPE!"]}
    ) == {
        "callsigns": [],
        "procedures": [{"id": "DEM1", "name": "DEMO ONE"}],
    }
    assert sanitize_parse_context(
        {"approaches": [{"id": "ils27", "name": "ILS RWY 27"}, "NOPE!"]}
    ) == {
        "callsigns": [],
        "approaches": [{"id": "ILS27", "name": "ILS RWY 27"}],
    }
    msg = build_parse_user_message(
        "giblet 204 proceed direct c-max",
        "voice",
        {
            "callsigns": ["DAL123", "SWA204"],
            "selectedCallsign": "SWA204",
            "fixes": ["SEMAX", "NEMAX", "MERGE"],
            "procedures": [{"id": "DEM1", "name": "DEMO ONE"}],
            "approaches": [{"id": "ILS27", "name": "ILS RWY 27"}],
        },
    )
    assert "onFrequency=DAL123,SWA204" in msg
    assert "selected=SWA204" in msg
    assert "fixes=SEMAX,NEMAX,MERGE" in msg
    assert "procedures=DEM1 (DEMO ONE)" in msg
    assert "approaches=ILS27 (ILS RWY 27)" in msg
    assert "text=giblet 204 proceed direct c-max" in msg
    assert "nbest" not in msg
    assert "confidence" not in msg
    bare = build_parse_user_message("ident", "voice", None)
    assert "onFrequency=" not in bare
    assert "fixes=" not in bare
    assert "procedures=" not in bare
    assert "approaches=" not in bare
    assert "text=ident" in bare


def test_system_prompt_distinguishes_heading_vector_from_turn_degrees() -> None:
    from parse_engine import SYSTEM_PROMPT

    assert "NEVER TURN_DEGREES for a heading assignment" in SYSTEM_PROMPT
    assert "heading 270" in SYSTEM_PROMPT
    assert "heading 360" in SYSTEM_PROMPT
    assert "fixes=" in SYSTEM_PROMPT
    assert "C-Max" in SYSTEM_PROMPT
    assert "procedures=" in SYSTEM_PROMPT
    assert "DEM1" in SYSTEM_PROMPT
    assert "approaches=" in SYSTEM_PROMPT
    assert "ILS27" in SYSTEM_PROMPT
    assert "Position reports" in SYSTEM_PROMPT
    assert "Never substitute the selected aircraft" in SYSTEM_PROMPT
    assert "Procedures and approaches are separate namespaces" in SYSTEM_PROMPT
    assert "INTERSEPTOR RUNWAY 27 LOCALIZER" in SYSTEM_PROMPT
    assert '"callsignToken": "NKS310"' in SYSTEM_PROMPT
    assert '"approachId": "ILS27"' in SYSTEM_PROMPT


def test_parse_n_gpu_layers_auto_cuda(monkeypatch) -> None:
    from parse_engine import _llm_device, _parse_n_gpu_layers

    monkeypatch.delenv("PARSE_N_GPU_LAYERS", raising=False)
    monkeypatch.setattr("parse_engine._llama_supports_gpu_offload", lambda: True)
    assert _parse_n_gpu_layers() == -1
    assert _llm_device(-1) == "cuda"


def test_parse_n_gpu_layers_env_zero_forces_cpu(monkeypatch) -> None:
    from parse_engine import _llm_device, _parse_n_gpu_layers

    monkeypatch.setenv("PARSE_N_GPU_LAYERS", "0")
    monkeypatch.setattr("parse_engine._llama_supports_gpu_offload", lambda: True)
    assert _parse_n_gpu_layers() == 0
    assert _llm_device(0) == "cpu"
