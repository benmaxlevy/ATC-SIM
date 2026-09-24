# T04-83 VFR auto-land on visual final

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-82
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later ticket or phase.

## Goal

Replace the terminal despawn vanish of airport-bound ambient VFR aircraft with an autonomous
straight-in visual final descent and touchdown, emitting `vfr.tower.handoff` and `nav.landed` events.

## Context

Today, airport-bound ambient VFR traffic (`AIRPORT_BOUND` mission) flies toward the satellite airport
reference point (ARP). Upon reaching the ARP vicinity (~2 NM), it abruptly logs `vfr.tower.handoff`
and despawns from the world (`src/core/fms/vfrNavigation.ts:939-949`). No landing or touchdown
is executed.

Under this ticket, ambient VFR airport-bound traffic seeds a destination runway deterministically
at spawn time from the destination airport's public runways. When entering the terminal phase
(~3–5 NM from the threshold), it transitions smoothly onto the visual final approach path (reusing
the visual final primitive built in T04-82), tracks straight-in, descends at 3°, touches down at the
runway threshold, logs `nav.landed`, and despawns. Departures, transits, and local VFR flights remain
unaffected. Airborne IFR pickups never auto-land.

## Research

- **AIM §4-3-3 (Traffic Patterns) & AIM §4-3-5:** autonomous VFR approaches in non-towered or
  towered satellite environments follow standard straight-in or pattern alignment to the active
  runway.
- **FAA JO 7110.65 §7-6 (Basic Radar Service to VFR Aircraft):** radar advisory service terminates
  with handoff to the tower or advisory frequency before touchdown.
- **Trainer delta:** no 3D pattern traffic spacing, no runway occupancy conflict detection, no
  touch-and-go. Two arrivals to the same runway will land through each other without collision.

## Scope

- Runway seeding (`src/core/fms/vfrTraffic.ts`):
  - At spawn time for `AIRPORT_BOUND` missions, select a destination runway deterministically
    from `RegionalAirport.runways` (using the seeded scenario PRNG stream) and store `destinationRunwayId`
    on `AmbientVfrState`.
- Terminal navigation hook (`src/core/fms/vfrNavigation.ts`):
  - Replace the immediate ARP despawn in `stepAirportBoundTraffic`.
  - When within ~3–5 NM along the extended centerline of the assigned runway, intercept the visual
    final approach path using the visual final guidance primitive from T04-82.
  - Emit `vfr.tower.handoff` en route as the aircraft enters the terminal arrival segment (preserving
    existing list and event contracts).
  - Descend along the 3° visual glidepath to runway elevation.
  - At threshold (`alongTrack <= 0 && altitude <= LANDING_ALT_MAX_FT`), emit `nav.landed` and despawn.
- Datablock & Presentation:
  - Datablock remains in standard VFR presentation (discrete beacon or 1200 squawk; no `V<rwy>` tag
    is shown because no ATC approach clearance was issued).
- Alert inhibition:
  - MSAW inhibition applies inside 3 NM of the threshold during final descent.
- Acceptance & Regression:
  - End-to-end integration test validating spawn -> approach -> tower handoff -> touchdown -> despawn.
  - Assert that departures (`SATELLITE_DEPARTURE`), transits, and locals still exit at boundaries
    and never auto-land.
  - Verify that VFR flight-following arrivals land identically, while airborne IFR pickups require
    explicit clearance and do not auto-land.
  - Docs: update `docs/USER.md` and phase README notes.

## Out of scope

- Center airport (KATL) autonomous VFR arrivals (Bravo entry remains guarded).
- Go-around or missed approaches for autonomous VFR.
- Wake separation or sequencing between multiple autonomous VFR arrivals.
- New commands, keyboard shortcuts, or strip UI changes.

## Implementation notes

- DRY: leverage the visual final guidance and touchdown detection established in T04-82.
- Determinism: runway selection must draw strictly from the existing PRNG stream; never use `Math.random()`.
- If an airport-bound aircraft cannot establish a valid visual final (e.g. extreme angle or boundary overshoot),
  it must exit cleanly at the airspace boundary with `BOUNDARY_EXIT`, never freeze or teleport.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Airport-bound VFR reaches 4 NM from satellite runway | Joins visual final, descends 3°, lands at threshold, despawns | `vfr.tower.handoff` emitted; `nav.landed` emitted at touchdown | Extreme angle -> boundary exit, never freeze | AIM §4-3-3 |
| Airport-bound with Flight Following active | Receives advisories, joins final, lands and despawns | Service state preserved until despawn | Drop following -> continues landing | JO 7110.65 §7-6-1 |
| Airborne IFR pickup near satellite | Does NOT auto-land; requires controller clearance | Remains on assigned heading/altitude | Must not execute autonomous VFR final | JO 7110.65 §4-8-1 |
| Departure or Transit VFR | Climbs and tracks to boundary exit | No landing or descent triggered | Departures must never auto-land | T04-80 contract |
| Two airport-bound VFR arrivals on same runway | Both track final and touch down | Documented limitation (no spacing) | Must not alert-flood or crash | AIM §4-3-5 |

## Acceptance criteria

- [x] Destination runway seeded deterministically on `ambientVfr` at spawn for `AIRPORT_BOUND` missions.
- [x] Airport-bound VFR transitions onto visual final at ~3–5 NM and touches down at runway threshold.
- [x] `vfr.tower.handoff` and `nav.landed` events emitted in proper sequence.
- [x] Aircraft safely despawns upon touchdown.
- [x] Datablock display remains standard VFR (no clearance shorthand).
- [x] Departures, transits, and airborne IFR pickups do not auto-land.
- [x] Zero MSAW alert flooding during terminal descent.
- [x] End-to-end automated integration suite verifies complete landing lifecycle.
- [x] `npm run ci` passes cleanly.
