/**
 * PPI paint stages. Draw order is owned by renderScope().
 */
import {
  caSeverityForCallsign,
  handoffFor,
  MSAW_DATABLOCK_TAG,
  msawSeverityForCallsign,
  type Aircraft,
  type World,
} from "@core";
import { inAltitudeFilter } from "../altitudeFilter";
import { nmToScreen, type ScopeViewSize } from "../camera";
import {
  DATABLOCK_FIELD_GAP,
  datablockMetrics,
  fullDatablockLine3Parts,
  linesForDatablock,
  type DatablockMode,
} from "../datablock";
import { datablockFontCss, datablockLineHeightPx, measureDatablockCellWidth } from "../fonts";
import { datablockTopLeft, DEFAULT_LEADER_DIR, drawLeaderLine, type LeaderDir } from "../leader";
import { type MapCache } from "../mapLayers";
import { historyDotsToDraw } from "../history";
import { drawPredictedTrackLine, ptlEndpoint, shouldDrawPtlForTrack } from "../ptl";
import { isViewOffAirport, type ScopeView } from "../scopeView";
import { formatPreviewReadout } from "../previewArea";
import { formatStarsChordReadout } from "../starsChord";
import {
  atpaConeMileagePlacement,
  atpaInTrailDatablockReadout,
  atpaReadoutColor,
} from "../atpaReadout";
import {
  atpaConeColor,
  atpaConePoints,
  selectAtpaConesToPaint,
  shouldPaintAtpaGeometry,
  type AtpaConePaintFlags,
} from "../atpaCone";
import {
  TPA_STROKE_COLOR,
  TPA_STROKE_PX,
  manualTpaConePoints,
  tpaConeDigitPlacement,
  tpaConesToPaint,
  tpaRingDigitPlacement,
  tpaRingPoints,
  tpaRingsToPaint,
  tpaSizeReadoutEnabled,
} from "../tpa";
import {
  buildGiLines,
  buildSsaRenderLines,
  SSA_ALTIMETER_STUB,
  SSA_NETWORK_HEALTH_STUB,
} from "../ssa";
import {
  SITE_FAR_LINE_COLOR,
  aircraftAtReport,
  effectiveSurveillanceMode,
  surveillanceModeWord,
} from "../surveillance";
import { buildMapListLines } from "../dcb/dcbFunctions";
import type { TrackOwnership } from "../ownership";
import { BLINK_HALF_PERIOD_MS, PALETTE, applyBrite, caDatablockTagVisible } from "../palette";
import {
  TARGET_PUCK_BG,
  drawHistoryDot,
  drawTargetSymbol,
  historyDotColor,
  isPrimaryTarget,
  targetStrokeColor,
} from "./targetSymbol";
import {
  deriveScratchpads,
  isBeaconatorReadout,
  isIdentFlashing,
  isTrackQueried,
  type TrackDisplay,
} from "../trackDisplay";
import {
  buildAlertList,
  buildCoastSuspendList,
  buildCrdaStatusList,
  buildSignOnList,
  buildTabFlightPlanList,
  buildTowerArrivalList,
  buildVfrList,
  findOverlappingLists,
  type ListRect,
} from "../systemLists";
import { buildVideoMapsListLines } from "../coordinationList";

const RING_STROKE_PX = 1;
const RUNWAY_STROKE_PX = 2;
const MAP_STROKE_PX = 1;

export function displayAircraft(ac: Aircraft, td: TrackDisplay | undefined): Aircraft | null {
  return td?.lastReport ? aircraftAtReport(ac, td.lastReport) : null;
}

