# T04-27 Dual-runway SIDs and STARs

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-26
**Blocks:** T04-28, T04-29
**Launch:** Implement this ticket only.

## Goal

Extend the KDEM SID (`BAY1`) and STAR (`DEM1`) procedure catalog definitions to fully support both West Flow (Runway 27) and East Flow (Runway 09) navigation and FMS guidance.

## Context

T04-26 provided navigation fixes and ILS 09. Now `BAY1` departure needs a runway transition for Runway 09, and `DEM1` STAR needs arrivals feeding East Flow toward `WMERG`.

Under FAA procedure standards and our procedure catalog schema:
- `BAY1` SID has `runwayTransitions`: runway `27` (initial heading 270°, climb to `BAYEE` at or above 1500 ft) and runway `09` (initial heading 090°, climb to `BAYEA` at or above 1500 ft), then joining enroute transitions `NORMA` and `OCTTA`.
- `DEM1` STAR contains transitions for both West Flow (North `N`, South `S` joining at `MERGE`) and East Flow (West-North `WN`, West-South `WS` joining at `WMERG` at 4000 ft / 210 kt).

## Scope

- In `src/scenario/data/kdem/sids.json`:
  - Add runway transition for `"09"`: `initialHeadingDeg: 90`, `initialClimbFt: 5000`, legs: `[ { "fixId": "BAYEA", "altConstraint": { "type": "AT_OR_ABOVE", "altitudeFt": 1500 } } ]`.
  - Ensure enroute transitions `NORMA` and `OCTTA` connect seamlessly from both runway transitions (`BAYEE` $\to$ `BAYNW` / `BAYSO`; `BAYEA` $\to$ `BAYNE` / `BAYSE`).
- In `src/scenario/data/kdem/procedures.json`:
  - Extend `DEM1` with East Flow transitions:
    - Transition `WN` (West-North): legs `WNMAX` (>=10000 ft, <=250 kt) $\to$ `WNLBO` (>=8000 ft, <=230 kt) $\to$ `WNJOIN` (>=6000 ft, <=210 kt) $\to$ `WMERG` (at 4000 ft, <=210 kt).
    - Transition `WS` (West-South): legs `WSMAX` (>=10000 ft, <=250 kt) $\to$ `WSLBO` (>=8000 ft, <=230 kt) $\to$ `WSJOIN` (>=6000 ft, <=210 kt) $\to$ `WMERG` (at 4000 ft, <=210 kt).
- Verify FMS navigation guidance:
  - `sidRouteFixIds(catalog, "BAY1", "09", "NORMA")` returns `["BAYEA", "BAYNE", "NORMA"]`.
  - `sidRouteFixIds(catalog, "BAY1", "09", "OCTTA")` returns `["BAYEA", "BAYSE", "OCTTA"]`.
  - `starRouteFixIds(catalog, "DEM1", "WN")` returns `["WNMAX", "WNLBO", "WNJOIN", "WMERG"]`.
  - `starRouteFixIds(catalog, "DEM1", "WS")` returns `["WSMAX", "WSLBO", "WSJOIN", "WMERG"]`.
  - Lateral and vertical guidance (`CLIMB_VIA` and `DESCEND_VIA`) navigate correctly along RW09 SID and STAR legs.

## Out of scope

- Scenario definitions and video maps (T04-28).
- Traffic generator configuration filtering (T04-29).

## Acceptance criteria

- [ ] **AC1 —** `sids.json` contains `BAY1` with valid runway transitions for both `"27"` and `"09"`.
- [ ] **AC2 —** `procedures.json` contains `DEM1` with `N`, `S`, `WN`, and `WS` transitions.
- [ ] **AC3 —** `sidRouteFixIds` correctly resolves route fix lists for both Runway 27 and Runway 09 runway transitions.
- [ ] **AC4 —** `starRouteFixIds` correctly resolves route fix lists for all `DEM1` transitions.
- [ ] **AC5 —** FMS `CLIMB_VIA` computes correct vertical profile for RW09 departures climbing to assigned altitude.
- [ ] **AC6 —** FMS `DESCEND_VIA` computes correct crossing altitude profile for `DEM1` East Flow arrivals.
- [ ] **AC7 —** Automated tests cover AC1–AC6.

## Suggested files

- `src/scenario/data/kdem/sids.json`
- `src/scenario/data/kdem/procedures.json`
- `src/scenario/procedures/sidHelpers.ts`
- `src/scenario/procedures/sidHelpers.test.ts`
- `src/core/fms/procedureJoin.test.ts`
- `src/core/fms/vertical.test.ts`
