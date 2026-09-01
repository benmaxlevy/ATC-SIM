# T02-87 Compass Rose Geometry, Ticks, and Map Cache

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** None
**Blocks:** T02-88, T02-89
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Implement the mathematical geometry generator and map cache structures for the STARS Compass Rose overlay: outer ring, radial tick marks (5° minor, 10° medium, 30° major), and 3-digit heading numeral labels (`360`, `030`, `060`, `090`, `120`, `150`, `180`, `210`, `240`, `270`, `300`, `330`).

## Context

On FAA STARS TCW displays (docs.virtualnas.net/crc/stars — R07 and FAA 7110.65):
- The **Compass Rose** is a circular navigation aid centered on the radar antenna / range ring origin (or scope viewport) used by controllers to quickly judge headings when vectoring aircraft.
- It displays:
  - An outer circular ring at the outermost range ring / radar scope radius.
  - Minor radial tick marks every 5° (short ticks inward).
  - Medium radial tick marks every 10° (medium ticks inward).
  - Major radial tick marks every 30° (longer ticks inward).
  - 3-digit heading text labels every 30° (`360`, `030`, `060`, `090`, `120`, `150`, `180`, `210`, `240`, `270`, `300`, `330`) positioned just inside or along the major ticks.

## Scope

- **`src/scope/compassRose.ts`**:
  - Export types: `CompassRoseTick`, `CompassRoseLabel`, `CompassRoseGeometry`.
  - Export `generateCompassRoseGeometry(origin: ScreenPoint, radiusPx: number)`:
    - 72 tick marks from 0° to 355° in 5° steps.
    - 5°: Minor tick length (e.g. 4px inward).
    - 10°: Medium tick length (e.g. 8px inward).
    - 30°: Major tick length (e.g. 14px inward) + 3-digit label (`"360"`, `"030"`, `"060"`, `"090"`, `"120"`, `"150"`, `"180"`, `"210"`, `"240"`, `"270"`, `"300"`, `"330"`).
    - Label position centered radially inside the major tick line (e.g. offset by ~22px inward).
- **`src/scope/scopeView.ts`**:
  - Add `showCompassRose: boolean` (default: `true`) to `ScopeView` and `createScopeView`.
- **`src/scope/mapLayers.ts`**:
  - Add `showCompassRose?: boolean` to `MapCacheView`, `MapCacheInput`, and `MapLayerFlags`.
  - In `buildMapCache`, compute `compassRose: CompassRoseGeometry | null` when `layers.showCompassRose !== false` and `layers.showRings`.
  - Include `compassRosePath: Path2D | null` and `compassRoseLabels: CompassRoseLabel[]` in `MapCache`.
  - Update `buildMapCacheKey` to include `layers.showCompassRose`.
- **`src/scope/index.ts`**:
  - Export all new compass rose types and helper functions.

## Out of scope

- Direct canvas stroke rendering (handled in T02-88).
- Final end-to-end acceptance suite (handled in T02-89).

## Acceptance criteria

- [ ] **AC1 —** `generateCompassRoseGeometry` produces 72 accurate 5°/10°/30° radial ticks and twelve 3-digit heading labels (`360`..`330`).
- [ ] **AC2 —** `MapCache` and `buildMapCache` correctly construct and cache compass rose tick geometry and label coordinates.
- [ ] **AC3 —** `ScopeView` provides `showCompassRose: boolean` defaulting to `true`.
- [ ] **AC4 —** Unit tests verify trigonometric accuracy, tick lengths, label angles, and cache invalidation.

## Test plan

- Unit: `src/scope/test/compassRose.test.ts` (test geometry generation, angle conversion, and label offsets).
- Cache: `src/scope/test/mapLayers.test.ts` (test map cache key generation and compass rose cache data).
