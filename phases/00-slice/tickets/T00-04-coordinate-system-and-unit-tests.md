# T00-04 Coordinate system and unit tests

**Phase:** 00 Slice
**Priority:** P0
**Size:** M
**Depends on:** T00-03
**Blocks:** T00-05
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

World lateral positions are **nautical miles east/north** of a documented origin. Conversion to/from geodetic lat/lon is implemented and tested. This choice is **frozen**.

## Context

`phases/_shared/glossary.md` units: lateral NM, true north; altitude feet MSL; heading degrees `[0, 360)` with `360` → `0`.

`phases/_shared/architecture.md`: KDEM ARP is 0°N, 0°E in a local tangent plane **or** a real lat/lon with a documented origin — **this ticket must pick one**. Pick the following and do not bikeshed:

**Frozen choice:** local ENU tangent plane. Runtime world xy is **not** lat/lon.

## Scope

- Add `src/core/geo/coords.ts` (pure, DOM-free) and `src/core/geo/coords.test.ts`.
- Add `docs/COORDINATE-SYSTEM.md` documenting the frozen system, formulas, heading/canvas notes, and what phase 4 may change (new ARP, same functions).
- Re-export geo helpers from `@core`.
- Heading helper: `normalizeHeadingDeg(deg: number): number` → `[0, 360)`.
- Do not add wind, magnetic variation models, or ellipsoid (WGS84) Vincenty math.

## Out of scope

- Canvas **PPI** transforms (phase 2). You may **document** that canvas y is down so scope will flip north.
- Aircraft kinematics, Earth curvature for radar slant range.
- Storing positions as lat/lon in `World`.
- KDEM JSON (T00-05); tests may use 0°N, 0°E literals.

## Implementation notes

### Runtime types

```ts
/** Geodetic degrees, WGS84 spherical approximation. */
export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

/** Local ENU, origin = facility ARP. +x east, +y north, NM. */
export interface NmEastNorth {
  xNm: number;
  yNm: number;
}
```

Altitude is **not** on these types (feet MSL lives on the aircraft later).

### Origin

Default / KDEM origin: `{ latDeg: 0, lonDeg: 0 }`. Functions take `origin: LatLon` so phase 4 can pass a real ARP without rewriting callers.

### Formulas (spherical, 1 NM = 1 arc-minute of latitude)

```
yNm = (latDeg - origin.latDeg) * 60
xNm = (lonDeg - origin.lonDeg) * 60 * cos(origin.latDeg * π/180)
```

Inverse:

```
latDeg = origin.latDeg + yNm / 60
lonDeg = origin.lonDeg + xNm / (60 * cos(origin.latDeg * π/180))
```

At KDEM (`lat = 0`), `cos = 1`, so 1° latitude = 60 NM and 1° longitude = 60 NM. Use `Math.cos` of origin latitude, **not** the point latitude (local tangent plane, not equirectangular around the aircraft).

If `|origin.latDeg|` is 90°, throw a named error or `RangeError` (cos = 0). Not needed for KDEM; still guard it.

### Heading

- `0` = true north = +y.
- `90` = east = +x.
- `normalizeHeadingDeg(360) === 0`, `normalizeHeadingDeg(-90) === 270`.
- Use modulo that works for negatives: `((deg % 360) + 360) % 360`, then if result is `360` treat as `0` (it will not be after `%`).

### Docs

`docs/COORDINATE-SYSTEM.md` must state:

1. Runtime xy is `NmEastNorth`, never lat/lon in the sim tick.
2. True north = magnetic north at KDEM (mag var 0).
3. Display may show magnetic later; v1 true = magnetic at demo field (glossary).
4. PPI canvas conversion is phase 2; north-up means +y world → −y canvas.

## Acceptance criteria

- [ ] **AC1 —** `docs/COORDINATE-SYSTEM.md` exists and states ENU `xNm` east / `yNm` north, origin-parameterized, KDEM ARP 0°N 0°E.
- [ ] **AC2 —** At origin (0,0), `latLonToNm({ latDeg: 1, lonDeg: 0 })` is `{ xNm: 0, yNm: 60 }` within `1e-9` (Vitest).
- [ ] **AC3 —** At origin (0,0), `latLonToNm({ latDeg: 0, lonDeg: 1 })` is `{ xNm: 60, yNm: 0 }` within `1e-9` (Vitest).
- [ ] **AC4 —** Round-trip `latLonToNm` → `nmToLatLon` recovers the input lat/lon within `1e-10` deg for a point 5 NM east and 8 NM north of KDEM origin (Vitest).
- [ ] **AC5 —** `normalizeHeadingDeg(360) === 0`, `normalizeHeadingDeg(540) === 180`, `normalizeHeadingDeg(-90) === 270` (Vitest).
- [ ] **AC6 —** Geo modules import no `document` / `window` / React (file-level: they live under `src/core/geo/` and tests use Vitest `node` env).
- [ ] **AC7 —** `@core` re-exports `LatLon`, `NmEastNorth`, `latLonToNm`, `nmToLatLon`, `normalizeHeadingDeg`.

## Test plan

- Unit: `src/core/geo/coords.test.ts` (ACs 2–5).
- Integration: none.
- Manual: none.

## Suggested files

- `src/core/geo/coords.ts`
- `src/core/geo/coords.test.ts`
- `src/core/index.ts` (re-exports)
- `docs/COORDINATE-SYSTEM.md`
