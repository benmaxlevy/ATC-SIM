"""Unit and contract tests for SQLite trace persistence, /debug/traces endpoint, and pruning."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure mock is set before importing app
os.environ["SPEECH_API_MOCK"] = "1"

from app import create_app
from config import Settings
from prune_traces import main as prune_main
from trace_db import (
    StageAttemptTrace,
    SessionTrace,
    TraceBatchPayload,
    UtteranceEntry,
    UtteranceTrace,
    get_db_connection,
    init_db,
    insert_trace_batch,
    prune_traces,
)


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    return tmp_path / "test-traces.sqlite"


@pytest.fixture
def client_with_db(temp_db_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("TRACE_DB_PATH", str(temp_db_path))
    monkeypatch.setattr("config.load_env_file", lambda: False)
    settings = Settings.load()
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client


def test_gitignore_contains_local_entries() -> None:
    gitignore_path = Path(__file__).resolve().parents[2] / ".gitignore"
    text = gitignore_path.read_text(encoding="utf-8")
    lines = [line.strip() for line in text.splitlines()]
    assert ".local/" in lines
    assert ".local/parse-traces.sqlite" in lines


def test_config_trace_db_default_and_env(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("TRACE_DB_PATH", raising=False)
    monkeypatch.delenv("PARSE_TRACES_DB", raising=False)
    monkeypatch.setattr("config.load_env_file", lambda: False)
    settings = Settings.load()
    assert settings.trace_db_path.name == "parse-traces.sqlite"
    assert ".local" in str(settings.trace_db_path)

    custom_path = tmp_path / "custom.sqlite"
    monkeypatch.setenv("TRACE_DB_PATH", str(custom_path))
    settings2 = Settings.load()
    assert settings2.trace_db_path == custom_path.resolve()


def test_tables_and_indexes_auto_created(temp_db_path: Path) -> None:
    conn = get_db_connection(temp_db_path)
    try:
        # Check WAL mode
        journal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
        assert journal_mode.upper() == "WAL"

        # Check tables
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table';"
            ).fetchall()
        }
        assert "sessions" in tables
        assert "utterances" in tables
        assert "stage_attempts" in tables

        # Check required indexes
        indexes = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index';"
            ).fetchall()
        }
        assert "idx_utterances_session_id" in indexes
        assert "idx_utterances_created_at" in indexes
        assert "idx_stage_attempts_stage" in indexes
        assert "idx_stage_attempts_status" in indexes
        assert "idx_stage_attempts_reason" in indexes
    finally:
        conn.close()


def test_batch_insertion_and_deserialization(temp_db_path: Path) -> None:
    conn = get_db_connection(temp_db_path)
    try:
        payload = TraceBatchPayload(
            session=SessionTrace(
                session_id="sess-001",
                started_at="2026-09-20T00:00:00Z",
                app_version="0.1.0",
            ),
            utterances=[
                UtteranceEntry(
                    utterance=UtteranceTrace(
                        utterance_id="utt-001",
                        session_id="sess-001",
                        source="voice",
                        stt_json={"model": "mock", "latency": 42.0},
                        final_stage="spoken_a",
                        final_status="hit",
                        created_at="2026-09-20T00:00:01Z",
                    ),
                    stage_attempts=[
                        StageAttemptTrace(
                            stage="typed",
                            status="miss",
                            reason="syntax_error",
                            elapsed_ms=1.2,
                        ),
                        StageAttemptTrace(
                            stage="spoken_a",
                            status="hit",
                            elapsed_ms=3.4,
                            result_json={"command": "TURN_LEFT_HEADING", "heading": 270},
                        ),
                    ],
                )
            ],
        )
        count = insert_trace_batch(conn, payload)
        assert count == 1

        sess_rows = conn.execute("SELECT * FROM sessions WHERE session_id='sess-001';").fetchall()
        assert len(sess_rows) == 1
        assert sess_rows[0][0] == "sess-001"
        assert sess_rows[0][2] == "0.1.0"

        utt_rows = conn.execute("SELECT * FROM utterances WHERE utterance_id='utt-001';").fetchall()
        assert len(utt_rows) == 1
        assert utt_rows[0][2] == "voice"
        assert '"model": "mock"' in utt_rows[0][3]

        sa_rows = conn.execute(
            "SELECT stage, status, elapsed_ms, result_json FROM stage_attempts WHERE utterance_id='utt-001' ORDER BY attempt_id ASC;"
        ).fetchall()
        assert len(sa_rows) == 2
        assert sa_rows[0][0] == "typed"
        assert sa_rows[0][1] == "miss"
        assert sa_rows[1][0] == "spoken_a"
        assert sa_rows[1][1] == "hit"
        assert '"TURN_LEFT_HEADING"' in sa_rows[1][3]
    finally:
        conn.close()


def test_idempotent_session_and_utterance_collision(temp_db_path: Path) -> None:
    conn = get_db_connection(temp_db_path)
    try:
        payload1 = TraceBatchPayload(
            session=SessionTrace(
                sessionId="sess-100",
                startedAt="2026-09-20T00:00:00Z",
                appVersion="1.0.0",
            ),
            utterances=[
                UtteranceEntry(
                    utterance=UtteranceTrace(
                        utteranceId="utt-100",
                        source="text",
                        finalStatus="miss",
                        createdAt="2026-09-20T00:00:01Z",
                    ),
                    stageAttempts=[
                        StageAttemptTrace(
                            stage="typed",
                            status="miss",
                            elapsedMs=2.0,
                        )
                    ],
                )
            ],
        )
        insert_trace_batch(conn, payload1)

        # Re-send with same session and utterance ID but updated fields
        payload2 = TraceBatchPayload(
            session=SessionTrace(
                sessionId="sess-100",
                startedAt="2026-09-20T01:00:00Z",  # Different, should be ignored by INSERT OR IGNORE
                appVersion="2.0.0",
            ),
            utterances=[
                UtteranceEntry(
                    utterance=UtteranceTrace(
                        utteranceId="utt-100",
                        source="text",
                        finalStage="typed",
                        finalStatus="hit",  # Updated
                        createdAt="2026-09-20T00:00:01Z",
                    ),
                    stageAttempts=[
                        StageAttemptTrace(
                            stage="typed",
                            status="hit",
                            elapsedMs=1.5,
                        )
                    ],
                )
            ],
        )
        insert_trace_batch(conn, payload2)

        # Check session is preserved
        sess = conn.execute("SELECT started_at, app_version FROM sessions WHERE session_id='sess-100';").fetchone()
        assert sess[0] == "2026-09-20T00:00:00Z"
        assert sess[1] == "1.0.0"

        # Check utterance was updated idempotently
        utt = conn.execute("SELECT final_status, final_stage FROM utterances WHERE utterance_id='utt-100';").fetchone()
        assert utt[0] == "hit"
        assert utt[1] == "typed"

        # Check stage attempts were replaced, not duplicated
        sa_count = conn.execute("SELECT COUNT(*) FROM stage_attempts WHERE utterance_id='utt-100';").fetchone()[0]
        assert sa_count == 1
    finally:
        conn.close()


def test_transaction_safety_rollback(temp_db_path: Path) -> None:
    conn = get_db_connection(temp_db_path)
    try:
        # Construct invalid batch that triggers SQLite constraint error
        payload = TraceBatchPayload(
            session=SessionTrace(
                sessionId="sess-err",
                startedAt="2026-09-20T00:00:00Z",
                appVersion="1.0.0",
            ),
            utterances=[
                UtteranceEntry(
                    utterance=UtteranceTrace(
                        utteranceId="utt-err-1",
                        source="text",
                        finalStatus="hit",
                        createdAt="2026-09-20T00:00:01Z",
                    )
                )
            ],
        )
        insert_trace_batch(conn, payload)
        assert conn.execute("SELECT COUNT(*) FROM utterances;").fetchone()[0] == 1

        # Attempt to insert another batch where second entry violates NOT NULL constraint manually
        with pytest.raises(Exception):
            with conn:
                conn.execute(
                    "INSERT INTO utterances (utterance_id, session_id, source, final_status, created_at) VALUES ('utt-err-2', 'sess-err', 'text', 'hit', '2026-09-20T00:00:02Z');"
                )
                # This statement fails: missing NOT NULL columns
                conn.execute("INSERT INTO utterances (utterance_id) VALUES (NULL);")

        # Rollback check: 'utt-err-2' was NOT saved
        assert conn.execute("SELECT COUNT(*) FROM utterances WHERE utterance_id='utt-err-2';").fetchone()[0] == 0
    finally:
        conn.close()


def test_post_debug_traces_endpoint_success(client_with_db: TestClient, temp_db_path: Path) -> None:
    response = client_with_db.post(
        "/debug/traces",
        json={
            "session": {
                "sessionId": "web-sess-1",
                "startedAt": "2026-09-20T00:00:00Z",
                "appVersion": "0.1.0",
            },
            "utterances": [
                {
                    "utterance": {
                        "utteranceId": "u-42",
                        "source": "voice",
                        "sttJson": {"text": "turn left heading 270"},
                        "finalStage": "spoken_a",
                        "finalStatus": "hit",
                        "createdAt": "2026-09-20T00:00:05Z",
                    },
                    "stageAttempts": [
                        {
                            "stage": "spoken_a",
                            "status": "hit",
                            "elapsedMs": 5.5,
                            "resultJson": {"command": "TURN_LEFT_HEADING"},
                        }
                    ],
                }
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["inserted"] == 1

    conn = sqlite3.connect(str(temp_db_path))
    try:
        assert conn.execute("SELECT COUNT(*) FROM utterances WHERE utterance_id='u-42';").fetchone()[0] == 1
        assert conn.execute("SELECT COUNT(*) FROM stage_attempts WHERE utterance_id='u-42';").fetchone()[0] == 1
    finally:
        conn.close()


def test_post_debug_traces_endpoint_rejects_malformed_payload(client_with_db: TestClient) -> None:
    # Missing required session fields
    response = client_with_db.post(
        "/debug/traces",
        json={"session": {"sessionId": "s1"}},  # missing startedAt, appVersion
    )
    assert response.status_code == 422

    # Malformed JSON body
    response2 = client_with_db.post(
        "/debug/traces",
        content=b"not json",
        headers={"Content-Type": "application/json"},
    )
    assert response2.status_code == 422

    # Invalid types
    response3 = client_with_db.post(
        "/debug/traces",
        json={
            "session": {
                "sessionId": "s1",
                "startedAt": "2026-09-20T00:00:00Z",
                "appVersion": "1.0",
            },
            "utterances": [
                {
                    "utterance": {
                        "utteranceId": "u1",
                        "source": "voice",
                        "finalStatus": "hit",
                        "createdAt": "2026-09-20T00:00:00Z",
                    },
                    "stageAttempts": [
                        {
                            "stage": "spoken_a",
                            "status": "hit",
                            "elapsedMs": "not_a_number",
                        }
                    ],
                }
            ],
        },
    )
    assert response3.status_code == 422


def test_prune_traces_by_days(temp_db_path: Path) -> None:
    conn = get_db_connection(temp_db_path)
    try:
        now = datetime.now(timezone.utc)
        date_10_days_ago = (now - timedelta(days=10)).isoformat()
        date_2_days_ago = (now - timedelta(days=2)).isoformat()

        payload = TraceBatchPayload(
            session=SessionTrace(
                sessionId="sess-prune-days",
                startedAt=date_10_days_ago,
                appVersion="1.0.0",
            ),
            utterances=[
                UtteranceEntry(
                    utterance=UtteranceTrace(
                        utteranceId="u-old",
                        source="text",
                        finalStatus="hit",
                        createdAt=date_10_days_ago,
                    ),
                    stageAttempts=[
                        StageAttemptTrace(stage="typed", status="hit", elapsedMs=1.0)
                    ],
                ),
                UtteranceEntry(
                    utterance=UtteranceTrace(
                        utteranceId="u-new",
                        source="text",
                        finalStatus="hit",
                        createdAt=date_2_days_ago,
                    ),
                    stageAttempts=[
                        StageAttemptTrace(stage="typed", status="hit", elapsedMs=1.0)
                    ],
                ),
            ],
        )
        insert_trace_batch(conn, payload)
        assert conn.execute("SELECT COUNT(*) FROM utterances;").fetchone()[0] == 2
        assert conn.execute("SELECT COUNT(*) FROM stage_attempts;").fetchone()[0] == 2

        # Prune traces older than 7 days
        u_del, sa_del = prune_traces(conn, days=7)
        assert u_del == 1
        assert sa_del == 1

        remaining_u = [r[0] for r in conn.execute("SELECT utterance_id FROM utterances;").fetchall()]
        assert remaining_u == ["u-new"]
        remaining_sa = [r[0] for r in conn.execute("SELECT utterance_id FROM stage_attempts;").fetchall()]
        assert remaining_sa == ["u-new"]
    finally:
        conn.close()


def test_prune_traces_by_max_utterances(temp_db_path: Path) -> None:
    conn = get_db_connection(temp_db_path)
    try:
        now = datetime.now(timezone.utc)
        utterances = []
        for i in range(5):
            ts = (now - timedelta(hours=5 - i)).isoformat()
            utterances.append(
                UtteranceEntry(
                    utterance=UtteranceTrace(
                        utteranceId=f"u-cap-{i}",
                        source="voice",
                        finalStatus="hit",
                        createdAt=ts,
                    ),
                    stageAttempts=[
                        StageAttemptTrace(stage="typed", status="hit", elapsedMs=float(i))
                    ],
                )
            )

        payload = TraceBatchPayload(
            session=SessionTrace(
                sessionId="sess-prune-cap",
                startedAt=now.isoformat(),
                appVersion="1.0.0",
            ),
            utterances=utterances,
        )
        insert_trace_batch(conn, payload)
        assert conn.execute("SELECT COUNT(*) FROM utterances;").fetchone()[0] == 5

        # Limit to 3 utterances (should prune 2 oldest: u-cap-0 and u-cap-1)
        u_del, sa_del = prune_traces(conn, max_utterances=3)
        assert u_del == 2
        assert sa_del == 2

        remaining = [r[0] for r in conn.execute("SELECT utterance_id FROM utterances ORDER BY created_at ASC;").fetchall()]
        assert remaining == ["u-cap-2", "u-cap-3", "u-cap-4"]
    finally:
        conn.close()


def test_prune_empty_and_missing_db_graceful(tmp_path: Path) -> None:
    # Empty DB
    empty_db = tmp_path / "empty.sqlite"
    init_db(empty_db)
    u_del, sa_del = prune_traces(empty_db, days=7, max_utterances=100)
    assert u_del == 0
    assert sa_del == 0

    # Non-existent DB
    missing_db = tmp_path / "missing.sqlite"
    u_del2, sa_del2 = prune_traces(missing_db, days=7)
    assert u_del2 == 0
    assert sa_del2 == 0


def test_prune_traces_cli(temp_db_path: Path, capsys: pytest.CaptureFixture) -> None:
    conn = get_db_connection(temp_db_path)
    try:
        now = datetime.now(timezone.utc)
        date_old = (now - timedelta(days=15)).isoformat()
        payload = TraceBatchPayload(
            session=SessionTrace(
                sessionId="sess-cli",
                startedAt=date_old,
                appVersion="1.0.0",
            ),
            utterances=[
                UtteranceEntry(
                    utterance=UtteranceTrace(
                        utteranceId="u-cli-1",
                        source="text",
                        finalStatus="hit",
                        createdAt=date_old,
                    ),
                    stageAttempts=[StageAttemptTrace(stage="typed", status="hit", elapsedMs=1.0)],
                )
            ],
        )
        insert_trace_batch(conn, payload)
    finally:
        conn.close()

    exit_code = prune_main(["--days", "7", "--max-utterances", "5000", "--db", str(temp_db_path)])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "Deleted 1 utterances, 1 stage attempts." in captured.out
