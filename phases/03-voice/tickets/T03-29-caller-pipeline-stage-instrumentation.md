# T03-29 Caller-side parse pipeline and voice loop instrumentation

**Phase:** 03 Voice  
**Priority:** P1  
**Size:** L  
**Depends on:** T03-28  
**Blocks:** T03-30  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Instrument the JS/TS caller flow across STT, `typed`, `spoken_a`, `spoken_b`, and `llm_c` stages to record execution latency, stage statuses, rejection causes, and candidate counts without altering parse behavior or requiring changes for new command types.

## Context

Diagnostics must reveal whether a command failure stems from STT inaccuracy, deterministic grammar misses, ungrounded catalog entities, or Path C guard rejections. Per project law, all logging occurs on the caller (JS/TS) side rather than the callee (`speech-api`). The telemetry representation must remain fully generic so future Class B clearances, holding instructions, or new command discriminants require no instrumentation updates.

Relevant contracts:
- `phases/_shared/parse-pipeline.md`
- `phases/_shared/command-ir.md`
- `phases/_shared/references.md` (R01)

## Research

- **R01 (JO 7110.65):** Radio transmission structure, standard readbacks, and phraseology boundaries.
- **Trainer delta:** Stage breakdown telemetry is an internal diagnostic layer and must never leak into pilot simulation readbacks or alter deterministic snap precedence.

## Scope

- Instrument `src/parse/parse-command.ts`:
  - Measure elapsed time for each stage using `performance.now()`.
  - Record attempts for all 4 stages:
    - `typed`: hit or miss; elapsed ms; ungrounded tokens if any.
    - `spoken_a`: hit, miss, or skipped (`prior_hit`); elapsed ms; error/reason.
    - `spoken_b`: hit, miss, or skipped (`prior_hit`); elapsed ms.
    - `llm_c`:
      - If prior stage hit: `status: "skipped"`, `reason: "prior_hit"`.
      - If not eligible (Path C disabled, missing evidence, ungrounded IFR syntax): `status: "skipped"`, `reason: "not_eligible"`.
      - If attempted:
        - Request/response latency (`elapsed_ms`).
        - Candidate counts: `fixesCount`, `proceduresCount`, `approachesCount`, `airportsCount` (no full catalog dumps).
        - Outcome classification:
          - `hit`: Accepted output.
          - `rejected`:
            - `reason: "timeout"` / `"unavailable"`
            - `reason: "schema_rejection"` (GBNF / Pydantic / TypeScript schema check failure)
            - `reason: "evidence_rejection"` (`pathCResultIsComplete` failed, hallucinated tokens)
            - `reason: "catalog_grounding_rejection"` (unlisted fix, unlisted procedure/approach, invalid route link, ungrounded callsign).
  - Generalizability: Dynamically extract `instructionTypes: parsed.instructions.map(i => i.type)` and instruction counts; do not hardcode command discriminants.
  - Record final winning stage (`typed`, `spoken_a`, `spoken_b`, `llm_c`, or `none`) and final status (`hit`, `miss`, `rejected`, `timeout`).
- Instrument caller entry points:
  - `src/speech/voice-loop.ts`: Pass utterance ID, STT text, latency, audio duration, and STT metadata into the trace context.
  - `src/pilot/handleRadioText.ts`: Supply trace context for typed command inputs.
- Emit trace to `TraceCollector` (T03-28) at the completion of `parseCommand`.

## Out of scope

- Direct database writes from JS/TS (buffered by T03-28 and ingested by T03-27).
- Changing any parsing logic, regexes, catalog retrieval thresholds, or readback formatting.
- Storing raw audio waveforms or full catalog/roster prompts.

## Implementation notes

- All logging logic resides on the caller (JS/TS), not on `speech-api`.
- When tracing is disabled, keep overhead strictly minimal (single boolean check).
- Tracing failures must be wrapped in `try/catch` so errors never throw into the parse path.

## Acceptance criteria

- [ ] **AC1 —** Parse outputs and side effects are bit-for-bit identical with instrumentation enabled versus disabled.
- [ ] **AC2 —** Skipped stages are explicitly recorded (`spoken_b: skipped / prior_hit`, `llm_c: skipped / prior_hit` or `llm_c: skipped / not_eligible`).
- [ ] **AC3 —** Path C guard rejections (`schema_rejection`, `evidence_rejection`, `catalog_grounding_rejection`, `timeout`) are correctly classified and recorded with candidate counts.
- [ ] **AC4 —** Instruction types are extracted generically from `instructions` without a hardcoded list of command types.
- [ ] **AC5 —** Voice loop STT metadata (latency, duration, model) is attached to the utterance trace.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `parseCommand("H270", { source: "text" })` | Returns valid parse; trace records `typed: hit`, others `skipped / prior_hit` | Trace enqueued | Zero parse behavioral difference | `src/parse/test/parseTrace.test.ts` |
| Voice: `"Delta 123 turn left heading 270"` | `typed: miss`, `spoken_a: hit`, `spoken_b: skipped`, `llm_c: skipped` | STT metadata attached | Identical command produced | `src/parse/test/parseTrace.test.ts` |
| Path C returns unlisted fix | `llm_c: rejected` (`reason: "catalog_grounding_rejection"`) | Trace records candidate counts and rejected reason | Falls back cleanly to `PARSE_MISS` | `src/parse/test/parseTrace.test.ts` |
| Path C network throws / times out | `llm_c: rejected` (`reason: "timeout"`) | Soft miss returned; trace records timeout | Exception does not leak into caller | `src/parse/test/parseTrace.test.ts` |

## Test plan

- Unit: Test stage status logging, skip reason assignment, candidate counting, and Path C rejection classification in `src/parse/test/parseTrace.test.ts`.
- Integration: Test `voice-loop.ts` integration ensuring STT metadata and latency are captured without regression in existing voice loop tests.

## Suggested files

- `src/parse/parse-command.ts`
- `src/speech/voice-loop.ts`
- `src/pilot/handleRadioText.ts`
- `src/parse/test/parseTrace.test.ts`
- `src/speech/test/voice-loop.test.ts`
