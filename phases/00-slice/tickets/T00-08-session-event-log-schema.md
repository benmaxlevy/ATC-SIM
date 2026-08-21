# T00-08 Session event log schema

**Phase:** 00 Slice
**Priority:** P0
**Size:** S
**Depends on:** T00-06
**Blocks:** T00-10
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

An append-only in-memory **session event log** is typed and tested. It can record `session.started`, `command.accepted`, and `command.rejected` with a `Command` payload as required by `phases/_shared/command-ir.md`.

## Context

Shared Command IR: every accepted or rejected command emits `command.accepted` or `command.rejected` on the session event log. Payload includes `Command` plus reject reason.

Phase 5 will score from this log. Phase 0 only needs schema + a class that stores events in insertion order. Do not persist to disk or IndexedDB.

## Scope

- `src/core/events/types.ts` — discriminated union `SessionEvent`.
- `src/core/events/session-log.ts` — `SessionLog` class.
- Re-export from `@core`.
- Vitest: append order, immutability of `all()`, reject payload includes `reason`.
- Extend `createApp` / `AppHandles` to construct a `SessionLog` (so T00-10 can append `session.started` without inventing a second log). If `createApp` lives in `src/app`, it may import `SessionLog` from `@core`.

## Out of scope

- Emitting events from a parser or Pilot agent (those do not exist).
- UI for the log, export JSON button, scoring.
- Extra event types (`speech.transcribe.failed`, `aircraft.spawned`) unless you add them as **optional unused** members — prefer **only** the three types below so phase 1 has a stable switch.
- Wrapping `console.log` as the log.

## Implementation notes

### Event union (frozen for phase 0–1)

```ts
export type SessionEvent =
  | {
      type: "session.started";
      atSimMs: number;
      atWallMs: number;
      scenarioId: string;
    }
  | {
      type: "command.accepted";
      atSimMs: number;
      atWallMs: number;
      command: Command;
    }
  | {
      type: "command.rejected";
      atSimMs: number;
      atWallMs: number;
      command: Command;
      reason: string;
    };
```

`atWallMs` is `Date.now()` at append time (caller passes it). Sim time is the source of truth for order in the sim; wall clock is for PTT latency later (glossary). Callers pass both; `SessionLog` does not read `Date.now()` internally so tests stay deterministic.

### `SessionLog`

```ts
export class SessionLog {
  append(event: SessionEvent): void;
  all(): readonly SessionEvent[];
  byType<T extends SessionEvent["type"]>(type: T): Extract<SessionEvent, { type: T }>[];
}
```

- `all()` returns a **copy** or a frozen snapshot so callers cannot `push` onto internals.
- Max size: none in v1 (comment: phase 5 may truncate). Fine for phase 0 tests with < 10 events.

### Reject reason

Use a string. Phase 1 will pass values like `"unknown callsign"`. Fixture test can use `"empty instruction list"`.

### `createApp`

```ts
export interface AppHandles {
  speech: SpeechPort;
  log: SessionLog;
}

export function createApp(deps: AppDeps): AppHandles {
  return { speech: deps.speech, log: new SessionLog() };
}
```

Update T00-07 tests accordingly.

## Acceptance criteria

- [ ] **AC1 —** `SessionEvent` includes `session.started`, `command.accepted`, `command.rejected` and no other required variants.
- [ ] **AC2 —** `command.rejected` requires `reason: string` and `command: Command` (TypeScript; fixture compiles).
- [ ] **AC3 —** Appending accepted then rejected yields `all()[0].type === "command.accepted"` and `all()[1].type === "command.rejected"` (Vitest).
- [ ] **AC4 —** Mutating the array returned by `all()` does not change a subsequent `all()` (Vitest).
- [ ] **AC5 —** `byType("command.rejected")` returns only rejected events (Vitest).
- [ ] **AC6 —** `createApp` returns a `log` that is a `SessionLog` instance (Vitest).
- [ ] **AC7 —** `SessionLog` lives in `src/core` and does not import React or `@ui`.

## Test plan

- Unit: `src/core/events/session-log.test.ts` using Command fixtures from T00-06.
- Integration: `createApp` test updated.
- Manual: none.

## Suggested files

- `src/core/events/types.ts`
- `src/core/events/session-log.ts`
- `src/core/events/session-log.test.ts`
- `src/core/index.ts`
- `src/app/create-app.ts`
- `src/app/create-app.test.ts`
