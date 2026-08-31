# T02-69 WX VIP Paint Under Tracks

**Phase:** 02 Scope (WX mosaic addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-68
**Blocks:** T02-70, T02-71
**Launch:** After T02-68 is merged to `feature/wx-mosaic`.

## Goal

Paint enabled WX VIP fills beneath tracks while preserving KDEM's unchanged default view. Use T02-68's fetched, decoded, and binned mosaic state; do not decode weather or fetch data during rendering.

## Context

This is the Twenty-first swarm: live IEM CONUS NEXRAD N0Q mosaic, binned to STARS VIP 1–6, display-only. IEM only: `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi` `GetMap`; no RainViewer default, GRIB, OSM, or paid weather API.

T02-68 owns one transparent WMS PNG for `scenario.arp`, covering approximately ±80 NM at 256–512 px, `EPSG:4326`, `TRANSPARENT=TRUE`, fetched through Vite `/wx-iem` proxy. Refresh is approximately 5 minutes; pan inside the padded area does not refetch. Fetch failure is an empty overlay; boot never waits. KDEM ARP `{ latDeg: 0, lonDeg: 0 }` yields an empty CONUS mosaic, correctly. Never add `if (icao === "KDEM")`.

VIP breaks remain data, not hardcoded airport behavior. Trainer split follows JO 7110.65 light `<30`, moderate `30–40`, heavy `40–50`, extreme `>50` dBZ, divided into six STARS buttons. Suggested default is `wxVipBreaksDbz: [18, 30, 36, 41, 46, 51]`; level 1 starts at 18 to drop clear-air. JO 7110.65 supplies 30/40/50; extra splits are trainer choices. Do not invent per-facility bins.

T02-68 decodes IEM N0Q RGB→dBZ and creates six VIP masks. T02-69 composites enabled masks for display only. DCB stays disabled until T02-70. Preview `*WX` is T02-71. BRITE WX/WXC is T02-72.

## Research

- Existing `renderScope`, `drawMapLayers`, `drawTracks`, offscreen-canvas, and `applyBrite` paths.
- T02-68 weather state and mask coordinate contract.
- Existing `view.brite.wx` storage and whether it can be applied without enabling BRITE UI.
- Existing render tests and their OSM guard expectations.
- `phases/_shared/non-goals.md` weather-mosaic restriction and phase-2 addendum boundary.

## Scope

- Add `src/scope/weatherLayer.ts` (or a name matching T02-68's weather module).
- Call weather rendering from `renderScope` after `drawMapLayers` and before `drawTracks`.
- Composite enabled VIP masks into an offscreen canvas. Per frame, make one `drawImage` call for the pre-composited result; do not decode, bin, parse JSON, or rebuild geometry each animation frame.
- Use trainer STARS-like fills, not IEM's NWS rainbow. Apply stored `view.brite.wx` through existing `applyBrite` only when this is possible without enabling BRITE UI. If BRITE UI remains a no-op, still apply stored `view.brite.wx`, default `100`.
- Update greps/guards so weather paint terms are allowed only in weather module:
  - `drawImage`, `nexrad`, `mosaic`, and `drawWeather` may appear in the weather module.
  - Keep OSM/openstreetmap bans in `renderScope.ts`, `DisplayControlBar.tsx`, and `ScopeCanvas.tsx`.
- Amend precisely `src/scope/renderScope.test.ts`, `src/ui/dcbAddendumAcceptance.test.ts`, and `src/ui/tcwVisualAcceptance.test.ts` where current paint guards reject the intended weather layer. Do not delete OSM guards.
- Lift `phases/_shared/non-goals.md`'s weather-mosaic prohibition that says weather waits for a phase 4 ticket. This phase-2 addendum is the explicit lift. Phase 4 README historical references may remain; T02-72 owns README tables.
- Add tests that set `view.wxLevels` directly while DCB remains disabled. Prove all-off paints nothing, one enabled level draws, default levels are off, and OSM remains absent.

## Out of scope

- IEM fetch, RGB→dBZ decoding, VIP binning, refresh policy, or `vipAtNm`; T02-68 owns those.
- DCB latch or enabling WX controls; T02-70 owns it.
- Preview `*WX`; T02-71 owns it.
- BRITE WX/WXC controls; T02-72 owns them.
- WXC contours, BKC, SSA WX/WX HIST, AVL 2×3 restyle, weather history, wind, or aircraft deviation.
- Steering aircraft or changing world state. Display remains display-only.
- OSM, GRIB, RainViewer, paid weather APIs, mercator tile pyramids, or live network access in CI.
- Per-facility bins or KDEM-specific logic.
- Any render-loop JSON parsing or uncached geometry rebuild.

## Implementation notes

- Preserve all-off behavior so KDEM look stays unchanged by default.
- Rebuild the offscreen composite only when mosaic data, enabled levels, trainer fills, or relevant BRITE value changes; render loop draws cached output.
- Keep geographic-to-canvas placement consistent with T02-68's bounds and scope transform.
- Ensure transparent/empty mosaics produce no visible draw.
- Keep weather code isolated enough that paint greps cannot become a backdoor for OSM/basemap additions.
- Use the existing `applyBrite` path where compatible; do not turn on BRITE controls as part of this ticket.
- 30-track/60 FPS envelope: cache geometry and composites; no JSON.parse per frame; no WebGL.

## Acceptance criteria

- [ ] **AC1 —** `renderScope` paints weather after maps and before tracks.
- [ ] **AC2 —** All six WX levels default off and all-off rendering makes no weather draw call, preserving KDEM's default appearance.
- [ ] **AC3 —** Enabling one level through direct `view.wxLevels` state produces the expected trainer fill from T02-68's mask; DCB remains disabled.
- [ ] **AC4 —** Weather render loop performs one `drawImage` from a cached, pre-composited offscreen canvas and does not decode, fetch, parse JSON, or rebuild geometry per frame.
- [ ] **AC5 —** Stored `view.brite.wx` is applied through existing `applyBrite` when available without enabling BRITE UI; default value remains `100`.
- [ ] **AC6 —** Weather paint greps are confined to weather module; OSM/openstreetmap guards remain in `renderScope.ts`, `DisplayControlBar.tsx`, and `ScopeCanvas.tsx`.
- [ ] **AC7 —** Existing forbidden-file tests are amended precisely, with no deleted OSM guard, and weather tests prove all-off, one-on, default-off, and no-OSM behavior.
- [ ] **AC8 —** `phases/_shared/non-goals.md` no longer forbids this phase-2 weather mosaic addendum, while unrelated non-goals remain intact.
- [ ] **AC9 —** Weather remains display-only, has no KDEM/facility branch, and does not steer aircraft.
- [ ] **AC10 —** Typecheck, lint, formatting, and test suite pass within the 30-track/60 FPS envelope.

## Test plan

- Unit/render: all-off and one-level-on weather paint using synthetic masks.
- Render ordering: maps, weather, then tracks.
- Cache/performance: assert cached composite reuse and no per-frame decode, JSON parse, or geometry rebuild.
- BRITE: stored WX intensity applies without enabling BRITE UI.
- Guard acceptance: `renderScope`, DCB, and TCW tests retain OSM bans while allowing isolated weather module code.
- Non-goal documentation: verify only phase-2 weather prohibition is lifted.
- Regression: `npm run ci`.

## Suggested files

- `src/scope/weatherLayer.ts` (or the weather module established by T02-68)
- `src/scope/renderScope.ts`
- `src/scope/renderScope.test.ts`
- `src/ui/dcbAddendumAcceptance.test.ts`
- `src/ui/tcwVisualAcceptance.test.ts`
- `src/ui/DisplayControlBar.tsx`
- `src/ui/ScopeCanvas.tsx`
- `phases/_shared/non-goals.md`
- Relevant weather/render tests
