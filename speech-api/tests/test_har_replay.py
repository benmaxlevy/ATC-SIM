"""Structural regression coverage for the redacted fullrun /parse replay."""

from __future__ import annotations

import json
from pathlib import Path

FIXTURE = Path(__file__).parent / "fixtures" / "fullrun-parse-replay.json"
CLASSES = {"accepted", "expected_miss", "unsafe_acceptance", "incomplete_acceptance"}


def test_fullrun_parse_replay_is_compact_redacted_and_classified() -> None:
    replay = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cases = replay["cases"]
    assert len(cases) == 30
    assert sum(case["classification"] == "expected_miss" for case in cases) == 7
    assert {case["classification"] for case in cases} == CLASSES
    assert all(set(case) == {"id", "text", "context", "response", "classification"} for case in cases)
    assert all("audio" not in case and "wav" not in case for case in cases)
    assert all("startedDateTime" not in case and "url" not in case for case in cases)


def test_fullrun_parse_replay_preserves_recorded_failure_classes() -> None:
    replay = json.loads(FIXTURE.read_text(encoding="utf-8"))
    contexts = replay["contexts"]
    seen_contexts = set()
    for case in replay["cases"]:
        assert case["classification"] in CLASSES
        assert case["context"] in contexts
        seen_contexts.add(case["context"])
        body = case["response"]
        if case["classification"] == "expected_miss":
            assert body == {"ok": False, "error": "PARSE_MISS"}
        else:
            assert body["ok"] is True
            assert isinstance(body["instructions"], list) and body["instructions"]
        if case["classification"] == "unsafe_acceptance":
            serialized = json.dumps(body)
            assert any(token in serialized for token in ("\"LEFT\"", "T26R", "ONLY26"))
        if case["classification"] == "incomplete_acceptance":
            assert case["id"] in {"p24", "p30"}
    assert seen_contexts == set(contexts)
