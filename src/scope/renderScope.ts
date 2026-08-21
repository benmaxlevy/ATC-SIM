import type { World } from "@core";
import { formatRangeReadout, nmToScreen, rangeCircle, type ScopeViewSize } from "./camera";
import { reuseOrBuildMapCache, toMapCacheInput, type MapCache } from "./mapLayers";
import { PALETTE } from "./palette";
import type { ScopeView } from "./scopeView";

/**
 * Analog: CRC STARS video map + RANGE PPI (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: Canvas2D north-up; digital map from KDEM JSON (runway,
 * localizer feather, range rings, optional coastline); circular clip.
 * Not OSM / tiles (R12). Extra CRC presets omitted. Not NAS STARS.
 *
 * Draw order (phase README): background, rings, coastline, runway, localizer,
 * then tracks. Maps rebuild on range/center/resize/layer toggle, not every rAF.
 */

const TICK_RADIUS_PX = 2.5;
const SELECTED_TICK_RADIUS_PX = 4.5;
const SELECTED_RING_RADIUS_PX = 8;
const IDENT_HALO_RADIUS_PX = 10;
const CALLSIGN_OFFSET_X_PX = 8;
const CALLSIGN_OFFSET_Y_PX = 4;
const RING_STROKE_PX = 1;
const RUNWAY_STROKE_PX = 2;
const MAP_STROKE_PX = 1;
const IDENT_HALO = "rgba(180, 255, 170, 0.55)";
const SCOPE_MONO =
  '12px "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace';

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

  const circle = rangeCircle(size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(circle.cx, circle.cy, circle.radiusPx, 0, Math.PI * 2);
  ctx.clip();

  view.mapCache = reuseOrBuildMapCache(view.mapCache, toMapCacheInput(view, size));
  drawMapLayers(ctx, view.mapCache);

  drawTracks(ctx, world, view, size);

  ctx.restore();

  ctx.beginPath();
  ctx.arc(circle.cx, circle.cy, circle.radiusPx, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.map;
  ctx.lineWidth = 1;
  ctx.stroke();

  drawRangeReadout(ctx, view.camera.rangeNm, cssHeight);
}

function tracePolyline(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  close: boolean,
): void {
  const first = pts[0];
  if (!first || pts.length < 2) {
    return;
  }
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i += 1) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
  }
  if (close) {
    ctx.closePath();
  }
}

function drawMapLayers(ctx: CanvasRenderingContext2D, cache: MapCache): void {
  ctx.strokeStyle = PALETTE.mapDim;
  ctx.lineWidth = RING_STROKE_PX;
  if (cache.ringsPath) {
    ctx.stroke(cache.ringsPath);
  } else {
    for (const ring of cache.ringCircles) {
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radiusPx, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = PALETTE.map;
  ctx.fillStyle = PALETTE.map;
  ctx.lineWidth = MAP_STROKE_PX;
  if (cache.coastlinePath) {
    ctx.stroke(cache.coastlinePath);
  } else if (cache.coastline) {
    tracePolyline(ctx, cache.coastline, false);
    ctx.stroke();
  }

  ctx.lineWidth = RUNWAY_STROKE_PX;
  if (cache.runwayPath) {
    ctx.fill(cache.runwayPath);
    ctx.stroke(cache.runwayPath);
  } else if (cache.runway) {
    tracePolyline(ctx, cache.runway, true);
    ctx.fill();
    ctx.stroke();
  }

  ctx.lineWidth = MAP_STROKE_PX;
  if (cache.localizerPath) {
    ctx.stroke(cache.localizerPath);
  } else if (cache.localizer) {
    tracePolyline(ctx, cache.localizer, true);
    ctx.stroke();
  }

  if (cache.runwayLabel) {
    ctx.font = SCOPE_MONO;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = PALETTE.map;
    ctx.fillText(cache.runwayLabel.text, cache.runwayLabel.x, cache.runwayLabel.y);
  }
}

function drawTracks(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  ctx.font = SCOPE_MONO;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";

  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const selected = ac.id === world.selectedAircraftId;
    const identActive = ac.identUntilSimMs > world.simTimeMs;

    if (identActive) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, IDENT_HALO_RADIUS_PX, 0, Math.PI * 2);
      ctx.strokeStyle = IDENT_HALO;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (selected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, SELECTED_RING_RADIUS_PX, 0, Math.PI * 2);
      ctx.strokeStyle = PALETTE.selected;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, selected ? SELECTED_TICK_RADIUS_PX : TICK_RADIUS_PX, 0, Math.PI * 2);
    ctx.fillStyle = selected ? PALETTE.selected : PALETTE.unowned;
    ctx.fill();

    // Temporary callsign text — not a datablock (no leader, no Mode C).
    ctx.fillStyle = selected ? PALETTE.selected : PALETTE.unowned;
    ctx.fillText(ac.callsign, p.x + CALLSIGN_OFFSET_X_PX, p.y - CALLSIGN_OFFSET_Y_PX);
  }
}

function drawRangeReadout(
  ctx: CanvasRenderingContext2D,
  rangeNm: ScopeView["camera"]["rangeNm"],
  cssHeight: number,
): void {
  ctx.font = SCOPE_MONO;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.map;
  ctx.fillText(formatRangeReadout(rangeNm), 8, cssHeight - 8);
}
