# T01-06 Callsign resolution and selection

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** M
**Depends on:** T01-02, T01-05
**Blocks:** T01-07, T01-11
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A typed line is bound to exactly one aircraft: full callsign, unambiguous suffix, or the selected track when the callsign is omitted. Ambiguous suffix and unknown callsign fail **without** choosing an aircraft.

## Context

`phases/_shared/command-ir.md`: “Callsign: full (`DAL123`) or unambiguous suffix (`123`). Ambiguous suffix → reject, no aircraft moves.”

`phases/_shared/glossary.md`: radio commands vs scope commands. Selection is a **scope** concern that **feeds** the radio parser; clicking is T01-11. This ticket is the pure resolver plus `World.selectedAircraftId` semantics.

Selected track: `World.selectedAircraftId` holds `Aircraft.id`. Resolver maps that to `Aircraft.callsign` when `callsignToken` is null.

## Scope

- `resolveCallsign(input: { callsignToken: string | null; world: World }): ResolveResult`
- `ResolveResult` = `{ ok: true, aircraftId, callsign }` or `{ ok: false, reason }` where `reason` is a stable enum/string:
  - `UNKNOWN_CALLSIGN`
  - `AMBIGUOUS_CALLSIGN`
  - `NO_CALLSIGN_OR_SELECTION`
  - `SELECTED_NOT_FOUND` (stale id)
- Matching:
  - Full token: exact `aircraft.callsign === token` (both already uppercase).
  - Suffix token (digits / digits+letter): aircraft whose callsign **ends with** that suffix, but only if the suffix is the **numeric (plus optional letter) tail**, not a substring of the airline code. `123` matches `DAL123` and `AAL123`, not `DAL1230` unless token is `1230`. Define: strip ICAO prefix `[A-Z]{3}` from callsign, remainder must **equal** the suffix token.
  - If exactly one match → ok.
  - If zero → `UNKNOWN_CALLSIGN`.
  - If two or more → `AMBIGUOUS_CALLSIGN`.
- Null token: if `selectedAircraftId` points at a living aircraft → that callsign. Else `NO_CALLSIGN_OR_SELECTION`.
- If token is present, **ignore selection** (explicit callsign wins).
- `setSelectedAircraft(world, id: string | null)` helper; selecting an unknown id sets null or rejects — **set null** if id missing.
- No UI in this ticket.

## Out of scope

- Click hit-testing (T01-11).
- Pilot validation of heading/altitude.
- Telephony names.
- Partial airline match (`DAL` alone) — not a valid token in T01-05.

## Implementation notes

Keep this in `src/pilot` or `src/parse`. Prefer **`src/pilot/resolveCallsign.ts`** so `src/parse` stays World-free (parser tests remain simple). `src/core` should not depend on parse.

```ts
export type ResolveReason =
  | "UNKNOWN_CALLSIGN"
  | "AMBIGUOUS_CALLSIGN"
  | "NO_CALLSIGN_OR_SELECTION"
  | "SELECTED_NOT_FOUND";

export function numericTail(callsign: string): string {
  return callsign.replace(/^[A-Z]{3}/, "");
}
```

`DAL123A` tail is `123A`. Suffix `123` does **not** match `123A`. Suffix `123A` matches only `123A`.

Tests should construct a `World` with two aircraft via `createAircraft`, not canvas.

## Acceptance criteria

- [ ] **AC1 —** World with only `DAL123`: token `"DAL123"` and token `"123"` both resolve to that aircraft.
- [ ] **AC2 —** World with `DAL123` and `AAL123`: token `"123"` → `AMBIGUOUS_CALLSIGN`; `"DAL123"` → DAL only.
- [ ] **AC3 —** Token `"ZZZ9"` with no such aircraft → `UNKNOWN_CALLSIGN`.
- [ ] **AC4 —** Token `null`, `selectedAircraftId` = DAL’s id → DAL. Token `null` and selection `null` → `NO_CALLSIGN_OR_SELECTION`.
- [ ] **AC5 —** Token `"AAL123"` while DAL is selected → AAL (explicit wins).
- [ ] **AC6 —** Stale `selectedAircraftId` and null token → `SELECTED_NOT_FOUND`.
- [ ] **AC7 —** Vitest DOM-free; `npm test` green.

## Test plan

- Unit: AC1–AC6 worlds as fixtures.
- Integration: none
- Manual: none

## Suggested files

- `src/pilot/resolveCallsign.ts`
- `src/pilot/resolveCallsign.test.ts`
- `src/core/world.ts` (`setSelectedAircraft` if it lives on core)
- `src/pilot/index.ts`
