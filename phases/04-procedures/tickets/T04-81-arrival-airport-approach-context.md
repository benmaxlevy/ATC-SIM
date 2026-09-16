# T04-81 Arrival-airport approach context resolver and satellite ILS parity

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-80
**Blocks:** T04-82, T04-83
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later ticket or phase.

## Goal

Resolve approach procedures and localizer/glidepath geometry against the aircraft's
authoritative arrival airport rather than the center facility catalog alone. Enable
satellite ILS capture and execution while keeping center airport behavior byte-identical
and failing closed on unsupported approach types (RNAV/VOR/NDB).

## Context

Today, every approach consumer in the codebase reads `world.catalog` and `world.fixRegistry`
directly, assuming all approaches belong to the center airport (KATL / KDEM):
- `src/pilot/handleRadioText.ts:332-339`: validation uses `world.catalog?.approaches`.
- `src/pilot/validate.ts:310-319`: `approachKnown()` validates against center catalog approaches.
- `src/core/world.ts:789-790`: `locAxisFor` closure uses `world.catalog` and `world.fixRegistry`.
- `src/core/world.ts:684-697, 724-726`: along-track and FAF speed-gate lookups use `world.catalog`.
- `src/core/fms/landing.ts:33-44, 71`: tower handoff gate and missed spec lookups use `world.catalog`.
- `src/core/fms/missed.ts:80-92`: `missedSpecFor` uses passed catalog.
- `speech-api/parse_engine.py:87, 572, 720-743`: Path C approach candidates.

Satellite CIFP catalogs exist under `src/scenario/data/katl/airports/<ICAO>/` (e.g. KPDK, KFTY, KRYY)
and can be loaded via `loadRegionalAirportCatalog(facility, icao)`. However, satellite fix coordinates
in `fixes.json` are tangent to that satellite airport's ARP rather than the center ARP (0,0).
A naive fix lookup places the satellite localizer axis over the center airport. Furthermore,
MSAW alert inhibition in `src/core/alerts/msaw.ts` is currently hardcoded to `(0,0)`, causing
nuisance alerts on final approach into satellites.

## Research

- **Precedent:** `applyIfrClearance` (`src/core/fms/ifrClearance.ts:472-484`) already resolves
  route fixes across `effectiveCatalog?.regionalAirports`.
- **FAA JO 7110.65 §4-8-1 (Approach Clearance):** clearances are issued relative to the airport
  of intended landing. Cross-airport approach confusion is prevented by scoping available
  procedures to the destination airport.
- **AIM §1-1-9 (ILS):** localizer alignment and threshold crossing height (TCH) are anchored
  to the physical runway threshold.
- **Coordinate projection:** `RegionalRunwayGeometry.thresholdNm` in `RegionalFacility` is already
  projected to center ARP via `latLonToNm(threshold, centerArp)`. Satellite fixes in `fixes.json`
  must similarly be projected to center ARP (`latLonToNm(fix, centerArp)`).
- **Trainer delta:** no practice approaches to non-destination airports without an amended
  clearance limit. Rejection of unfiled/non-destination approaches is a deliberate deterministic guard.

## Scope

- Create a shared approach context module `src/core/nav/approachContext.ts`:
  - `resolveApproachContext(aircraft, world)` returning `{ airportIcao, catalog, fixRegistry, ilsComponents }`.
  - Deterministic precedence chain:
    1. `activeClearance.limitId` (ONLY if matching a known airport in `world.regional` or center `world.catalog.airportId`). Fix limits (e.g. `SIITH`) fall through.
    2. Correlated flight plan destination: `flightPlan.airportId` / `flightPlan.destination`.
    3. Ambient VFR destination: `ambientVfr.destinationAirportId`.
    4. Authored destination fields: `aircraft.destination` / `aircraft.destinationAirport`.
    5. Center default: `world.catalog.airportId` (falls back to `world.catalog` and `world.fixRegistry`).
  - Cache loaded regional catalogs and fix registries per session keyed by `(facility.centerAirportId, icao)` so `loadRegionalAirportCatalog` is not called per tick.
  - When building a satellite `FixRegistry`, project fixes/navaids to center ARP via `latLonToNm(fix, centerArp)` so localizer axes have correct world positions.
