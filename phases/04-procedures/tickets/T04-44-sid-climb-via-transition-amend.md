# T04-44 SID climb-via transition amend

**Phase:** 04 Procedures (twenty-second swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-19, T04-43
**Blocks:** none
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A controller can amend an active SID climb-via clearance with a named
enroute transition while preserving the aircraft's current runway transition.
The amendment takes effect at a catalog common fix and never silently
converts unsupported imported SID geometry into flyable TF legs.

## Context

T04-19 already ships SID lateral navigation, climb-via altitude constraints,
heading cancellation, validation, and readback. This ticket adds only
transition selection/amendment. It must reuse that engine, not fork or
rebuild it. T04-43 establishes the shared transition IR field and generic
procedure-join rules; extend those rules for `catalog.sids`.

The shared Command IR contract must remain synchronized with TypeScript.
`JOIN_PROCEDURE` already gains `transitionId` in T04-43; this ticket adds the
same optional field to `CLIMB_VIA` if not already present and keeps the shared
contract current.

## Research

- **R01 — JO 7110.65**, https://www.faa.gov/air_traffic/publications/atpubs/atc_html/;
  Search: `FAA JO 7110.65 climb via SID transition`. Use for Climb Via,
  SID amendments, and readback.
- **R03 — AIM**, https://www.faa.gov/air_traffic/publications/atpubs/aim_html/;
  Search: `FAA AIM climb via SID clearance`. Use for pilot-heard procedure
  and transition phraseology.

**Official terms:** Climb Via, SID, transition, runway transition, enroute
transition, common fix, top altitude, readback.

**Trainer delta:** The route is authored JSON and the pilot agent applies
deterministic common-fix joins. This is not certified NAS procedure guidance.

## Scope

- Add optional `transitionId?: string` to `CLIMB_VIA` in
  `src/core/command/types.ts`, if T04-43 has not already done so.
- Extend `phases/_shared/command-ir.md` in the same change if the field is
  absent; document `CVIA BAY1 NORMA` and spoken equivalents.
- Extend typed parsing:
  - `CVIA BAY1` keeps existing behavior.
  - `CVIA BAY1 NORMA` produces `CLIMB_VIA` with `transitionId: "NORMA"`.
  - `JOIN BAY1 NORMA` produces `JOIN_PROCEDURE` with that transition.
- Extend spoken parsing for “climb via BAY ONE, NORMA transition” while
  preserving existing `CLIMB_VIA` parsing.
- Extend generic procedure joining for `catalog.sids`:
  - select the named enroute transition;
  - retain the currently active runway transition;
  - change enroute route only at a shared common fix;
  - allow runway-transition changes only while the aircraft remains on
    runway-transition legs, subject to existing catalog metadata;
  - reject an amendment after the branch or without a reachable common fix.
- Update `src/pilot/applyIntent.ts`, `validate.ts`, and `readback.ts` for SID
  transition hints, atomic validation, deterministic error/readback behavior.
- Use `UNKNOWN_PROCEDURE` for unknown SID and `UNKNOWN_TRANSITION` for unknown
  transition, matching T04-43. Use the existing named join rejection for
  past-branch/no-common-fix cases.
- Preserve T04-19 behavior and tests: SID fly-through, `AT_OR_BELOW` caps,
  heading cancellation, validation, and readback.
- Add small synthetic SID fixtures with runway legs, two enroute transitions,
  and a shared common fix. Add unsupported heading-only, RF, and hold input
  fixtures that remain skipped diagnostics.

## Out of scope

- Rebuilding climb-via FMS, altitude/speed constraint math, or departure
  spawning and handoff.
- Departure telephony beyond transition readback.
- Imported CIFP path-terminator expansion, RF/hold support, or silent TF
  flattening.
- Wind, new path terminators, airport-id branches, runway UI, and display
  changes.

## Implementation notes

Use `catalog.sids` and procedure identifiers. No live `if (icao === ...)`,
`if (sidId === ...)`, or KDEM/KATL transition branch is allowed. A named
enroute transition is not a request to replace runway legs: preserve the
current runway transition until its catalog common fix, then follow the
selected enroute transition.

Resolve all route pieces before mutating intent. On failure, leave lateral,
vertical, active transition, and assigned altitude unchanged. Existing
heading/vector commands continue to cancel published SID and climb-via
guidance. The amendment must not alter `assignedAltitudeFt` or published
constraint interpretation.

Imported records with heading-only, RF, or hold legs remain skipped with the
existing diagnostic. Do not claim a transition is flyable by flattening such
legs.

## Acceptance criteria

- [ ] **AC1 — Contract:** `CLIMB_VIA` and `JOIN_PROCEDURE` expose optional
  `transitionId` in TypeScript and, where added/changed, in
  `phases/_shared/command-ir.md`.
- [ ] **AC2 — Existing behavior:** `CVIA BAY1` remains accepted and keeps
  existing T04-19 route, vertical, heading-cancel, validation, and readback
  behavior.
- [ ] **AC3 — Typed amendment:** `CVIA BAY1 NORMA` and `JOIN BAY1 NORMA`
  parse, validate, apply, and read back the named enroute transition.
- [ ] **AC4 — Spoken amendment:** “climb via BAY ONE, NORMA transition”
  produces equivalent IR and readback.
- [ ] **AC5 — Route preservation:** While on runway-transition legs, an
  enroute amendment preserves those legs and switches at their common fix.
- [ ] **AC6 — Safe runway rule:** A runway-transition change is accepted only
  while still on runway legs and only when catalog metadata permits it.
- [ ] **AC7 — Safe rejection:** Unknown SID, unknown transition, and
  past-branch/no-common-fix inputs reject without changing intent.
- [ ] **AC8 — Import safety:** Heading-only, RF, and hold SID legs remain
  skipped diagnostics; no test or live path silently flattens them.
- [ ] **AC9 — Vector law:** Heading/turn commands still cancel SID lateral
  guidance and `VIA_SID`.
- [ ] **AC10 — Research:** User-facing strings use Climb Via, SID, transition,
  top altitude, and readback terminology. Code comment cites R01/R03 and
  states trainer delta.
- [ ] **AC11 — Automated tests:** Synthetic parser, route-join, validation,
  apply, rejection, readback, and regression tests pass.

## Test plan

- **Unit:** SID transition lookup, runway/enroute route composition,
  common-fix selection, parser aliases, diagnostics, readback.
- **Integration:** Apply amendment before and after runway/common fixes;
  verify climb constraints and assigned altitude remain intact.
- **Manual:** Fly a seeded SID, issue `CVIA` with and without a transition,
  then issue a heading and verify expected cancellation.

## Suggested files

- `src/core/command/types.ts`
- `phases/_shared/command-ir.md`
- `src/core/fms/procedureJoin.ts`
- `src/core/fms/procedureJoin.test.ts`
- `src/parse/`
- `src/pilot/applyIntent.ts`
- `src/pilot/applyIntent.test.ts`
- `src/pilot/validate.ts`
- `src/pilot/validate.test.ts`
- `src/pilot/readback.ts`
- existing T04-19 SID/climb-via tests
