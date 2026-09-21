# T03-27 SQLite trace sink and prune command in speech-api

**Phase:** 03 Voice  
**Priority:** P1  
**Size:** M  
**Depends on:** none  
**Blocks:** T03-28  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Provide a local-only SQLite persistence sink and batch ingestion endpoint (`POST /debug/traces`) in `speech-api` for parser diagnostic traces, along with a prune command for trace retention.

## Context

To diagnose systemic STT and parser stage misses (typed, Path A, Path B, Path C) without altering parser behavior, the frontend caller streams trace records to `speech-api`. Per repository product law, `speech-api` acts solely as a passive storage sink: all stage timing, classification, and event logging are performed by the caller (JS/TS), not by `speech-api`.

Relevant contracts:
- `phases/_shared/parse-pipeline.md`
- `phases/_shared/architecture.md`
- `phases/_shared/references.md` (R01)

## Research

- **R01 (JO 7110.65):** Radio communications and clearance issuance phraseology.
- **Trainer delta:** Local trace persistence is a diagnostics facility for trainer development and model evaluation. It is never exposed as an operational ATC feature.

## Scope

- Configure SQLite trace file location defaulting to `.local/parse-traces.sqlite`.
- Ensure `.local/` is explicitly gitignored.
- Create database schema on startup with WAL mode and required indexes:
  - `sessions`: `session_id TEXT PRIMARY KEY`, `started_at TEXT NOT NULL`, `app_version TEXT NOT NULL`.
  - `utterances`: `utterance_id TEXT PRIMARY KEY`, `session_id TEXT NOT NULL`, `source TEXT NOT NULL`, `stt_json TEXT`, `final_stage TEXT`, `final_status TEXT NOT NULL`, `created_at TEXT NOT NULL`.
  - `stage_attempts`: `attempt_id INTEGER PRIMARY KEY AUTOINCREMENT`, `utterance_id TEXT NOT NULL`, `stage TEXT NOT NULL`, `status TEXT NOT NULL`, `reason TEXT`, `elapsed_ms REAL NOT NULL`, `result_json TEXT`.
  - Indexes: `idx_utterances_session_id`, `idx_utterances_created_at`, `idx_stage_attempts_stage`, `idx_stage_attempts_status`, `idx_stage_attempts_reason`.
- Add `POST /debug/traces` endpoint in `speech-api/app.py`:
  - Validates payload with Pydantic (`TraceBatchPayload`).
  - Writes records within a single database transaction.
  - Rejects malformed records with HTTP 422.
- Implement retention and pruning CLI utility `speech-api/prune_traces.py`:
  - Arguments: `--days <N>` and `--max-utterances <M>`.
  - Prunes oldest records and cascades stage attempts.

## Out of scope

- Direct SQLite writes from browser code.
- Remote telemetry, metrics dashboards, or cloud database engines.
- Audio recording or persistence.
- Any caller-side trace generation logic (owned by T03-28 and T03-29).

## Implementation notes

- Use standard Python `sqlite3` with `PRAGMA journal_mode=WAL` and `PRAGMA synchronous=NORMAL`.
- Ensure `.local/` directory is created if not present.
- Transactions must be atomic (`with conn:`).
- `speech-api` does NOT infer or construct traces; it only persists caller-supplied batches.

## Acceptance criteria

- [ ] **AC1 —** `.local/` and `.local/parse-traces.sqlite` are explicitly in `.gitignore`.
- [ ] **AC2 —** Database tables (`sessions`, `utterances`, `stage_attempts`) and indexes are automatically created on first access.
- [ ] **AC3 —** `POST /debug/traces` accepts valid batch payloads, inserts them within a transaction, and returns HTTP 200 `{"ok": true, "inserted": N}`.
- [ ] **AC4 —** `POST /debug/traces` rejects invalid or malformed schema payloads with HTTP 422.
- [ ] **AC5 —** `prune_traces.py` prunes records older than specified days or exceeding max utterance limits without errors on an empty or populated database.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `POST /debug/traces` with valid batch JSON | HTTP 200 `{"ok": true, "inserted": 1}` | Rows persisted to `sessions`, `utterances`, `stage_attempts` in `.local/parse-traces.sqlite` | Invalid JSON yields HTTP 422; no rows inserted | `speech-api/tests/test_traces.py` |
| `POST /debug/traces` with duplicate `session_id` | HTTP 200 `{"ok": true}` | Existing session preserved (`INSERT OR IGNORE`); utterances inserted | Primary key collision on utterance returns HTTP 409 or updates idempotently | `speech-api/tests/test_traces.py` |
| `python -m prune_traces --days 7 --max-utterances 5000` | Process exits 0 with deletion count summary | Deletes rows older than 7 days or beyond count limit from `.local/parse-traces.sqlite` | Graceful exit 0 when zero rows exist | `speech-api/tests/test_traces.py` |

## Test plan

- Unit: Test Pydantic trace models, SQLite table creation, WAL configuration, and query helpers in `speech-api/tests/test_traces.py`.
- Integration: FastAPI `TestClient` tests verifying `POST /debug/traces` batch persistence and atomic rollback on invalid records.
- Manual: Inspect `.local/parse-traces.sqlite` schema and record format using `sqlite3` CLI.

## Suggested files

- `.gitignore`
- `speech-api/config.py`
- `speech-api/trace_db.py`
- `speech-api/prune_traces.py`
- `speech-api/app.py`
- `speech-api/tests/test_traces.py`
