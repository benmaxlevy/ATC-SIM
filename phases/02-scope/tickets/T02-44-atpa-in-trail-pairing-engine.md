# T02-44 ATPA in-trail pairing and predicted status engine

**Phase:** 02 Scope (TPA / ATPA addendum)
**Priority:** P0
**Size:** L
**Depends on:** T02-43
**Blocks:** T02-45, T02-46
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The simulation core computes, every physics tick, which tracks are in-trail inside an enabled ATPA volume, which leader each trailing track is following, the required in-trail minimum for that pair, the current distance, and the resulting status: **monitor**, **warning**, or **alert**.

Nothing is drawn here. This ticket produces the state that T02-45 and T02-46 render.

## Context

`syncConflictAlerts` in `src/core/world.ts` is the shape to copy: a pure evaluator in `src/core/alerts/`, called from `stepWorld` after kinematics, writing a replaced array onto `world.alerts`. The scope reads that state and never recomputes geometry. Follow it exactly, including the session-log enter/clear pattern.

T02-43 supplies volumes and `isInsideAtpaVolume` / `alongCourseDistanceNm`.

## Separation minima — frozen, and deliberately incomplete

Required in-trail minimum is **basic radar separation only**:

- `volume.basicSeparationNm` (3 NM) by default;
- `volume.reducedSeparationNm` (2.5 NM) when **both** tracks of the pair are inside `volume.reducedWithinNm` (10 NM) of the threshold along the final.

Cone length therefore never varies by aircraft type. R07 says the length is "the distance required by wake category or basic radar separation", but the reference publishes **no separation matrix** — its CWT A–I table gives only the datablock category letter and a weight range. `Aircraft.wakeCategory` exists and is already rendered as the FDB category letter; this engine must **not** read it. Do not substitute recalled 7110.65 wake minima: a trainer must not present unsourced separation numbers as fact.

This ticket ships the backlog entry recording that gap (see Scope).

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — "ATPA" overview, Monitor Cone, Warning Cone, Alert Cone.

- Search: `STARS ATPA in-trail monitor warning alert cone`
- **Terms:** in-trail, leading track, trailing track, predicted violation. Not CA, not TCAS, not DRI.
- Comment: 45 s warning / 24 s alert are R07 values; the minima are basic radar separation because R07 gives no matrix.

## Scope

- New `src/core/alerts/atpa.ts`:
  - `AtpaPair` — `{ trailingCallsign, leadingCallsign, volumeId, distanceNm, requiredNm, closureKt, status }` with `status: "monitor" | "warning" | "alert"`.
  - `evaluateAtpa(aircraft, volumes, geometry)`:
    1. eligible tracks per enabled volume via `isInsideAtpaVolume`, excluding primary-only targets;
    2. sort by along-course distance to threshold ascending;
    3. each track's leader is the next track ahead **in the same volume** — the track nearest ahead of it in that order. The frontmost track has no leader and produces no pair;
    4. `distanceNm` is the straight-line separation between the pair;
    5. `requiredSeparationNm(pair, volume)` per the frozen rule above;
    6. status: `alert` when `distanceNm < requiredNm` already, or when predicted to fall below within **24 s**; else `warning` when predicted within **45 s**; else `monitor`.
  - Prediction is linear on current closure rate: range rate from the two velocity vectors, `timeToViolationS = (distanceNm - requiredNm) / closureNm per second` when closing. Opening or parallel pairs never warn.
- `src/core/world.ts`: `world.alerts.atpa: AtpaPair[]`, `syncAtpaPairs` called from `stepWorld` beside `syncConflictAlerts`, session-log events on status enter and clear.
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`: add the **"ATPA separation criteria not yet modeled"** subsection in this same commit, per `.cursor/rules/later-implementation-backlog.mdc`. It must name, each with what is visible now / what is missing / what later work must keep:
  - wake-category in-trail minima, unsourced from R07, requiring a cited table before `requiredSeparationNm` may read `wakeCategory`;
  - adapted 2.5 NM eligibility beyond "both inside 10 NM on final" (leader type, runway occupancy, facility authorization);
  - per-position ATPA adaptation, since we are single-TCP;
  - the TDW white monitor variant;
  - aural ATPA alerting;
  - volumes as authored trainer geometry rather than imported adaptation.

## Out of scope

- Cones, colors, datablock text, DCB wiring (T02-45 to T02-47).
- Reading `wakeCategory` on any live path.
- Changing conflict alert (T04-09) in any way.

## Implementation criteria

Keep `evaluateAtpa` pure and allocation-light: it runs at 20 Hz alongside CA. Sorting a handful of eligible tracks per volume is fine; do not build an O(n²) scan across the whole world when eligibility already narrows it.

A track that leaves the volume must drop out of the pair set on the next tick with no residue, the same way CA clears.

## Acceptance criteria

- [ ] **AC1 —** Two tracks on the RW27 final 4 NM apart, both outside 10 NM from the threshold, produce one pair: trailing follows leading, `requiredNm` 3, status `monitor`.
- [ ] **AC2 —** The same pair inside 10 NM of the threshold produces `requiredNm` 2.5, sourced from the volume JSON and not from a literal in code.
- [ ] **AC3 —** Status transitions: closing at a rate that reaches the minimum in 40 s gives `warning`; in 20 s gives `alert`; already inside the minimum gives `alert`; an opening pair stays `monitor`.
- [ ] **AC4 —** Sequencing with three tracks yields two pairs, each track paired to the one immediately ahead; the frontmost track produces no pair. Tracks in different volumes never pair with each other.
- [ ] **AC5 —** `requiredNm` is identical for a heavy leader and a light leader at the same geometry, and a grep proves `wakeCategory` appears nowhere in `src/core/alerts/atpa.ts`.
- [ ] **AC6 —** A track leaving the volume clears its pair on the next `stepWorld`, and existing CA / MSAW tests stay green.
- [ ] **AC7 — Research:** module comment cites R07 for 45 s / 24 s and states the minima limitation; the backlog subsection listed above exists in the same commit.

## Test plan

- Unit: `src/core/alerts/atpa.test.ts` — eligibility, ordering, pairing, required minimum, four status cases, wake-independence.
- Unit: `src/core/world.atpa.test.ts` — `stepWorld` attach and clear, session log.
- Regression: `src/core/alerts/conflictAlert.test.ts`, `src/core/world.ca.test.ts`.
- `npm test`.

## Suggested files

- `src/core/alerts/atpa.ts` (new)
- `src/core/alerts/atpa.test.ts` (new)
- `src/core/world.ts`
- `src/core/world.atpa.test.ts` (new)
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
