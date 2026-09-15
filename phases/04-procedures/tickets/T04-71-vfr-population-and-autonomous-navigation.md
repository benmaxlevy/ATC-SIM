# T04-71 VFR population, navigation, and Class B avoidance

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-69, T04-70
**Blocks:** T04-72
**Launch:** Implement this ticket only after T04-69 and T04-70 are merged. Do not start T04-72 or any radio-service ticket from this ticket.

## Mission

Add a generic, seeded ambient VFR traffic population to a loaded scenario. The
population has independent initial, target, entry-rate, and hard-cap controls;
named weighted geographic zones; local, transit, and airport-bound missions;
natural exits; and persistent waypoint navigation. For KATL, every generated
VFR route must avoid imported Atlanta Class B volumes in three dimensions.

This ticket consumes the airport, regional-catalog, and airspace records emitted
by the importer/runtime-catalog tickets. It must not add hand-authored KATL
airports, fixes, Bravo polygons, floors, ceilings, or procedures. Existing IFR,
authored traffic, STAR arrivals, departures, and their alert behavior remain
unchanged except for the explicitly documented ambient-VFR alert filter below.

## Context and state boundary

The current scenario path has authored/random IFR arrivals and independent
arrival/departure schedules (`src/scenario/spawn.ts`, `arrivalScheduler.ts`,
`departureGenerator.ts`). `Aircraft` already carries `flightRules`, squawk,
destination, intent, and flight-plan metadata. `stepWorld` owns simulation time
and kinematics; pilot/service code owns controller-issued mutations.

Add a data-driven ambient marker rather than inferring VFR from a missing flight
plan:

```ts
type AmbientVfrMission = "LOCAL" | "TRANSIT" | "AIRPORT_BOUND";

interface AmbientVfrState {
  mission: AmbientVfrMission;
  zoneId: string;
  destinationAirportId?: string;
  spawnedAtSimMs: number;
  alertEligibility: "AMBIENT_SUPPRESSED" | "CONTROLLED";
}
```

Generated ambient aircraft start with `flightRules: "VFR"`, `squawk` and
`reportedSquawk` equal to `"1200"`, no active/edited IFR clearance, no filed
IFR route, and `alertEligibility: "AMBIENT_SUPPRESSED"`. This explicit marker
prevents generic MSAW/ATPA/CA evaluation from flooding a KATL session with
ambient VFR warnings below the trainer MVA. T04-73/T04-74 may promote a
controller-worked aircraft to `CONTROLLED`; that transition is not implemented
here. Existing non-ambient aircraft continue through the current alert path.

## Configuration contract

Scenario JSON and the validated runtime object use one generic `vfrTraffic`
object. The object is optional so every existing scenario remains bit-stable
when it omits the feature.

```ts
interface VfrTrafficConfig {
  initialCount?: number;
  targetCount?: number;
  entriesPerHour?: number;
  maxPopulation?: number;
  seed?: number;
  zones?: Array<{ id: string; weight: number }>;
  aircraftMix?: Array<{
    aircraftType: string;
    weight: number;
    callsignPrefix: string;
    performanceSource: "PROFILE_REGISTRY" | "TRAINER_DEFAULT";
  }>;
  altitudeMix?: Array<{ minAltitudeFt: number; maxAltitudeFt: number; weight: number }>;
  movementMix?: {
    localPercent?: number;
    transitPercent?: number;
    airportBoundPercent?: number;
  };
}
```

Validation/default rules:

- Omitted `vfrTraffic` means disabled: initial count, target count, entry
  rate, and hard cap are all `0`; no zones are required and no traffic is
  spawned. This preserves current KDEM/KATL behavior until a scenario opts in.
- Within a present object, omitted counts/rates default to `0`, omitted seed
  uses the existing deterministic scenario seed, omitted `movementMix` means
  `localPercent: 100` and the other mission percentages `0`, and omitted
  `zones` means no valid spawn location. A positive count/rate with no positive
  zone weight is rejected, not silently placed at the ARP.
- `initialCount`, `targetCount`, and `maxPopulation` are non-negative integers;
  `entriesPerHour` is finite and non-negative. `maxPopulation` must be at
  least both count controls. Counts are independent: changing the target does
  not change `entriesPerHour`.
