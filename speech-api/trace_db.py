"""SQLite persistence sink for parse and STT diagnostic traces."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, List, Optional, Union

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, model_validator


class SessionTrace(BaseModel):
    session_id: str = Field(validation_alias=AliasChoices("session_id", "sessionId"))
    started_at: str = Field(validation_alias=AliasChoices("started_at", "startedAt"))
    app_version: str = Field(validation_alias=AliasChoices("app_version", "appVersion"))

    model_config = ConfigDict(populate_by_name=True)


class UtteranceTrace(BaseModel):
    utterance_id: str = Field(validation_alias=AliasChoices("utterance_id", "utteranceId"))
    session_id: Optional[str] = Field(default=None, validation_alias=AliasChoices("session_id", "sessionId"))
    source: str
    stt_json: Optional[Union[str, dict, list]] = Field(default=None, validation_alias=AliasChoices("stt_json", "sttJson"))
    final_stage: Optional[str] = Field(default=None, validation_alias=AliasChoices("final_stage", "finalStage"))
    final_status: str = Field(validation_alias=AliasChoices("final_status", "finalStatus"))
    created_at: str = Field(validation_alias=AliasChoices("created_at", "createdAt"))

    model_config = ConfigDict(populate_by_name=True)


class StageAttemptTrace(BaseModel):
    stage: str
    status: str
    reason: Optional[str] = None
    elapsed_ms: float = Field(validation_alias=AliasChoices("elapsed_ms", "elapsedMs"))
    result_json: Optional[Union[str, dict, list]] = Field(default=None, validation_alias=AliasChoices("result_json", "resultJson"))

    model_config = ConfigDict(populate_by_name=True)


class UtteranceEntry(BaseModel):
    utterance: UtteranceTrace
    stage_attempts: List[StageAttemptTrace] = Field(
        default_factory=list,
        validation_alias=AliasChoices("stage_attempts", "stageAttempts"),
    )

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def _coerce_entry(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "utterance" not in data and ("utterance_id" in data or "utteranceId" in data):
                stage_attempts = data.get("stageAttempts") or data.get("stage_attempts") or []
                utterance_data = {
                    k: v for k, v in data.items() if k not in ("stageAttempts", "stage_attempts")
                }
                return {"utterance": utterance_data, "stage_attempts": stage_attempts}
        return data


class TraceBatchPayload(BaseModel):
    session: SessionTrace
    utterances: List[UtteranceEntry] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


def serialize_json_field(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        return val
    return json.dumps(val)


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    app_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS utterances (
    utterance_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    source TEXT NOT NULL,
    stt_json TEXT,
    final_stage TEXT,
    final_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stage_attempts (
    attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
    utterance_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    elapsed_ms REAL NOT NULL,
    result_json TEXT,
    FOREIGN KEY (utterance_id) REFERENCES utterances(utterance_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_utterances_session_id ON utterances(session_id);
CREATE INDEX IF NOT EXISTS idx_utterances_created_at ON utterances(created_at);
CREATE INDEX IF NOT EXISTS idx_stage_attempts_stage ON stage_attempts(stage);
CREATE INDEX IF NOT EXISTS idx_stage_attempts_status ON stage_attempts(status);
CREATE INDEX IF NOT EXISTS idx_stage_attempts_reason ON stage_attempts(reason);
CREATE INDEX IF NOT EXISTS idx_stage_attempts_utterance_id ON stage_attempts(utterance_id);
"""


def init_db(conn_or_path: sqlite3.Connection | Path | str) -> None:
    """Initialize trace database tables and indexes."""
    if isinstance(conn_or_path, sqlite3.Connection):
        conn_or_path.executescript(SCHEMA_SQL)
        return

    path = Path(conn_or_path)
    if str(conn_or_path) != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.executescript(SCHEMA_SQL)
    finally:
        conn.close()


def get_db_connection(db_path: Path | str) -> sqlite3.Connection:
    path_str = str(db_path)
    if path_str != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path_str, timeout=10.0)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    init_db(conn)
    return conn


