# T04-28 KDEM RW09 video maps and playable scenarios

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-27
**Blocks:** T04-29, T05-14
**Launch:** Implement this ticket only.

## Goal

Add video maps for KDEM Runway 09 (LOC09 feather, RWY09 downwind pattern, dual-ended runway display) and author discrete playable scenarios for East Flow (`kdem-09`, `kdem-ils09`) registered in the playable scenario inventory.

## Context

Video maps provide radar scope background geometry for controllers. Currently KDEM video maps draw Runway 27 threshold and LOC 27 feather. For bidirectional operation, the scope should show both runway ends (`RWY 09/27`), and have selectable/default maps for LOC 09 and East Flow downwind.

Additionally, playable inventory needs versioned scenario entries for `kdem-09` (East Flow default) and `kdem-ils09` (East Flow ILS benchmark), with configuration metadata (`configLabel`, `activeRunwayId`).

## Scope

- In `src/scenario/video-maps/KDEM/`:
  - Update `001-rwy27.json` (or add `001-runways.json`) to define both runway ends `27` and `09` along the 10,000 ft centerline.
  - Add `008-loc09.json`: localizer feather for `09` (course 090°, 10 NM feather length, 2.5° half-width from RW09 threshold).
  - Add `009-downwind09.json`: East Flow downwind vector pattern north of centerline.
  - Update `catalog.json` video map catalog with appropriate entries, DCB button numbers, and roles.
- Create `src/scenario/kdem-09.json`:
  - `id: "KDEM"`, `name: "Demo Field (RWY 09)"`, `icao: "KDEM"`, `activeRunwayId: "09"`.
  - `runways`: `[{ id: "09", headingTrueDeg: 90, headingMagDeg: 90, lengthFt: 10000, thresholdLatLon: { latDeg: 0, lonDeg: 0 } }]`.
  - `approaches`: `[{ id: "ILS09", runwayId: "09", type: "ILS" }]`.
  - `spawns`: Downwind spawn for RW09.
  - `giTextLines`: `["ATIS A", "RWY 09", "ILS 09 IN USE", "", "", "", "", "", "", ""]`.
- Create `src/scenario/kdem-ils09.json`:
  - Direct ILS 09 vector benchmark scenario mirroring `kdem-ils27.json`.
- In `src/scenario/playable-scenarios.json` and `src/scenario/playableScenarios.ts`:
  - Add `kdem-09` (`airportIcao: "KDEM"`, `label: "Demo Field — East Flow (RWY 09)"`, `configLabel: "East Flow (RWY 09)"`, `activeRunwayId: "09"`, `default: false`, `source: "scenarios/kdem-09"`).
  - Update `kdem` entry with `configLabel: "West Flow (RWY 27)"`, `activeRunwayId: "27"`.
  - Add `kdem-ils09` (`sessionSetupVisible: false`, `source: "scenarios/kdem-ils09"`).
  - Validate scenario source loading and inventory listing.

## Out of scope

- Traffic spawning adjustments (T04-29).
- Session setup UI dual-dropdown component (T05-14).

## Acceptance criteria

- [ ] **AC1 —** Video maps include runway definition showing 09 and 27, LOC 09 feather, and RWY 09 downwind.
- [ ] **AC2 —** `kdem-09.json` and `kdem-ils09.json` validate against scenario schema with `activeRunwayId: "09"`.
- [ ] **AC3 —** `listPlayableScenarios()` includes `kdem` (West Flow) and `kdem-09` (East Flow) with valid metadata.
- [ ] **AC4 —** `loadPlayableScenario("kdem-09")` loads the validated East Flow scenario cleanly.
- [ ] **AC5 —** Automated tests cover AC1–AC4.

## Suggested files

- `src/scenario/video-maps/KDEM/catalog.json`
- `src/scenario/video-maps/KDEM/008-loc09.json`
- `src/scenario/video-maps/KDEM/009-downwind09.json`
- `src/scenario/kdem-09.json`
- `src/scenario/kdem-ils09.json`
- `src/scenario/playable-scenarios.json`
- `src/scenario/playableScenarios.ts`
- `src/scenario/playableScenarios.test.ts`
