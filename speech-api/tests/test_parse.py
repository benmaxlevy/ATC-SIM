"""Path C /parse mock-mode contract (no GGUF download)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app import ParseRequest, create_app
from config import DEFAULT_PARSE_GGUF_FILE, DEFAULT_PARSE_MODEL_ID, Settings
from parse_engine import MOCK_PARSE_OK, ParseOutcome, validate_instruction, validate_parse_json


def _settings(*, parse_model_id: str, mock: bool = True) -> Settings:
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
        tts_voices=("mock",),
    )


def test_parse_request_schema_has_no_nbest_or_confidence() -> None:
    fields = set(ParseRequest.model_fields)
    assert fields == {"text", "source", "schemaVersion", "context"}
    assert "confidence" not in fields
    assert "nbest" not in fields
    assert "nBest" not in fields
    assert "n_best" not in fields


def test_empty_parse_model_uses_default_and_mock_is_ready() -> None:
    from config import Settings

    settings = Settings(
        host="127.0.0.1",
        port=8090,
        stt_model_id="mock",
        tts_voice="mock",
        parse_model_id=DEFAULT_PARSE_MODEL_ID,
        parse_gguf_file=DEFAULT_PARSE_GGUF_FILE,
        cache_dir=Path("."),
        mock=True,
        hf_token=None,
        cors_origins=(),
        stt_device=None,
        tts_voices=("mock",),
    )
    with TestClient(create_app(settings)) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["parse"] == "ready"
        response = client.post(
            "/parse",
            json={
                "text": "delta one two three fly heading two seven zero",
                "source": "voice",
                "schemaVersion": "command-ir-v0",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["ok"] is True
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


def test_join_procedure_is_a_closed_instruction() -> None:
    instruction = {"type": "JOIN_PROCEDURE", "procedureId": "DEM1"}
    assert validate_instruction(instruction) == instruction
    assert validate_instruction({"type": "JOIN_PROCEDURE", "procedureId": "DEM1", "extra": True}) is None
    assert validate_parse_json(
        {"ok": True, "callsignToken": "DAL123", "instructions": [instruction]}
    ).instructions == [instruction]
    grammar = (Path(__file__).resolve().parents[1] / "parse_grammar.gbnf").read_text(encoding="utf-8")
    assert "join-procedure" in grammar
    assert '"\\"JOIN_PROCEDURE\\""' in grammar


def test_parse_context_forwards_approaches_to_engine() -> None:
    class CaptureParseEngine:
        ready = True

        def __init__(self) -> None:
            self.context = None

        def parse(self, text, source, schema_version, context=None):
            del text, source, schema_version
            self.context = context
            return ParseOutcome(ok=True, instructions=[{"type": "IDENT"}])

    engine = CaptureParseEngine()
    with TestClient(create_app(_settings(parse_model_id=DEFAULT_PARSE_MODEL_ID))) as client:
        client.app.state.parse = engine
        response = client.post(
            "/parse",
            json={
                "text": "delta one two three expect ILS runway 27",
                "context": {
                    "approaches": [{"id": "ILS27", "name": "ILS RWY 27", "runway": "27"}],
                },
            },
        )
    assert response.status_code == 200
    assert engine.context == {
        "callsigns": [],
        "selectedCallsign": None,
        "fixes": [],
        "procedures": [],
        "approaches": [{"id": "ILS27", "name": "ILS RWY 27", "runway": "27"}],
    }


def test_readme_documents_mandatory_path_c_salvage() -> None:
    text = (Path(__file__).resolve().parents[1] / "README.md").read_text(encoding="utf-8")
    lower = text.lower()
    assert "mandatory" in lower
    assert "7110.65-complete nlu" in lower
    assert "salvage after typed" in lower
    assert DEFAULT_PARSE_MODEL_ID in text
    assert DEFAULT_PARSE_GGUF_FILE in text
    assert "CPU OK" in text
    assert "slow OK" in text
    assert "openai.com" in text
    assert "api.groq.com" in text
    assert "api-inference.huggingface.co" in text


def test_default_parse_model_is_qwen3_4b_q4_k_m() -> None:
    assert DEFAULT_PARSE_MODEL_ID == "MaziyarPanahi/Qwen3-4B-Instruct-2507-GGUF"
    assert DEFAULT_PARSE_GGUF_FILE == "Qwen3-4B-Instruct-2507.Q4_K_M.gguf"


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
    assert "Map demo one" not in msg
    assert "Match noisy spoken names" in msg
    assert "e.g. ILS27" not in msg
    assert "Match spoken runway/approach variants to that id." in msg
    bare = build_parse_user_message("ident", "voice", None)
    assert "onFrequency=" not in bare
    assert "fixes=" not in bare
    assert "procedures=" not in bare
    assert "approaches=" not in bare
    assert "text=ident" in bare


def test_user_message_grounds_any_facility_catalog() -> None:
    from parse_engine import build_parse_user_message

    msg = build_parse_user_message(
        "United 456 descend via river one",
        "voice",
        {
            "callsigns": ["UAL456", "AAL12"],
            "selectedCallsign": "UAL456",
            "fixes": ["CEDAR", "RIVVR", "MOUNT"],
            "procedures": [{"id": "RIVR1", "name": "RIVER ONE"}],
            "approaches": [{"id": "ILS09", "name": "ILS RWY 09", "runway": "09"}],
        },
    )
    assert "onFrequency=UAL456,AAL12" in msg
    assert "fixes=CEDAR,RIVVR,MOUNT" in msg
    assert "procedures=RIVR1 (RIVER ONE)" in msg
    assert "approaches=ILS09 (ILS RWY 09)" in msg
    assert "DEM1" not in msg
    assert "ILS27" not in msg
    assert "SEMAX" not in msg
    assert "KDEM" not in msg


def test_system_prompt_guides_semantic_repair_without_schema_duplication() -> None:
    from parse_engine import SYSTEM_PROMPT

    assert "grammar supplies its closed shape" in SYSTEM_PROMPT
    assert '"type": "FLY_HEADING"' not in SYSTEM_PROMPT
    assert "TURN_DEGREES requires" in SYSTEM_PROMPT
    assert "heading 360" in SYSTEM_PROMPT
    assert "fixes=" in SYSTEM_PROMPT
    assert "procedures=" in SYSTEM_PROMPT
    assert "JOIN_PROCEDURE" in SYSTEM_PROMPT
    assert "approaches=" in SYSTEM_PROMPT
    assert "Position reports" in SYSTEM_PROMPT
    assert "Never substitute selected" in SYSTEM_PROMPT
    assert "separate namespaces" in SYSTEM_PROMPT
    assert "unambiguous; otherwise return PARSE_MISS" in SYSTEM_PROMPT
    assert "Recover the intended 7110.65 clearance" in SYSTEM_PROMPT
    assert "turn 20 degrees right" in SYSTEM_PROMPT
    assert "turn leftening 360" in SYSTEM_PROMPT
    assert "turn leftening one five zero" in SYSTEM_PROMPT
    assert "descent and maintain 4000" in SYSTEM_PROMPT
    assert "maintain 210 knots" in SYSTEM_PROMPT
    assert "maintain five thousand, maintain two one zero knots" in SYSTEM_PROMPT
    assert "leftening = left heading" in SYSTEM_PROMPT
    assert "require the word “via”" in SYSTEM_PROMPT
    assert "Preserve every independent instruction" in SYSTEM_PROMPT
    assert "requires three instructions" in SYSTEM_PROMPT
    assert "Position advisories are not commands" in SYSTEM_PROMPT
    assert "has two instructions after the advisory" in SYSTEM_PROMPT
    assert "Never default a facility" in SYSTEM_PROMPT
    assert "one one thousand is 11000" in SYSTEM_PROMPT
    assert "never map an unmatched spoken name" in SYSTEM_PROMPT


def test_semantic_guard_rejects_wrong_turn_and_via_instructions() -> None:
    from parse_engine import guard_instruction_semantics

    wrong_turn = validate_parse_json(
        {
            "ok": True,
            "callsignToken": "DAL123",
            "instructions": [{"type": "FLY_HEADING", "headingDeg": 20, "turn": "RIGHT"}],
        }
    )
    assert guard_instruction_semantics("Delta 123 turn 20 degrees right", wrong_turn).error == "PARSE_MISS"

    wrong_via = validate_parse_json(
        {
            "ok": True,
            "callsignToken": "DAL123",
            "instructions": [{"type": "DESCEND_VIA", "procedureId": "DEM1"}],
        }
    )
    assert (
        guard_instruction_semantics("Delta 123 descent and maintain 4000", wrong_via).error
        == "PARSE_MISS"
    )


def test_semantic_guard_requires_evidence_for_every_instruction_type() -> None:
    from parse_engine import guard_instruction_semantics

    cases = [
        ("turn left heading 270", {"type": "FLY_HEADING", "headingDeg": 270, "turn": "LEFT"}),
        ("turn 20 degrees right", {"type": "TURN_DEGREES", "direction": "RIGHT", "degrees": 20}),
        ("continue present heading", {"type": "PRESENT_HEADING"}),
        ("descend and maintain 4000", {"type": "ALTITUDE", "altitudeFt": 4000, "verb": "DESCEND"}),
        ("maintain 210 knots", {"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN"}),
        ("proceed direct SEMAX", {"type": "DIRECT", "fixId": "SEMAX"}),
        ("expect ILS runway 27 approach", {"type": "EXPECT_APPROACH", "approachId": "ILS27"}),
        ("cleared ILS runway 27 approach", {"type": "CLEARED_APPROACH", "approachId": "ILS27"}),
        ("intercept the localizer", {"type": "INTERCEPT_LOCALIZER", "approachId": "ILS27"}),
        ("squawk ident", {"type": "IDENT"}),
        ("say heading", {"type": "SAY_HEADING"}),
        ("say altitude", {"type": "SAY_ALTITUDE"}),
        ("descend via DEM1", {"type": "DESCEND_VIA", "procedureId": "DEM1"}),
        ("climb via DEM1", {"type": "CLIMB_VIA", "procedureId": "DEM1"}),
        ("join DEM1", {"type": "JOIN_PROCEDURE", "procedureId": "DEM1"}),
        ("cross SEMAX at 4000", {"type": "CROSS", "fixId": "SEMAX", "altitudeFt": 4000, "restriction": "AT"}),
        ("go around", {"type": "GO_AROUND"}),
    ]
    for transcript, instruction in cases:
        outcome = ParseOutcome(ok=True, instructions=[instruction])
        assert guard_instruction_semantics(transcript, outcome).ok, instruction["type"]
        assert not guard_instruction_semantics("Delta 123 radio check", outcome).ok, instruction["type"]


def test_semantic_guard_accepts_fused_turn_without_the_word_heading() -> None:
    from parse_engine import guard_instruction_semantics

    outcome = ParseOutcome(
        ok=True,
        instructions=[
            {"type": "FLY_HEADING", "headingDeg": 0, "turn": "LEFT"},
            {"type": "ALTITUDE", "altitudeFt": 5000, "verb": "DESCEND"},
        ],
    )
    assert guard_instruction_semantics(
        "Southwest 88 turn leftening 360 descend and maintain 5000", outcome
    ).ok


def test_semantic_guard_accepts_go_around_variants() -> None:
    from parse_engine import guard_instruction_semantics

    missed = ParseOutcome(ok=True, instructions=[{"type": "GO_AROUND"}])
    assert guard_instruction_semantics("United 456 go around", missed).ok
    assert guard_instruction_semantics("United 456 goin around", missed).ok


def test_catalog_guard_rejects_ids_outside_the_provided_lists() -> None:
    from parse_engine import guard_catalog_ids

    via = ParseOutcome(
        ok=True,
        callsign_token="UAL456",
        instructions=[{"type": "DESCEND_VIA", "procedureId": "DEM1"}],
    )
    ctx = {
        "callsigns": ["UAL456"],
        "procedures": [{"id": "RIVR1", "name": "RIVER ONE"}],
        "fixes": ["CEDAR"],
        "approaches": [{"id": "ILS09", "name": "ILS RWY 09"}],
    }
    assert guard_catalog_ids("descend via demo one", ctx, via).error == "PARSE_MISS"
    listed = ParseOutcome(
        ok=True,
        instructions=[{"type": "DESCEND_VIA", "procedureId": "RIVR1"}],
    )
    assert guard_catalog_ids("descend via river one", ctx, listed).ok
    assert guard_catalog_ids("descend via demo one", ctx, listed).error == "PARSE_MISS"
    other_fix = ParseOutcome(ok=True, instructions=[{"type": "DIRECT", "fixId": "SEMAX"}])
    assert guard_catalog_ids("proceed direct cedar", ctx, other_fix).error == "PARSE_MISS"
    local = ParseOutcome(
        ok=True, instructions=[{"type": "CLEARED_APPROACH", "approachId": "ILS27"}]
    )
    assert guard_catalog_ids("cleared ils runway 09", ctx, local).error == "PARSE_MISS"
    assert guard_catalog_ids("ident", None, via).ok
    stripped = ParseOutcome(
        ok=True,
        callsign_token="DAL123",
        instructions=[{"type": "IDENT"}],
    )
    out = guard_catalog_ids("ident", ctx, stripped)
    assert out.ok
    assert out.callsign_token is None


def test_heading_360_normalizes_in_schema() -> None:
    assert validate_instruction({"type": "FLY_HEADING", "headingDeg": 360, "turn": "LEFT"}) == {
        "type": "FLY_HEADING",
        "headingDeg": 0,
        "turn": "LEFT",
    }


def test_semantic_guard_drops_unsupported_extra_instructions() -> None:
    from parse_engine import guard_instruction_semantics

    mixed = ParseOutcome(
        ok=True,
        instructions=[
            {
                "type": "ALTITUDE",
                "altitudeFt": 4000,
                "verb": "MAINTAIN",
                "untilEstablished": True,
            },
            {"type": "CLEARED_APPROACH", "approachId": "ILS09"},
        ],
    )
    out = guard_instruction_semantics(
        "maintain four thousand until established on the localizer", mixed
    )
    assert out.ok
    assert out.instructions == [
        {
            "type": "ALTITUDE",
            "altitudeFt": 4000,
            "verb": "MAINTAIN",
            "untilEstablished": True,
        }
    ]


def test_user_message_passes_transcript_unrewritten() -> None:
    from parse_engine import build_parse_user_message

    msg = build_parse_user_message("fly heading tree six zero", "voice", None)
    assert "text=fly heading tree six zero" in msg


def test_semantic_guard_accepts_maintain_altitude_alongside_speed() -> None:
    from parse_engine import guard_instruction_semantics

    outcome = ParseOutcome(
        ok=True,
        callsign_token="DAL123",
        instructions=[
            {"type": "FLY_HEADING", "headingDeg": 150, "turn": "LEFT"},
            {"type": "ALTITUDE", "altitudeFt": 5000, "verb": "MAINTAIN"},
            {"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN"},
        ],
    )
    assert guard_instruction_semantics(
        "Delta one twenty three, turn leftening one five zero, maintain five thousand, maintain two one zero knots.",
        outcome,
    ).ok
    compact = ParseOutcome(
        ok=True,
        instructions=[
            {"type": "ALTITUDE", "altitudeFt": 4000, "verb": "MAINTAIN"},
            {"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN"},
        ],
    )
    assert guard_instruction_semantics("maintain 4000 maintain 210 knots", compact).ok


def test_semantic_guard_rejects_common_command_type_switches() -> None:
    from parse_engine import guard_instruction_semantics

    cases = [
        (
            "American 45 maintain 210 knots",
            {"type": "FLY_HEADING", "headingDeg": 210, "turn": "LEFT"},
        ),
        (
            "American 45 maintain 210 knots",
            {"type": "ALTITUDE", "altitudeFt": 21000, "verb": "MAINTAIN"},
        ),
        (
            "turn left heading 270",
            {"type": "TURN_DEGREES", "direction": "LEFT", "degrees": 270},
        ),
        ("turn left heading 270", {"type": "PRESENT_HEADING"}),
        ("turn left heading 270", {"type": "SAY_HEADING"}),
        (
            "descend and maintain 4000",
            {"type": "DESCEND_VIA", "procedureId": "DEM1"},
        ),
        (
            "descend via DEM1",
            {"type": "ALTITUDE", "altitudeFt": 4000, "verb": "DESCEND"},
        ),
        ("descend via DEM1", {"type": "JOIN_PROCEDURE", "procedureId": "DEM1"}),
        ("say heading", {"type": "FLY_HEADING", "headingDeg": 270, "turn": "LEFT"}),
        ("continue present heading", {"type": "FLY_HEADING", "headingDeg": 270, "turn": "LEFT"}),
        ("6 miles from MERGE", {"type": "DIRECT", "fixId": "MERGE"}),
        ("hidden in clouds", {"type": "IDENT"}),
        ("across the airport", {"type": "CROSS", "fixId": "MERGE", "altitudeFt": 4000, "restriction": "AT"}),
    ]
    for transcript, instruction in cases:
        outcome = ParseOutcome(ok=True, instructions=[instruction])
        assert guard_instruction_semantics(transcript, outcome).error == "PARSE_MISS", transcript


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
