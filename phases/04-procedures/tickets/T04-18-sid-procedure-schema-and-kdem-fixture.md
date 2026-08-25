# T04-18 SID procedure schema, KDEM departure fixture, and video map

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-01, T04-02, T04-14
**Blocks:** T04-19, T04-20, T04-21
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Extend the catalog schema to fully represent Standard Instrument Departures (SIDs) — including runway transitions, common legs, enroute departure transitions, and climb altitude/speed constraints. Populate `src/scenario/data/kdem/sids.json` with the KDEM `DEM1` ("DEMO ONE DEPARTURE") procedure and add the corresponding video map. Catalog loader and validation must support SIDs generically without hardcoded facility switches.

## Context

Phase 4 shipped `sids: []` as an empty schema placeholder in `src/scenario/data/kdem/sids.json`. Phase 4 addenda (T04-13–17) established STAR inbound spawning and check-ins. SIDs are the outward mirror of STARs:
- Runway transition (e.g. initial climb / turn off RW27 to initial fix `RW27` -> `MISSD` / `DME` fix or radar vector heading).
- Common legs with minimum climb crossing constraints (e.g. `AT_OR_ABOVE 3000`, `AT_OR_ABOVE 5000`).
- Enroute transitions to exit gates (e.g. North transition via `NORMA`, South transition via `SNARF`, East transition via `OCTTA` / `DEMEE`).

Catalog loader must validate fix references and constraint ranges for SIDs just as it does for STARs and approaches.

See `.cursor/rules/extensible-features.mdc` (data-first extensibility; no `"KDEM"`/`"DEM1"` code branches), `src/scenario/procedures/types.ts`, `src/scenario/procedures/loadCatalog.ts`.

## Research

- **R01** JO 7110.65 — Section on Departure Procedures and Standard Instrument Departures (SIDs).
- **R03** AIM 5-2-8 — Instrument Departure Procedures (DP) - Obstacle Departure Procedures (ODP) and Standard Instrument Departures (SID).
- **R11** CIFP / ARINC 424 — SID structure with runway transitions, common routes, and enroute transitions.

**Official term:** Standard Instrument Departure (SID), Runway Transition, Common Route, Enroute Transition, Climb Via SID.

**Trainer delta:** Discrete leg geometry in local tangent NM (+x east, +y north), altitude constraints in feet MSL, speed in knots. Video maps remain separate drawing files (`src/scenario/video-maps/KDEM/007-dem1-sid.json`).

## Scope

- Extend `SidProcedure` and related types in `src/scenario/procedures/types.ts`:
  ```ts
  export interface SidLeg {
    fixId: string;
    altConstraint?: AltConstraint;
    speedConstraint?: SpeedConstraint;
  }

  export interface SidRunwayTransition {
    runwayId: string; // e.g. "27" or "09"
    initialHeadingDeg?: number;
    initialClimbFt?: number;
    legs: SidLeg[];
  }

  export interface SidEnrouteTransition {
    id: string; // e.g. "NORMA", "SNARF", "OCTTA"
    name: string;
    legs: SidLeg[];
  }

  export interface SidProcedure {
    id: string; // e.g. "DEM1"
    name: string; // e.g. "DEMO ONE DEPARTURE"
    runwayTransitions?: SidRunwayTransition[];
    common: SidLeg[];
    enrouteTransitions?: SidEnrouteTransition[];
    initialClimbFt?: number; // default top altitude before enroute climb (e.g. 5000)
  }
  ```
- Populate `src/scenario/data/kdem/sids.json` with `DEM1` SID:
  - Runway 27 transition: climbing turn to `MISSD` (`AT_OR_ABOVE 2000`).
  - Common route: `MISSD` -> `SNARF` or initial departure waypoint (`AT_OR_ABOVE 4000`, `AT_OR_BELOW 250`).
  - Enroute transitions:
    - `NORMA` (North exit): legs to `NORMA` (`AT_OR_ABOVE 6000`).
    - `OCTTA` (East/Southeast exit): legs to `OCTTA` (`AT_OR_ABOVE 8000`).
- Add SID video map: `src/scenario/video-maps/KDEM/007-dem1-sid.json` and register in `src/scenario/video-maps/KDEM/catalog.json`.
- Update `src/scenario/procedures/loadCatalog.ts` to validate SID legs against `catalog.fixes` and `catalog.navaids`. Duplicate fix checks, missing fix errors.
- Export helper `sidRouteFixIds(catalog, sidId, runwayId, transitionId): string[]` returning the complete ordered fix sequence.
- Unit tests validating KDEM SID loading, route fix resolution, invalid fix detection, and testdata multi-SID catalogs.

## Out of scope

- FMS flight guidance / `CLIMB_VIA` runtime physics (T04-19).
- Spawning departures on runway (T04-20).
- Telephony check-in for departures (T04-22).

## Acceptance criteria

- [ ] **AC1 —** `loadCatalog("src/scenario/data/kdem")` successfully parses `sids.json` with `DEM1` ("DEMO ONE DEPARTURE"), validating all fix references against `fixes.json` / `vors.json`.
- [ ] **AC2 —** `sidRouteFixIds(catalog, "DEM1", "27", "NORMA")` returns the correct ordered sequence of fix IDs for RWY 27 via the NORMA transition without hardcoded facility branches in the helper.
- [ ] **AC3 —** Missing fix in a SID leg or invalid runway reference throws a descriptive error on catalog load.
- [ ] **AC4 —** Video map `007-dem1-sid.json` exists, is registered in KDEM video map catalog as map slot 7 (or next available slot), and renders SID lines on scope when active.
- [ ] **AC5 —** Generic multi-SID fixture in `testdata/` loads and resolves routes cleanly.
- [ ] **AC6 —** Automated tests for AC1–AC5 pass. `npm test` exit 0.

## Test plan

- Unit: `loadCatalog` with valid/invalid SIDs; `sidRouteFixIds` route resolution; constraint validation.
- Integration: Scenario loader loads KDEM with SIDs populated.
- Manual: None.

## Suggested files

- `src/scenario/procedures/types.ts`
- `src/scenario/procedures/loadCatalog.ts`
- `src/scenario/procedures/loadCatalog.test.ts`
- `src/scenario/procedures/sidHelpers.ts`
- `src/scenario/procedures/sidHelpers.test.ts`
- `src/scenario/data/kdem/sids.json`
- `src/scenario/video-maps/KDEM/007-dem1-sid.json`
- `src/scenario/video-maps/KDEM/catalog.json`
