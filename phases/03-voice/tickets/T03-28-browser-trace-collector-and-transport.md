# T03-28 Browser in-memory trace collector and async flush transport

**Phase:** 03 Voice  
**Priority:** P1  
**Size:** M  
**Depends on:** T03-27  
**Blocks:** T03-29  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Build the caller-side in-memory trace collector and asynchronous batch transport in TypeScript to collect parser and STT traces, buffer them in a bounded queue, and flush to `speech-api` without blocking or throwing.

## Context

All diagnostic telemetry and stage logging must originate on the caller (JS/TS) side, rather than inside `speech-api`. The collector acts as the client-side pipeline coordinator for traces. To prevent any performance degradation or parser regressions, the collector is disabled by default, maintains a bounded queue, flushes asynchronously, and silently drops traces if `speech-api` is unavailable.

Relevant contracts:
- `phases/_shared/parse-pipeline.md`
- `phases/_shared/architecture.md`

## Research

- **R01 (JO 7110.65):** Radio communication latency and clarity constraints.
- **Trainer delta:** Telemetry buffering must respect the trainer's 1.5 s p50 radio response target and never stall the browser UI or audio graph.

## Scope

- Define TypeScript interfaces in `src/parse/trace/types.ts`:
  - `SessionTrace`: `sessionId`, `startedAt`, `appVersion`.
  - `UtteranceTrace`: `utteranceId`, `sessionId`, `source`, `sttJson`, `finalStage`, `finalStatus`, `createdAt`.
  - `StageAttemptTrace`: `stage`, `status` (`"hit"` | `"miss"` | `"rejected"` | `"skipped"`), `reason`, `elapsedMs`, `resultJson`.
  - `TraceBatchPayload`: `session: SessionTrace`, `utterances: Array<{ utterance: UtteranceTrace, stageAttempts: StageAttemptTrace[] }>`.
- Implement `TraceCollector` in `src/parse/trace/collector.ts`:
  - `isEnabled()`: Disabled by default; opt-in via `localStorage.getItem("atc_parse_traces") === "1"` or `VITE_ENABLE_PARSE_TRACES=1`.
  - `recordUtteranceTrace(...)`: Appends an utterance trace and its stage attempts into a FIFO queue.
  - Bounded queue: Maximum capacity of 100 entries. Drops oldest entries when limit is exceeded.
  - Periodic / debounced background `flush()` to `POST /debug/traces`.
  - Fail-safe error handling: Swallows network and HTTP errors; never throws into callers.
- Export clean public API from `src/parse/trace/index.ts`.

## Out of scope

- Instrumenting `parseCommand` stages directly (owned by T03-29).
- Modifying `speech-api` Python endpoints (owned by T03-27).
- Persistent browser storage (traces reside in memory until flushed or dropped).

## Implementation notes

- All logging occurs from caller (JS/TS), not callee (`speech-api`).
- Keep `src/parse` free of direct DOM couplings where possible; rely on browser-standard `fetch` with non-blocking error absorption.
- Ensure `flush()` handles concurrent flush calls safely.

## Acceptance criteria

- [ ] **AC1 —** Collector is disabled by default; `recordUtteranceTrace` is a zero-allocation no-op when disabled.
- [ ] **AC2 —** When enabled, traces are enqueued in-memory and bounded to 100 items maximum (overflow drops oldest).
- [ ] **AC3 —** `flush()` batches enqueued traces and issues a POST to `/debug/traces`.
- [ ] **AC4 —** Network timeout, HTTP 503, or connection refusal during `flush()` drops traces safely and does not throw into caller code.
- [ ] **AC5 —** Unit tests verify queue bounding, batch serialization, and error suppression.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `collector.record(trace)` with `enabled=false` | No-op; returns immediately | Queue size remains 0; no network activity | Disabled state | `src/parse/test/traceCollector.test.ts` |
| `collector.record(trace)` with `enabled=true` | Trace appended to queue | Queue size incremented; schedules background flush | Overflow drops oldest trace at >100 entries | `src/parse/test/traceCollector.test.ts` |
| `collector.flush()` when server is down | Catches error; clears or drops failed batch | No exception propagated to caller | Server unreachable; logs debug warning only | `src/parse/test/traceCollector.test.ts` |

## Test plan

- Unit: Test queue bounds, FIFO eviction, batch payload formatting, and error tolerance in `src/parse/test/traceCollector.test.ts`.
- Integration: Mocked `fetch` tests proving no unhandled promise rejections on network failure.

## Suggested files

- `src/parse/trace/types.ts`
- `src/parse/trace/collector.ts`
- `src/parse/trace/index.ts`
- `src/parse/test/traceCollector.test.ts`
