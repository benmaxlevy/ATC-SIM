# T02-24 DCB MAPS 1–30, quick 1–6, WX disabled

**Phase:** 02 Scope (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-22, T02-14
**Blocks:** T02-29
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

MAIN has six **quick map toggles** (catalog 1–6) plus a **MAPS** submenu with slots **1–30**, **CLR ALL**, and **GEO MAPS** / **CURRENT** on-PPI lists. **WX1–WX4** exist on MAIN and are **disabled**. No precipitation, mosaic, or OSM.

## Context

T02-17 MAPS lists the KDEM catalog (~6 maps) and keeps RWY/LOC/CST role shortcuts. CRC has 30 numbered slots and weather cells. We have six authored maps (`dcbNumber` 1–6 in `video-maps/KDEM/catalog.json`). Empty 7–30 stay disabled. User freeze: weather buttons exist and cannot be pressed.

## Research

Read **R07** MAPS / GEO MAPS / CURRENT. **R06** / **R12**: no weather mosaic, no OSM.

- Search: `STARS DCB MAPS GEO MAPS CURRENT WX`
- **Terms:** **MAPS**, **video map**, **WX**. Not layers, basemap, radar weather.
- Comment: analog CRC numbered maps; trainer catalog only; WX disabled chrome.

## Scope

- MAIN: replace RWY/LOC/CST shortcut cells with **map 1–6** toggles (`dcbNumber` + `dcbLabel`, e.g. `1 RWY27`). Toggling a role map still flips `showRunway` / `showLocalizer` / `showCoastline` when that catalog row has that role.
- **MAPS** submenu (replaces bar, T02-22):
  - **DONE**
  - **CLR ALL** — all catalog maps off (coastline no-op if JSON `enabled: false`)
  - Slots **1–30** — bind to catalog `dcbNumber` when present; **missing numbers are disabled empty cells**, not invented OSM geometry
  - **GEO MAPS** — toggle an on-PPI list of every catalog map (id/label + on/off)
  - **CURRENT** — toggle an on-PPI list of maps that are currently on
- Lists are screen-fixed (SSA-like), map-green mono, must not steal empty-PPI deselect incorrectly. No HTML `<select>`.
- MAIN **WX1 WX2 WX3 WX4** (or `WX 1`…): visible, disabled, no weather state, no draw calls. Update T02-21 greps that forbade the letters `WX` — allow disabled WX cells; still forbid OSM / mosaic / precipitation drawing.
- Clicks never emit Command IR.

## Out of scope

- Painting NEXRAD / VIP / precipitation. Wind barbs. Real NAS map IDs (`221 J_RNAV`). Filling 7–30 with fake coastlines. CRDA.

## Implementation notes

Reuse `toggleVideoMap` / `mapVisibility`. CLR ALL is a loop over catalog ids. GEO/CURRENT can be a small `buildMapListLines(view)` helper (pure strings) plus a canvas or DOM overlay consistent with T02-20 lists.

## Acceptance criteria

- [ ] **AC1 —** MAIN shows six quick toggles matching catalog 1–6 labels; toggling COAST hides coastline strokes.
- [ ] **AC2 —** MAPS submenu has 30 slots; 7–30 (or any unused number) are disabled; 1–6 toggle the same visibility map as the quick cells.
- [ ] **AC3 —** CLR ALL sets every catalog map off (coastline respects `enabled: false`).
- [ ] **AC4 —** GEO MAPS list lists all catalog labels; CURRENT lists only maps that are on; both toggle off with a second click or DONE.
- [ ] **AC5 —** WX1–WX4 are in the MAIN DOM, disabled, and produce no weather draw / no Command IR.
- [ ] **AC6 —** No OSM / tile / precipitation strings in renderer. Radio `DAL123 H270` still works.
- [ ] **AC7 — Research:** MAPS/video map/WX comments; not layers/basemap.

## Test plan

- Unit: visibility map, CLR ALL, list builders, unused slots disabled.
- Integration: DCB markup; WX buttons `disabled`; heading command still green.
- Manual: none required.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/scope/dcbFunctions.ts`
- `src/scope/scopeView.ts`
- `src/scope/renderScope.ts` (list overlay, if canvas)
- `src/ui/tcwVisualAcceptance.test.ts`
- `src/scenario/video-maps/KDEM/catalog.json` (read only unless a label is wrong)