def insert_trace_batch(conn: sqlite3.Connection, payload: TraceBatchPayload) -> int:
    """Insert a trace batch atomically.

    Preserves existing session with INSERT OR IGNORE.
    Updates duplicate utterances idempotently and replaces their stage attempts.
    Returns the count of utterances processed.
    """
    with conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO sessions (session_id, started_at, app_version)
            VALUES (?, ?, ?)
            """,
            (payload.session.session_id, payload.session.started_at, payload.session.app_version),
        )
        for entry in payload.utterances:
            u = entry.utterance
            session_id = u.session_id or payload.session.session_id
            stt_str = serialize_json_field(u.stt_json)
            conn.execute(
                """
                INSERT INTO utterances (
                    utterance_id, session_id, source, stt_json, final_stage, final_status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(utterance_id) DO UPDATE SET
                    session_id=excluded.session_id,
                    source=excluded.source,
                    stt_json=excluded.stt_json,
                    final_stage=excluded.final_stage,
                    final_status=excluded.final_status,
                    created_at=excluded.created_at
                """,
                (
                    u.utterance_id,
                    session_id,
                    u.source,
                    stt_str,
                    u.final_stage,
                    u.final_status,
                    u.created_at,
                ),
            )
            conn.execute("DELETE FROM stage_attempts WHERE utterance_id = ?", (u.utterance_id,))
            for sa in entry.stage_attempts:
                res_str = serialize_json_field(sa.result_json)
                conn.execute(
                    """
                    INSERT INTO stage_attempts (
                        utterance_id, stage, status, reason, elapsed_ms, result_json
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (u.utterance_id, sa.stage, sa.status, sa.reason, sa.elapsed_ms, res_str),
                )
    return len(payload.utterances)


def _delete_utterance_ids(conn: sqlite3.Connection, ids: list[str]) -> tuple[int, int]:
    if not ids:
        return 0, 0
    u_deleted = 0
    sa_deleted = 0
    chunk_size = 500
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        placeholders = ",".join("?" * len(chunk))
        cur_sa = conn.execute(
            f"DELETE FROM stage_attempts WHERE utterance_id IN ({placeholders})",
            chunk,
        )
        sa_deleted += cur_sa.rowcount
        cur_u = conn.execute(
            f"DELETE FROM utterances WHERE utterance_id IN ({placeholders})",
            chunk,
        )
        u_deleted += cur_u.rowcount
    return u_deleted, sa_deleted


def _prune_connection(
    conn: sqlite3.Connection,
    *,
    days: int | None = None,
    max_utterances: int | None = None,
) -> tuple[int, int]:
    total_u = 0
    total_sa = 0

    with conn:
        if days is not None and days >= 0:
            cur = conn.execute(
                "SELECT utterance_id FROM utterances WHERE datetime(created_at) < datetime('now', '-' || ? || ' days')",
                (days,),
            )
            old_ids = [row[0] for row in cur.fetchall()]
            if old_ids:
                u_del, sa_del = _delete_utterance_ids(conn, old_ids)
                total_u += u_del
                total_sa += sa_del

        if max_utterances is not None and max_utterances >= 0:
            cur = conn.execute("SELECT COUNT(*) FROM utterances")
            count = cur.fetchone()[0]
            if count > max_utterances:
                excess = count - max_utterances
                cur = conn.execute(
                    "SELECT utterance_id FROM utterances ORDER BY datetime(created_at) ASC, rowid ASC LIMIT ?",
                    (excess,),
                )
                excess_ids = [row[0] for row in cur.fetchall()]
                if excess_ids:
                    u_del, sa_del = _delete_utterance_ids(conn, excess_ids)
                    total_u += u_del
                    total_sa += sa_del

    return total_u, total_sa


def prune_traces(
    conn_or_path: sqlite3.Connection | Path | str,
    *,
    days: int | None = None,
    max_utterances: int | None = None,
) -> tuple[int, int]:
    """Prune traces older than `days` and/or limit total utterances to `max_utterances`.

    Returns (utterances_deleted, stage_attempts_deleted).
    """
    if isinstance(conn_or_path, sqlite3.Connection):
        return _prune_connection(conn_or_path, days=days, max_utterances=max_utterances)

    path = Path(conn_or_path)
    if str(conn_or_path) != ":memory:" and not path.exists():
        return 0, 0

    conn = get_db_connection(path)
    try:
        return _prune_connection(conn, days=days, max_utterances=max_utterances)
    finally:
        conn.close()
