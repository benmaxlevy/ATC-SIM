/**
 * Analog: CRC STARS video map + RANGE / HISTORY / FDB-LDB / PTL / altitude
 * filter / MAPS / RR / LDR / CHAR SIZE / BRITE / SSA PPI (docs.virtualnas.net/crc/stars — R07).
 * PCG datablock / Mode C (R02). FOA STARS altitude filters (R05).
 * Trainer delta: Canvas2D north-up; digital map from KDEM JSON (runway,
 * localizer feather, generated range rings, optional coastline); rectangular PPI
 * filling the canvas (RANGE is still the nearest-edge NM; corners show extra);
 * **target** diamond + optional **history** dots (5 s sim / 5 dots, no phosphor);
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
 * each drawn channel; WX/WXC/BKC do not paint weather. SSA is screen-fixed top-left (sim time, KDEM 29.92 stub,
 * FILTER, RANGE, OFF CNTR, OK) — not world-fixed. Current CA displays static `CA`
 * + tone from `world.alerts` and paints red. T04-10 MSAW still tints yellow then red. CA halo is
 * **not** drawn: CRC conflict-alert CA is static `CA` text + tone, not a 3 NM circle
 * (circles are TPA J-rings or ERAM DRI). Not OSM / tiles (R12). Not a
 * sprite. Not an airplane. Not a label. Not NAS STARS.
 *
 * Draw order (phase README): background, rings, coastline, runway, localizer,
 * history, PTL, TPA J-rings, targets, leader lines, datablocks, selection box, SSA
 * (screen-fixed). Maps rebuild on range/center/resize/layer toggle, not every rAF.
 *
 * Hot path (T02-12): reuse Path2D map cache — do not parse KDEM JSON per frame,
 * do not rebuild maps 60 times for a static camera, do not fillText per
 * character, history cap is 5 dots. Canvas2D only (no WebGL).
 */

import { caSeverityForCallsign, handoffFor, type Aircraft, type World } from "@core";
import { inAltitudeFilter } from "./altitudeFilter";
import { nmToScreen, type ScopeViewSize } from "./camera";
import { datablockMetrics, linesForDatablock, type DatablockMode } from "./datablock";
import { datablockFontCss, datablockLineHeightPx, measureDatablockCellWidth } from "./fonts";
import { datablockTopLeft, DEFAULT_LEADER_DIR, drawLeaderLine, type LeaderDir } from "./leader";
import { reuseOrBuildMapCache, toMapCacheInput, type MapCache } from "./mapLayers";
import { historyDotsToDraw } from "./history";
import { drawPredictedTrackLine, ptlEndpoint, shouldDrawPtlForTrack } from "./ptl";
import { isViewOffAirport, type ScopeView } from "./scopeView";
import {
  TPA_STROKE_COLOR,
  TPA_STROKE_PX,
  aircraftForTpaRings,
  shouldPaintAtpaGeometry,
  tpaRingPoints,
} from "./tpa";
import { buildGiLines, buildSsaLines } from "./ssa";
import { buildMapListLines } from "./dcbFunctions";
import type { TrackOwnership } from "./ownership";
import {
  BLINK_HALF_PERIOD_MS,
  PALETTE,
  alertTintPaintColor,
  applyBrite,
  caDatablockTagVisible,
  trackAlertTint,
  trackPaintAlertTint,
  withCaDatablockTag,
} from "./palette";
import {
  drawHistoryDot,
  drawTargetSymbol,
  historyDotColor,
  isPrimaryTarget,
  targetStrokeColor,
} from "./targetSymbol";
import { deriveScratchpads, isIdentFlashing, isTrackQueried, syncTrackDisplays } from "./trackDisplay";

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

  view.mapCache = reuseOrBuildMapCache(view.mapCache, toMapCacheInput(view, size));
  drawMapLayers(ctx, view.mapCache, view);
  drawTracks(ctx, world, view, size);

  const ssaBottomY = drawSsa(ctx, world, view);
  drawChordHint(ctx, view, ssaBottomY);
  drawMapLists(ctx, view, cssWidth);
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

