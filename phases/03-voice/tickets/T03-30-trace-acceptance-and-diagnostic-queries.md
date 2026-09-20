# T03-30 Trace acceptance, diagnostic queries, and pipeline documentation

**Phase:** 03 Voice  
**Priority:** P1  
**Size:** M  
**Depends on:** T03-29  
**Blocks:** none; final ticket  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Provide diagnostic queries answering the 5 acceptance analysis questions against `.local/parse-traces.sqlite`, verify end-to-end trace delivery in integration tests, and update `phases/_shared/parse-pipeline.md` with the trace contract.

## Context

Once trace collection across STT and parser stages is active, developers and researchers need reliable diagnostic queries to evaluate systemic gaps. The query tooling operates directly on `.local/parse-traces.sqlite`. All logging originated on the caller side (JS/TS); the database provides the structured analytics view.

Relevant contracts:
- `phases/_shared/parse-pipeline.md`
- `phases/_shared/architecture.md`

## Research

- **R01 (JO 7110.65):** Phraseology evaluation against real controller commands.
- **Trainer delta:** Diagnostic queries provide retrospective analysis for trainer accuracy without executing live inference or altering sim performance.

## Scope

- Implement `speech-api/query_traces.py` providing programmatic and CLI functions answering:
  1. **Failure root cause breakdown:** Group by failure category (STT empty/low-prob, typed syntax, spoken_a grammar, ungrounded catalog token, Path B rewrite miss, Path C rejection).
  2. **Path B rescue rate:** Ratio of utterances where `spoken_a` was a `miss` and `spoken_b` was a `hit`.
  3. **Path C guard rejection breakdown:** Counts grouped by `schema_rejection`, `evidence_rejection`, `catalog_grounding_rejection`, and `timeout`.
  4. **Command miss rate ranking:** Utterances grouped by command / instruction type showing hit vs miss percentages.
  5. **Latency distribution:** p50, p90, and p99 elapsed milliseconds broken down by stage (`stt`, `typed`, `spoken_a`, `spoken_b`, `llm_c`).
- Implement integration test `tests/integration/parseTraceAcceptance.test.ts`:
  - Runs realistic utterances (typed, spoken A hit, spoken B rescue, ungrounded catalog miss, Path C hit, Path C guard rejection).
  - Verifies caller records are correctly dispatched and ingested.
  - Verifies no raw audio is saved in any column.
  - Verifies that future or synthetic command types are handled generically without schema failure.
- Update `phases/_shared/parse-pipeline.md`:
  - Document the trace architecture: caller-side instrumentation → in-memory collector → async POST `/debug/traces` → speech-api SQLite writer.
  - Document the SQLite schema, query usage, and retention policy.

## Out of scope

- Real-time web UI dashboard or live graph streaming.
- Exporting traces to external cloud telemetry providers.

## Implementation notes

- Use standard SQLite JSON functions (`json_extract`) in queries for flexible inspection of `result_json` and `stt_json`.
- Queries must handle zero-row databases cleanly without zero-division errors.
- Ensure documentation highlights that all trace logging occurs from the JS/TS caller.

## Acceptance criteria

- [ ] **AC1 —** Diagnostic query script `query_traces.py` successfully answers the 5 core diagnostic questions against `.local/parse-traces.sqlite`.
- [ ] **AC2 —** Integration test proves end-to-end trace flow from `parseCommand` to SQLite sink without altering parse results.
- [ ] **AC3 —** Path B rescue rate and Path C guard rejection distributions are calculated accurately.
- [ ] **AC4 —** Query logic works generically across current and future command types without code modifications.
- [ ] **AC5 —** `phases/_shared/parse-pipeline.md` is updated with the trace schema, caller-logging architecture, and diagnostic query documentation.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `python -m query_traces --summary` | Prints breakdown of failure stages, rescue rate, guard rejections, and latencies | Read-only query on `.local/parse-traces.sqlite` | Handles empty database gracefully | `speech-api/tests/test_query_traces.py` |
| Integration test with mixed command types | Traces recorded for all commands, including synthetic command types | Validates generic storage and retrieval | Non-blocking execution | `tests/integration/parseTraceAcceptance.test.ts` |
| End-to-end PTT voice simulation | STT metadata and parse stage latencies recorded accurately | Verifies caller-side timing accuracy | Network drop during flush does not crash test | `tests/integration/parseTraceAcceptance.test.ts` |

## Test plan

- Unit: Test query calculation functions in `speech-api/tests/test_query_traces.py`.
- Integration: Full-stack integration test in `tests/integration/parseTraceAcceptance.test.ts`.
- Manual: Run CLI summary against generated sample database.

## Suggested files

- `speech-api/query_traces.py`
- `speech-api/tests/test_query_traces.py`
- `tests/integration/parseTraceAcceptance.test.ts`
- `phases/_shared/parse-pipeline.md`
