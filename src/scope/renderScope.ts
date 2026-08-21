/**
 * Analog: CRC STARS video map + RANGE / HISTORY / FDB-LDB / PTL / altitude
 * filter PPI (docs.virtualnas.net/crc/stars — R07). PCG datablock / Mode C
 * (R02). FOA STARS altitude filters (R05).
 * Trainer delta: Canvas2D north-up; digital map from KDEM JSON (runway,
 * localizer feather, range rings, optional coastline); circular clip;
 * **target** square + optional **history** dots (5 s sim / 5 dots, no phosphor);
 * full/limited **datablock** in IBM Plex Mono (not a STARS face); L1–L9 **leader**
 * (pixel-constant 24 CSS px, no length menu); **predicted track line** (PTL) straight 1.0 min
 * GS along ground track, default off, F7; CRC may offer extra minute
 * presets / turn curves — we do not. Extra CRC presets omitted.
 * **Altitude filter** (FILTER readout): out of band keep target + history,
 * suppress datablock / leader / PTL. F3 initiate-track color stub (unowned
 * white / owned green); selected yellow box independent of ownership.
 * Not OSM / tiles (R12). Not a sprite. Not a label. Not NAS STARS.
 *
 * Draw order (phase README): background, rings, coastline, runway, localizer,
 * history, PTL, targets, leader lines, datablocks, selection box. Maps rebuild
 * on range/center/resize/layer toggle, not every rAF.
 *
 * Hot path (T02-12): reuse Path2D map cache — do not parse KDEM JSON per frame,
 * do not rebuild maps 60 times for a static camera, do not fillText per
 * character, history cap is 5 dots. Canvas2D only (no WebGL).
 */

import type { Aircraft, World } from "@core";
import { formatFilterReadout, inAltitudeFilter } from "./altitudeFilter";
import { formatRangeReadout, nmToScreen, rangeCircle, type ScopeViewSize } from "./camera";
import { datablockMetrics, linesForDatablock, type DatablockMode } from "./datablock";
import { DATABLOCK_FONT, DATABLOCK_LINE_HEIGHT_PX, measureDatablockCellWidth } from "./fonts";
import { datablockTopLeft, DEFAULT_LEADER_DIR, drawLeaderLine, type LeaderDir } from "./leader";
import { reuseOrBuildMapCache, toMapCacheInput, type MapCache } from "./mapLayers";
import { PALETTE } from "./palette";
import { PTL_MINUTES, drawPredictedTrackLine, ptlEndpoint, shouldDrawPtl } from "./ptl";
import type { ScopeView } from "./scopeView";
import { trackPaintColor } from "./ownership";
import {
  drawHistoryDot,
  drawSelectionBox,
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
  drawFilterReadout(ctx, view, cssHeight);
  drawChordHint(ctx, view, cssHeight);
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

  ctx.lineWidth = MAP_STROKE_PX;
  for (const stroke of cache.videoStrokes) {
    ctx.strokeStyle = stroke.color === "mapDim" ? PALETTE.mapDim : PALETTE.map;
    if (stroke.points.length < 2) {
      continue;
    }
    tracePolyline(ctx, stroke.points, stroke.closed);
    ctx.stroke();
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

  ctx.font = DATABLOCK_FONT;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "center";
  for (const label of cache.videoLabels) {
    ctx.fillStyle = label.color === "mapDim" ? PALETTE.mapDim : PALETTE.map;
    ctx.fillText(label.text, label.x, label.y);
  }
}

function trackDatablockMode(view: ScopeView, aircraftId: string): DatablockMode {
  return view.tracks.get(aircraftId)?.datablockMode ?? "full";
}

function trackLeaderDir(view: ScopeView, aircraftId: string): LeaderDir {
  return view.tracks.get(aircraftId)?.leaderDir ?? DEFAULT_LEADER_DIR;
}

function trackOwnership(view: ScopeView, aircraftId: string) {
  return view.tracks.get(aircraftId)?.ownership ?? "unowned";
}

function trackColor(view: ScopeView, world: World, ac: Aircraft): string {
  const td = view.tracks.get(ac.id);
  const identActive = td ? isIdentFlashing(td, world.simTimeMs) : false;
  return targetStrokeColor(trackOwnership(view, ac.id), identActive);
}

function drawDatablock(
  ctx: CanvasRenderingContext2D,
  ac: Aircraft,
  targetX: number,
  targetY: number,
  view: ScopeView,
): void {
  const lines = linesForDatablock(ac, trackDatablockMode(view, ac.id), view.modeCVisible);
  const metrics = datablockMetrics(lines, view.datablockCellWidthPx, DATABLOCK_LINE_HEIGHT_PX);
  const origin = datablockTopLeft(trackLeaderDir(view, ac.id), metrics);
  ctx.fillStyle = trackPaintColor(trackOwnership(view, ac.id));
  ctx.fillText(lines.line1, targetX + origin.x, targetY + origin.y);
  if (lines.line2 != null) {
    ctx.fillText(lines.line2, targetX + origin.x, targetY + origin.y + DATABLOCK_LINE_HEIGHT_PX);
  }
}

function drawTracks(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  if (view.historyEnabled) {
    for (const ac of world.aircraft) {
      const td = view.tracks.get(ac.id);
      if (!td) {
        continue;
      }
      const historyColor = historyDotColor(trackPaintColor(td.ownership));
      for (let i = 0; i < td.history.eastNm.length; i += 1) {
        const p = nmToScreen(td.history.eastNm[i]!, td.history.northNm[i]!, view.camera, size);
        drawHistoryDot(ctx, p.x, p.y, historyColor);
      }
    }
  }

  if (view.ptlOn) {
    drawPredictedTrackLines(ctx, world, view, size);
  }

  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const color = trackColor(view, world, ac);
    drawTargetSymbol(ctx, p.x, p.y, ac.headingDeg, color);
  }

  ctx.font = DATABLOCK_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  view.datablockCellWidthPx = measureDatablockCellWidth(ctx);

  for (const ac of world.aircraft) {
    // Outside the altitude filter: keep the target (and history above);
    // suppress datablock and leader. T02-05 draws the leader behind this same gate.
    if (!inAltitudeFilter(ac.altitudeFt, view.altitudeFilter)) {
      continue;
    }
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const color = trackColor(view, world, ac);
    drawLeaderLine(ctx, p.x, p.y, trackLeaderDir(view, ac.id), color);
  }

  for (const ac of world.aircraft) {
    if (!inAltitudeFilter(ac.altitudeFt, view.altitudeFilter)) {
      continue;
    }
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    drawDatablock(ctx, ac, p.x, p.y, view);
  }

  for (const ac of world.aircraft) {
    if (ac.id !== world.selectedAircraftId) {
      continue;
    }
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    drawSelectionBox(ctx, p.x, p.y);
  }
}