function drawMapLayers(ctx: CanvasRenderingContext2D, cache: MapCache, view: ScopeView): void {
  const mpa = applyBrite(PALETTE.map, view.brite.mpa);
  const mpb = applyBrite(PALETTE.mapDim, view.brite.mpb);
  const rr = applyBrite(PALETTE.mapDim, view.brite.rr);
  ctx.strokeStyle = rr;
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
    ctx.strokeStyle = stroke.color === "mapDim" ? mpb : mpa;
    if (stroke.points.length < 2) {
      continue;
    }
    tracePolyline(ctx, stroke.points, stroke.closed);
    ctx.stroke();
  }

  ctx.strokeStyle = mpa;
  ctx.fillStyle = mpa;
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

  const mapFont = datablockFontCss(view.charSizes.dataBlocks);
  if (cache.runwayLabel) {
    ctx.font = mapFont;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = mpa;
    ctx.fillText(cache.runwayLabel.text, cache.runwayLabel.x, cache.runwayLabel.y);
  }

  ctx.font = mapFont;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "center";
  const mapLineH = datablockLineHeightPx(view.charSizes.dataBlocks);
  for (const label of cache.videoLabels) {
    ctx.fillStyle = label.color === "mapDim" ? mpb : mpa;
    drawVideoMapLabel(ctx, label.text, label.x, label.y, mapLineH);
  }
}

/** STAR restriction boxes are newline-stacked (`------` / alt / speed / `------`). */
function drawVideoMapLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  lineH: number,
): void {
  const lines = text.split("\n");
  const last = lines.length - 1;
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i]!, x, y - (last - i) * lineH);
  }
}

export interface DatablockVisualState {
  color: string;
  visible: boolean;
  mode: DatablockMode;
  line1Tag?: string;
  leaderColor: string;
}

export function isTrackedTarget(view: ScopeView, world: World, ac: Aircraft): boolean {
  const td = view.tracks.get(ac.id);
  const ownership: TrackOwnership = td?.ownership ?? "unowned";
  const ho = handoffFor(world, ac.id);
  return (
    ownership === "owned" ||
    ownership === "tower" ||
    ownership === "center" ||
    td?.tracked === true ||
    ho.kind === "inbound" ||
    (ho.kind === "outbound" && ho.status === "accepted") ||
    ho.kind === "pointout_inbound" ||
    ho.kind === "pointout_outbound"
  );
}

