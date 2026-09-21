"""Tests for diagnostic query functions and CLI in query_traces.py."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

import pytest

# Ensure mock is set before imports
os.environ["SPEECH_API_MOCK"] = "1"

from query_traces import (
    LATENCY_STAGES,
    PATH_C_GUARD_CATEGORIES,
    ROOT_CAUSE_CATEGORIES,
    get_command_miss_rates,
    get_diagnostic_summary,
    get_failure_root_causes,
    get_latency_distribution,
    get_path_b_rescue_rate,
    get_path_c_guard_rejections,
    main as query_main,
)
from trace_db import (
    SessionTrace,
    StageAttemptTrace,
    TraceBatchPayload,
    UtteranceEntry,
    UtteranceTrace,
    get_db_connection,
    init_db,
    insert_trace_batch,
)


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    return tmp_path / "test-query-traces.sqlite"


@pytest.fixture
def empty_db(temp_db_path: Path) -> Path:
    init_db(temp_db_path)
    return temp_db_path


def test_empty_database_clean_returns(empty_db: Path) -> None:
    """Empty database returns 0 counts, 0.0 rates, and handles queries without error."""
    # 1. Failure root causes
    failures = get_failure_root_causes(empty_db)
    assert failures == {cat: 0 for cat in ROOT_CAUSE_CATEGORIES}

    # 2. Rescue rate
    rescue = get_path_b_rescue_rate(empty_db)
    assert rescue["spoken_a_misses"] == 0
    assert rescue["spoken_b_rescues"] == 0
    assert rescue["rescue_rate"] == 0.0

    # 3. Path C guard rejections
    guards = get_path_c_guard_rejections(empty_db)
    assert guards == {cat: 0 for cat in PATH_C_GUARD_CATEGORIES}

    # 4. Command miss rates
    cmd_rates = get_command_miss_rates(empty_db)
    assert cmd_rates == []

    # 5. Latency distribution
    latencies = get_latency_distribution(empty_db)
    for stage in LATENCY_STAGES:
        assert latencies[stage]["count"] == 0
        assert latencies[stage]["p50"] == 0.0
        assert latencies[stage]["p90"] == 0.0
        assert latencies[stage]["p99"] == 0.0

    # Summary
    summary = get_diagnostic_summary(empty_db)
    assert "failure_root_causes" in summary
    assert "path_b_rescue_rate" in summary
    assert "path_c_guard_rejections" in summary
    assert "command_miss_rates" in summary
    assert "latencies" in summary


def test_nonexistent_database_path_safe(tmp_path: Path) -> None:
    """Nonexistent DB path returns zero counts safely without throwing."""
    missing_path = tmp_path / "does-not-exist.sqlite"
    summary = get_diagnostic_summary(missing_path)
    assert summary["path_b_rescue_rate"]["rescue_rate"] == 0.0
    assert summary["command_miss_rates"] == []


def test_failure_root_cause_breakdown(temp_db_path: Path) -> None:
    """Tests categorization of failed utterances into each root cause."""
    conn = get_db_connection(temp_db_path)
    session = SessionTrace(session_id="s1", started_at="2026-09-20T00:00:00Z", app_version="1.0.0")

    utterances = [
        # 1. STT empty (voice)
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u_stt_empty",
                source="voice",
                stt_json={"text": ""},
                final_stage="none",
                final_status="miss",
                created_at="2026-09-20T00:01:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="typed", status="miss", reason="syntax_miss", elapsed_ms=1.0),
                StageAttemptTrace(stage="spoken_a", status="miss", reason="syntax_miss", elapsed_ms=1.0),
                StageAttemptTrace(stage="spoken_b", status="miss", reason="syntax_miss", elapsed_ms=1.0),
                StageAttemptTrace(stage="llm_c", status="skipped", reason="not_eligible", elapsed_ms=0.0),
            ],
        ),
        # 2. Typed syntax (text)
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u_typed_syntax",
                source="text",
                stt_json=None,
                final_stage="none",
                final_status="miss",
                created_at="2026-09-20T00:02:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="typed", status="miss", reason="syntax_miss", elapsed_ms=1.2),
            ],
        ),
        # 3. Spoken A grammar (voice, spoken_a missed, spoken_b skipped/not run)
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u_spoken_a",
                source="voice",
                stt_json={"text": "delta 123 unknown command phraseology"},
                final_stage="none",
                final_status="miss",
                created_at="2026-09-20T00:03:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="typed", status="miss", reason="syntax_miss", elapsed_ms=0.5),
                StageAttemptTrace(stage="spoken_a", status="miss", reason="spoken_a_grammar", elapsed_ms=2.0),
            ],
        ),
        # 4. Ungrounded catalog token (ungroundedTokens present)
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u_ungrounded",
                source="voice",
                stt_json={"text": "proceed direct UNKNOWNFIX"},
                final_stage="none",
                final_status="miss",
                created_at="2026-09-20T00:04:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(
                    stage="spoken_a",
                    status="miss",
                    reason="ungrounded_tokens",
                    elapsed_ms=1.5,
                    result_json={"ungroundedTokens": ["UNKNOWNFIX"]},
                ),
            ],
        ),
        # 5. Path B rewrite miss (spoken_a missed, spoken_b tried and missed)
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u_spoken_b_miss",
                source="voice",
                stt_json={"text": "gibberish text that failed rewrite"},
                final_stage="none",
                final_status="miss",
                created_at="2026-09-20T00:05:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="typed", status="miss", reason="syntax_miss", elapsed_ms=0.5),
                StageAttemptTrace(stage="spoken_a", status="miss", reason="syntax_miss", elapsed_ms=1.0),
                StageAttemptTrace(stage="spoken_b", status="miss", reason="syntax_miss", elapsed_ms=1.2),
                StageAttemptTrace(stage="llm_c", status="skipped", reason="not_eligible", elapsed_ms=0.0),
            ],
        ),
        # 6. Path C rejection (schema_rejection)
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u_path_c_rej",
                source="voice",
                stt_json={"text": "pizza the runway"},
                final_stage="none",
                final_status="rejected",
                created_at="2026-09-20T00:06:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="typed", status="miss", reason="syntax_miss", elapsed_ms=0.5),
                StageAttemptTrace(stage="spoken_a", status="miss", reason="syntax_miss", elapsed_ms=1.0),
                StageAttemptTrace(stage="spoken_b", status="miss", reason="syntax_miss", elapsed_ms=1.2),
                StageAttemptTrace(stage="llm_c", status="rejected", reason="schema_rejection", elapsed_ms=120.0),
            ],
        ),
        # 7. A successful hit (must NOT count in failure breakdown)
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u_hit",
                source="text",
                stt_json=None,
                final_stage="typed",
                final_status="hit",
                created_at="2026-09-20T00:07:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(
                    stage="typed",
                    status="hit",
                    reason=None,
                    elapsed_ms=0.4,
                    result_json={"instructionTypes": ["FLY_HEADING"]},
                ),
            ],
        ),
    ]

    insert_trace_batch(conn, TraceBatchPayload(session=session, utterances=utterances))
    conn.close()

    breakdown = get_failure_root_causes(temp_db_path)
    assert breakdown["stt_empty_or_low_prob"] == 1
    assert breakdown["typed_syntax"] == 1
    assert breakdown["spoken_a_grammar"] == 1
    assert breakdown["ungrounded_catalog_token"] == 1
    assert breakdown["path_b_rewrite_miss"] == 1
    assert breakdown["path_c_rejection"] == 1


def test_path_b_rescue_rate_calculation(temp_db_path: Path) -> None:
    """Tests Path B rescue rate: ratio of spoken_a miss to spoken_b hit."""
    conn = get_db_connection(temp_db_path)
    session = SessionTrace(session_id="s1", started_at="2026-09-20T00:00:00Z", app_version="1.0.0")

    utterances = [
        # Case 1: Spoken A hit (spoken_b skipped, not a spoken_a miss)
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u1",
                source="voice",
                final_stage="spoken_a",
                final_status="hit",
                created_at="2026-09-20T00:01:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="spoken_a", status="hit", elapsed_ms=2.0),
                StageAttemptTrace(stage="spoken_b", status="skipped", reason="prior_hit", elapsed_ms=0.0),
            ],
        ),
        # Case 2: Spoken A miss, Spoken B rescue hit!
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u2",
                source="voice",
                final_stage="spoken_b",
                final_status="hit",
                created_at="2026-09-20T00:02:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="spoken_a", status="miss", reason="syntax_miss", elapsed_ms=1.5),
                StageAttemptTrace(stage="spoken_b", status="hit", elapsed_ms=2.5),
            ],
        ),
        # Case 3: Spoken A miss, Spoken B rescue hit!
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u3",
                source="voice",
                final_stage="spoken_b",
                final_status="hit",
                created_at="2026-09-20T00:03:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="spoken_a", status="miss", reason="syntax_miss", elapsed_ms=1.5),
                StageAttemptTrace(stage="spoken_b", status="hit", elapsed_ms=2.0),
            ],
        ),
        # Case 4: Spoken A miss, Spoken B miss!
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u4",
                source="voice",
                final_stage="none",
                final_status="miss",
                created_at="2026-09-20T00:04:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="spoken_a", status="miss", reason="syntax_miss", elapsed_ms=1.5),
                StageAttemptTrace(stage="spoken_b", status="miss", reason="syntax_miss", elapsed_ms=2.0),
            ],
        ),
        # Case 5: Spoken A miss, Spoken B miss!
        UtteranceEntry(
            utterance=UtteranceTrace(
                utterance_id="u5",
                source="voice",
                final_stage="none",
                final_status="miss",
                created_at="2026-09-20T00:05:00Z",
            ),
            stage_attempts=[
                StageAttemptTrace(stage="spoken_a", status="miss", reason="syntax_miss", elapsed_ms=1.5),
                StageAttemptTrace(stage="spoken_b", status="miss", reason="syntax_miss", elapsed_ms=2.0),
            ],
        ),
    ]

    insert_trace_batch(conn, TraceBatchPayload(session=session, utterances=utterances))
    conn.close()

    result = get_path_b_rescue_rate(temp_db_path)
    # Total spoken_a misses = u2, u3, u4, u5 = 4
    # Spoken B rescues (spoken_a miss AND spoken_b hit) = u2, u3 = 2
    # Rescue rate = 2 / 4 = 0.50 (50%)
    assert result["spoken_a_misses"] == 4
    assert result["spoken_b_rescues"] == 2
    assert result["rescue_rate"] == 0.5


def test_path_c_guard_rejections(temp_db_path: Path) -> None:
    """Tests Path C guard rejection counts grouped by guard reason."""
    conn = get_db_connection(temp_db_path)
    session = SessionTrace(session_id="s1", started_at="2026-09-20T00:00:00Z", app_version="1.0.0")

    utterances = [
        # schema_rejection
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u1", source="voice", final_status="rejected", created_at="2026-09-20T00:01:00Z"),
            stage_attempts=[StageAttemptTrace(stage="llm_c", status="rejected", reason="schema_rejection", elapsed_ms=50.0)],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u2", source="voice", final_status="rejected", created_at="2026-09-20T00:02:00Z"),
            stage_attempts=[StageAttemptTrace(stage="llm_c", status="rejected", reason="schema_rejection", elapsed_ms=50.0)],
        ),
        # evidence_rejection
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u3", source="voice", final_status="rejected", created_at="2026-09-20T00:03:00Z"),
            stage_attempts=[StageAttemptTrace(stage="llm_c", status="rejected", reason="evidence_rejection", elapsed_ms=60.0)],
        ),
        # catalog_grounding_rejection
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u4", source="voice", final_status="rejected", created_at="2026-09-20T00:04:00Z"),
            stage_attempts=[StageAttemptTrace(stage="llm_c", status="rejected", reason="catalog_grounding_rejection", elapsed_ms=70.0)],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u5", source="voice", final_status="rejected", created_at="2026-09-20T00:05:00Z"),
            stage_attempts=[StageAttemptTrace(stage="llm_c", status="rejected", reason="catalog_grounding_rejection", elapsed_ms=70.0)],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u6", source="voice", final_status="rejected", created_at="2026-09-20T00:06:00Z"),
            stage_attempts=[StageAttemptTrace(stage="llm_c", status="rejected", reason="catalog_grounding_rejection", elapsed_ms=70.0)],
        ),
        # timeout
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u7", source="voice", final_status="rejected", created_at="2026-09-20T00:07:00Z"),
            stage_attempts=[StageAttemptTrace(stage="llm_c", status="rejected", reason="timeout", elapsed_ms=3000.0)],
        ),
        # Path C hit (must NOT count as rejection)
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u8", source="voice", final_status="hit", created_at="2026-09-20T00:08:00Z"),
            stage_attempts=[StageAttemptTrace(stage="llm_c", status="hit", reason=None, elapsed_ms=100.0)],
        ),
    ]

    insert_trace_batch(conn, TraceBatchPayload(session=session, utterances=utterances))
    conn.close()

    guards = get_path_c_guard_rejections(temp_db_path)
    assert guards["schema_rejection"] == 2
    assert guards["evidence_rejection"] == 1
    assert guards["catalog_grounding_rejection"] == 3
    assert guards["timeout"] == 1


def test_command_miss_rate_ranking_generic(temp_db_path: Path) -> None:
    """Tests generic command ranking by miss rate, including future/synthetic types."""
    conn = get_db_connection(temp_db_path)
    session = SessionTrace(session_id="s1", started_at="2026-09-20T00:00:00Z", app_version="1.0.0")

    utterances = [
        # FLY_HEADING: 1 hit, 1 miss -> 50% miss rate
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u1", source="text", final_status="hit", created_at="2026-09-20T00:01:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="hit", elapsed_ms=1.0, result_json={"instructionTypes": ["FLY_HEADING"]})],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u2", source="text", final_status="miss", created_at="2026-09-20T00:02:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="miss", elapsed_ms=1.0, result_json={"instructionTypes": ["FLY_HEADING"]})],
        ),
        # ALTITUDE: 3 hits, 1 miss -> 25% miss rate
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u3", source="text", final_status="hit", created_at="2026-09-20T00:03:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="hit", elapsed_ms=1.0, result_json={"instructionTypes": ["ALTITUDE"]})],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u4", source="text", final_status="hit", created_at="2026-09-20T00:04:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="hit", elapsed_ms=1.0, result_json={"instructionTypes": ["ALTITUDE"]})],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u5", source="text", final_status="hit", created_at="2026-09-20T00:05:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="hit", elapsed_ms=1.0, result_json={"instructionTypes": ["ALTITUDE"]})],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u6", source="text", final_status="miss", created_at="2026-09-20T00:06:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="miss", elapsed_ms=1.0, result_json={"instructionTypes": ["ALTITUDE"]})],
        ),
        # ASSIGN_SQUAWK: 0 hits, 2 misses -> 100% miss rate
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u7", source="text", final_status="miss", created_at="2026-09-20T00:07:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="miss", elapsed_ms=1.0, result_json={"instructionTypes": ["ASSIGN_SQUAWK"]})],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u8", source="text", final_status="miss", created_at="2026-09-20T00:08:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="miss", elapsed_ms=1.0, result_json={"instructionTypes": ["ASSIGN_SQUAWK"]})],
        ),
        # Synthetic / Future command: SYNTHETIC_FUTURE_CMD: 2 hits, 0 misses -> 0% miss rate
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u9", source="text", final_status="hit", created_at="2026-09-20T00:09:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="hit", elapsed_ms=1.0, result_json={"instructionTypes": ["SYNTHETIC_FUTURE_CMD"]})],
        ),
        UtteranceEntry(
            utterance=UtteranceTrace(utterance_id="u10", source="text", final_status="hit", created_at="2026-09-20T00:10:00Z"),
            stage_attempts=[StageAttemptTrace(stage="typed", status="hit", elapsed_ms=1.0, result_json={"commandType": "SYNTHETIC_FUTURE_CMD"})],
        ),
    ]

    insert_trace_batch(conn, TraceBatchPayload(session=session, utterances=utterances))
    conn.close()

    ranks = get_command_miss_rates(temp_db_path)
    assert len(ranks) == 4

    # Ranking by miss rate DESC:
    # 1. ASSIGN_SQUAWK: 100% (1.0)
    assert ranks[0]["command"] == "ASSIGN_SQUAWK"
    assert ranks[0]["total"] == 2
    assert ranks[0]["misses"] == 2
    assert ranks[0]["miss_rate"] == 1.0

    # 2. FLY_HEADING: 50% (0.5)
    assert ranks[1]["command"] == "FLY_HEADING"
    assert ranks[1]["total"] == 2
    assert ranks[1]["misses"] == 1
    assert ranks[1]["miss_rate"] == 0.5

    # 3. ALTITUDE: 25% (0.25)
    assert ranks[2]["command"] == "ALTITUDE"
    assert ranks[2]["total"] == 4
    assert ranks[2]["misses"] == 1
    assert ranks[2]["miss_rate"] == 0.25

    # 4. SYNTHETIC_FUTURE_CMD: 0% (0.0)
    assert ranks[3]["command"] == "SYNTHETIC_FUTURE_CMD"
    assert ranks[3]["total"] == 2
    assert ranks[3]["misses"] == 0
    assert ranks[3]["miss_rate"] == 0.0


def test_latency_distribution_percentiles(temp_db_path: Path) -> None:
    """Tests latency percentiles (p50, p90, p99) per stage and skipped exclusions."""
    conn = get_db_connection(temp_db_path)
    session = SessionTrace(session_id="s1", started_at="2026-09-20T00:00:00Z", app_version="1.0.0")

    # Generate 100 stage attempts for typed stage with elapsed_ms from 1.0 to 100.0
    utterances: list[UtteranceEntry] = []
    for i in range(1, 101):
        utterances.append(
            UtteranceEntry(
                utterance=UtteranceTrace(
                    utterance_id=f"u_{i}",
                    source="voice",
                    stt_json={"latencyMs": i * 2.0},
                    final_status="hit",
                    created_at="2026-09-20T00:00:00Z",
                ),
                stage_attempts=[
                    StageAttemptTrace(stage="typed", status="hit", elapsed_ms=float(i)),
                    # Skipped stages must be excluded (elapsed_ms=0 should not pollute spoken_b percentiles)
                    StageAttemptTrace(stage="spoken_b", status="skipped", reason="prior_hit", elapsed_ms=0.0),
                ],
            )
        )

    insert_trace_batch(conn, TraceBatchPayload(session=session, utterances=utterances))
    conn.close()

    latencies = get_latency_distribution(temp_db_path)

    # typed: 100 values from 1.0 to 100.0
    typed_stats = latencies["typed"]
    assert typed_stats["count"] == 100
    assert abs(typed_stats["p50"] - 50.5) <= 1.0
    assert abs(typed_stats["p90"] - 90.1) <= 1.0
    assert abs(typed_stats["p99"] - 99.01) <= 1.0

    # stt: 100 values from 2.0 to 200.0
    stt_stats = latencies["stt"]
    assert stt_stats["count"] == 100
    assert abs(stt_stats["p50"] - 101.0) <= 2.0

    # spoken_b: all skipped -> count must be 0!
    assert latencies["spoken_b"]["count"] == 0
    assert latencies["spoken_b"]["p50"] == 0.0


def test_cli_invocation(temp_db_path: Path, capsys) -> None:
    """Tests CLI entrypoint and argument flags."""
    conn = get_db_connection(temp_db_path)
    session = SessionTrace(session_id="s1", started_at="2026-09-20T00:00:00Z", app_version="1.0.0")
    insert_trace_batch(
        conn,
        TraceBatchPayload(
            session=session,
            utterances=[
                UtteranceEntry(
                    utterance=UtteranceTrace(utterance_id="u1", source="text", final_status="hit", created_at="2026-09-20T00:00:00Z"),
                    stage_attempts=[StageAttemptTrace(stage="typed", status="hit", elapsed_ms=1.5, result_json={"instructionTypes": ["FLY_HEADING"]})],
                ),
            ],
        ),
    )
    conn.close()

    # 1. Summary text output
    ret = query_main(["--summary", "--db", str(temp_db_path)])
    assert ret == 0
    captured = capsys.readouterr()
    assert "ATC-SIM Parse & STT Diagnostic Traces" in captured.out
    assert "FLY_HEADING" in captured.out

    # 2. Summary JSON output
    ret = query_main(["--summary", "--json", "--db", str(temp_db_path)])
    assert ret == 0
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert "failure_root_causes" in data
    assert "path_b_rescue_rate" in data

    # 3. Individual queries
    for flag in ["--failure-root-causes", "--rescue-rate", "--guard-rejections", "--command-miss-rates", "--latencies"]:
        ret = query_main([flag, "--db", str(temp_db_path)])
        assert ret == 0