/**
 * Straight 1.0 min PTL along ground track. Clipped with the PPI range circle
 * (ctx.clip above). Altitude-filtered tracks keep the symbol and lose PTL
 * (`inAltitudeFilter` / `shouldDrawPtl`).
 */
function drawPredictedTrackLines(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  for (const ac of world.aircraft) {
    const altitudeFiltered = !inAltitudeFilter(ac.altitudeFt, view.altitudeFilter);
    if (!shouldDrawPtl(ac.speedKt, altitudeFiltered)) {
      continue;
    }
    const end = ptlEndpoint(ac.xNm, ac.yNm, ac.headingDeg, ac.speedKt, PTL_MINUTES);
    const from = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const to = nmToScreen(end.eastNm, end.northNm, view.camera, size);
    const td = view.tracks.get(ac.id);
    const identActive = td ? isIdentFlashing(td, world.simTimeMs) : false;
    const ownership = td?.ownership ?? "unowned";
    drawPredictedTrackLine(
      ctx,
      from.x,
      from.y,
      to.x,
      to.y,
      targetStrokeColor(ownership, identActive),
    );
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

function drawChordHint(ctx: CanvasRenderingContext2D, view: ScopeView, cssHeight: number): void {
  const hint = view.pendingChord?.hint;
  if (!hint) {
    return;
  }
  ctx.font = DATABLOCK_FONT;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.uiChrome;
  ctx.fillText(hint, 8, cssHeight - 8 - 2 * DATABLOCK_LINE_HEIGHT_PX);
}

/** Altitude filter / FILTER control (FOA R05 / CRC R07 analog). Not a slider. */
function drawFilterReadout(
  ctx: CanvasRenderingContext2D,
  view: ScopeView,
  cssHeight: number,
): void {
  ctx.font = DATABLOCK_FONT;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.uiChrome;
  ctx.fillText(
    formatFilterReadout(view.altitudeFilter, view.filterEntry),
    8,
    cssHeight - 8 - DATABLOCK_LINE_HEIGHT_PX,
  );
}
