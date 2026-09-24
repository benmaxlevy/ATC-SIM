# T04-79 Satellite-origin continuous VFR entries

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-78
**Blocks:** T04-80
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start T04-80 or later work.

## Goal

Post-login VFR entries take off from scenario-derived satellite airports
instead of appearing mid-air. Login-time initial population stays
disc-spawned and airborne. No command, parser, or UI change ships here.

## Context

`VfrTrafficManager.spawnInitialPopulation()` spawns the login-time population
from a uniform ARP-centered disc, and `step()` routes both scheduled
`entriesPerHour` entries and soft `targetCount` replenishment through the same
mid-air `spawnOneVfrAircraft()` path (`src/scenario/vfrTraffic.ts:556-741`).
The user-approved change keeps the login-time disc population and routes every
post-login spawn through a satellite departure: liftoff near a satellite
airport, then a line corridor owned by T04-80. Arrival-eligible destinations
are already derived programmatically with no facility branch
(`getEligibleVfrDestinations`, `src/scenario/vfrTraffic.ts:86-101`); this
ticket reuses that derivation for departure sources, excluding the center
airport.

## Research

- **T04-70/T04-71 eligibility:** only imported controlled B/C/D airports with
  public use and usable runway geometry qualify as destinations. Reusing the
  same list for departures preserves the tower-coordination assumption and
  adds no new eligibility rule.
- **T04-71 state boundary:** generated aircraft start VFR/1200 with
  `alertEligibility: AMBIENT_SUPPRESSED`, no IFR clearance or plan.
  Departures keep that marker; T04-73/T04-74 own later service transitions.
- **T04-72 stream independence:** airport/runway/pose draws must not reorder
  legacy IFR draws or the request-scheduler stream for a fixed seed.
- **R01 (FAA JO 7110.65 §§7-6, 7-9) / R03 (AIM):** VFR satellite departures
  operate clear of Class B unless authorized; this trainer path keeps the
  hard Bravo-avoidance guard and issues no Bravo clearance. Record edition
  and paragraph identifiers during manual review; do not claim compliance.
- Trainer delta: airborne-at-liftoff spawn near the departure airport. No
  takeoff roll, ground traffic, tower cab, or departure clearance is modeled.

## Scope

- Add `SATELLITE_DEPARTURE` to `AmbientVfrMission` (`src/core/aircraft.ts`).
  `LOCAL`, `TRANSIT`, and `AIRPORT_BOUND` semantics stay unchanged.
- Add optional `originAirportId` and `departureRunwayId` to `AmbientVfrState`.
  Initial disc spawns omit both fields.
- Add a generic departure-source selector, e.g.
  `getDepartureVfrAirports(regional, centerIcao)`: eligible destinations per
  `getEligibleVfrDestinations()` minus the center airport (`scenario.icao` /
  `regional.centerAirportId`, case-insensitive). No hardcoded ICAO on any
  live path.
- Split the spawn paths in `VfrTrafficManager`:
  - `spawnInitialPopulation()` unchanged: disc-sampled airborne spawns.
  - Every `step()`-driven spawn (scheduled entries and target replenishment)
    uses the satellite-departure path with mission `SATELLITE_DEPARTURE`.
- Satellite liftoff pose (airborne-at-liftoff, no ground state):
  - Position within 2 NM of the departure airport ARP, outside avoidance
    volumes per the existing point test.
  - Altitude between field elevation + 500 ft and the assigned VFR cruise
    altitude from the altitude mix, climbing toward cruise via existing
    waypoint altitude intent.
  - Heading from a seeded runway choice (true heading converted at the
    magnetic frame boundary), speed at the existing 110 kt VFR baseline.
- Seeded-stream discipline: airport index from the mission stream, runway and
  pose details from the placement stream, corridor geometry from the route
  stream. Legacy IFR draws for a fixed seed stay identical.
- No usable departure source (no regional data, empty source list, KDEM):
  skip the entry with a structured `vfr.spawn.skipped` event and reason
  `NO_DEPARTURE_AIRPORT`. Never fall back to a mid-air spawn, never throw.
- Request scheduling, service lifecycles, session setup, density presets,
  and movement-mix behavior are untouched.

## Out of scope

- En-route line geometry, wobble bounds, and exit handling (T04-80 owns the
  corridor, terminal condition, and acceptance/docs).