export function getDatablockVisualState(
  view: ScopeView,
  world: World,
  ac: Aircraft,
): DatablockVisualState {
  const td = view.tracks.get(ac.id);
  const ho = handoffFor(world, ac.id);
  const paintTint = trackPaintAlertTint(world, ac.callsign);
  const alertColor = alertTintPaintColor(paintTint);

  // 1. MSAW Alert tint
  if (alertColor) {
    return {
      color: alertColor,
      visible: true,
      mode: "full",
      leaderColor: alertColor,
    };
  }

  // 1b. Conflict Alert: only shown for tracked targets (full datablock in white)
  const isTracked = isTrackedTarget(view, world, ac);
  const caSeverity = caSeverityForCallsign(world.alerts.ca, ac.callsign);
  if (isTracked && caSeverity) {
    return {
      color: PALETTE.owned,
      visible: true,
      mode: "full",
      leaderColor: PALETTE.owned,
    };
  }

  // 2. Inbound pending handoff: Blinking white FDB
  if (ho.kind === "inbound") {
    const isBlinkOn = Math.floor(world.simTimeMs / BLINK_HALF_PERIOD_MS) % 2 === 0;
    return {
      color: PALETTE.owned,
      visible: isBlinkOn,
      mode: "full",
      leaderColor: PALETTE.owned,
    };
  }

  // 3. Outbound accepted handoff: Blinking white for 5s, settles to solid white
  const isOutboundAccepted =
    (ho.kind === "outbound" && ho.status === "accepted") ||
    (td?.outboundFlashUntilSimMs != null && td.outboundFlashUntilSimMs > 0) ||
    td?.outboundClickStep !== undefined;
  if (isOutboundAccepted) {
    const step = td?.outboundClickStep ?? 0;
    if (step === 0) {
      const flashDeadline =
        td?.outboundFlashUntilSimMs ??
        (ho.kind === "outbound" ? (ho.acceptedAtSimMs ?? 0) + 5000 : 0);
      const isFlashing = world.simTimeMs < flashDeadline;
      const isBlinkOn = Math.floor(world.simTimeMs / BLINK_HALF_PERIOD_MS) % 2 === 0;
      return {
        color: PALETTE.owned,
        visible: isFlashing ? isBlinkOn : true,
        mode: "full",
        leaderColor: PALETTE.owned,
      };
    }
    if (step === 1) {
      return {
        color: PALETTE.owned,
        visible: true,
        mode: "full",
        leaderColor: PALETTE.owned,
      };
    }
    if (step === 2) {
      return {
        color: PALETTE.unowned,
        visible: true,
        mode: "full",
        leaderColor: PALETTE.unowned,
      };
    }
    if (step === 3) {
      return {
        color: PALETTE.unowned,
        visible: true,
        mode: "partial",
        leaderColor: PALETTE.unowned,
      };
    }
  }

  // 4. Pointout inbound pending: Blinking yellow FDB with PO tag
  if (ho.kind === "pointout_inbound" && ho.status === "pending") {
    const isBlinkOn = Math.floor(world.simTimeMs / BLINK_HALF_PERIOD_MS) % 2 === 0;
    return {
      color: PALETTE.caution,
      visible: isBlinkOn,
      mode: "full",
      line1Tag: "PO",
      leaderColor: PALETTE.caution,
    };
  }

  // 5. Pointout inbound accepted: Solid yellow FDB
  if (
    (ho.kind === "pointout_inbound" && ho.status === "accepted") ||
    td?.pointoutAccepted === true
  ) {
    return {
      color: PALETTE.caution,
      visible: true,
      mode: "full",
      leaderColor: PALETTE.caution,
    };
  }

  // 6. Pointout outbound
  if (ho.kind === "pointout_outbound") {
    if (ho.status === "pending") {
      const baseColor = td?.ownership ? PALETTE[td.ownership] : PALETTE.unowned;
      return {
        color: td?.highlighted ? PALETTE.highlight : baseColor,
        visible: true,
        mode: "full",
        line1Tag: `PO ${ho.toSectorId}`,
        leaderColor: td?.highlighted ? PALETTE.highlight : baseColor,
      };
    }
    if (ho.status === "rejected") {
      const isUnOn = Math.floor(world.simTimeMs / 500) % 2 === 0;
      const baseColor = td?.ownership ? PALETTE[td.ownership] : PALETTE.unowned;
      return {
        color: td?.highlighted ? PALETTE.highlight : baseColor,
        visible: true,
        mode: "full",
        line1Tag: isUnOn ? "UN" : undefined,
        leaderColor: td?.highlighted ? PALETTE.highlight : baseColor,
      };
    }
  }

  // 7. Track highlight (Cyan #00FFFF)
  if (td?.highlighted) {
    const baseMode = td.datablockMode ?? (td.ownership === "owned" ? "full" : "partial");
    const mode = view.beaconatorActive && baseMode === "partial" ? "full" : baseMode;
    return {
      color: PALETTE.highlight,
      visible: true,
      mode,
      leaderColor: PALETTE.highlight,
    };
  }

  // 8. Base ownership
  const ownership = td?.ownership ?? "unowned";
  const baseMode = td?.datablockMode ?? (ownership === "owned" ? "full" : "partial");
  const mode = view.beaconatorActive && baseMode === "partial" ? "full" : baseMode;
  const baseColor = PALETTE[ownership];

  return {
    color: baseColor,
    visible: true,
    mode,
    leaderColor: baseColor,
  };
}

