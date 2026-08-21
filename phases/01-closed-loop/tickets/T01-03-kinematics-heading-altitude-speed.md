# T01-03 Kinematics heading altitude speed

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** L
**Depends on:** T01-02
**Blocks:** T01-07, T01-10, T01-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Each physics step, every aircraft moves toward its **intent**: turn at 3 deg/s, climb/descend at 1800 fpm, accelerate at 1 kt/s, and integrate position on the Phase 0 NM plane. No wind. Tests drive `stepWorld` with no rAF.

## Context

`phases/_shared/glossary.md` units; `phases/_shared/architecture.md` tick. Phase README frozen constants.

Intent is already on the aircraft (T01-02). This ticket **reads** intent and writes heading/altitude/speed/position. It does not parse commands. Tests set `aircraft.intent` directly.

`SAY_*` / `IDENT` are irrelevant here (no intent change). `clearedApproachId` is ignored (no ILS).

## Scope

- Implement `stepAircraft(ac: Aircraft, dtS: number): void` (or equivalent) called from `stepWorld` for each aircraft **after** advancing `simTimeMs` (order: bump time, then move — document it).
- Heading: turn toward `intent.assignedHeadingDeg` at `TURN_RATE_DEG_PER_S = 3`.
  - `LEFT`: always decreasing heading (through 0).
  - `RIGHT`: always increasing heading.
  - `SHORTEST`: smaller arc; **exactly 180° → LEFT**.
  - Do not overshoot: if remaining turn ≤ `3 * dtS`, snap to assigned.
- Altitude: move toward `intent.assignedAltitudeFt` at `CLIMB_RATE_FT_PER_MIN = 1800` (900 ft in 30 sim seconds). No overshoot.
- Speed: move toward `intent.assignedSpeedKt` at `ACCEL_KT_PER_S = 1`. No overshoot. Clamp speed to ≥ 0 (should never hit 0 in v1).
- Position:  
  `xNm += speedKt * Math.sin(headingRad) * (dtS / 3600)`  
  `yNm += speedKt * Math.cos(headingRad) * (dtS / 3600)`  
  Use **current** (post-turn) heading and **current** (post-accel) speed for the translation this step, or document pre-update; pick **post-heading, post-speed** and test that a northbound 360 kt aircraft gains +0.005 NM north in one 0.05 s step? 360 kt × 0.05/3600 = 0.005 NM. Use 180 kt × 1 s = 0.05 NM for a cleaner test (`stepWorld` 20 times).
- Constants exported from `src/core/kinematics.ts`.
- If `identUntilSimMs > 0` and `world.simTimeMs >= identUntilSimMs`, set `identUntilSimMs = 0` (so flash expires even without PPI). Optional but cheap; required if you store it on the aircraft.

## Out of scope

- Bank-angle / TAS-dependent turn rate (rate-one is the model).
- Wind, GS vs TAS, Mach, flap/gear, ground roll.
- Procedure / localizer tracking.
- Rendering.

## Implementation notes

```ts
export const TURN_RATE_DEG_PER_S = 3;
export const CLIMB_RATE_FT_PER_MIN = 1800;
export const ACCEL_KT_PER_S = 1;
```

Heading helpers:

```ts
export function normalizeHeading(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** Signed delta in (-180, 180]; + = right / increasing heading. */
export function shortestDeltaDeg(from: number, to: number): number;
```

For `LEFT`/`RIGHT`, remaining angle is the long or short way **in that direction** (0–360), not the shortest delta.

Straight-and-level regression: default intent (T01-02) ⇒ after 10 sim seconds, heading/altitude/speed unchanged; position moved along initial heading.

`stepWorld` must remain pure w.r.t. browser APIs. Mutating `World` in place is required (single object).

## Acceptance criteria

- [ ] **AC1 —** Level flight: aircraft at heading 90, 8000 ft, 220 kt, intent = present, after 10 sim seconds (200 steps): heading/alt/speed unchanged; `xNm` increased by `220 * 10 / 3600` NM (±0.001); `yNm` unchanged (±0.001).
- [ ] **AC2 —** Heading SHORTEST: start 000, assigned 090, after **2.0** sim seconds heading is **6.0°** (±0.05). After **30** sim seconds heading is **90** (captured).
- [ ] **AC3 —** Heading LEFT vs RIGHT: start 000, assigned 270: `LEFT` decreases toward 270 (after 2 s heading ≈ 354); `RIGHT` increases (after 2 s heading ≈ 6). `SHORTEST` from 000 to 270 turns **left** (shorter).
- [ ] **AC4 —** 180° tie: start 000, assigned 180, `SHORTEST` → after 1 s heading is **357** (left), not 3.
- [ ] **AC5 —** Altitude: 8000 assigned 6000, after 60 sim seconds altitude decreased by 1800 ft → 6200 (±1 ft). After enough time, snaps to 6000 and stays.
- [ ] **AC6 —** Speed: 220 assigned 210, after 5 sim seconds speed is 215 (±0.01). After 10 s, 210 and stays.
- [ ] **AC7 —** Vitest file in `src/core` (DOM-free) covers AC1–AC6 happy paths. `npm test` green.

## Test plan

- Unit: helpers `normalizeHeading`, `shortestDeltaDeg`; each axis (heading/alt/speed/position) in isolation by setting the other assigned values equal to current.
- Integration: none (that is T01-13)
- Manual: none

## Suggested files

- `src/core/kinematics.ts`
- `src/core/kinematics.test.ts`
- `src/core/world.ts` (`stepWorld` loops aircraft)
- `src/core/index.ts`
