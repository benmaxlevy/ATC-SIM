# T04-30 Dual-runway configuration integration and acceptance

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-26, T04-27, T04-28, T04-29, T05-14
**Blocks:** none
**Launch:** Implement this ticket only.

## Goal

Provide end-to-end integration and automated regression acceptance proving that KDEM operates bidirectionally in both West Flow (Runway 27) and East Flow (Runway 09) configurations, including STAR arrivals, ILS approaches, SID departures, radio check-ins, and session setup selection.

## Context

With tickets T04-26 through T04-29 and T05-14 implemented, the entire dual-runway and configuration system is assembled. This acceptance ticket verifies the end-to-end user loop across both configurations, validating that no regressions were introduced to existing Phase 0–4 or STARS scope capabilities.

## Scope

- Automated End-to-End Integration Suite:
  1. **West Flow (RWY 27) Full Cycle**:
     - Scenario loads with `activeRunwayId: "27"`.
     - Arrivals spawn on DEM1 (`N`/`S`), descend via constraints to `MERGE`, accept radar vectors, intercept localizer 27 (`IDEM`), capture GS (`IDEMGS`), and land or execute missed approach to `MISSD`.
     - Departures spawn on RW27 threshold `(0, 0)`, roll on heading 270°, check in on radio, climb via `BAY1` to `BAYEE` $\to$ `NORMA`/`OCTTA`, and hand off cleanly at TRACON boundary.
  2. **East Flow (RWY 09) Full Cycle**:
     - Scenario loads with `activeRunwayId: "09"`.
     - Arrivals spawn on DEM1 (`WN`/`WS`), descend via constraints to `WMERG`, accept radar vectors, intercept localizer 09 (`IDEM09`), capture GS (`IDEMGS09`), and land or execute missed approach to `MISSE`.
     - Departures spawn on RW09 threshold `(-1.645, 0)`, roll on heading 090°, check in on radio, climb via `BAY1` to `BAYEA` $\to$ `NORMA`/`OCTTA`, and hand off cleanly at TRACON boundary.
  3. **Session Setup Switching**:
     - Selecting KDEM East Flow in Session Setup restarts World with complete East Flow traffic behavior.
  4. **Full Test Suite & CI Validation**:
     - Run `npm test` and `npm run ci`, ensuring 100% pass across all unit, component, and integration suites.

## Out of scope

- Scoring or replay changes (Phase 5).
- Third airport additions.

## Acceptance criteria

- [ ] **AC1 —** West Flow (RWY 27) end-to-end simulation passes all arrival and departure phases.
- [ ] **AC2 —** East Flow (RWY 09) end-to-end simulation passes all arrival and departure phases.
- [ ] **AC3 —** Session Setup UI cleanly switches configurations and confirms restart.
- [ ] **AC4 —** All 116+ test files and 1200+ unit/integration tests pass with 0 failures (`npm test` exit code 0).
- [ ] **AC5 —** `npm run ci` passes cleanly with no lint or typecheck errors.

## Suggested files

- `src/scenario/dualRunwayIntegration.test.ts`
- `src/ui/session-setup.test.tsx`
