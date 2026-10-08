# T04-80 Departure-line navigation and acceptance

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-79
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later phase or swarm.

## Goal

Satellite departures fly near-straight lines with slight seeded movement
across the TRACON to a boundary exit, under the hard Bravo-avoidance guard.
Whole-feature acceptance and docs ship here.

## Context

T04-79 gives every post-login entry a satellite origin, liftoff pose, and
mission `SATELLITE_DEPARTURE`. The en-route shape is still open: the
user-approved behavior is line flight with slight movement across the scope,
exiting at the boundary. The closest existing analog is `TRANSIT` (offset mid
waypoint plus seeded angle variance, `src/core/vfrNavigation.ts:624-648`).
This ticket adds the departure corridor, keeps waypoint-persistent navigation
with no per-tick random headings, and verifies the complete behavior.

## Research

- **T04-71 navigation contract:** persistent waypoints, natural exits only,
  swept 3D avoidance on every leg, bounded planner attempts with
  `vfr.spawn.skipped / NO_SAFE_ROUTE`. No change to margins or attempts.
- **TRANSIT precedent:** corridor to the opposite boundary with one offset
  mid waypoint; departure corridor follows the same pattern with the origin
  fixed at the liftoff pose instead of a disc sample.
- **R01 (FAA JO 7110.65 §§7-6, 7-9) / R03 (AIM):** en-route VFR stays clear
  of Class B unless authorized; the trainer keeps avoidance as a hard guard
  and issues no Bravo clearance. Record edition and paragraph identifiers
  during manual review; do not claim compliance.
- Trainer delta: small lateral wobble is a training approximation of
  navigational wander, not an FAA procedure.

## Scope

- Add the departure corridor to `planSafeVfrRoute` for mission
  `SATELLITE_DEPARTURE`:
  - Climb on runway heading to the assigned VFR cruise altitude.
  - One or two seeded intermediate waypoints with bounded perpendicular
    offsets of at most 3 NM from the direct liftoff-to-exit course
    ("slight movement"), drawn from the route stream.
  - Exit waypoint at `exitRadiusNm + 2` on the far side of the liftoff
    position relative to the scenario center.
  - Full swept 3D Bravo check on every leg, with dogleg escalation across
    planner attempts following the existing TRANSIT/AIRPORT_BOUND pattern.
- Terminal condition: boundary exit logging `vfr.exit` with the transit
  reason vocabulary (reuse `BOUNDARY_EXIT`), then removal. No satellite
  landing and no tower handoff for departures; inbound `AIRPORT_BOUND`
  handoff is unchanged.
- Existing per-tick avoidance guard covers departure legs with no planner
  change to the guard itself.
- Departures stay eligible for existing service flows (silent, flight
  following, IFR pickup/cancellation) with no scheduler or IR change.
- Population bounds unchanged: scheduled entries and target replenishment
  stay paced and capped; cap-full defers without catch-up burst.
- Docs: short `docs/USER.md` note (login disc population versus satellite
  departures, line approximation, no tower/ground simulation) and one
  `phases/04-procedures/README.md` addendum line. No history deletion.
- `phases/LATER-IMPLEMENTATION-BACKLOG.md` only if visible-but-unexecuted
  behavior ships; extend an existing subsection, never duplicate.

## Out of scope

- Origin selection and liftoff pose (T04-79 owns them).
- New commands, parser/IR changes, readbacks, speech-api changes.
- Session-setup UI, presets, new config knobs.
- Bravo entry clearance, satellite landings by departures, ground/tower
  simulation, weather, scoring.
- Production-geometry assertions in generic suites.

## Implementation notes

- Wobble must be waypoint geometry, not per-tick heading noise, preserving
  the frozen no-per-tick-random-heading decision.
- If the direct course penetrates Bravo, escalate lateral offset and mid
  altitude across attempts before failing closed with `NO_SAFE_ROUTE`.
- Keep `LOCAL` dwell/exit and `AIRPORT_BOUND` descent/handoff code paths
  untouched; branch the corridor on the new mission value only.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Departure, clear corridor | Climbs on runway heading, tracks line with ≤3 NM seeded offsets, exits at boundary | Persistent waypoints; `vfr.exit BOUNDARY_EXIT`; removal | Wobble above 3 NM fails the test | Synthetic corridor test: deviation bound, exit reached |
| Corridor crossing Bravo shelf | Planner doglegs or skips with `NO_SAFE_ROUTE` | Never penetrates; no clearance issued | Guard deflects unplanned legs per-tick | Synthetic shelf + guard tests |
| Long session with exits + entries | Population stays bounded by `maxPopulation` | Pacing/cap semantics unchanged | Cap-full defers entry, no burst | Sim-clock lifecycle test |
| Departure requesting following/pickup | Existing T04-73/T04-74 flows work unchanged | No IR/parser/speech diff | Service regressions fail acceptance | Integrated acceptance run |
| KATL with authorized source (conditional) | Departures cross without Bravo entry | Provenance preserved; facility asserts only in acceptance | Missing source records check as skipped with reason | KATL structural/manual walkthrough |

## Acceptance criteria

- [ ] Departure tracks are line-like with seeded lateral variation bounded
  at 3 NM and deterministic replay.
- [ ] No swept-path Bravo entry across parameterized synthetic shelves;
  per-tick guard covered.
- [ ] One integrated acceptance file covers satellite origin, line flight,
  boundary exit, service-flow compatibility, and bounded population.
- [ ] KATL conditional acceptance or honestly recorded skip with reason; no
  fabricated regional files.
- [ ] Docs updated (`docs/USER.md`, `phases/04-procedures/README.md`).
- [ ] Generic suites stay facility-free (no production IDs, counts, or
  geometry).
- [ ] `npm run ci` passes.

## Test plan

- Unit: `src/core/test/vfrNavigation.test.ts` for corridor shape, wobble
  bound, exit targeting, shelf dogleg/skip, replay.
- Integration: extend the VFR population acceptance with a synthetic
  regional scenario (origin, line flight, exit, bounds, service
  compatibility); one conditional KATL structural check only.
- Manual: KATL seeded session watching departures lift off near satellites
  and cross the scope; record scenario/seed and FAA edition/paragraphs.
  Record unavailable live-speech/perf evidence honestly.

## Suggested files

- `src/core/vfrNavigation.ts`
- `src/scenario/vfrTraffic.ts` (corridor wiring only; origin logic is T04-79)
- `src/core/test/vfrNavigation.test.ts`
- `tests/integration/vfr-population.test.ts` (synthetic fixtures only)
- `docs/USER.md`
- `phases/04-procedures/README.md`

## Test and handoff requirements

Focused tests then `npm run ci`. Speech mock pytest only if speech paths
change (they must not). Never skip hooks. Stage explicit owned paths only.
Worker implements exactly this ticket on
`ticket/T04-80-departure-line-navigation-and-acceptance`, progressive gated
commits, never merges/spawns/pushes, returns exactly `READY TO MERGE` or
`BLOCKED`.