- New commands, parser/IR changes, readbacks, speech-api changes.
- Session-setup UI, new config knobs, preset changes.
- Ground roll, tower cab, departure clearances, Bravo entry clearance.
- Satellite landings by departures; inbound `AIRPORT_BOUND` handoff is
  unchanged.

## Implementation notes

- Airport selection that draws an ineligible or center airport is a bug, not
  a fallback: filter before the seeded draw so the draw stays uniform over
  usable sources.
- Keep `planSafeVfrRoute` signature compatible for existing missions; add the
  departure corridor in T04-80. This ticket may plumb `originAirport` through
  to the planner or stub the departure pose with a minimal safe-leg check,
  but full corridor geometry belongs in T04-80.
- Liftoff inside Bravo after bounded attempts follows the existing
  `NO_SAFE_ROUTE` skip path; do not reshape the guard or margins.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Boot `initialCount: 4`, synthetic regional scenario | 4 disc-spawned airborne VFR on scope, no origin fields | `ambientVfr` set, `AMBIENT_SUPPRESSED` | Planner failure emits `NO_SAFE_ROUTE`, no throw | Unit: disc poses outside Bravo |
| `step()` entry, 2 usable satellites | Aircraft spawns near satellite ARP on runway heading, mission `SATELLITE_DEPARTURE` | `originAirportId` + `departureRunwayId` recorded; VFR/1200 markers | Center airport never selected; assert in test | Unit: seeded origin distribution, replay |
| Same seed twice, fixed IFR schedule | Identical IFR traffic and identical VFR origins/poses | New draws consume only VFR streams | Any IFR-stream divergence fails | Stream-identity unit test |
| No regional data (KDEM) with `entriesPerHour > 0` | No continuous VFR appears | Boot initials unchanged; skip event logged | Must not throw or invent an airport | Loader unit, `regional === undefined` |
| Regional pack with zero usable sources | Entry skipped with `NO_DEPARTURE_AIRPORT` | Population unchanged, existing aircraft untouched | Must not fall back to mid-air spawn | Skip-event unit test |
| Liftoff candidate inside Bravo | Candidate rejected, next attempt, then `NO_SAFE_ROUTE` | No penetration, no teleport | Margins unchanged (1 NM / 500 ft) | Prism unit test |

## Acceptance criteria

- [ ] Post-login entries carry a scenario-derived satellite origin; the
  center airport is never selected; no hardcoded ICAO exists on live paths.
- [ ] Liftoff pose is airborne near the departure airport, runway-aligned,
  and climbing; no ground or tower state is introduced.
- [ ] Boot-time initial population behavior is unchanged.
- [ ] No-source and no-safe-route cases emit structured skip events and
  spawn nothing.
- [ ] Seeded repeatability and legacy IFR-stream identity hold.
- [ ] Generic synthetic tests only; no production IDs, counts, or geometry
  encoded.
- [ ] `npm run ci` passes.

## Test plan

- Unit: `src/scenario/test/vfrTraffic.test.ts` for source filtering, center
  exclusion, seeded origin/runway draws, liftoff bounds, skip reasons,
  stream identity, KDEM no-regional behavior.
- Unit: `src/core/test/vfrNavigation.test.ts` only for any shared helper
  touched; corridor geometry tests belong in T04-80.
- Integration: synthetic regional scenario asserting a `step()` entry is a
  satellite departure with origin fields set.
- Manual: KATL seeded session confirming new entries lift off near
  satellites (recorded as leftover if live run unavailable; record
  scenario/seed and FAA edition/paragraphs honestly).

## Suggested files

- `src/scenario/vfrTraffic.ts`
- `src/core/aircraft.ts`
- `src/scenario/types.ts` (only if a type must move; no new config knobs)
- `src/scenario/test/vfrTraffic.test.ts`
- `tests/integration/vfr-population.test.ts` (extend only with synthetic
  fixtures)

## Test and handoff requirements

Focused tests then `npm run ci`. Speech mock pytest only if speech paths
change (they must not). Never skip hooks. Stage explicit owned paths only.
Worker implements exactly this ticket on
`ticket/T04-79-satellite-origin-continuous-vfr-entries`, progressive gated
commits, never merges/spawns/pushes, returns exactly `READY TO MERGE` or
`BLOCKED`.
