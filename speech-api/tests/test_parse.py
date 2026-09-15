"""Path C /parse mock-mode contract (no GGUF download)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app import ParseRequest, create_app
from config import DEFAULT_PARSE_GGUF_FILE, DEFAULT_PARSE_MODEL_ID, Settings
from parse_engine import (
    INSTRUCTION_TYPES,
    MOCK_PARSE_OK,
    PARSE_CONTRACT_VERSION,
    ParseOutcome,
    ROUTE_SEGMENT_TYPES,
    guard_catalog_ids,
    sanitize_parse_context,
    validate_instruction,
    validate_parse_json,
)
def test_parse_contract_version_is_explicit() -> None:
    assert PARSE_CONTRACT_VERSION == "command-ir-v0-safe-1"


def test_catalog_guard_rejects_unlisted_callsign() -> None:
    outcome = ParseOutcome(
        ok=True,
        callsign_token="GTI7908",
        instructions=[{"type": "FLY_HEADING", "headingDeg": 270, "turn": "LEFT"}],
    )
    guarded = guard_catalog_ids(
        "GTI 7908 fly heading 270",
        {"callsigns": ["UAL8431"]},
        outcome,
    )
    assert guarded.ok is False
    assert guarded.error == "PARSE_MISS"


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


def test_path_c_instruction_type_parity_with_frontend_union() -> None:
    """Adding a frontend Command IR type must update Path C in the same change."""
    import re

    root = Path(__file__).resolve().parents[2]
    source = (root / "src/core/command/types.ts").read_text(encoding="utf-8")
    block = source.split("export const INSTRUCTION_TYPES = [", 1)[1].split("] as const", 1)[0]
    frontend = set(re.findall(r'^\s+"([A-Z][A-Z_]+)",\s*$', block, flags=re.MULTILINE))
    assert frontend == set(INSTRUCTION_TYPES)
    segment_block = source.split("export type ClearanceRouteSegment =", 1)[1].split(
        "export type IfrClearanceAccess =", 1
    )[0]
    frontend_segments = set(re.findall(r'type: "([A-Z_]+)"', segment_block))
    assert frontend_segments == set(ROUTE_SEGMENT_TYPES)


def test_path_c_route_schema_accepts_arbitrary_canonical_segments() -> None:
    route = {
        "type": "IFR_CLEARANCE",
        "limitId": "KATL",
        "access": {
            "type": "EXPLICIT_ROUTE",
            "segments": [
                {"type": "DIRECT", "fixId": "SWEPT"},
                {"type": "DIRECT", "fixId": "HOUND"},
                {"type": "PROCEDURE", "procedureId": "SID1", "transitionId": "NORTH"},
            ],
        },
    }
    assert validate_instruction(route) == route
    assert validate_instruction(
        {"type": "IFR_CLEARANCE", "limitId": "KATL", "access": {"type": "EXPLICIT_ROUTE", "segments": [{"type": "DIRECT", "fixId": "X", "extra": True}]}}
    ) is None


def test_path_c_route_guard_requires_supplied_ids_and_transcript_spans() -> None:
    from parse_engine import guard_catalog_ids

    context = {
        "airports": [{"icao": "KATL", "name": "Atlanta International"}],
        "clearanceLimits": [
            {"id": "KATL", "kind": "FIX", "aliases": ["KATL"], "spans": [{"start": 0, "end": 4, "text": "KATL"}]}
        ],
        "routeWindow": {
            "transcript": "swept hound",
            "fixMatches": [
                {"span": {"start": 0, "end": 5, "text": "swept"}, "candidates": [{"id": "SWEPT", "kind": "FIX", "score": 1, "method": "exact"}]},
                {"span": {"start": 6, "end": 11, "text": "hound"}, "candidates": [{"id": "HOUND", "kind": "NAVAID", "score": 1, "method": "exact"}]},
            ],
            "procedures": [],
        },
    }
    valid = ParseOutcome(
        ok=True,
        instructions=[
            {
                "type": "IFR_CLEARANCE",
                "limitId": "KATL",
                "access": {
                    "type": "EXPLICIT_ROUTE",
                    "segments": [
                        {"type": "DIRECT", "fixId": "SWEPT"},
                        {"type": "DIRECT", "fixId": "HOUND"},
                    ],
                },
            }
        ],
    )
    assert guard_catalog_ids("cleared to KATL via swept hound", context, valid).ok
    for bad_id in ("NOPE", "KATL"):
        bad = ParseOutcome(
            ok=True,
            instructions=[
                {
                    "type": "IFR_CLEARANCE",
                    "limitId": "KATL",
                    "access": {"type": "EXPLICIT_ROUTE", "segments": [{"type": "DIRECT", "fixId": bad_id}]},
                }
            ],
        )
        assert guard_catalog_ids("cleared to KATL via swept", context, bad).error == "PARSE_MISS"
    tactical = ParseOutcome(
        ok=True,
        instructions=[{"type": "DIRECT", "fixId": "ATL"}],
    )
    assert guard_catalog_ids(
        "endeavor 1155 clear to atlanta international airport via direct swept direct kimmy direct bluff direct",
        context,
        tactical,
    ).error == "PARSE_MISS"

    partial_context = {
        **context,
        "routeWindow": {
            "transcript": "swept kimmy",
            "fixMatches": [context["routeWindow"]["fixMatches"][0]],
            "procedures": [],
        },
    }
    partial = ParseOutcome(
        ok=True,
        instructions=[
            {
                "type": "IFR_CLEARANCE",
                "limitId": "KATL",
                "access": {
                    "type": "EXPLICIT_ROUTE",
                    "segments": [{"type": "DIRECT", "fixId": "SWEPT"}],
                },
            }
        ],
    )
    assert guard_catalog_ids("cleared to KATL via swept kimmy", partial_context, partial).error == "PARSE_MISS"


def test_path_c_route_prompt_teaches_optional_direct_and_catalog_transitions() -> None:
    from parse_engine import SYSTEM_PROMPT, build_parse_user_message

    assert "DIRECT is an optional marker" in SYSTEM_PROMPT
    assert "transitionId only when that transition is nested" in SYSTEM_PROMPT
    message = build_parse_user_message(
        "cleared to atlanta via swept hound",
        "voice",
        {
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "clearanceLimits": [],
            "routeWindow": {
                "transcript": "swept hound",
                "fixMatches": [{"span": {"start": 0, "end": 5, "text": "swept"}, "candidates": [{"id": "SWEPT", "kind": "FIX", "score": 1, "method": "exact"}]}],
                "procedures": [],
            },
        },
    )
    assert "routeWindow=" in message
    assert "swept hound" in message
    assert "fixMatches" in message
    assert "one listed candidate" in message


def test_path_c_route_fix_matches_are_span_scoped_and_exclude_airports() -> None:
    from parse_engine import sanitize_parse_context

    context = sanitize_parse_context(
        {
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "routeWindow": {
                "transcript": "kimmi",
                "fixMatches": [
                    {
                        "span": {"start": 0, "end": 5, "text": "kimmi"},
                        "candidates": [
                            {"id": "KIMMY", "kind": "FIX", "score": 0.6, "method": "levenshtein"},
                            {"id": "KATL", "kind": "FIX", "score": 1, "method": "exact"},
                        ],
                    }
                ],
                "procedures": [],
            },
        }
    )
    assert context is not None
    matches = context["routeWindow"]["fixMatches"]
    assert matches[0]["span"] == {"start": 0, "end": 5, "text": "kimmi"}
    assert [item["id"] for item in matches[0]["candidates"]] == ["KIMMY"]


def test_path_c_route_guard_requires_ordered_complete_span_segmentation() -> None:
    from parse_engine import guard_catalog_ids

    context = {
        "airports": [{"icao": "KATL", "name": "Atlanta International"}],
        "clearanceLimits": [],
        "routeWindow": {
            "transcript": "swept hound",
            "fixMatches": [
                {
                    "span": {"start": 0, "end": 5, "text": "swept"},
                    "candidates": [{"id": "SWEPT", "kind": "FIX", "score": 1, "method": "exact"}],
                },
                {
                    "span": {"start": 6, "end": 11, "text": "hound"},
                    "candidates": [{"id": "HOUND", "kind": "NAVAID", "score": 1, "method": "exact"}],
                },
            ],
            "procedures": [],
        },
    }

    def outcome(ids: list[str]) -> ParseOutcome:
        return ParseOutcome(
            ok=True,
            instructions=[
                {
                    "type": "IFR_CLEARANCE",
                    "limitId": "KATL",
                    "access": {
                        "type": "EXPLICIT_ROUTE",
                        "segments": [{"type": "DIRECT", "fixId": item} for item in ids],
                    },
                }
            ],
        )

    assert guard_catalog_ids("cleared to KATL via swept hound", context, outcome(["SWEPT", "HOUND"])).ok
    assert guard_catalog_ids(
        "cleared to KATL via swept hound", context, outcome(["HOUND", "SWEPT"])
    ).error == "PARSE_MISS"
    assert guard_catalog_ids(
        "cleared to KATL via swept hound", context, outcome(["SWEPT"])
    ).error == "PARSE_MISS"


def test_path_c_route_guard_rejects_equal_best_direct_candidates() -> None:
    def context(candidates: list[dict[str, object]]) -> dict[str, object]:
        return {
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "clearanceLimits": [],
            "routeWindow": {
                "transcript": "kimmi",
                "fixMatches": [
                    {
                        "span": {"start": 0, "end": 5, "text": "kimmi"},
                        "candidates": candidates,
                    }
                ],
                "procedures": [],
            },
        }

    def outcome(fix_id: str) -> ParseOutcome:
        return ParseOutcome(
            ok=True,
            instructions=[
                {
                    "type": "IFR_CLEARANCE",
                    "limitId": "KATL",
                    "access": {
                        "type": "EXPLICIT_ROUTE",
                        "segments": [{"type": "DIRECT", "fixId": fix_id}],
                    },
                }
            ],
        )

    equal_best = [
        {"id": "KIMMY", "kind": "FIX", "score": 0.6, "method": "levenshtein"},
        {"id": "KIMMS", "kind": "FIX", "score": 0.6, "method": "levenshtein"},
    ]
    assert (
        guard_catalog_ids("cleared to KATL via kimmi", context(equal_best), outcome("KIMMY")).error
        == "PARSE_MISS"
    )

    unique_best = [
        {"id": "KIMMY", "kind": "FIX", "score": 0.8, "method": "folded"},
        {"id": "KIMMS", "kind": "FIX", "score": 0.6, "method": "levenshtein"},
    ]
    assert guard_catalog_ids(
        "cleared to KATL via kimmi", context(unique_best), outcome("KIMMY")
    ).ok


def test_path_c_route_context_accepts_structured_long_navaid_and_keeps_fix_rules() -> None:
    context = sanitize_parse_context(
        {
            "fixes": ["VORABCD1"],
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "clearanceLimits": [
                {
                    "id": "VORABCD1",
                    "kind": "NAVAID",
                    "spans": [{"start": 0, "end": 8, "text": "vorabcd1"}],
                }
            ],
            "routeWindow": {
                "transcript": "vorabcd1",
                "fixMatches": [
                    {
                        "span": {"start": 0, "end": 8, "text": "vorabcd1"},
                        "candidates": [
                            {
                                "id": "VORABCD1",
                                "kind": "NAVAID",
                                "score": 1,
                                "method": "exact",
                            }
                        ],
                    }
                ],
                "procedures": [],
            },
        }
    )
    assert context is not None
    assert context.get("fixes") is None
    assert context["clearanceLimits"][0]["id"] == "VORABCD1"
    assert context["routeWindow"]["fixMatches"][0]["candidates"][0]["id"] == "VORABCD1"

    fix_context = sanitize_parse_context(
        {
            "airports": [{"icao": "KATL", "name": "Atlanta International"}],
            "routeWindow": {
                "transcript": "vorabcd1",
                "fixMatches": [
                    {
                        "span": {"start": 0, "end": 8, "text": "vorabcd1"},
                        "candidates": [
                            {
                                "id": "VORABCD1",
                                "kind": "FIX",
                                "score": 1,
                                "method": "exact",
                            }
                        ],
                    }
                ],
                "procedures": [],
            },
        }
    )
    assert fix_context is not None
    assert fix_context["routeWindow"]["fixMatches"] == []


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


def test_path_c_validates_squawk_vfr_maintain_vfr_and_clearance_variants() -> None:
    cases = [
        {"type": "ASSIGN_SQUAWK", "code": "2222", "source": "DISCRETE"},
        {"type": "ASSIGN_SQUAWK", "code": "1200", "source": "VFR"},
        {"type": "MAINTAIN_VFR"},
        {
            "type": "IFR_CLEARANCE",
            "limitId": "KATL",
            "access": {"type": "AS_FILED"},
        },
        {
            "type": "IFR_CLEARANCE",
            "limitId": "KATL",
            "access": {"type": "FIX_THEN_DIRECT", "fixId": "CEDAR"},
            "altitudeFt": 5000,
            "climbVia": True,
            "frequency": "119.5",
            "squawk": "2345",
        },
        {
            "type": "IFR_CLEARANCE",
            "limitId": "KATL",
            "access": {"type": "SID", "procedureId": "RIVR1", "transitionId": "HILL2"},
        },
    ]
    for case in cases:
        assert validate_instruction(case) == case
    assert validate_instruction({"type": "ASSIGN_SQUAWK", "code": "8921", "source": "DISCRETE"}) is None
    assert validate_instruction({"type": "ASSIGN_SQUAWK", "code": "2222", "source": "VFR"}) is None
    assert validate_instruction({"type": "MAINTAIN_VFR", "extra": True}) is None
    assert validate_instruction(
        {"type": "IFR_CLEARANCE", "limitId": "KATL", "access": {"type": "DIRECT"}, "squawk": "9999"}
    ) is None


def test_path_c_validates_delete_speed_restrictions_and_speed_until() -> None:
    dsr = {"type": "DELETE_SPEED_RESTRICTIONS"}
    assert validate_instruction(dsr) == dsr
    assert validate_instruction({"type": "DELETE_SPEED_RESTRICTIONS", "extra": True}) is None

    cancellation = {"type": "CANCEL_APPROACH"}
    assert validate_instruction(cancellation) == cancellation
    assert validate_instruction({"type": "CANCEL_APPROACH", "approachId": "ILS27"}) is None

    speed_plain = {"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN"}
    assert validate_instruction(speed_plain) == speed_plain

    speed_faf = {"type": "SPEED", "speedKt": 180, "verb": "MAINTAIN", "until": {"type": "FAF"}}
    assert validate_instruction(speed_faf) == speed_faf

    speed_dme = {"type": "SPEED", "speedKt": 180, "verb": "MAINTAIN", "until": {"type": "DME", "distanceNm": 7}}
    assert validate_instruction(speed_dme) == speed_dme

    speed_fix = {"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN", "until": {"type": "FIX", "fixId": "MERGE"}}
    assert validate_instruction(speed_fix) == speed_fix

    # Rejections
    assert validate_instruction({"type": "SPEED", "speedKt": 180, "verb": "MAINTAIN", "until": {"type": "FAF", "extra": True}}) is None
    assert validate_instruction({"type": "SPEED", "speedKt": 180, "verb": "MAINTAIN", "until": {"type": "DME", "distanceNm": -1}}) is None
    assert validate_instruction({"type": "SPEED", "speedKt": 180, "verb": "MAINTAIN", "until": {"type": "DME"}}) is None
    assert validate_instruction({"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN", "until": {"type": "FIX", "fixId": ""}}) is None
    assert validate_instruction({"type": "SPEED", "speedKt": 210, "verb": "MAINTAIN", "until": {"type": "UNKNOWN"}}) is None


def test_path_c_semantic_guard_distinguishes_tactical_direct_from_clearance() -> None:
    from parse_engine import guard_instruction_semantics

    tactical = ParseOutcome(ok=True, instructions=[{"type": "DIRECT", "fixId": "ATL"}])
    assert guard_instruction_semantics("cleared direct atl vor", tactical).ok
    assert not guard_instruction_semantics(
        "cleared to atl via direct",
        tactical,
    ).ok

    clearance = ParseOutcome(
        ok=True,
        instructions=[
            {"type": "IFR_CLEARANCE", "limitId": "KATL", "access": {"type": "DIRECT"}}
        ],
    )
    assert guard_instruction_semantics("cleared to atl via direct", clearance).ok
    assert not guard_instruction_semantics("cleared direct atl vor", clearance).ok


def test_path_c_catalog_guard_accepts_airport_limit_but_not_airport_direct() -> None:
    from parse_engine import guard_catalog_ids

    context = {
        "fixes": ["CEDAR"],
        "airports": [{"icao": "KATL", "name": "Atlanta International"}],
    }
    clearance = ParseOutcome(
        ok=True,
        instructions=[
            {
                "type": "IFR_CLEARANCE",
                "limitId": "KATL",
                "access": {"type": "DIRECT"},
            }
        ],
    )
    assert guard_catalog_ids("cleared to atlanta international via direct", context, clearance).ok
    direct = ParseOutcome(ok=True, instructions=[{"type": "DIRECT", "fixId": "KATL"}])
    assert guard_catalog_ids("proceed direct atlanta international", context, direct).error == "PARSE_MISS"
    unknown = ParseOutcome(
        ok=True,
        instructions=[
            {"type": "IFR_CLEARANCE", "limitId": "KSEA", "access": {"type": "DIRECT"}}
        ],
    )
    assert guard_catalog_ids("cleared to seattle via direct", context, unknown).error == "PARSE_MISS"


def test_path_c_catalog_guard_rejects_airport_fix_then_direct_in_airport_only_and_overlap_contexts() -> None:
    clearance = ParseOutcome(
        ok=True,
        instructions=[
            {
                "type": "IFR_CLEARANCE",
                "limitId": "KATL",
                "access": {"type": "FIX_THEN_DIRECT", "fixId": "KATL"},
            }
        ],
    )
    airport_only = {"airports": [{"icao": "KATL", "name": "Atlanta International"}]}
    overlap = {
        "fixes": ["KATL"],
        "airports": [{"icao": "KATL", "name": "Atlanta International"}],
    }
    assert (
        guard_catalog_ids("cleared to KATL via KATL then direct", airport_only, clearance).error
        == "PARSE_MISS"
    )
    assert (
        guard_catalog_ids("cleared to KATL via KATL then direct", overlap, clearance).error
        == "PARSE_MISS"
    )

    direct = ParseOutcome(ok=True, instructions=[{"type": "DIRECT", "fixId": "KATL"}])
    assert guard_catalog_ids("proceed direct KATL", airport_only, direct).error == "PARSE_MISS"
    assert guard_catalog_ids("proceed direct KATL", overlap, direct).error == "PARSE_MISS"


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
        "airports": [],
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
    assert "airports=" not in bare
    assert "text=ident" in bare


def test_user_message_keeps_airports_separate_from_fix_grounding() -> None:
    from parse_engine import build_parse_user_message, sanitize_parse_context

    context = {
        "airports": [
            {
                "icao": "katl",
                "name": "Atlanta International",
                "aliases": ["Atlanta Airport"],
            }
        ],
        "fixes": ["CEDAR"],
    }
    assert sanitize_parse_context(context) == {
        "callsigns": [],
        "fixes": ["CEDAR"],
        "airports": [
            {"icao": "KATL", "name": "Atlanta International", "aliases": ["Atlanta Airport"]}
        ],
    }
    message = build_parse_user_message("cleared to atlanta airport via direct", "voice", context)
    assert "airports=KATL (Atlanta International; Atlanta Airport)" in message
    assert "Airports are clearance limits only, never DIRECT/CROSS fixes." in message
    assert "fixes=CEDAR" in message


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
    assert "squad 2222" in SYSTEM_PROMPT
    assert "squawk vfr" in SYSTEM_PROMPT
    assert "maintain vfr" in SYSTEM_PROMPT
    assert "cleared to KATL via direct" in SYSTEM_PROMPT
    assert "cleared direct ATL VOR" in SYSTEM_PROMPT
    assert "airport" in SYSTEM_PROMPT


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


def test_semantic_guard_accepts_and_orders_cancel_approach() -> None:
    from parse_engine import guard_instruction_semantics

    cancellation = ParseOutcome(
        ok=True,
        instructions=[
            {"type": "CANCEL_APPROACH"},
            {"type": "FLY_HEADING", "headingDeg": 270, "turn": "SHORTEST"},
            {"type": "ALTITUDE", "altitudeFt": 5000, "verb": "MAINTAIN"},
        ],
    )
    assert guard_instruction_semantics(
        "cancel approach clearance, fly heading 270, maintain 5000", cancellation
    ).ok
    assert not guard_instruction_semantics(
        "cancel approach, fly heading 270", ParseOutcome(ok=True, instructions=[{"type": "CANCEL_APPROACH"}])
    ).ok
    assert not guard_instruction_semantics(
        "cancel approach clearance, go around",
        ParseOutcome(
            ok=True,
            instructions=[{"type": "CANCEL_APPROACH"}, {"type": "GO_AROUND"}],
        ),
    ).ok


def test_semantic_guard_lemmatization() -> None:
    from parse_engine import (
        _has_altitude_maintain_evidence,
        guard_instruction_semantics,
        normalize_evidence_text,
    )

    assert normalize_evidence_text("maintained") == "maintain"
    assert normalize_evidence_text("climbed") == "climb"
    assert normalize_evidence_text("descended") == "descend"
    assert normalize_evidence_text("turned") == "turn"
    assert normalize_evidence_text("intercepted") == "intercept"

    assert _has_altitude_maintain_evidence("maintained 5000")
    assert _has_altitude_maintain_evidence("maintain 5000")

    maintain_outcome = ParseOutcome(
        ok=True,
        instructions=[{"type": "ALTITUDE", "altitudeFt": 5000, "verb": "MAINTAIN"}],
    )
    assert guard_instruction_semantics("maintained 5000", maintain_outcome).ok

    climb_outcome = ParseOutcome(
        ok=True,
        instructions=[{"type": "ALTITUDE", "altitudeFt": 7000, "verb": "CLIMB"}],
    )
    assert guard_instruction_semantics("climbed to 7000", climb_outcome).ok

    turn_outcome = ParseOutcome(
        ok=True,
        instructions=[{"type": "FLY_HEADING", "headingDeg": 180, "turn": "LEFT"}],
    )
    assert guard_instruction_semantics("turned left 180", turn_outcome).ok


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
    assert out.ok is False
    assert out.error == "PARSE_MISS"


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


def test_catalog_guard_rejects_callsign_in_slots() -> None:
    from parse_engine import guard_catalog_ids

    ctx = {
        "callsigns": ["EDV9255", "UAL9953"],
        "fixes": ["BLUFF"],
        "approaches": [{"id": "I26R", "name": "ILS RWY 26R"}],
    }

    # Callsign copied into fixId -> rejected
    bad_fix = ParseOutcome(
        ok=True,
        callsign_token="UAL9953",
        instructions=[{"type": "DIRECT", "fixId": "UAL9953"}],
    )
    assert guard_catalog_ids("proceed direct fawger", ctx, bad_fix).error == "PARSE_MISS"

    # Callsign copied into approachId -> rejected
    bad_approach = ParseOutcome(
        ok=True,
        callsign_token="EDV9255",
        instructions=[{"type": "CLEARED_APPROACH", "approachId": "EDV9255"}],
    )
    assert guard_catalog_ids("cleared approach two six right", ctx, bad_approach).error == "PARSE_MISS"
