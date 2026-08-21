# T02-02 Map layers runway loc and rings

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-01, T00-05
**Blocks:** T02-10, T02-12, T02-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

KDEM paints as a **digital video map**: runway 27, ILS 27 localizer feather, range rings, optional coastline polyline from scenario JSON — green on black, not a GIS basemap.

## Context

STARS-like scopes show sparse facility maps, not OSM. Geometry is authored in KDEM JSON (T00-05). Do not scrape charts (`phases/_shared/non-goals.md`). Camera from T02-01 converts NM → pixels. Palette from `phases/02-scope/README.md` (map `#00AA00`, rings `#006600`).

## Research

Read **R04** (STARS as terminal automation / maps), **R07** (CRC map layers, localizer, rings), **R12** (do not copy OSM/satellite).

- Open: https://docs.virtualnas.net/crc/stars/ — **maps** / video map / localizer.
- Search: `STARS video map localizer feather range rings CRC`
- **Terms:** **digital map** / **video map**, **localizer feather**, **range rings**. Not basemap, GIS, ILS triangle, minimap.
- Feather geometry is a *trainer drawing* of an approach course, not a TERPS obstacle surface. Do not scrape plates (**R11** is procedures later, not map art).
- Negative example: if a web ATC sim draws Mapbox tiles, that is the look we are avoiding.

## Scope

- Extend KDEM scenario JSON with a `maps` object. Preserve existing spawn/airport fields.

Suggested shape (adapt names to T00-05 style; keep units NM east/north of the frozen origin unless T00-04 is lat/lon — then convert once when loading):

```json
"maps": {
  "runway": {
    "id": "27",
    "thresholdEastNm": 0,
    "thresholdNorthNm": 0,
    "lengthNm": 1.5,
    "headingTrueDeg": 270,
    "widthNm": 0.025
  },
  "localizer": {
    "runwayId": "27",
    "courseTrueDeg": 270,
    "featherLengthNm": 10,
    "halfWidthDeg": 2.5
  },
  "rangeRings": {
    "intervalNm": 5,
    "maxNm": 60
  },
  "coastline": {
    "enabled": true,
    "polyline": [[-8.0, 3.0], [-2.0, 1.0], [4.0, 2.5]]
  }
}
```

- **Runway:** filled or stroked rectangle (or two edge lines + threshold). Align to heading 270. Visually readable at 20 NM and 5 NM.
- **Localizer feather:** isosceles triangle or two diverging rays from the approach end, 10 NM long, ±2.5° from course **090° inbound / 270° outbound** as appropriate: the feather lies on the **approach** side of rwy 27 (east of the field, aircraft inbound heading 270). Unit-test the three corners in NM.
- **Range rings:** concentric circles about **airport ref** (not view center) at 5 NM intervals, only those with radius ≤ current camera range (and at least the 5 NM ring when range is 5). Stroke map-dim green. Do not draw a ring at 0.
- **Coastline:** optional polyline; if `enabled: false` or missing, skip. Fictional; label in JSON comment / README that it is not a real shoreline.
- Layer visibility flags on `ScopeView`: `showRunway`, `showLocalizer`, `showRings`, `showCoastline` (all default true except coastline follows JSON `enabled`).
- Cache `Path2D` (or equivalent) and rebuild on range/center/resize/layer toggle — **not** every rAF by reallocating map JSON.
- Clip to the range circle from T02-01.
- No map labels required except optional tiny `27` at the runway (monospace, map-green). No navaid names.

## Out of scope

- DCB-lite toggles (T02-10 can bind to flags you add here).
- Real CIFP, geojson coast of a real state, map editor, brightness menus, sidesteps, taxiways, buildings.
- Web Mercator tiles.

## Implementation notes

- Pure `buildLocalizerFeather(runway, loc): [NmPoint, NmPoint, NmPoint]` for tests.
- Rings about airport ref: when the view is panned, rings move on screen with the field — correct.
- Stroke width: 1 CSS px for rings, 1–2 px for runway. Do not scale stroke with range (hairlines that vanish at 60 NM are OK; runway should remain a visible sliver).
- Invalid JSON (missing runway): boot with rings only and `console.warn` once; do not crash the tick.

## Acceptance criteria

- [ ] **AC1 —** Given KDEM at 20 NM centered on airport, when the PPI paints, then a runway aligned ~270° is visible at the center and a localizer feather extends **east** of the field (~10 NM).
- [ ] **AC2 —** Automated: feather vertices are 10 NM from the defined origin along course ±2.5° (tolerance 0.05 NM).
- [ ] **AC3 —** Given range 20 NM, rings at 5, 10, 15, 20 NM are drawn about the airport; no 25 NM ring. Given range 5 NM, only the 5 NM ring.
- [ ] **AC4 —** Given `coastline.enabled: false`, no coastline stroke. Given `true` with ≥2 points, the polyline is visible in map green.
- [ ] **AC5 —** Toggling `showLocalizer` off removes the feather without affecting the runway.
- [ ] **AC6 —** Maps do not parse as OSM/geo tiles; draw uses only scenario JSON + camera.
- [ ] **AC7 —** Automated: `buildMapCache` / draw preparation is not invoked from `stepWorld`. A render-loop test or spy asserts map path rebuild happens on camera change, not on every physics step.
- [ ] **AC8 — Research:** UI/settings use **map** / **localizer** / **rings**, not “terrain” or “OSM.” Comment cites CRC video maps + trainer-authored JSON.

## Test plan

- Unit: feather geometry, which ring radii are active for each preset, JSON defaulting.
- Integration: scenario load includes `maps`.
- Manual: pan off-airport; rings stay glued to KDEM; feather still points at rwy 27.

## Suggested files

- `src/scenario/kdem.json` (maps extension)
- `src/scope/mapLayers.ts`
- `src/scope/mapLayers.test.ts`
- `src/scope/renderScope.ts`
- `src/scope/palette.ts`