function trackLeaderDir(view: ScopeView, aircraftId: string): LeaderDir {
  return view.tracks.get(aircraftId)?.leaderDir ?? DEFAULT_LEADER_DIR;
}

function trackOwnership(view: ScopeView, aircraftId: string) {
  return view.tracks.get(aircraftId)?.ownership ?? "unowned";
}

function trackColor(view: ScopeView, world: World, ac: Aircraft): string {
  const tint = trackPaintAlertTint(world, ac.callsign);
  const alertColor = alertTintPaintColor(tint);
  if (alertColor) {
    return alertColor;
  }
  const isTracked = isTrackedTarget(view, world, ac);
  const caSeverity = caSeverityForCallsign(world.alerts.ca, ac.callsign);
  if (isTracked && caSeverity) {
    return PALETTE.owned;
  }
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
  world: World,
): void {
  const visual = getDatablockVisualState(view, world, ac);
  if (!visual.visible) {
    return;
  }
  const td = view.tracks.get(ac.id);
  const derived = deriveScratchpads(ac, td);
  const scratchpad = derived.sp1;
  const tint = trackAlertTint(world, ac.callsign);
  const mode = visual.mode;
  const isQueried = td ? isTrackQueried(td, world.simTimeMs) : false;
  const squawk = td?.squawk ?? ac.squawk;
  const beaconCodeReadout = view.beaconatorActive === true;
  const callsign = beaconCodeReadout && squawk ? squawk : ac.callsign;

  const base = linesForDatablock(
    {
      ...ac,
      callsign,
      squawk,
    },
    mode,
    view.modeCVisible,
    scratchpad,
    {
      queried: isQueried,
      beaconVisible: true,
    },
    world.simTimeMs,
  );
  let line1 = base.line1;
  if (visual.line1Tag) {
    line1 = `${line1} ${visual.line1Tag}`;
  }
  const lines = { ...base, line1: withCaDatablockTag(line1, tint, world.simTimeMs) };
  const lineH = datablockLineHeightPx(view.charSizes.dataBlocks);
  const metrics = datablockMetrics(lines, view.datablockCellWidthPx, lineH);
  const origin = datablockTopLeft(trackLeaderDir(view, ac.id), metrics, view.leaderLengthPx);
  const briteCh = mode === "limited" || mode === "partial" ? view.brite.ldb : view.brite.fdb;

  const isTracked = isTrackedTarget(view, world, ac);
  const caSeverity = caSeverityForCallsign(world.alerts.ca, ac.callsign);
  if (isTracked && caSeverity && mode === "full" && caDatablockTagVisible(world.simTimeMs)) {
    ctx.fillStyle = applyBrite(PALETTE.alert, view.brite.fdb);
    ctx.fillText("CA", targetX + origin.x, targetY + origin.y - lineH);
  }

  ctx.fillStyle = applyBrite(visual.color, briteCh);
  ctx.fillText(lines.line1, targetX + origin.x, targetY + origin.y);
  if (lines.line2 != null) {
    ctx.fillText(lines.line2, targetX + origin.x, targetY + origin.y + lineH);
  }
  if (lines.line3 != null) {
    ctx.fillText(lines.line3, targetX + origin.x, targetY + origin.y + 2 * lineH);
  }
}

