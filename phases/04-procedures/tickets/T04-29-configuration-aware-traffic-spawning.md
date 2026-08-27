# T04-29 Configuration-aware traffic spawning

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-27, T04-28
**Blocks:** T04-30
**Launch:** Implement this ticket only.

## Goal

Ensure arrival traffic scheduler (`assignStarRoutes`) and departure generator (`departureGenerator`, `departureSpawn`) filter and select STAR transitions and SID runway transitions that match the active scenario's configuration and runway.

## Context

When running in West Flow (RWY 27), arrivals should spawn on West Flow STAR transitions (`N`, `S`), and departures should roll on RWY 27 and fly the `27` SID runway transition. When running in East Flow (RWY 09), arrivals should spawn on East Flow STAR transitions (`WN`, `WS`), and departures should roll on RWY 09 (threshold `-1.645, 0`, heading 090°) and fly the `09` SID runway transition.

## Scope

- In `src/scenario/starSpawn.ts` & `src/scenario/arrivalScheduler.ts`:
  - Support configuration/runway filtering in `listStarSlots(catalog, runwayId?)` or `assignStarRoutes({ catalog, activeRunwayId, ... })`.
  - For KDEM:
    - West Flow (`activeRunwayId: "27"`): assigns transitions `N`, `S` (merging at `MERGE`).
    - East Flow (`activeRunwayId: "09"`): assigns transitions `WN`, `WS` (merging at `WMERG`).
  - Graceful fallback: If no transitions are tagged/associated with a specific runway, all catalog transitions remain available.
- In `src/scenario/departureSpawn.ts` & `src/scenario/departureGenerator.ts`:
  - Ensure departure spawning positions and headings are derived strictly from `activeRunwayId` and the matching `runwayTransitions` entry in `catalog.sids`.
  - Verify departure roll pose for RW09: threshold `RW09` at `(-1.645, 0)`, initial heading 090°, initial climb armed toward `BAYEA`.
  - Downwind benchmark spawn (`?traffic=N`): correctly offsets relative to the active runway heading and threshold.

## Out of scope

- UI Session setup selectors (T05-14).
- End-to-end multi-config acceptance suite (T04-30).

## Acceptance criteria

- [x] **AC1 —** In East Flow (`kdem-09`), `assignStarRoutes` assigns arrivals only to East Flow transitions (`WN`, `WS`) feeding `WMERG`.
- [x] **AC2 —** In West Flow (`kdem`), `assignStarRoutes` assigns arrivals only to West Flow transitions (`N`, `S`) feeding `MERGE`.
- [x] **AC3 —** In East Flow, departures spawn at `RW09` threshold (`-1.645, 0`) with heading 090° and armed `BAY1` RW09 transition toward `BAYEA`.
- [x] **AC4 —** In West Flow, departures continue to spawn at `RW27` threshold (`0, 0`) with heading 270° and armed `BAY1` RW27 transition toward `BAYEE`.
- [x] **AC5 —** Successive departures on RW09 maintain >= 60s simulated spacing.
- [x] **AC6 —** Automated tests cover AC1–AC5.

## Suggested files

- `src/scenario/starSpawn.ts`
- `src/scenario/starSpawn.test.ts`
- `src/scenario/departureSpawn.ts`
- `src/scenario/departureSpawn.test.ts`
- `src/scenario/departureGenerator.ts`
- `src/scenario/departureGenerator.test.ts`
- `src/scenario/arrivalScheduler.ts`