export function tracePolyline(
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

export function drawMapLayers(
  ctx: CanvasRenderingContext2D,
  cache: MapCache,
  view: ScopeView,
): void {
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

  const cmp = applyBrite(PALETTE.mapDim, view.brite.cmp);
  if (cache.compassRosePath) {
    ctx.strokeStyle = cmp;
    ctx.lineWidth = RING_STROKE_PX;
    ctx.stroke(cache.compassRosePath);
  } else if (cache.compassRose) {
    ctx.strokeStyle = cmp;
    ctx.lineWidth = RING_STROKE_PX;
    ctx.beginPath();
    const { minX, minY, maxX, maxY } = cache.compassRose.bounds;
    ctx.moveTo(minX, minY);
    ctx.lineTo(maxX, minY);
    ctx.lineTo(maxX, maxY);
    ctx.lineTo(minX, maxY);
    ctx.closePath();
    for (const tick of cache.compassRose.ticks) {
      ctx.moveTo(tick.x1, tick.y1);
      ctx.lineTo(tick.x2, tick.y2);
    }
    ctx.stroke();
  }

  if (cache.compassRoseLabels.length > 0) {
    ctx.font = datablockFontCss(view.charSizes.tools);
    ctx.fillStyle = cmp;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const label of cache.compassRoseLabels) {
      ctx.fillText(label.text, label.x, label.y);
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
  } else {
    for (const loc of cache.localizers) {
      tracePolyline(ctx, loc, true);
      ctx.stroke();
    }
  }

  const mapFont = datablockFontCss(view.charSizes.dataBlocks);
  if (cache.runwayLabels.length > 0) {
    ctx.font = mapFont;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = mpa;
    for (const label of cache.runwayLabels) {
      ctx.fillText(label.text, label.x, label.y);
    }
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
export function drawVideoMapLabel(
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
    ho.kind === "departure" ||
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

  // 1. Conflict Alert: only shown for tracked targets (full datablock in white)
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

  // 2. Inbound / Departure pending handoff: Blinking white FDB
  if (ho.kind === "inbound" || ho.kind === "departure") {
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

  const isSelected = world.selectedAircraftId === ac.id;

  function computeBaseDatablockMode(
    view: ScopeView,
    td?: TrackDisplay,
  ): "full" | "partial" | "limited" {
    if (td?.forcedFdb) {
      return "full";
    }
    const ownership = td?.ownership ?? "unowned";
    if (view.modeFsl === "S") {
      // Semi Mode: selected/clicked owned track expands to FDB; unselected tracks show PDB
      if (isSelected && ownership === "owned") {
        return "full";
      }
      return td?.unassociated ? "limited" : "partial";
    }
    if (view.modeFsl === "L") {
      // Limited Mode: selected/clicked owned track expands to FDB; unselected tracks show LDB
      if (isSelected && ownership === "owned") {
        return "full";
      }
      return "limited";
    }
    return (
      td?.datablockMode ??
      (ownership === "owned" ? "full" : td?.unassociated ? "limited" : "partial")
    );
  }

  // 7. Track highlight (Cyan #00FFFF) or Dwell highlight
  const isDwellHighlighted =
    view.dwellMode !== "OFF" && view.dwellLockedAircraftId === ac.id;
  if (td?.highlighted || isDwellHighlighted) {
    const baseMode = computeBaseDatablockMode(view, td);
    const mode =
      isBeaconatorReadout(view.beaconatorActive, td, world.simTimeMs) && baseMode === "partial"
        ? "full"
        : baseMode;
    return {
      color: PALETTE.highlight,
      visible: true,
      mode,
      leaderColor: PALETTE.highlight,
    };
  }

  // 8. Base ownership
  const ownership = td?.ownership ?? "unowned";
  const baseMode = computeBaseDatablockMode(view, td);
  const mode =
    isBeaconatorReadout(view.beaconatorActive, td, world.simTimeMs) && baseMode === "partial"
      ? "full"
      : baseMode;
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

function trackLeaderLength(view: ScopeView, aircraftId: string): number {
  return view.tracks.get(aircraftId)?.leaderLengthPx ?? view.leaderLengthPx;
}

function trackOwnership(view: ScopeView, aircraftId: string) {
  return view.tracks.get(aircraftId)?.ownership ?? "unowned";
}

function trackColor(view: ScopeView, world: World, ac: Aircraft): string {
  const isTracked = isTrackedTarget(view, world, ac);
  const caSeverity = caSeverityForCallsign(world.alerts.ca, ac.callsign);
  if (isTracked && caSeverity) {
    return PALETTE.owned;
  }
  const td = view.tracks.get(ac.id);
  const identActive = td ? isIdentFlashing(td, world.simTimeMs) : false;
  return targetStrokeColor(trackOwnership(view, ac.id), identActive);
}

export function drawDatablock(
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
  const mode = visual.mode;
  const isQueried = td ? isTrackQueried(td, world.simTimeMs) : false;
  const squawk = td?.squawk ?? ac.squawk;
  const beaconCodeReadout = isBeaconatorReadout(view.beaconatorActive, td, world.simTimeMs);
  const callsign = beaconCodeReadout && squawk ? squawk : ac.callsign;

  const handoff = handoffFor(world, ac.id);
  let handoffSectorId: string | undefined;
  if (handoff.kind === "inbound") {
    handoffSectorId = handoff.fromSectorId;
  } else if (handoff.kind === "departure") {
    handoffSectorId = handoff.fromSectorId === "TWR" ? "T" : handoff.fromSectorId;
  } else if (handoff.kind === "outbound") {
    handoffSectorId = handoff.toSectorId;
  } else if (handoff.kind === "pointout_inbound") {
    handoffSectorId = handoff.fromSectorId;
  } else if (handoff.kind === "pointout_outbound") {
    handoffSectorId = handoff.toSectorId;
  }

  const atpaReadout =
    mode === "full"
      ? atpaInTrailDatablockReadout(world.alerts.atpa, ac.callsign, {
          globalEnabled: view.atpa.inTrailDistance,
          trackEnabled: td?.atpaInTrailDistanceEnabled !== false,
        })
      : null;

  const datablockSource = {
    ...ac,
    callsign,
    squawk,
    atpaDistance: atpaReadout?.text,
  };
  const base = linesForDatablock(datablockSource, mode, {
    modeCVisible: view.modeCVisible,
    scratchpad: derived.sp1,
    sp1: derived.sp1,
    sp2: derived.sp2,
    handoffSectorId,
    queried: isQueried,
    beaconVisible: true,
    simTimeMs: world.simTimeMs,
  });
  let line1 = base.line1;
  if (visual.line1Tag) {
    line1 = `${line1} ${visual.line1Tag}`;
  }
  const lines = { ...base, line1 };
  const lineH = datablockLineHeightPx(view.charSizes.dataBlocks);
  const metrics = datablockMetrics(lines, view.datablockCellWidthPx, lineH);
  const origin = datablockTopLeft(
    trackLeaderDir(view, ac.id),
    metrics,
    trackLeaderLength(view, ac.id),
  );
  const briteCh = mode === "limited" || mode === "partial" ? view.brite.ldb : view.brite.fdb;

  const isTracked = isTrackedTarget(view, world, ac);
  const caSeverity = caSeverityForCallsign(world.alerts.ca, ac.callsign);
  const showCa =
    isTracked && caSeverity && mode === "full" && caDatablockTagVisible(world.simTimeMs);
  const msawSeverity = msawSeverityForCallsign(world.alerts.msaw, ac.callsign);
  let alertTagX = targetX + origin.x;
  const alertTagY = targetY + origin.y - lineH;
  if (showCa) {
    ctx.fillStyle = applyBrite(PALETTE.alert, view.brite.fdb);
    ctx.fillText("CA", alertTagX, alertTagY);
    alertTagX += ctx.measureText("CA ").width;
  }
  if (msawSeverity) {
    ctx.fillStyle = applyBrite(PALETTE.alert, briteCh);
    ctx.fillText(MSAW_DATABLOCK_TAG, alertTagX, alertTagY);
  }

  ctx.fillStyle = applyBrite(visual.color, briteCh);
  ctx.fillText(lines.line1, targetX + origin.x, targetY + origin.y);
  if (lines.line2 != null) {
    ctx.fillText(lines.line2, targetX + origin.x, targetY + origin.y + lineH);
  }
  if (lines.line3 != null) {
    const line3X = targetX + origin.x;
    const line3Y = targetY + origin.y + 2 * lineH;
    if (atpaReadout) {
      const parts = fullDatablockLine3Parts(datablockSource);
      const prefix = [parts.assignedField, parts.squawkField]
        .filter((part): part is string => part != null && part.length > 0)
        .join(DATABLOCK_FIELD_GAP);
      if (prefix.length > 0) {
        ctx.fillText(prefix, line3X, line3Y);
        const prefixW = ctx.measureText(`${prefix}${DATABLOCK_FIELD_GAP}`).width;
        ctx.fillStyle = applyBrite(atpaReadoutColor(atpaReadout.status), briteCh);
        ctx.fillText(atpaReadout.text, line3X + prefixW, line3Y);
      } else {
        ctx.fillStyle = applyBrite(atpaReadoutColor(atpaReadout.status), briteCh);
        ctx.fillText(atpaReadout.text, line3X, line3Y);
      }
    } else {
      ctx.fillText(lines.line3, line3X, line3Y);
    }
  }
}

export function drawTracks(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const historyCount = view.historyEnabled ? view.historyDotCount : 0;
  if (historyCount > 0) {
    for (const ac of world.aircraft) {
      const td = view.tracks.get(ac.id);
      if (!td?.lastReport) {
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

  if (view.ptlOn || view.ptlOwn || view.ptlByAircraftId.size > 0) {
    drawPredictedTrackLines(ctx, world, view, size);
  }

  drawTpaRings(ctx, world, view, size);
  drawManualTpaCones(ctx, world, view, size);
  drawAtpaCones(ctx, world, view, size);

  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    const shown = displayAircraft(ac, td);
    if (!shown || !td?.lastReport) {
      continue;
    }
    const p = nmToScreen(shown.xNm, shown.yNm, view.camera, size);
    const color = trackColor(view, world, ac);
    const isPrimary = isPrimaryTarget(ac, td);
    const ownership: TrackOwnership = td?.ownership ?? "unowned";
    const ho = handoffFor(world, ac.id);
    const isTracked = isTrackedTarget(view, world, ac);
    const bcnMult = (view.brite.bcn ?? 100) / 100;
    const posBrite = isPrimary
      ? view.brite.pri
      : Math.round((isTracked ? view.brite.pos : view.brite.oth) * bcnMult);
    const priMark = applyBrite(TARGET_PUCK_BG, view.brite.pri);
    const squawk = td?.squawk ?? ac.squawk;
    let sectorId = td?.sectorId;
    if (!sectorId) {
      if (ho.kind === "inbound") {
        sectorId = ho.fromSectorId;
      } else if (ho.kind === "departure") {
        sectorId = ho.fromSectorId === "TWR" ? "T" : ho.fromSectorId;
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

    const antenna = td.lastReport.sourceSiteId
      ? view.radarSites.find((site) => site.id === td.lastReport!.sourceSiteId)
      : undefined;
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
        surveillancePaint: td.lastReport.paint,
        groundTrackDeg: td.lastReport.headingDeg,
        reportXNm: td.lastReport.xNm,
        reportYNm: td.lastReport.yNm,
        antennaXNm: antenna?.xNm,
        antennaYNm: antenna?.yNm,
        siteRangeNm: antenna?.rangeNm,
        positionMarkColor: priMark,
        farLineColor: applyBrite(SITE_FAR_LINE_COLOR, view.brite.pri),
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
    const shown = displayAircraft(ac, td);
    if (!shown || isPrimaryTarget(ac, td)) {
      continue;
    }
    // Outside the altitude filter: keep the target (and history above);
    // suppress datablock and leader. T02-05 draws the leader behind this same gate.
    if (!inAltitudeFilter(shown.altitudeFt, view.altitudeFilter)) {
      continue;
    }
    const p = nmToScreen(shown.xNm, shown.yNm, view.camera, size);
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
        trackLeaderLength(view, ac.id),
        view.charSizes.pos,
      );
    }
  }

  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    const shown = displayAircraft(ac, td);
    if (!shown || isPrimaryTarget(ac, td)) {
      continue;
    }
    if (!inAltitudeFilter(shown.altitudeFt, view.altitudeFilter)) {
      continue;
    }
    const p = nmToScreen(shown.xNm, shown.yNm, view.camera, size);
    drawDatablock(ctx, shown, p.x, p.y, view, world);
  }

  drawAtpaConeMileage(ctx, world, view, size);
}

/**
 * A/TPA Mileage digits alongside the painted T02-45 cone. Placement is a
 * local pose (trailer, leader, requiredNm, status) offset from the same
 * `atpaConePoints` axis the wedge uses. Digits paint only when that cone
 * would — `selectAtpaConesToPaint` plus `shouldPaintAtpaGeometry` — so a
 * suppressed cone never keeps a stray numeral. No wedge polyline here.
 */
export function drawAtpaConeMileage(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  if (!view.atpa.coneMileage) {
    return;
  }
  const pairs = world.alerts.atpa;
  if (pairs.length === 0) {
    return;
  }
  ctx.font = datablockFontCss(view.charSizes.tools);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const pair of selectAtpaConesToPaint(pairs)) {
    const trailing = world.aircraft.find((ac) => ac.callsign === pair.trailingCallsign);
    const leading = world.aircraft.find((ac) => ac.callsign === pair.leadingCallsign);
    if (!trailing || !leading) {
      continue;
    }
    const td = view.tracks.get(trailing.id);
    if (!shouldPaintAtpaGeometry(pair.status, atpaConePaintFlags(view, td))) {
      continue;
    }
    if (td?.atpaConeMileageEnabled === false) {
      continue;
    }
    const trailingShown = displayAircraft(trailing, view.tracks.get(trailing.id));
    const leadingShown = displayAircraft(leading, view.tracks.get(leading.id));
    if (!trailingShown || !leadingShown) {
      continue;
    }
    const placed = atpaConeMileagePlacement({
      trailing: { xNm: trailingShown.xNm, yNm: trailingShown.yNm },
      leading: { xNm: leadingShown.xNm, yNm: leadingShown.yNm },
      requiredNm: pair.requiredNm,
      status: pair.status,
    });
    if (!placed) {
      continue;
    }
    const p = nmToScreen(placed.eastNm, placed.northNm, view.camera, size);
    ctx.fillStyle = applyBrite(atpaReadoutColor(placed.status), view.brite.tls);
    ctx.fillText(placed.text, p.x, p.y);
  }
}

/**
 * Straight predicted track line along ground track (default 1.0 min; AUX spinner
 * 0.5/1/2/4). PTL ALL draws every in-filter track; PTL OWN draws F3-owned only;
 * ALL wins if both are on. Per-track `*R` overrides (session, not PREF) can
 * force or hide a line. Canvas bounds clip the rectangular PPI.
 * Altitude-filtered tracks keep the symbol and lose PTL
 * (`inAltitudeFilter` / `shouldDrawPtl`).
 */
export function drawPredictedTrackLines(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  for (const ac of world.aircraft) {
    const shown = displayAircraft(ac, view.tracks.get(ac.id));
    if (!shown) {
      continue;
    }
    const altitudeFiltered = !inAltitudeFilter(shown.altitudeFt, view.altitudeFilter);
    const owned = (view.tracks.get(ac.id)?.ownership ?? "unowned") === "owned";
    if (
      !shouldDrawPtlForTrack(
        shown.speedKt,
        altitudeFiltered,
        owned,
        view.ptlOn,
        view.ptlOwn,
        view.ptlByAircraftId.get(ac.id),
      )
    ) {
      continue;
    }
    const end = ptlEndpoint(shown.xNm, shown.yNm, shown.headingDeg, shown.speedKt, view.ptlMinutes);
    const from = nmToScreen(shown.xNm, shown.yNm, view.camera, size);
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
 * CRC TPA J-rings: world-NM mileage circles about selected (or owned) tracks
 * plus per-track `*J` rings. Stroke is TLS/tools (`TPA_STROKE_COLOR`), not CA
 * red. Radius digits sit inside the ring at lower-left unless inhibited.
 * Canvas bounds clip like range rings (no extra clip call). Manual `*P` cones
 * are `drawManualTpaCones`; ATPA cones are `drawAtpaCones`. CA remains
 * datablock text — not a 3 NM halo. Display only — never a Command.
 */
export function drawTpaRings(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const targets = tpaRingsToPaint(
    view.tpa.on,
    world.selectedAircraftId,
    world.aircraft,
    view.tracks,
    view.tpa.radiusNm,
  );
  if (targets.length === 0) {
    return;
  }
  ctx.strokeStyle = TPA_STROKE_COLOR;
  ctx.lineWidth = TPA_STROKE_PX;
  ctx.fillStyle = TPA_STROKE_COLOR;
  ctx.font = datablockFontCss(view.charSizes.tools);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { aircraft: ac, radiusNm } of targets) {
    const shown = displayAircraft(ac, view.tracks.get(ac.id));
    if (!shown) {
      continue;
    }
    const worldPts = tpaRingPoints(shown.xNm, shown.yNm, radiusNm);
    const pts = worldPts.map((p) => nmToScreen(p.eastNm, p.northNm, view.camera, size));
    tracePolyline(ctx, pts, false);
    ctx.stroke();
    if (tpaSizeReadoutEnabled(view.tracks.get(ac.id))) {
      const digit = tpaRingDigitPlacement(shown.xNm, shown.yNm, radiusNm);
      const p = nmToScreen(digit.eastNm, digit.northNm, view.camera, size);
      ctx.fillText(digit.text, p.x, p.y);
    }
  }
}

/**
 * Manual `*P` TPA cones along ground track. Reuses T02-45 `atpaConePoints` via
 * `manualTpaConePoints`. Unfilled wedge, flat far end cap, TPA tools stroke.
 * Warning/alert ATPA cones suppress this paint; J-rings never do.
 */
export function drawManualTpaCones(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const targets = tpaConesToPaint(world.aircraft, view.tracks, world.alerts.atpa, view.atpa);
  if (targets.length === 0) {
    return;
  }
  ctx.strokeStyle = TPA_STROKE_COLOR;
  ctx.lineWidth = TPA_STROKE_PX;
  ctx.fillStyle = TPA_STROKE_COLOR;
  ctx.font = datablockFontCss(view.charSizes.tools);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const { aircraft: ac, lengthNm } of targets) {
    const shown = displayAircraft(ac, view.tracks.get(ac.id));
    if (!shown) {
      continue;
    }
    const worldPts = manualTpaConePoints(shown.xNm, shown.yNm, shown.headingDeg, lengthNm);
    if (worldPts.length < 2) {
      continue;
    }
    const pts = worldPts.map((p) => nmToScreen(p.eastNm, p.northNm, view.camera, size));
    if (tpaSizeReadoutEnabled(view.tracks.get(ac.id))) {
      const digit = tpaConeDigitPlacement(shown.xNm, shown.yNm, shown.headingDeg, lengthNm);
      const p = nmToScreen(digit.eastNm, digit.northNm, view.camera, size);
      const gap = coneDigitGapBox(ctx, digit.text, p.x, p.y, view.charSizes.tools);
      strokeConeAroundDigits(ctx, pts, gap, size);
      ctx.fillText(digit.text, p.x, p.y);
    } else {
      strokeConeAroundDigits(ctx, pts, null, size);
    }
  }
}

/**
 * ATPA cones from `world.alerts.atpa`. World-NM polyline → screen → stroke.
 * Never filled. One cone per trailing track (highest status). Length is the
 * pair's `requiredNm`. Display only — never a Command. Not a CA halo.
 */
/** Breathing room around the numerals where the cone line is cut away. */
const CONE_DIGIT_GAP_PAD_PX = 1;

interface ScreenBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Box the centered cone digits occupy on screen. `ctx.font` must already be
 * the tools font so `measureText` matches what `fillText` will paint.
 */
function coneDigitGapBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  fontPx: number,
): ScreenBox {
  const cell = measureDatablockCellWidth(ctx);
  const width = cell * text.length + CONE_DIGIT_GAP_PAD_PX * 2;
  const height = fontPx + CONE_DIGIT_GAP_PAD_PX * 2;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

/**
 * Stroke a cone so its lines stop at the mileage digits and pick up again on
 * the far side (Fig 38/39), instead of running through the numerals. The gap
 * is an even-odd clip hole, so the wedge stays one path and one stroke.
 */
function strokeConeAroundDigits(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  gap: ScreenBox | null,
  size: ScopeViewSize,
): void {
  if (!gap) {
    tracePolyline(ctx, pts, false);
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size.widthPx, size.heightPx);
  ctx.rect(gap.x, gap.y, gap.width, gap.height);
  ctx.clip("evenodd");
  tracePolyline(ctx, pts, false);
  ctx.stroke();
  ctx.restore();
}

function atpaConePaintFlags(
  view: ScopeView,
  td: { atpaMonitorEnabled?: boolean; atpaWarningAlertEnabled?: boolean } | undefined,
): AtpaConePaintFlags {
  return {
    atpaMonitorEnabled: td?.atpaMonitorEnabled,
    atpaWarningAlertEnabled: td?.atpaWarningAlertEnabled,
    alertCones: view.atpa.alertCones,
    monitorCones: view.atpa.monitorCones,
  };
}

export function drawAtpaCones(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const pairs = world.alerts.atpa;
  if (pairs.length === 0) {
    return;
  }
  const byCallsign = new Map<string, Aircraft>();
  for (const ac of world.aircraft) {
    byCallsign.set(ac.callsign, ac);
  }
  ctx.lineWidth = TPA_STROKE_PX;
  ctx.font = datablockFontCss(view.charSizes.tools);
  for (const pair of selectAtpaConesToPaint(pairs)) {
    const trailing = byCallsign.get(pair.trailingCallsign);
    const leading = byCallsign.get(pair.leadingCallsign);
    if (!trailing || !leading) {
      continue;
    }
    const td = view.tracks.get(trailing.id);
    if (!shouldPaintAtpaGeometry(pair.status, atpaConePaintFlags(view, td))) {
      continue;
    }
    const trailingShown = displayAircraft(trailing, td);
    const leadingShown = displayAircraft(leading, view.tracks.get(leading.id));
    if (!trailingShown || !leadingShown) {
      continue;
    }
    const worldPts = atpaConePoints(
      trailingShown.xNm,
      trailingShown.yNm,
      leadingShown.xNm,
      leadingShown.yNm,
      pair.requiredNm,
    );
    if (worldPts.length < 2) {
      continue;
    }
    const pts = worldPts.map((p) => nmToScreen(p.eastNm, p.northNm, view.camera, size));
    ctx.strokeStyle = atpaConeColor(pair.status);
    let gap: ScreenBox | null = null;
    if (view.atpa.coneMileage && td?.atpaConeMileageEnabled !== false) {
      const placed = atpaConeMileagePlacement({
        trailing: { xNm: trailingShown.xNm, yNm: trailingShown.yNm },
        leading: { xNm: leadingShown.xNm, yNm: leadingShown.yNm },
        requiredNm: pair.requiredNm,
        status: pair.status,
      });
      if (placed) {
        const digit = nmToScreen(placed.eastNm, placed.northNm, view.camera, size);
        gap = coneDigitGapBox(ctx, placed.text, digit.x, digit.y, view.charSizes.tools);
      }
    }
    strokeConeAroundDigits(ctx, pts, gap, size);
  }
}

const SSA_LEFT_PX = 8;
const SSA_TOP_PX = 8;

/**
 * Screen-fixed SSA + GI TEXT (CRC R07 analog). Phosphor-green mono. Never a Command.
 * FILTER / RANGE live here so the lower-left stays clear for the on-PPI list.
 * GI TEXT is authored facility lines (not a METAR panel / HUD). Empty slots never paint.
 */
export function drawSsa(ctx: CanvasRenderingContext2D, world: World, view: ScopeView): number {
  const hasAlert =
    (world.alerts?.msaw && world.alerts.msaw.length > 0) ||
    (world.alerts?.ca && world.alerts.ca.length > 0);

  const airportId = world.catalog?.airportId ?? "KDEM";
  const rwys: string[] = [];
  const seenRwys = new Set<string>();
  for (const approach of world.catalog?.approaches ?? []) {
    const id = approach.runwayId ?? approach.runway;
    if (!id || seenRwys.has(id)) {
      continue;
    }
    seenRwys.add(id);
    rwys.push(id);
  }
  const primaryRwy = rwys[0] ?? "27";
  const secondaryRwy = rwys[1] ?? (primaryRwy === "27" ? "09" : "27");
  const pairing = `${primaryRwy}/${secondaryRwy}`;
  const crdaRpcStatus = `*S1 ${airportId} ${pairing}`;

  const ssaLines = buildSsaRenderLines({
    simTimeMs: world.simTimeMs,
    nowMs: world.simTimeMs,
    rangeNm: view.camera.rangeNm,
    offCenter: isViewOffAirport(view),
    filter: view.altitudeFilter,
    filterEntry: view.filterEntry,
    visibility: view.ssaFilter,
    ptlMinutes: view.ptlMinutes,
    hasAlert: Boolean(hasAlert),
    airportCode: airportId,
    primaryAltimeter: view.primaryAltimeter ?? SSA_ALTIMETER_STUB,
    airportAltimeters: view.airportAltimeters,
    wxLevels: view.wxLevels,
    wxMosaic: view.wxMosaic,
    crdaRpcStatus,
    systemStatus: SSA_NETWORK_HEALTH_STUB,
    surveillanceMode: surveillanceModeWord(
      effectiveSurveillanceMode(view.surveillanceMode, view.radarSites),
    ),
  });
  const giLines = buildGiLines(view.giTextLines, view.giFilterVisible);

  const lineH = datablockLineHeightPx(view.charSizes.lists);
  ctx.font = datablockFontCss(view.charSizes.lists);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const defaultColor = applyBrite(PALETTE.ssa, view.brite.lst);
  const alertColor = applyBrite(PALETTE.alert, view.brite.lst);

  let y = SSA_TOP_PX;
  for (const item of ssaLines) {
    if (item.text === "▼") {
      const listSize = view.charSizes.lists;
      const triFontSize = Math.round(listSize * 1.25);
      ctx.font = datablockFontCss(triFontSize);
      const metrics = ctx.measureText(item.text);
      const triW = metrics.width > 0 ? metrics.width : Math.round(triFontSize * 0.85);
      const triH = Math.round(triFontSize * 0.9);
      ctx.fillStyle = alertColor;
      ctx.fillText(item.text, SSA_LEFT_PX, y);
      ctx.strokeStyle = defaultColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(SSA_LEFT_PX, y, triW, triH);
      ctx.font = datablockFontCss(view.charSizes.lists);
      y += triH + Math.round(lineH * 0.25);
    } else {
      ctx.fillStyle = item.style === "alert" || item.style === "spc" ? alertColor : defaultColor;
      ctx.fillText(item.text, SSA_LEFT_PX, y);
      y += lineH;
    }
  }
  for (const line of giLines) {
    ctx.fillStyle = defaultColor;
    ctx.fillText(line, SSA_LEFT_PX, y);
    y += lineH;
  }
  return y;
}

export function drawChordHint(
  ctx: CanvasRenderingContext2D,
  view: ScopeView,
  ssaBottomY: number,
): void {
  const stars = formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed);
  const preview = formatPreviewReadout(view.preview);
  const hint = view.pendingChord?.hint;
  if (!stars && !preview && !hint) {
    return;
  }
  ctx.font = datablockFontCss(view.charSizes.lists);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  if (stars) {
    ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
    ctx.fillText(stars, SSA_LEFT_PX, ssaBottomY + 4);
    return;
  }
  if (preview) {
    ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
    ctx.fillText(preview, SSA_LEFT_PX, ssaBottomY + 4);
    return;
  }
  ctx.fillStyle = PALETTE.uiChrome;
  ctx.fillText(hint ?? "", SSA_LEFT_PX, ssaBottomY + 4);
}

/**
 * GEO MAPS / CURRENT lists: screen-fixed video-map inventory (CRC analog).
 * Map-green mono like SSA. Canvas text is not a hit target, so empty-PPI
 * deselect is unchanged. No HTML select. Not OSM / precipitation.
 */
export function drawMapLists(
  ctx: CanvasRenderingContext2D,
  view: ScopeView,
  cssWidth: number,
): void {
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

export function drawSystemLists(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  cssWidth: number,
  cssHeight: number,
): void {
  if (!view.systemLists) {
    return;
  }

  const lineH = datablockLineHeightPx(view.charSizes.lists);
  ctx.font = datablockFontCss(view.charSizes.lists);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const textColor = applyBrite(PALETTE.ssa, view.brite.lst);

  const activeRects: { id: string; bounds: ListRect }[] = [];
  const airportId = world.catalog?.airportId ?? "KDEM";

  for (const [id, placement] of Object.entries(view.systemLists)) {
    if (!placement.visible && id !== "ALERT") {
      continue;
    }

    let lines: string[] = [];
    switch (id) {
      case "SIGN_ON":
        lines = buildSignOnList();
        break;
      case "TAB":
        lines = buildTabFlightPlanList(world, placement.maxLines);
        break;
      case "VFR":
        lines = buildVfrList(world, placement.maxLines);
        break;
      case "TOWER_1":
        lines = buildTowerArrivalList(
          world,
          view.towerAirports?.[0] ?? airportId,
          0,
          0,
          placement.maxLines,
        );
        break;
      case "TOWER_2":
        lines = buildTowerArrivalList(
          world,
          view.towerAirports?.[1] ?? airportId,
          0,
          0,
          placement.maxLines,
        );
        break;
      case "TOWER_3":
        lines = buildTowerArrivalList(
          world,
          view.towerAirports?.[2] ?? airportId,
          0,
          0,
          placement.maxLines,
        );
        break;
      case "ALERT":
        lines = buildAlertList(world, placement.maxLines);
        break;
      case "COAST":
        lines = buildCoastSuspendList([], placement.maxLines);
        break;
      case "CRDA":
        lines = buildCrdaStatusList(view.crdaRpcConfigs, placement.maxLines, airportId);
        break;
      case "MAPS":
        lines = buildVideoMapsListLines(view, "ALL", placement.maxLines);
        break;
      default:
        break;
    }

    if (lines.length === 0) {
      continue;
    }

    const x = Math.round(placement.x * cssWidth);
    const y = Math.round(placement.y * cssHeight);
    let maxLineW = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxLineW) maxLineW = w;
    }
    const width = Math.max(maxLineW + 8, 80);
    const height = lines.length * lineH + 4;
    const bounds: ListRect = { x, y, width, height };
    activeRects.push({ id, bounds });

    // Draw text lines
    ctx.fillStyle = textColor;
    let textY = y;
    for (const line of lines) {
      ctx.fillText(line, x, textY);
      textY += lineH;
    }

    // If showAllFrames is enabled, draw frame title
    if (view.listDrag?.showAllFrames) {
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
      ctx.fillText(`[${placement.frameTitle}]`, x, y - lineH);
    }
  }

  // Check and draw overlapping warning boxes
  const overlapping = findOverlappingLists(activeRects);
  if (overlapping.size > 0 && !view.listDrag?.movingListId) {
    ctx.strokeStyle = "#00FF00";
    ctx.lineWidth = 1;
    for (const item of activeRects) {
      if (overlapping.has(item.id)) {
        ctx.strokeRect(
          item.bounds.x - 2,
          item.bounds.y - 2,
          item.bounds.width + 4,
          item.bounds.height + 4,
        );
      }
    }
  }

  // Draw active middle-click drag frames
  if (
    view.listDrag?.movingListId &&
    view.listDrag.movingAnchorRect &&
    view.listDrag.movingCurrentPos &&
    view.listDrag.movingOffset
  ) {
    // Green anchor box
    ctx.strokeStyle = "#00FF00";
    ctx.lineWidth = 1;
    const anchor = view.listDrag.movingAnchorRect;
    ctx.strokeRect(anchor.x - 2, anchor.y - 2, anchor.width + 4, anchor.height + 4);

    // White moving box
    ctx.strokeStyle = "#FFFFFF";
    const movingX = view.listDrag.movingCurrentPos.x - view.listDrag.movingOffset.x;
    const movingY = view.listDrag.movingCurrentPos.y - view.listDrag.movingOffset.y;
    ctx.strokeRect(movingX - 2, movingY - 2, anchor.width + 4, anchor.height + 4);
  }
}
