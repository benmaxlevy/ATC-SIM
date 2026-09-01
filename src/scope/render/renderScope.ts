/**
 * Analog: CRC STARS video map + RANGE / HISTORY / FDB-LDB / PTL / altitude
 * filter / MAPS / RR / LDR / CHAR SIZE / BRITE / SSA PPI (docs.virtualnas.net/crc/stars — R07).
 * PCG datablock / Mode C (R02). FOA STARS altitude filters (R05).
 * Trainer delta: Canvas2D north-up; digital map from KDEM JSON (runway,
 * localizer feather, generated range rings, optional coastline); rectangular PPI
 * filling the canvas (RANGE is still the nearest-edge NM; corners show extra);
 * **target** diamond + optional **history** dots (report arrival, cap 5, no phosphor);
 * full/limited **datablock** in IBM Plex Mono (not a STARS face); L1–L9 **leader**
 * (pixel-constant default 36 CSS px; DCB LDR length 0/24/36/48); **predicted track line** (PTL)
 * straight 1.0 min GS along ground track by default (AUX spinner 0.5/1/2/4),
 * default off, F7 toggles PTL ALL. CRC may offer extra minute presets / turn
 * curves — we do not. Extra CRC presets omitted.
 * **Altitude filter** (FILTER readout in SSA): out of band keep target + history,
 * suppress datablock / leader / PTL. F3 initiate-track color stub (unowned green
 * FDB / owned white FDB, CSI-like `*` / `G`); position symbol stays blue;
 * selected yellow box independent of ownership. CHAR SIZE is per-subsystem
 * (DATA BLOCKS / LISTS / DCB / TOOLS / POS) on IBM Plex Mono. BRITE multiplies
 * each drawn channel. Weather VIP fills paint after maps and before tracks
 * (display only). SSA is screen-fixed top-left (sim time, KDEM 29.92 stub,
 * FILTER, RANGE, OFF CNTR, `OK/OK/NA` plus live SITE radar word) — not world-fixed. Live `*` TPA/ATPA chord
 * buffer paints next to FILTER in SSA/preview green (same FIL-prompt grammar).
 * Current CA displays static `CA` + tone from `world.alerts` and paints red. T04-10 MSAW paints a red `MSAW` tag when MSL is below the MVA floor; neither tints the block, leader, or target. CA halo is
 * **not** drawn: CRC conflict-alert CA is static `CA` text + tone, not a 3 NM circle
 * (circles are TPA J-rings or ERAM DRI). Not OSM / tiles (R12). Not a
 * sprite. Not an airplane. Not a label. Not NAS STARS.
 *
 * Draw order (phase README): background, rings, coastline, runway, localizer,
 * weather VIP fills, history, PTL, TPA J-rings, ATPA cones, targets, leader
 * lines, datablocks, selection box, SSA (screen-fixed). Maps rebuild on
 * range/center/resize/layer toggle, not every rAF.
 *
 * Hot path (T02-12): reuse Path2D map cache — do not parse KDEM JSON per frame,
 * do not rebuild maps 60 times for a static camera, do not fillText per
 * character, history cap is 5 dots. Canvas2D only (no WebGL).
 */

import { reuseOrBuildMapCache, toMapCacheInput } from "../mapLayers";
import { type ScopeView } from "../scopeView";
import { type World } from "@core";
import { PALETTE } from "../palette";
import { type ScopeViewSize } from "../camera";
import { syncTrackDisplays } from "../trackDisplay";
import { drawWeatherLayer } from "./weatherLayer";
import {
  drawChordHint,
  drawMapLayers,
  drawMapLists,
  drawSsa,
  drawSystemLists,
  drawTracks,
} from "./renderScopePaint";

export function renderScope(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  cssWidth: number,
  cssHeight: number,
): void {
  const size: ScopeViewSize = { widthPx: cssWidth, heightPx: cssHeight };
  ctx.fillStyle = PALETTE.background;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  if (cssWidth <= 0 || cssHeight <= 0) {
    return;
  }

  syncTrackDisplays(view.tracks, world, {
    mode: view.surveillanceMode,
    sites: view.radarSites,
  });

  view.mapCache = reuseOrBuildMapCache(view.mapCache, toMapCacheInput(view, size));
  drawMapLayers(ctx, view.mapCache, view);
  drawWeatherLayer(ctx, view, size);
  drawTracks(ctx, world, view, size);

  const ssaBottomY = drawSsa(ctx, world, view);
  drawChordHint(ctx, view, ssaBottomY);
  drawMapLists(ctx, view, cssWidth);
  drawSystemLists(ctx, world, view, cssWidth, cssHeight);
}

export { getDatablockVisualState, isTrackedTarget } from "./renderScopePaint";
export type { DatablockVisualState } from "./renderScopePaint";
