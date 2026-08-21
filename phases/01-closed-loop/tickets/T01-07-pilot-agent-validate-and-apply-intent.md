# T01-07 Pilot agent validate and apply intent

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** L
**Depends on:** T01-03, T01-06, T01-08, T00-08 (session event log)
**Blocks:** T01-09, T01-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The pilot agent is the **only** module that turns a parsed radio line into intent changes. It resolves the callsign, validates limits, emits a template readback, applies intent on accept, and writes `command.accepted` or `command.rejected` to the session log. `SAY_*` and `IDENT` never change kinematics.

## Context

`phases/_shared/command-ir.md` — Validation, events, and “the pilot agent is the only module allowed to change aircraft intent from a `Command`.”

`phases/_shared/architecture.md` — Parser → Command IR → Pilot agent → Intent + Readback.

`phases/_shared/glossary.md` — Keep radio pipeline separate from scope keys (none in this phase).

Implement **after T01-08** so readbacks are real templates, not placeholders.

## Scope

- `handleRadioText(world: World, sourceText: string, log: SessionLog): PilotResult` (name may match Phase 0 log type).
- Pipeline:
  1. `parseRadioText`
  2. If parse fail → reject `PARSE`, no aircraft mutation, log `command.rejected`, readback `unable, say again`
  3. `resolveCallsign`
  4. If resolve fail → reject with that reason, no mutation
  5. Build `Command`: `id` (unique), `issuedAtSimMs: world.simTimeMs`, `callsign`, `instructions`, `sourceText`, `source: "text"`
  6. Validate instructions against **that** aircraft’s current state
  7. If invalid → `command.rejected` with reason, **no** intent change, error readback
  8. If valid → apply intent, format success readback, `command.accepted` with the `Command`
- Validation (reject entire command if **any** instruction fails — do not partially apply):
  - Empty `instructions` → `EMPTY`
  - `FLY_HEADING.headingDeg` not in `[0, 360)` (0 is OK)
  - `TURN_DEGREES.degrees` not in `[1, 180]` (document; >180 is silly — reject)
  - Altitude not multiple of 100, or outside `[1000, 18000]` → `ALTITUDE`
  - `CLIMB` if `altitudeFt <= aircraft.altitudeFt` → `CLIMB_NOT_ABOVE`
  - `DESCEND` if `altitudeFt >= aircraft.altitudeFt` → `DESCEND_NOT_BELOW`
  - Speed outside `[150, 280]` → `SPEED`
  - `CLEARED_APPROACH`: accept if `approachId` is non-empty (KDEM `ILS27` is enough); do not validate published procedures
- Apply (only on full accept):
  - `FLY_HEADING`: set `intent.assignedHeadingDeg`, `intent.turn`
  - `TURN_DEGREES`: `assignedHeadingDeg = normalize(current ± deg)`, `turn = LEFT|RIGHT` matching direction (use **current** heading at apply time, not assigned)
  - `PRESENT_HEADING`: `assignedHeadingDeg = current heading`, `turn = SHORTEST` (stops a turn)
  - `ALTITUDE`: `intent.assignedAltitudeFt = altitudeFt`
  - `SPEED`: `intent.assignedSpeedKt = speedKt`
  - `CLEARED_APPROACH`: `intent.clearedApproachId = approachId` only; **do not** change heading/alt/speed
  - `IDENT`: `identUntilSimMs = world.simTimeMs + 5000`; no intent field changes
  - `SAY_HEADING` / `SAY_ALTITUDE`: no state changes
- Return `{ accepted: boolean, readback: string, command?: Command, reason?: string }`.
- Session events per `command-ir.md`: payload includes `Command` (use `sourceText` + reason if parse failed before a full Command — then `command` may be omitted or a stub with `callsign: ""` and empty instructions; **document one** and test it). Prefer: parse failures log `command.rejected` with `{ sourceText, reason, command: null }`.

## Out of scope

- UI command line (T01-09).
- Canvas IDENT flash drawing (T01-10 may read `identUntilSimMs`).
- ILS intercept, DIRECT, wind.
- Partial apply of multi-instruction commands.
- Voice `source: "voice"`.

## Implementation notes

Apply order for a combined command: left to right on the same aircraft. `TURN_DEGREES` then `FLY_HEADING` → heading instruction wins last.

`TURN_DEGREES` uses heading **before** this command’s earlier heading instructions? **Left to right**: if `H270 T20L`, first set assigned 270 SHORTEST, then turn 20 left from **current actual heading**, not from 270. That is a bit sharp; freeze it anyway and test `T20L` alone.

Do not import `src/scope` or `src/ui`.

Do not call `stepWorld` inside the pilot agent. Intent changes take effect on the **next** physics step (architecture: < 50 ms). Tests may call `stepWorld` themselves.

Expedite: ignore if absent; if present on IR, 1.5× climb rate is **not** required this phase (no parser token).

Grep guard: no `intent.assigned` writes outside `src/pilot` except tests and `createAircraft` defaults.

## Acceptance criteria

- [ ] **AC1 —** `DAL123` present, `handleRadioText(world, "DAL123 H270")` accepted; that aircraft `intent.assignedHeadingDeg === 270`, `turn === "SHORTEST"`; others unchanged; readback matches T01-08 heading template; log has `command.accepted`.
- [ ] **AC2 —** `SAY_HEADING` / `SAY_ALTITUDE` / `IDENT`: accepted; heading, altitude, speed, assigned intent **identical** after (IDENT may set `identUntilSimMs = simTimeMs + 5000`).
- [ ] **AC3 —** `APP ILS27`: accepted; `clearedApproachId === "ILS27"`; kinematics intent (hdg/alt/spd) unchanged.
- [ ] **AC4 —** `C30` while at 8000 ft → rejected `CLIMB_NOT_ABOVE` (or `ALTITUDE`); intent unchanged; `command.rejected`.
- [ ] **AC5 —** `S400` → rejected speed; `H370` parse or validate reject; empty string → reject; no intent change.
- [ ] **AC6 —** Ambiguous suffix world (`DAL123` + `AAL123`), text `"123 H270"` → rejected `AMBIGUOUS_CALLSIGN`; **both** assigned headings unchanged.
- [ ] **AC7 —** `D30` at 8000 → `assignedAltitudeFt === 3000`; `S210` → assigned speed 210; `PH` during a turn (`assigned 90`, current 10) → assigned heading snaps to current 10.
- [ ] **AC8 —** Vitest in `src/pilot` DOM-free covers AC1–AC7; `npm test` green.

## Test plan

- Unit: accept heading/alt/speed/PH/IDENT/SAY/APP; reject bounds, climb/descend sense, ambiguous, parse fail; combined apply last-wins documented.
- Integration: deferred to T01-13 (`stepWorld` after heading).
- Manual: none

## Suggested files

- `src/pilot/handleRadioText.ts`
- `src/pilot/validate.ts`
- `src/pilot/applyIntent.ts`
- `src/pilot/handleRadioText.test.ts`
- `src/pilot/index.ts`
- Session log adapter next to T00-08 types
