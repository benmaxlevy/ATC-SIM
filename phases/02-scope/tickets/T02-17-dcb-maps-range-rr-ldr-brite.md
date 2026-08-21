# T02-17 DCB MAPS, RANGE/CNTR, RR, LDR, CHAR SIZE, BRITE

**Phase:** 02 Scope
**Priority:** P0
**Size:** L
**Depends on:** T02-14, T02-16, T02-05, T02-06
**Blocks:** T02-21
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Trainer-safe **DCB functions** beyond the T02-16 grid: numbered **MAPS** from the video-map catalog, **RANGE / OFF CNTR**, **RR** interval, **LDR DIR** (and length if T02-19 has landed), **CHAR SIZE**, **BRITE**. All mutate **scope display state** only.

## Context

T02-16 is the cell look. This ticket fills STARS-like *jobs* without cloning NAS. Catalog from T02-14 is the MAPS source (`dcbNumber` / `dcbLabel`). Rings stay generated.

## Research

Read **R07** DCB RANGE / MAPS / RR / LDR / BRITE / CHAR SIZE.

- Search: `STARS DCB RANGE OFF CNTR PLACE RR LDR DIR CHAR SIZE BRITE`
- **Terms:** **range**, **MAPS**, **range rings**, **leader**, **datablock** size. Not zoom, layers, brightness slider (BRITE is discrete steps).
- Comment per cell: analog + trainer delta.

## Scope

- **RANGE** + **PLACE CNTR / OFF CNTR:** RANGE cycles presets. OFF CNTR when view center ≠ airport. PLACE CNTR: next PPI click (or existing double-click / End) sets center; document in F1. No zoom-to-cursor.
- **RR n / RR CNTR / PLACE RR:** interval among a small frozen set (e.g. 2 / 5 / 10 NM). Rings still about **airport ref**, not the view center, unless you add an explicit RR CNTR trainer flag default **off** (airport). Do not make rings follow the mouse.
- **MAPS:** opening the MAPS cell shows numbered catalog buttons (`1 RWY27`, `3 COAST`, …). Toggle `defaultOn` / visibility per `LoadedVideoMap.id`. Role maps stay wired to RWY/LOC/CST if those cells remain; do not duplicate toggles. Extra maps (downwind, class B) are MAPS entries, not OSM.
- **LDR DIR** + length: cell shows current default / selected-track leader (L1–L9). Clicking opens 1–9 (same as scope-focus `L`+digit). Length: if T02-19 exists, expose 2–3 discrete px lengths; else direction only.
- **CHAR SIZE:** 2 or 3 datablock / DCB font sizes, still **IBM Plex Mono** (or system mono). Not a STARS face.
- **BRITE:** 2–4 map stroke brightness steps (multiply or swap between `map` / `mapDim` / a third hex). Not a continuous slider. Does not recolor tracks.
- **PTL / HIST / FILTER** already latch from T02-16 — do not regress.
- Clicks never emit Command IR. Radio-focus `L090` still a left turn.

## Out of scope

- WX mosaic, SITE FUSED, PREF sets, SHIFT, CSA, CRDA, FMA, dual FSL/EFSL, real video-map IDs (`221 J_RNAV`), licensed STARS font, weather.

## Implementation notes

Store MAPS on/off on `ScopeView` keyed by map id (do not put it on `Aircraft`). Rebuild map cache when MAPS/RR/BRITE change. CHAR SIZE updates `datablockCellWidthPx` measurement.

## Acceptance criteria

- [ ] **AC1 —** MAPS submenu lists catalog `dcbLabel`s; toggling COAST hides coastline strokes; toggling an extra map hides its polylines.
- [ ] **AC2 —** RANGE presets unchanged; OFF CNTR appears iff pan offset ≠ airport (unit test on camera).
- [ ] **AC3 —** RR interval change alters `activeRingRadiiNm` (unit test).
- [ ] **AC4 —** LDR DCB sets the same leader dirs as L1–L9; radio-focus `L090` still parses.
- [ ] **AC5 —** CHAR SIZE has ≥2 sizes; font stack still Plex/system mono (grep: no STARS .ttf).
- [ ] **AC6 —** BRITE has ≥2 steps; track/datablock colors unchanged.
- [ ] **AC7 —** No Command IR from these cells.
- [ ] **AC8 — Research:** MAPS/RANGE/leader/range rings in comments; not zoom/layers.

## Test plan

- Unit: map visibility, RR intervals, leader dir from DCB helper.
- Integration: `scopeKeys.routing.test.ts` still green.
- Manual: MAPS off/on extra maps; BRITE dimmer maps.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/scope/scopeView.ts`
- `src/scope/mapLayers.ts`
- `src/scope/leader.ts`
- `src/scope/fonts.ts`
- `src/ui/ScopeHelpOverlay.tsx`
