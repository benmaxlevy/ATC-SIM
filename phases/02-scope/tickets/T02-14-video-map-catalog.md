# T02-14 Video map catalog (per-airport JSON)

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-02
**Blocks:** T02-17
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

KDEM digital maps load from **`src/scenario/video-maps/<ICAO>/`**: one `catalog.json` plus one JSON file per video map. Range rings stay generated (DCB **RR**), not files. The PPI can show denser trainer linework (coast, downwind, class B stub) without OSM.

## Context

T02-02 inlined runway / localizer / coastline on `kdem.json`. STARS **MAPS** is a numbered list of facility video maps. `phases/_shared/non-goals.md`: no chart scrape, no OSM. Coordinates stay T00-04 **NM east/north of ARP**.

If this work already exists on a branch, land it — do not invent a second format.

## Research

Read **R07** (MAPS / video maps), **R12** (no OSM / tiles).

- Search: `STARS video maps CRC MAPS DCB`
- **Terms:** **video map**, **MAPS**, **range rings**. Not layers, tiles, GIS, coastline-from-OSM.
- Comment: analog CRC video-map set; trainer-authored JSON only.

## Scope

- Directory: `src/scenario/video-maps/<ICAO>/catalog.json` and `NNN-slug.json` per map.
- Catalog fields: `id`, `file`, `dcbNumber`, `dcbLabel`, `defaultOn`, `color` (`map` | `mapDim`), optional `role` (`runway` | `localizer` | `coastline`).
- Map feature types: `polyline`, `text`, `runway` (parametric slab), `localizerFeather` (parametric triangle).
- `kdem.json` `maps.videoMapSet` points at `KDEM`. Inline geometry may go away if the catalog supplies `role` maps.
- Existing DCB-lite **RWY / LOC / CST / RING** keep working (roles + generated rings).
- Extra default-on maps (downwind, class B stub, denser coast) draw dimmer than runway/loc.
- Loader throws on missing file / id mismatch. Tests without a canvas.

## Out of scope

- MAPS DCB submenu (T02-17). OSM, lat/lon map files, CIFP, real JFK maps, weather, numbered NAS map IDs (`221 J_RNAV`).

## Implementation notes

`import.meta.glob("./video-maps/*/*.json")` from `@scenario`. `parseDigitalMap` reads `loadedVideoMaps`. Do not `JSON.parse` inside `mapLayers.ts` (T02-02 AC). Rings: still `intervalNm` / `maxNm` on scenario maps.

## Acceptance criteria

- [ ] **AC1 —** `loadKdem().maps.videoMapSet === "KDEM"` and catalog ids include RWY, LOC, COAST plus at least one extra map.
- [ ] **AC2 —** Runway 27 / ILS 27 feather / coastline still match T02-02 geometry tests (parametric features or equivalent).
- [ ] **AC3 —** Extra default-on polylines appear in the map cache (unit test, no GPU).
- [ ] **AC4 —** Missing `video-maps/KJFK/catalog.json` throws.
- [ ] **AC5 —** `npm test` green. Scope keys still never emit Command IR.
- [ ] **AC6 — Research:** Comments say video map / MAPS, not tiles; “Not OSM.”

## Test plan

- Unit: catalog load, role → runway/loc/coast, extra strokes.
- Integration: existing mapLayers / renderScope tests.
- Manual: `npm run dev` — denser coast + downwind, not ring-only.

## Suggested files

- `src/scenario/video-maps/KDEM/*`
- `src/scenario/loadVideoMaps.ts`
- `src/scenario/videoMapTypes.ts`
- `src/scope/mapLayers.ts`
- `src/scope/renderScope.ts`
