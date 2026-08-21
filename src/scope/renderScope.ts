/**
 * Analog: CRC STARS video map + RANGE / HISTORY / FDB-LDB PPI
 * (docs.virtualnas.net/crc/stars — R07). PCG datablock / Mode C (R02).
 * Trainer delta: Canvas2D north-up; digital map from KDEM JSON (runway,
 * localizer feather, range rings, optional coastline); circular clip;
 * **target** square + optional **history** dots (5 s sim / 5 dots, no phosphor);
 * full/limited **datablock** in IBM Plex Mono (not a STARS face); default L8
 * offset (north, 24 px) until T02-05. Extra CRC presets omitted.
 * Not OSM / tiles (R12). Not a sprite. Not a label. Not NAS STARS.
 *
 * Draw order (phase README): background, rings, coastline, runway, localizer,
 * history, targets, datablocks. Maps rebuild on range/center/resize/layer
 * toggle, not every rAF.
 */

import type { Aircraft, World } from "@core";
import { formatRangeReadout, nmToScreen, rangeCircle, type ScopeViewSize } from "./camera";
import { datablockTopLeft, linesForDatablock, type DatablockMode } from "./datablock";
import { DATABLOCK_FONT, DATABLOCK_LINE_HEIGHT_PX, measureDatablockCellWidth } from "./fonts";
import { reuseOrBuildMapCache, toMapCacheInput, type MapCache } from "./mapLayers";
import { PALETTE } from "./palette";
import type { ScopeView } from "./scopeView";
import {
  UNOWNED_TRACK_COLOR,
  drawHistoryDot,
  drawTargetSymbol,
  historyDotColor,
  targetStrokeColor,
} from "./targetSymbol";
import { isIdentFlashing, syncTrackDisplays } from "./trackDisplay";

const RING_STROKE_PX = 1;
const RUNWAY_STROKE_PX = 2;
const MAP_STROKE_PX = 1;

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

  syncTrackDisplays(view.tracks, world);

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
    ctx.font = DATABLOCK_FONT;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = PALETTE.map;
    ctx.fillText(cache.runwayLabel.text, cache.runwayLabel.x, cache.runwayLabel.y);
  }
}

function trackDatablockMode(view: ScopeView, aircraftId: string): DatablockMode {
  return view.tracks.get(aircraftId)?.datablockMode ?? "full";
}

function drawDatablock(
  ctx: CanvasRenderingContext2D,
  ac: Aircraft,
  targetX: number,
  targetY: number,
  view: ScopeView,
): void {
  const lines = linesForDatablock(ac, trackDatablockMode(view, ac.id), view.modeCVisible);
  const origin = datablockTopLeft(targetX, targetY);
  ctx.fillStyle = PALETTE.unowned;
  ctx.fillText(lines.line1, origin.x, origin.y);
  if (lines.line2 != null) {
    ctx.fillText(lines.line2, origin.x, origin.y + DATABLOCK_LINE_HEIGHT_PX);
  }
}

function drawTracks(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const historyColor = historyDotColor(UNOWNED_TRACK_COLOR);

  if (view.historyEnabled) {
    for (const ac of world.aircraft) {
      const td = view.tracks.get(ac.id);
      if (!td) {
        continue;
      }
      for (let i = 0; i < td.history.eastNm.length; i += 1) {
        const p = nmToScreen(td.history.eastNm[i]!, td.history.northNm[i]!, view.camera, size);
        drawHistoryDot(ctx, p.x, p.y, historyColor);
      }
    }
  }

  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const selected = ac.id === world.selectedAircraftId;
    const td = view.tracks.get(ac.id);
    const identActive = td ? isIdentFlashing(td, world.simTimeMs) : false;
    drawTargetSymbol(ctx, p.x, p.y, ac.headingDeg, targetStrokeColor(selected, identActive));
  }

  ctx.font = DATABLOCK_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  view.datablockCellWidthPx = measureDatablockCellWidth(ctx);

  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    drawDatablock(ctx, ac, p.x, p.y, view);
  }
}

function drawRangeReadout(
  ctx: CanvasRenderingContext2D,
  rangeNm: ScopeView["camera"]["rangeNm"],
  cssHeight: number,
): void {
  ctx.font = DATABLOCK_FONT;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.map;
  ctx.fillText(formatRangeReadout(rangeNm), 8, cssHeight - 8);
}