- Zone weights are finite and non-negative; at least one zone must have positive
  weight when a spawn is requested. Movement percentages are each in `[0,100]`
  and must sum to `100` when a movement mix is present.
- `aircraftMix` and `altitudeMix` are optional scenario-controlled mixes. Each
  row has a finite non-negative weight; at least one row must be positive when
  traffic is enabled. An aircraft row must name a profile-registry type or an
  explicit `TRAINER_DEFAULT` profile and a non-empty callsign prefix. The
  generator must use the row's generic callsign allocator and uniqueness rules;
  it must not reuse an airline-only allocator for an unlisted GA type. An
  altitude row has finite MSL bounds with `minAltitudeFt <= maxAltitudeFt`.
  Missing/invalid GA profile rows are rejected or skipped deterministically;
  they must never silently acquire the jet `DEFAULT_PROFILE` and its 1800-fpm
  fallback. `TRAINER_DEFAULT` is a documented simulator approximation, not an
  OpenAP or FAA performance claim.
- Exact loader errors are stable:
  - `vfrTraffic.initialCount must be a non-negative integer`
  - `vfrTraffic.targetCount must be a non-negative integer`
  - `vfrTraffic.entriesPerHour must be a finite number >= 0`
  - `vfrTraffic.maxPopulation must be a non-negative integer`
  - `vfrTraffic.maxPopulation must be >= initialCount and targetCount`
  - `vfrTraffic zone weights require a positive zone when traffic is enabled`
  - `vfrTraffic.movementMix percentages must sum to 100`
  - `vfrTraffic aircraft mix requires a positive weighted row`
  - `vfrTraffic altitude mix requires a positive weighted row`
  - `vfrTraffic aircraft row <TYPE> requires a verified profile or explicit trainer default`
  - `vfrTraffic altitude row <INDEX> must have finite bounds with min <= max`
  - `vfrTraffic aircraft row <INDEX> requires a non-empty callsignPrefix`
  - `vfrTraffic zone <ID> is not defined by the scenario`
  - `vfrTraffic has no eligible imported controlled-airport destination`

## Navigation and population contract

- Use independent seeded streams derived from `vfrTraffic.seed` for initial
  placement, mission/zone selection, route choices, and future entries. A
  request scheduler must receive its own stream in T04-72; adding/removing a
  radio request must not reorder aircraft poses or callsigns.
- Initial population is spawned once at scenario creation up to
  `min(initialCount, maxPopulation)`. The soft `targetCount` is maintained only
  by future natural exits and paced entries; it never deletes an aircraft.
  `entriesPerHour` remains an independent stream and is not recalculated to
  close a target deficit.
- Future entries use a continuous deterministic schedule at
  `3_600_000 / entriesPerHour` simulated milliseconds (with seeded bounded
  jitter that never creates a catch-up burst). A full population or hard cap
  defers an entry; it does not burst later. The hard cap is never exceeded.
  Paused simulation does not advance scheduling.
- A generated aircraft is never removed merely because the target or settings
  changed, and an aircraft with a pending request, controller service, active
  clearance, or scope association is never removed by replenishment. Natural
  exits occur only after a mission reaches its terminal condition:
  local traffic completes its bounded dwell/route and exits the training box,
  transit traffic exits the training boundary, and airport-bound traffic is
  handed to the destination tower stub and then leaves. The exact handoff
  event must be observable and must not mutate controller-owned service state.
- Local traffic follows persistent waypoints inside its selected named zone;
  transit traffic follows a boundary-to-boundary corridor; airport-bound
  traffic follows a route to an eligible destination. Do not choose a new
  random heading every tick. Controller heading/altitude instructions later
  override the autonomous intent; a downstream resume-own-navigation action
  restores the mission route.
- Destination eligibility is data-driven from the T04-69/T04-70 imported
  regional catalog: public, operational airports with a complete position and
  at least one runway, whose imported controlled class is B, C, or D. Exclude
  heliports, closed/unknown-class records, and airports with no usable runway.
  Do not infer eligibility from the weather list, a scenario's satellite
  entries, or airport name text. Every selected destination must be present in
  the imported catalog and be representable in the scenario coordinate frame.
- Aircraft performance comes from the existing profile registry when a
  matching profile exists. No OpenAP support for piston/GA types may be
  assumed, queried at runtime, or silently fabricated. If a selected GA type
  lacks a verified profile, use the explicitly documented trainer-default
  fallback (with `source: "trainer-default"`/equivalent provenance) and record
  the limitation; do not claim aircraft-specific fidelity. This is a manual
  review risk for T04-76.