- Switch approach consumers to use `resolveApproachContext(aircraft, world)`:
  - `src/pilot/handleRadioText.ts`: supply destination-aware approach IDs and catalog to `validateInstructions`.
  - `src/pilot/validate.ts`: `approachKnown` uses the resolved context.
  - Fail-closed RNAV/VOR/NDB guard: in `validate.ts`, reject non-ILS approach IDs (`RNAV`, `VOR`, `NDB`, `RNP`) with `UNABLE` / `UNKNOWN_APPROACH` rather than arming an unexecutable localizer intercept.
  - `src/core/world.ts`: `locAxisFor`, `computeApproachAlongTrackNm`, `updateApproachSpeedAssignments`, `applyMissedFms` use aircraft's resolved context.
  - `src/core/fms/landing.ts`: `locAxisForAircraft`, `isTowerHandoffEligible`, `despawnLandedAircraft` use resolved context.
  - `src/core/alerts/msaw.ts`: update `isMsawInhibited` to accept an optional threshold coordinate from the aircraft's approach context so satellite arrivals inside FAF/3 NM do not trigger nuisance MSAW alerts.
- Candidate lists for Path C / spoken parser:
  - In `handleRadioText.ts` and `voice-loop.ts`, ensure regional satellite ILS approach IDs are accessible to `parseCommand` without exceeding candidate size limits.

## Out of scope

- `CLEARED_VISUAL` command and visual approach execution (T04-82).
- VFR auto-landing execution (T04-83).
- RNAV/RNP lateral waypoint navigation.
- Practice approaches to non-destination airports.

## Implementation notes

- Keep the thin-module architecture intact: `approachContext.ts` lives in `@core/nav` and imports purely data/pure functions.
- Never re-parse JSON files on the animation/simulation tick. Cache parsed catalogs and projected fix registries.
- Center airport behavior must remain byte-identical: when destination is KATL, resolution returns `world.catalog` and `world.fixRegistry`.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `DAL123 APP I26R` (dest KATL) | Validated and captures KATL 26R localizer/GS | Center context used; identical to legacy | Unknown ID -> `UNKNOWN_APPROACH` | JO 7110.65 §4-8-1 |
| `N123AB CLR TO KPDK...` then `APP I21L` | Validated and captures KPDK 21L localizer/GS | Satellite context cached; threshold projected to center ARP | KATL fallback never used | AIM §1-1-9 |
| `DAL123 APP I21L` (dest KATL) | Rejected `UNKNOWN_APPROACH` | No state mutation | Must not search satellite catalogs | JO 7110.65 §4-8-1 |
| `N123AB APP H21LZ` (RNAV approach) | Rejected `UNKNOWN_APPROACH` | Fail-closed guard prevents heading-hold drift | RNAV/VOR/NDB rejected | AIM §1-2-1 |
| Aircraft with fix clearance limit `CLR TO SIITH` | Falls through limit to flight plan destination | Resolves to destination airport, not `SIITH` | If no destination, defaults to center | JO 7110.65 §4-2-1 |
| Satellite arrival inside 4 NM of threshold | Approaches and lands without MSAW alert | Per-aircraft MSAW inhibit active | Below floor outside FAF triggers MSAW | JO 7110.65 §5-1-13 |

## Acceptance criteria

- [ ] Single shared `resolveApproachContext(aircraft, world)` function feeds all approach validation and kinematics.
- [ ] Satellite catalogs cached per session; zero per-tick file loading or re-parsing.
- [ ] Satellite fix coordinates correctly projected to center ARP (`latLonToNm`); localizer axis matches runway threshold.
- [ ] Existing KATL/KDEM ILS capture, speed gates, tower handoffs, landings, and missed approaches pass regression suites with zero behavior delta.
- [ ] Non-ILS approaches (RNAV, VOR, NDB) fail closed during validation with `UNKNOWN_APPROACH`.
- [ ] MSAW inhibition properly accounts for satellite arrival thresholds; no false alerts on satellite final.
- [ ] `npm run ci` passes cleanly.