function drawTracks(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const historyCount = view.historyEnabled ? view.historyDotCount : 0;
  if (historyCount > 0) {
    for (const ac of world.aircraft) {
      const td = view.tracks.get(ac.id);
      if (!td) {
        continue;
      }
      const dots = historyDotsToDraw(td.history, historyCount);
      const n = dots.eastNm.length;
      for (let i = 0; i < n; i += 1) {
        const p = nmToScreen(dots.eastNm[i]!, dots.northNm[i]!, view.camera, size);
        drawHistoryDot(ctx, p.x, p.y, applyBrite(historyDotColor(i, n), view.brite.hst));
      }
    }
  }

  if (view.ptlOn || view.ptlOwn) {
    drawPredictedTrackLines(ctx, world, view, size);
  }

  drawTpaRings(ctx, world, view, size);

  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const color = trackColor(view, world, ac);
    const td = view.tracks.get(ac.id);
    const isPrimary = isPrimaryTarget(ac, td);
    const ownership: TrackOwnership = td?.ownership ?? "unowned";
    const ho = handoffFor(world, ac.id);
    const isTracked = isTrackedTarget(view, world, ac);
    const posBrite = isPrimary ? view.brite.pri : isTracked ? view.brite.pos : view.brite.oth;
    const squawk = td?.squawk ?? ac.squawk;
    let sectorId = td?.sectorId;
    if (!sectorId) {
      if (ho.kind === "inbound") {
        sectorId = ho.fromSectorId;
      } else if (ho.kind === "outbound" && ho.status === "accepted") {
        sectorId = ho.toSectorId;
      } else if (ownership === "tower") {
        sectorId = "T";
      } else if (ownership === "center") {
        sectorId = "C";
      } else {
        sectorId = view.sectorId ?? "D";
      }
    }

    drawTargetSymbol(
      ctx,
      p.x,
      p.y,
      applyBrite(isPrimary ? PALETTE.positionSymbol : color, posBrite),
      {
        isPrimary,
        ownership,
        tracked: isTracked,
        squawk,
        beaconSelect: view.beaconSelectCodes,
        sectorId,
      },
      view.charSizes.pos,
    );
  }

  ctx.font = datablockFontCss(view.charSizes.dataBlocks);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  view.datablockCellWidthPx = measureDatablockCellWidth(ctx);

  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    if (isPrimaryTarget(ac, td)) {
      continue;
    }
    // Outside the altitude filter: keep the target (and history above);
    // suppress datablock and leader. T02-05 draws the leader behind this same gate.
    if (!inAltitudeFilter(ac.altitudeFt, view.altitudeFilter)) {
      continue;
    }
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const visual = getDatablockVisualState(view, world, ac);
    if (visual.visible) {
      const briteCh =
        visual.mode === "limited" || visual.mode === "partial" ? view.brite.ldb : view.brite.fdb;
      const leaderColor = applyBrite(visual.leaderColor, briteCh);
      drawLeaderLine(
        ctx,
        p.x,
        p.y,
        trackLeaderDir(view, ac.id),
        leaderColor,
        view.leaderLengthPx,
        view.charSizes.pos,
      );
    }
  }

  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    if (isPrimaryTarget(ac, td)) {
      continue;
    }
    if (!inAltitudeFilter(ac.altitudeFt, view.altitudeFilter)) {
      continue;
    }
    const p = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    drawDatablock(ctx, ac, p.x, p.y, view, world);
  }
}

/**
 * Straight predicted track line along ground track (default 1.0 min; AUX spinner
 * 0.5/1/2/4). PTL ALL draws every in-filter track; PTL OWN draws F3-owned only;
 * ALL wins if both are on. Canvas bounds clip the rectangular PPI.
 * Altitude-filtered tracks keep the symbol and lose PTL
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
    const owned = (view.tracks.get(ac.id)?.ownership ?? "unowned") === "owned";
    if (!shouldDrawPtlForTrack(ac.speedKt, altitudeFiltered, owned, view.ptlOn, view.ptlOwn)) {
      continue;
    }
    const end = ptlEndpoint(ac.xNm, ac.yNm, ac.headingDeg, ac.speedKt, view.ptlMinutes);
    const from = nmToScreen(ac.xNm, ac.yNm, view.camera, size);
    const to = nmToScreen(end.eastNm, end.northNm, view.camera, size);
    const td = view.tracks.get(ac.id);
    const identActive = td ? isIdentFlashing(td, world.simTimeMs) : false;
    const capTickPx = Math.max(2, view.charSizes.tools - 8);
    drawPredictedTrackLine(
      ctx,
      from.x,
      from.y,
      to.x,
      to.y,
      applyBrite(identActive ? PALETTE.selected : PALETTE.ptl, view.brite.tls),
      capTickPx,
    );
  }
}

/**
 * CRC TPA J-rings: world-NM mileage circles about selected (or owned) tracks.
 * Stroke is TLS/tools (`TPA_STROKE_COLOR` / PTL white), not CA red. Canvas
 * bounds clip like range rings (no extra clip call). ATPA is a stored stub and
 * paints nothing (no pairing / cones). CA remains datablock text — not a 3 NM
 * halo. Display only — never a Command.
 */