## Three-dimensional Class B avoidance

The T04-69 importer must preserve relevant airspace records and T04-70 must
expose them through the generic runtime catalog. T04-71 consumes that API; it
must not re-import ARINC records or add a KATL branch. A volume has a horizontal
boundary plus floor and ceiling in feet MSL, with units/provenance retained by
the catalog.

- Apply avoidance only to catalog volumes explicitly marked as VFR-avoidance
  Class B volumes. For the KATL pack this is Atlanta Class B. Other airspace
  classes/facilities are assumed coordinated by their respective tower and do
  not constrain this first version.
- Test the swept 3-D segment from the previous position/altitude to the
  proposed position/altitude, not only the destination waypoint. A collision
  exists when the horizontal segment intersects the polygon (including a
  documented boundary margin) and the vertical segment overlaps
  `[floorFt, ceilingFt]` (including the same margin). A turn or climb/descent
  is unsafe if any intermediate segment intersects.
- Seeded route planning must select a waypoint/altitude outside the volume,
  remain outside during the entire segment, and apply hysteresis so an aircraft
  does not oscillate along a shelf boundary. Spawn placement is subject to the
  same test; an invalid initial pose is regenerated deterministically.
- If no safe candidate is found within the bounded planner attempts, skip that
  entry with a structured `vfr.spawn.skipped` event and reason
  `NO_SAFE_ROUTE`; never penetrate the volume, teleport across it, or disable
  the guard. Tests must prove the bounded failure is deterministic.
- The planner does not grant Bravo clearance, ask a controller, or rewrite
  flight rules. An aircraft already in a protected volume is not forcibly
  teleported; the generated ambient path simply never creates that state.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Omitted `vfrTraffic` | Existing scenario boots with no ambient VFR additions | No new aircraft/scheduler; IFR/authored traffic unchanged | No zones/defaults required | `src/scenario/test/vfrTraffic.test.ts`; clean KDEM/KATL boot |
| `{ initialCount: 4, targetCount: 8, entriesPerHour: 2, maxPopulation: 12, seed: 7, zones: [{id:"north",weight:1}] }` | Four VFR aircraft spawn; future arrivals are independently paced | Each has VFR/1200/ambient marker and persistent mission route | Invalid count/rate/cap throws exact loader error | Config validation test; setup walkthrough |
| `targetCount` lowered below live population | No mass removal | Existing aircraft and pending/active work remain | Natural exit/replenishment only | World lifecycle test |
| `entriesPerHour: 6` while population is full | Entry remains deferred until a slot is safe | No burst at the next hour; cap never exceeded | Full cap records a deferred decision, not a throw | Sim-clock schedule test |
| Named zones with weights `north: 3`, `east: 1` | Seeded draws select zones by normalized weight | Zone choice reproducible and independent of request draws | Unknown/negative/all-zero weights reject exactly | Synthetic weighted-zone test |
| Mission mix `50/25/25` | Local/transit/airport-bound routes use the selected proportions over a seeded sample | Mission stored on `ambientVfr`; no per-tick random headings | Sum not 100 rejects exact error | Synthetic mix test |
| Airport-bound draw | Chooses only imported operational controlled B/C/D airport with runway | Stores destination ICAO and route in scenario frame | No eligible imported destination rejects/spawn-skips; no hand-filled fallback | Catalog integration test; generator provenance review |
| Proposed segment intersects KATL Bravo shelf floor/ceiling | Planner chooses a safe waypoint/altitude before committing movement | Aircraft remains outside imported volume | Boundary margin/vertical overlap catches shelf crossing; no teleport | Synthetic 3-D prism test plus KATL manual scope walk |
| No safe route after bounded attempts | Entry is not spawned | Append `vfr.spawn.skipped` with `reason: "NO_SAFE_ROUTE"` | Must not disable avoidance or mutate existing aircraft | Failure-path unit test |
| Ambient VFR below trainer MVA | Aircraft continues without MSAW/ATPA/CA flood | `alertEligibility: "AMBIENT_SUPPRESSED"` | Existing IFR/non-ambient alert evaluation unchanged | Alert eligibility acceptance test |
| Controller-worked marker set downstream | T71 navigation continues under service-owned intent | Eligibility can become `CONTROLLED`; T71 does not issue radio/clearance changes | T71 never mutates scope association, service, or flight rules | State-boundary test/inspection |

