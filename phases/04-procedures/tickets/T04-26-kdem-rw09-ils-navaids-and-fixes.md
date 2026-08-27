# T04-26 KDEM RW09 ILS, navaids, and fixes catalog data

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-24, T04-25
**Blocks:** T04-27
**Launch:** Implement this ticket only.

## Goal

Add complete, validated catalog fixtures for KDEM Runway 09 ILS approach, associated navaids (localizer, glideslope, markers), and navigation fixes into `src/scenario/data/kdem/`, enabling reciprocal East Flow instrument approaches.

## Context

KDEM currently only defines Runway 27 (`RW27` threshold at `0, 0`) and `ILS27`. The physical runway is 10,000 ft (~1.645 NM) long. `RW09` threshold is at `x = -1.645, y = 0`. To support bidirectional operations, KDEM requires full reciprocal catalog definitions for Runway 09.

`.cursor/rules/extensible-features.mdc` requires data-first catalogs: adding Runway 09 is done via JSON catalog data in `src/scenario/data/kdem/`, without introducing airport or runway conditionals into core loaders.

## Scope

- Add Runway 09 navigation fixes to `src/scenario/data/kdem/fixes.json`:
  - `FI09` (FAF for ILS 09 at `x = -7.645, y = 0`, GS intercept 2000 ft)
  - `WMERG` (West merge point for East Flow at `x = -11.645, y = 0`)
  - West STAR entry/intermediate fixes: `WNMAX` (-18.645, 12), `WNLBO` (-17.645, 7), `WNJOIN` (-13.645, 4); `WSMAX` (-18.645, -12), `WSLBO` (-17.645, -7), `WSJOIN` (-13.645, -4)
  - East departure gate fix `BAYEA` (2.355, 0) and transition waypoints `BAYNE` (6.355, 4.5), `BAYSE` (5.355, -6)
  - Missed approach fix `MISSE` (6.355, 6)
- Add Runway 09 ILS navaids to `src/scenario/data/kdem/ils.json`:
  - `IDEM09` (LOC antenna at `x = 0.20, y = 0`, course 090°, length 18 NM, beam half-width 2.5°)
  - `IDEMGS09` (GS antenna at `x = -1.465, y = -0.07`, 3.0° glidepath, TCH 50 ft)
  - `IDEMDME09` (DME at `x = 0.20, y = 0`, paired with `IDEM09`)
  - `OM09` (Outer marker at `x = -7.845, y = 0`)
  - `MM09` (Middle marker at `x = -2.195, y = 0`)
- Add `ILS09` approach procedure to `src/scenario/data/kdem/procedures.json`:
  - `id: "ILS09"`, `runway: "09"`, `courseDeg: 90`, `fafFixId: "FI09"`, `thresholdFixId: "RW09"`, `locNavaidId: "IDEM09"`, `gsNavaidId: "IDEMGS09"`, `missed: { headingDeg: 90, climbToFt: 3000, directFixId: "MISSE" }`
- Validate that `loadCatalog` correctly loads KDEM catalog with both ILS 27 and ILS 09 approaches, all navaids, and all fixes without errors.

## Out of scope

- SID and STAR route adjustments (T04-27).
- Scenario JSON and video maps (T04-28).
- UI session setup modifications (T05-14).

## Acceptance criteria

- [ ] **AC1 —** `fixes.json` contains `FI09`, `WMERG`, `WNMAX`, `WNLBO`, `WNJOIN`, `WSMAX`, `WSLBO`, `WSJOIN`, `BAYEA`, `BAYNE`, `BAYSE`, and `MISSE` with correct ENU NM coordinates.
- [ ] **AC2 —** `ils.json` contains `IDEM09` (LOC), `IDEMGS09` (GS), `IDEMDME09` (DME), `OM09`, and `MM09` matching Runway 09 geometry.
- [ ] **AC3 —** `procedures.json` contains `ILS09` with correct FAF, threshold, course, and missed approach specification.
- [ ] **AC4 —** `loadCatalog("KDEM")` parses cleanly and contains both `ILS27` and `ILS09` approaches and all associated navaids.
- [ ] **AC5 —** Existing KDEM tests and `loadCatalog` unit tests continue to pass with zero regressions.
- [ ] **AC6 —** Automated tests cover AC1–AC5.

## Suggested files

- `src/scenario/data/kdem/fixes.json`
- `src/scenario/data/kdem/ils.json`
- `src/scenario/data/kdem/procedures.json`
- `src/scenario/procedures/loadCatalog.test.ts`
- `src/scenario/procedures/kdemCatalog.test.ts`
