# Coordinate system (frozen)

Runtime world lateral position is a **local east-north-up (ENU) tangent plane**. Simulation state stores `NmEastNorth`, never geodetic lat/lon, on the tick.

| Axis | Meaning |
| --- | --- |
| `xNm` | Nautical miles **east** of the facility ARP |
| `yNm` | Nautical miles **north** of the facility ARP |
| Altitude | Feet MSL on the aircraft (not on these types) |

Helpers live in `src/core/geo/coords.ts` and are re-exported from `@core`. Every conversion takes an `origin: LatLon` so a later facility can pass a real ARP without rewriting callers.

## Origin

**KDEM (Demo Field) ARP:** `{ latDeg: 0, lonDeg: 0 }` (0°N, 0°E).

Phase 4 may load a real airport reference point. Use the same `latLonToNm` / `nmToLatLon` functions with a different `origin`. Do not change the runtime representation.

## Formulas (spherical)

1 NM = 1 arc-minute of latitude. East scale uses **origin** latitude, not the point (local tangent plane, not equirectangular around the aircraft). Not WGS84 Vincenty.

```
yNm = (latDeg - origin.latDeg) * 60
xNm = (lonDeg - origin.lonDeg) * 60 * cos(origin.latDeg * π/180)
```

Inverse:

```
latDeg = origin.latDeg + yNm / 60
lonDeg = origin.lonDeg + xNm / (60 * cos(origin.latDeg * π/180))
```

At KDEM (`lat = 0`), `cos = 1`, so 1° of latitude or longitude is 60 NM. Origins at `|latDeg| >= 90` (poles) throw `RangeError` because `cos` is 0.

## Heading

True heading, degrees in `[0, 360)` via `normalizeHeadingDeg`:

- `0` = true north = **+y**
- `90` = east = **+x**
- `360` → `0`; negatives wrap (`-90` → `270`)

## Magnetic variation

At KDEM, magnetic variation is **0°**, so **true north = magnetic north**. Display may show magnetic later; v1 true = magnetic at the demo field (glossary).

## Canvas / PPI (phase 2)

This ticket does not convert world NM to pixels. North-up PPI means **+y world → −y canvas** (canvas y is down). Phase 2 owns that transform.

## Out of scope here

Wind, magnetic variation models, ellipsoid (Vincenty), Earth curvature for radar slant range, and storing `World` positions as lat/lon.
