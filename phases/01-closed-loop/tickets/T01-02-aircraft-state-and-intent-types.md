# T01-02 Aircraft state and intent types

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** S
**Depends on:** T01-01, T00-06 (Command IR types)
**Blocks:** T01-03, T01-04, T01-06, T01-07, T01-08
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

`World.aircraft` is a typed array of `Aircraft`. Each aircraft has a kinematic state (where it is) and an `Intent` (what it is trying to fly). Tracks are 1:1 with aircraft. No motion yet.

## Context

`phases/_shared/glossary.md`: **Intent** is assigned heading/altitude/speed/route; **Kinematics** is how the aircraft moves toward intent; **Track** is the displayed target (v1: 1:1, no sensor error).

`phases/_shared/command-ir.md`: the pilot agent is the only module allowed to change intent from a `Command`. This ticket only defines the data. `TurnDir` already exists on the IR (`LEFT` | `RIGHT` | `SHORTEST`) — reuse it, do not duplicate under another name.

Units: NM east/north, feet MSL, knots, heading degrees `[0, 360)`.

## Scope

- Replace the T01-01 stub aircraft field with `aircraft: Aircraft[]`.
- Define `Aircraft` and `Intent` in `src/core`.
- `createAircraft(init: AircraftInit): Aircraft` with required callsign + state; intent defaults to “hold present”: assigned heading/altitude/speed equal to current (so T01-03 with no commands is straight and level).
- `createWorld` still allowed to start with `aircraft: []`.
- Fixture helper `makeTestAircraft(overrides?)` for later tests (stable id + `DAL123` available).
- Normalize heading on create (`360` → `0`, wrap negatives).

## Out of scope

- `stepAircraft` / integration of position.
- Spawn from scenario JSON.
- Parser, pilot, PPI.
- Performance categories, wake, weight, wind.

## Implementation notes

Reuse `TurnDir` from Command IR types (`T00-06`).

```ts
import type { TurnDir } from "../parse/command"; // or wherever T00-06 put it

export interface Intent {
  assignedHeadingDeg: number;
  turn: TurnDir;
  assignedAltitudeFt: number;
  assignedSpeedKt: number;
  /** Phase 1: parsed but not flown. */
  clearedApproachId: string | null;
}

export interface Aircraft {
  id: string;
  callsign: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
  intent: Intent;
  /** Sim time when IDENT flash ends; 0 = inactive. */
  identUntilSimMs: number;
}

export interface AircraftInit {
  id?: string;
  callsign: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
}
```

On create:

- `id` default: `crypto.randomUUID()` is OK in browser; for Vitest use an incrementing `ac-n` if `crypto` is missing. Prefer a `nextAircraftId()` so tests are deterministic.
- `intent.assignedHeadingDeg = normalizeHeading(headingDeg)`
- `intent.turn = "SHORTEST"`
- `intent.assignedAltitudeFt = altitudeFt`
- `intent.assignedSpeedKt = speedKt`
- `intent.clearedApproachId = null`
- `identUntilSimMs = 0`

Callsign stored **uppercase** (`dal123` → `DAL123`).

Do not add route arrays, nav modes, or flap state.

`World.selectedAircraftId` already exists; it stores `Aircraft.id`, not callsign.

## Acceptance criteria

- [x] **AC1 —** `Aircraft` and `Intent` compile under `strict` and are exported from `src/core`.
- [x] **AC2 —** `createAircraft({ callsign: "dal123", headingDeg: 360, ...})` stores `callsign === "DAL123"` and `headingDeg === 0`, and `intent.assignedHeadingDeg === 0`.
- [x] **AC3 —** Fresh aircraft has `intent` matching present heading, altitude, and speed so it is in equilibrium before any command.
- [x] **AC4 —** `World.aircraft` is `Aircraft[]`; `createWorld()` still has length 0.
- [x] **AC5 —** Automated test: fixture `makeTestAircraft({ callsign: "DAL123" })` is unique-id stable across two calls **only if** ids are passed in; two calls without id get **different** ids.
- [x] **AC6 —** No import from `src/scope` or `src/ui` into `src/core`.

## Test plan

- Unit: heading normalize; callsign uppercasing; default intent equals state; world still empty.
- Integration: none
- Manual: none

## Suggested files

- `src/core/aircraft.ts`
- `src/core/aircraft.test.ts`
- `src/core/world.ts` (aircraft field type)
- `src/core/index.ts`