function drawTpaRings(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  // ATPA stub: even when on, no extra stroke.
  void shouldPaintAtpaGeometry(view.atpa.on);
  const targets = aircraftForTpaRings(
    view.tpa.on,
    world.selectedAircraftId,
    world.aircraft,
    view.tracks,
  );
  if (targets.length === 0) {
    return;
  }
  ctx.strokeStyle = TPA_STROKE_COLOR;
  ctx.lineWidth = TPA_STROKE_PX;
  for (const ac of targets) {
    const worldPts = tpaRingPoints(ac.xNm, ac.yNm, view.tpa.radiusNm);
    const pts = worldPts.map((p) => nmToScreen(p.eastNm, p.northNm, view.camera, size));
    tracePolyline(ctx, pts, false);
    ctx.stroke();
  }
}

const SSA_LEFT_PX = 8;
const SSA_TOP_PX = 8;

/**
 * Screen-fixed SSA + GI TEXT (CRC R07 analog). Phosphor-green mono. Never a Command.
 * FILTER / RANGE live here so the lower-left stays clear for the on-PPI list.
 * GI TEXT is authored facility lines (not a METAR panel / HUD). Empty slots never paint.
 */
function drawSsa(ctx: CanvasRenderingContext2D, world: World, view: ScopeView): number {
  const lines = [
    ...buildSsaLines({
      simTimeMs: world.simTimeMs,
      rangeNm: view.camera.rangeNm,
      offCenter: isViewOffAirport(view),
      filter: view.altitudeFilter,
      filterEntry: view.filterEntry,
      visibility: view.ssaFilter,
      ptlMinutes: view.ptlMinutes,
    }),
    ...buildGiLines(view.giTextLines, view.giFilterVisible),
  ];
  const lineH = datablockLineHeightPx(view.charSizes.lists);
  ctx.font = datablockFontCss(view.charSizes.lists);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
  let y = SSA_TOP_PX;
  for (const line of lines) {
    ctx.fillText(line, SSA_LEFT_PX, y);
    y += lineH;
  }
  return y;
}

function drawChordHint(ctx: CanvasRenderingContext2D, view: ScopeView, ssaBottomY: number): void {
  const hint = view.pendingChord?.hint;
  if (!hint) {
    return;
  }
  ctx.font = datablockFontCss(view.charSizes.lists);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.uiChrome;
  ctx.fillText(hint, SSA_LEFT_PX, ssaBottomY + 4);
}

/**
 * GEO MAPS / CURRENT lists: screen-fixed video-map inventory (CRC analog).
 * Map-green mono like SSA. Canvas text is not a hit target, so empty-PPI
 * deselect is unchanged. No HTML select. Not OSM / precipitation.
 */
function drawMapLists(ctx: CanvasRenderingContext2D, view: ScopeView, cssWidth: number): void {
  if (!view.geoMapsListOn && !view.currentMapsListOn) {
    return;
  }
  const lineH = datablockLineHeightPx(view.charSizes.lists);
  ctx.font = datablockFontCss(view.charSizes.lists);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
  const x = Math.max(cssWidth - 220, 200);
  let y = SSA_TOP_PX;
  if (view.geoMapsListOn) {
    ctx.fillText("GEO MAPS", x, y);
    y += lineH;
    for (const line of buildMapListLines(view, "geo")) {
      ctx.fillText(line, x, y);
      y += lineH;
    }
    y += lineH / 2;
  }
  if (view.currentMapsListOn) {
    ctx.fillText("CURRENT", x, y);
    y += lineH;
    for (const line of buildMapListLines(view, "current")) {
      ctx.fillText(line, x, y);
      y += lineH;
    }
  }
}
