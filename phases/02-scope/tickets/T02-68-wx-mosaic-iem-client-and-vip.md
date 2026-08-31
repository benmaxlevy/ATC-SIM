# T02-68 WX Mosaic IEM Client & VIP Bins

**Phase:** 02 Scope (WX mosaic addendum)
**Priority:** P0
**Size:** M
**Depends on:** None (phase 2 shipped)
**Blocks:** T02-69
**Launch:** Implement this ticket only.

## Goal

Add live IEM CONUS NEXRAD N0Q mosaic fetch and decode state, binned into six STARS VIP levels, without painting the PPI. Keep weather display-only, disabled by default, and safe when the network is unavailable.

## Context

This is the Twenty-first swarm: live IEM CONUS NEXRAD N0Q mosaic, binned to STARS VIP 1–6, display-only. IEM is the only weather source: `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi` through WMS `GetMap`. Do not use RainViewer, GRIB, OSM, or paid weather APIs.

Fetch one transparent PNG for `scenario.arp` covering approximately ±80 NM, using 256–512 px, `EPSG:4326`, and `TRANSPARENT=TRUE`. Use Vite `server.proxy` at `/wx-iem` to reach `mesonet.agron.iastate.edu`; never route weather through `speech-api`. Refresh approximately every 5 minutes. Panning inside the padded area must not refetch. Fetch failure produces an empty overlay; boot never waits for weather.

KDEM ARP is `{ latDeg: 0, lonDeg: 0 }`, so its CONUS mosaic is empty. That is correct. Fetch by `scenario.arp`; do not add `if (icao === "KDEM")`.

VIP breaks are data, not airport logic. Use trainer splits of JO 7110.65: light `<30`, moderate `30–40`, heavy `40–50`, extreme `>50` dBZ, divided into six STARS buttons. Suggested default: `wxVipBreaksDbz: [18, 30, 36, 41, 46, 51]`; level 1 starts at 18 to drop clear-air. Cite JO 7110.65 for 30/40/50; extra splits are trainer choices. Do not invent per-facility bins.

Decode IEM N0Q RGB values through a documented RGB→dBZ color-ramp table, then produce six VIP masks. T02-68 does not paint trainer fills. `drawImage` belongs later in `weatherLayer.ts` under T02-69. CI must never hit the network; use a fixture PNG under `testdata/wx/`.

## Research

- IEM OGC WMS N0Q `GetMap`: endpoint, supported parameters, image format, transparent output, and geographic CRS.
- IEM NEXRAD composite color-map documentation: N0Q RGB ramp and dBZ mapping.
- FAA JO 7110.65: weather intensity terms and 30/40/50 dBZ boundaries.
- Existing `ScopeView`, scenario ARP, Vite proxy, and map-coordinate conversion paths.
- Terms: WX, VIP, mosaic, NEXRAD, N0Q. This is not a basemap and not OSM.

## Scope

- Add a weather module, such as `src/scope/wx/` or `src/scope/weather/`, containing:
  - IEM WMS client and request construction.
  - Documented N0Q RGB→dBZ ramp table.
  - Generic `binVip` implementation using data-provided breaks.
  - `WxMosaic` data, such as `{ westLon, southLat, eastLon, northLat, vipMasks, fetchedAtMs }`.
  - Empty and fetch-failure results.
- Fetch bbox from `scenario.arp`, padded approximately ±80 NM. Keep refresh and in-pad pan behavior explicit.
- Add `ScopeView.wxLevels: [false, false, false, false, false, false]` with all levels off by default.
- Add `vipAtNm(mosaic, xNm, yNm, arp)` for a later deviate ticket. Implement and unit-test it; leave it unused by pilots and aircraft logic.
- Add Vite proxy `/wx-iem` in `vite.config.ts` only.
- Add a small PNG fixture under `testdata/wx/`; tests must prove RGB→dBZ→VIP behavior without network access.
- Preserve display-only behavior. Do not add steering, deviation, or aircraft-world effects.

## Out of scope

- PPI paint, `drawImage`, trainer fills, or render ordering; T02-69 owns paint.
- DCB enable or weather controls; DCB remains disabled until T02-70.
- `*WX` preview; T02-71 owns it.
- BRITE WX/WXC; T02-72 owns it.
- BKC, SSA WX/WX HIST, AVL 2×3 restyle, WXC contours, weather history, wind, or aircraft deviation.
- Mercator tile pyramids, OSM, GRIB, RainViewer, paid weather APIs, or any vendor weather service.
- Per-facility VIP bins or KDEM-specific branches.
- Network access in CI or boot-time dependency on IEM.

## Implementation notes

- Keep WMS request construction generic and driven by ARP/bounds, not facility IDs.
- Keep RGB→dBZ decoding and VIP binning in fetch/decode work, never in the animation loop.
- Treat transparent/unknown/clear-air pixels as no VIP mask.
- Keep mask coordinate metadata aligned with geographic bounds so `vipAtNm` can query later.
- Use the suggested breaks as defaults, while allowing scenario/trainer data to provide breaks without new facility branches.
- Document that `drawImage` and trainer repainting are intentionally deferred to T02-69.

## Acceptance criteria

- [ ] **AC1 —** IEM N0Q WMS `GetMap` request uses `/wx-iem`, `EPSG:4326`, transparent PNG output, ARP-derived padded bbox, and no speech API or external weather vendor.
- [ ] **AC2 —** Weather state fetches from `scenario.arp`, refreshes on its interval, does not refetch for pan inside the padded bbox, and returns an empty mosaic on failure without delaying boot.
- [ ] **AC3 —** N0Q fixture RGB values decode through the documented ramp into dBZ and six VIP masks using data-provided breaks, including the JO 7110.65 30/40/50 boundaries and trainer extra splits.
- [ ] **AC4 —** `ScopeView.wxLevels` defaults to six false values; no weather is painted or applied to aircraft.
- [ ] **AC5 —** `vipAtNm(mosaic, xNm, yNm, arp)` is implemented and unit-tested for bounds, empty mosaics, and VIP lookup, but remains unused by pilots.
- [ ] **AC6 —** No live path contains a KDEM/ICAO facility branch or invents per-facility bins.
- [ ] **AC7 —** Tests use `testdata/wx/` and never fetch IEM; no PPI `drawImage` work is introduced.
- [ ] **AC8 —** Typecheck, lint, formatting, and test suite pass.

## Test plan

- Unit: WMS URL/proxy construction, ARP-to-bbox conversion, refresh/in-pad pan decisions, empty/failure state.
- Unit: fixture RGB→dBZ ramp decoding, VIP edge thresholds, unknown/transparent pixels, and data-provided break arrays.
- Unit: `vipAtNm` geographic-to-NM lookup and out-of-bounds behavior.
- Scope state: six WX levels default off.
- Regression: assert no KDEM-specific branch and no network dependency in tests.
- CI: `npm run ci`.

## Suggested files

- `src/scope/wx/*` or `src/scope/weather/*`
- `src/scope/scopeView.ts` (or actual `ScopeView` location after search)
- `vite.config.ts`
- `testdata/wx/*`
- Relevant scope/weather unit tests