## Acceptance criteria

- [ ] `vfrTraffic` validates with the exact defaults/errors above; omitted
  config is disabled and does not perturb existing scenarios.
- [ ] Initial count, soft target, entries/hour, and hard maximum are separate;
  target maintenance never creates a replenishment burst or deletes worked
  traffic.
- [ ] Seeded named-zone and mission selection is persistent, repeatable, and
  uses independent random streams from future radio requests.
- [ ] Local, transit, and airport-bound missions move through persistent
  waypoints and exit naturally; no per-tick random heading behavior exists.
- [ ] Airport-bound destinations come only from T04-69/T04-70 imported,
  controlled B/C/D airports with usable runway data. No hand-authored KATL
  destination or airspace data is added.
- [ ] Every ambient aircraft starts VFR/1200 with no IFR clearance/plan and an
  explicit `AMBIENT_SUPPRESSED` alert eligibility; existing IFR alerts stay
  unchanged.
- [ ] Swept-segment 3-D avoidance prevents KATL Class B penetration using
  imported polygon/floor/ceiling volumes, including turns and altitude changes;
  non-KATL/non-avoidance airspace remains unrestricted in this slice.
- [ ] Generic synthetic geometry tests cover zone weighting, mission routing,
  natural exits, swept prism intersection, shelf floors/ceilings, boundary
  margin, bounded no-route failure, and deterministic replay. One KATL
  acceptance verifies only the imported-data contract, not hard-coded geometry.
- [ ] No parser, Command IR, pilot-service, IFR-clearance, speech, or UI command
  behavior is changed by this ticket.

## Test plan

- Unit: `src/scenario/test/vfrTraffic.test.ts` for config, independent streams,
  zone/mix draws, spawn pacing, cap/target semantics, and natural exits.
- Unit: `src/core/test/vfrNavigation.test.ts` for waypoint navigation and
  swept 3-D volume intersection with synthetic rectangles/prisms.
- Integration: `tests/integration/vfr-population.test.ts` for a synthetic
  scenario plus one KATL catalog smoke check proving destinations/volumes come
  from the imported catalog.
- Regression: existing scenario/world/CA/MSAW/ATPA tests must still pass;
  ambient suppression must not alter authored/IFR alert fixtures.
- Manual: review generated KATL catalog provenance and run a seeded scope
  session showing VFR tracks remain outside Bravo shelves and do not flood MVA
  alerts. Do not claim official airspace fidelity beyond importer provenance.

## Research and manual evidence

- FAA AIM, **§3-2-3 Class B Airspace**: VFR entry requires authorization;
  this trainer path does not authorize entry and therefore avoids imported
  Class B volumes.
- 14 CFR **§91.131 Operations in Class B airspace**: regulatory basis for the
  no-unauthorized-entry behavior; this simulator is not a compliance claim.
- FAA AIM, **§4-1-18 Terminal Radar Services for VFR Aircraft**: supports the
  distinction between ambient VFR movement and later requested radar service;
  T04-72/T04-73 own the radio lifecycle.
- FAA CIFP importer README, **“Dialects” / “KATL data” / “Out of scope”**:
  imported records are source-driven, airspace must be imported by T04-69, and
  no hand-authored national/KATL fallback is permitted.

## Non-goals

- No hand-authored airport, navaid, procedure, Class B polygon, shelf floor,
  ceiling, or national data dump.
- No Class B clearance/penetration service, tower simulation, ground traffic,
  weather, conflict-resolution AI, or non-KATL airspace restrictions.
- No controller command grammar, flight-following acceptance, squawk/IDENT
  handling, IFR pickup, IFR cancellation, route clearance, or scope ownership
  transitions.
- No OpenAP runtime/network dependency or aircraft-specific GA fidelity claim.

## Handoff

Return `READY TO MERGE` only after focused tests and the KATL imported-data
manual checklist pass. Report the exact config schema, alert-eligibility
marker, catalog fields consumed from T04-69/T04-70, and any GA fallback
provenance limitation. Do not modify `phases/SWARM.md`, start T04-72, or merge
downstream work.
