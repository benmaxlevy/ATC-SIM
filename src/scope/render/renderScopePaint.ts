/**
 * PPI paint stages. Draw order is owned by renderScope().
 */
import {
  caPairKey,
  caSeverityForCallsign,
  handoffFor,
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
  withInboundHandoffCue,
  type DatablockMode,
} from "../datablock";
import { datablockFontCss, datablockLineHeightPx, measureDatablockCellWidth } from "../fonts";
import {
  pointInLayoutBounds,
  solveDatablockLayout,
  type ProtectedGeometry,
  type DatablockLayoutInput,
  type ResolvedDatablockLayout,
} from "../datablockLayout";
import {
  datablockTopLeft,
  DEFAULT_LEADER_DIR,
  drawLeaderLine,
  leaderSegmentPx,
  type LeaderDir,
} from "../leader";
import { type MapCache } from "../mapLayers";
import { historyDotsToDraw } from "../history";
import { drawPredictedTrackLine, ptlEndpoint, shouldDrawPtlForTrack, PTL_STROKE_PX } from "../ptl";
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
import type { TrackOwnership } from "../ownership";
import { BLINK_HALF_PERIOD_MS, PALETTE, applyBrite, isAlertBlinkOn } from "../palette";
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
  filterActiveCaAlerts,
  isBeaconatorReadout,
  isIdentFlashing,
  isTrackQueried,
  isCaPairInhibited,
  type TrackDisplay,
} from "../trackDisplay";
import {
  DEFAULT_SYSTEM_LIST_PLACEMENTS,
  buildAlertList,
  buildCoastSuspendList,
  buildCrdaStatusList,
  buildSignOnList,
  buildTabFlightPlanList,
  buildTowerArrivalList,
  buildVfrList,
  canonicalSystemListId,
  findOverlappingLists,
  resolveAirportCoordinates,
  resolveTowerAirport,
  type ListRect,
} from "../systemLists";
import { buildVideoMapsListLines, getVideoMapsEntries } from "../coordinationList";

/** CA severity after track and pair inhibits, preserving other active pairs. */
function caSeverityForVisibleTrack(view: ScopeView, world: World, callsign: string) {
  return caSeverityForCallsign(filterActiveCaAlerts(world.alerts.ca, world, view), callsign);
}

/** Pair inhibit Δ is shown only for a member of an inhibited active CA pair. */
function isCaPairInhibitedForTrack(view: ScopeView, world: World, ac: Aircraft): boolean {
  return world.alerts.ca.some((alert) => {
    if (alert.callsignA !== ac.callsign && alert.callsignB !== ac.callsign) return false;
    const trackA = world.aircraft.find((candidate) => candidate.callsign === alert.callsignA);
    const trackB = world.aircraft.find((candidate) => candidate.callsign === alert.callsignB);
    if (
      view.caControllerOwnedPairsInhibited &&
      trackA &&
      trackB &&
      view.tracks.get(trackA.id)?.ownership === "owned" &&
      view.tracks.get(trackB.id)?.ownership === "owned"
    ) {
      return true;
    }
    if (isCaPairInhibited(view, alert.callsignA, alert.callsignB)) return true;
    return Boolean(trackA && trackB && isCaPairInhibited(view, trackA.id, trackB.id));
  });
}

const RING_STROKE_PX = 1;
const RUNWAY_STROKE_PX = 2;
const MAP_STROKE_PX = 1;

/** Collects only target-owned, visible geometry. Shared by layout callers. */
export function collectDatablockProtectedGeometry(
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): ProtectedGeometry[] {
  const out: ProtectedGeometry[] = [];
  const point = (ac: Aircraft) => {
    const shown = displayAircraft(ac, view.tracks.get(ac.id));
    return shown ? nmToScreen(shown.xNm, shown.yNm, view.camera, size) : null;
  };
  for (const ac of world.aircraft) {
    const p = point(ac);
    if (!p) continue;
    const td = view.tracks.get(ac.id);
    out.push({
      kind: "circle",
      aircraftId: ac.id,
      center: p,
      radius: Math.max(7, view.charSizes.pos / 2 + 2),
    });
    if (view.historyEnabled && td)
      for (const h of [historyDotsToDraw(td.history, view.historyDotCount)])
        for (let i = 0; i < h.eastNm.length; i += 1) {
          const q = nmToScreen(h.eastNm[i]!, h.northNm[i]!, view.camera, size);
          out.push({ kind: "circle", aircraftId: ac.id, center: q, radius: 2 });
        }
    const shown = displayAircraft(ac, td)!;
    const filtered = !inAltitudeFilter(shown.altitudeFt, view.altitudeFilter);
    if (
      shouldDrawPtlForTrack(
        shown.speedKt,
        filtered,
        td?.ownership === "owned",
        view.ptlOn,
        view.ptlOwn,
        view.ptlByAircraftId.get(ac.id),
      )
    ) {
      const e = ptlEndpoint(shown.xNm, shown.yNm, shown.headingDeg, shown.speedKt, view.ptlMinutes);
      out.push({
        kind: "segment",
        aircraftId: ac.id,
        from: p,
        to: nmToScreen(e.eastNm, e.northNm, view.camera, size),
        strokePx: PTL_STROKE_PX,
      });
    }
    const dir = trackLeaderDir(view, ac.id),
      len = trackLeaderLength(view, ac.id);
    const segment = leaderSegmentPx(dir, len, view.charSizes.pos);
    if (segment)
      out.push({
        kind: "segment",
        aircraftId: ac.id,
        from: { x: p.x + segment.x0, y: p.y + segment.y0 },
        to: { x: p.x + segment.x1, y: p.y + segment.y1 },
        strokePx: 1,
      });
  }
  for (const { aircraft: ac, radiusNm } of tpaRingsToPaint(
    view.tpa.on,
    world.selectedAircraftId,
    world.aircraft,
    view.tracks,
    view.tpa.radiusNm,
  )) {
    const shown = displayAircraft(ac, view.tracks.get(ac.id));
    if (!shown) continue;
    const pts = tpaRingPoints(shown.xNm, shown.yNm, radiusNm).map((q) =>
      nmToScreen(q.eastNm, q.northNm, view.camera, size),
    );
    out.push({ kind: "polyline", aircraftId: ac.id, points: pts, strokePx: TPA_STROKE_PX });
  }
  for (const { aircraft: ac, lengthNm } of tpaConesToPaint(
    world.aircraft,
    view.tracks,
    world.alerts.atpa,
    view.atpa,
  )) {
    const shown = displayAircraft(ac, view.tracks.get(ac.id));
    if (!shown) continue;
    const pts = manualTpaConePoints(shown.xNm, shown.yNm, shown.headingDeg, lengthNm).map((q) =>
      nmToScreen(q.eastNm, q.northNm, view.camera, size),
    );
    out.push({ kind: "polygon", aircraftId: ac.id, points: pts, strokePx: TPA_STROKE_PX });
  }
  const byCallsign = new Map(world.aircraft.map((ac) => [ac.callsign, ac]));
  for (const pair of selectAtpaConesToPaint(world.alerts.atpa)) {
    const trailing = byCallsign.get(pair.trailingCallsign),
      leading = byCallsign.get(pair.leadingCallsign);
    if (!trailing || !leading) continue;
    const td = view.tracks.get(trailing.id);
    if (!shouldPaintAtpaGeometry(pair.status, atpaConePaintFlags(view, td))) continue;
    const a = displayAircraft(trailing, td),
      b = displayAircraft(leading, view.tracks.get(leading.id));
    if (!a || !b) continue;
    const pts = atpaConePoints(a.xNm, a.yNm, b.xNm, b.yNm, pair.requiredNm).map((q) =>
      nmToScreen(q.eastNm, q.northNm, view.camera, size),
    );
    out.push({
      kind: "polygon",
      aircraftId: trailing.id,
      aircraftIds: [trailing.id, leading.id],
      points: pts,
      strokePx: TPA_STROKE_PX,
    });
  }
  return out;
}

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

export function isCaInhibitedForTrack(
  ac: Aircraft,
  td: TrackDisplay | undefined,
  view?: ScopeView,
): boolean {
  if (
    td?.caInhibited ||
    td?.inhibitCA ||
    (td as { caInhibit?: boolean } | undefined)?.caInhibit ||
    (td as { inhibitCa?: boolean } | undefined)?.inhibitCa ||
    (ac as { caInhibited?: boolean }).caInhibited ||
    (ac as { inhibitCA?: boolean }).inhibitCA
  ) {
    return true;
  }
  if (
    (view as { caInhibitedTracks?: Set<string> } | undefined)?.caInhibitedTracks?.has(ac.id) ||
    (view as { caInhibitedTracks?: Set<string> } | undefined)?.caInhibitedTracks?.has(ac.callsign)
  ) {
    return true;
  }
  return false;
}

export function isCaAlertAcknowledged(
  ac: Aircraft,
  td: TrackDisplay | undefined,
  view: ScopeView,
  world: World,
): boolean {
  if (
    td?.caAcknowledged ||
    td?.alertAcknowledged ||
    (td as { acknowledged?: boolean } | undefined)?.acknowledged ||
    (td as { isAck?: boolean } | undefined)?.isAck ||
    (ac as { caAcknowledged?: boolean }).caAcknowledged ||
    (ac as { acknowledged?: boolean }).acknowledged
  ) {
    return true;
  }
  const caAlerts = world.alerts?.ca;
  if (caAlerts) {
    for (const alert of caAlerts) {
      if (alert.callsignA === ac.callsign || alert.callsignB === ac.callsign) {
        if (
          (alert as { acknowledged?: boolean }).acknowledged ||
          (alert as { isAck?: boolean }).isAck
        ) {
          return true;
        }
        const pairKey = caPairKey(alert.callsignA, alert.callsignB);
        if (
          (view as { acknowledgedAlertPairs?: Set<string> }).acknowledgedAlertPairs?.has(pairKey) ||
          (view as { acknowledgedAlerts?: Set<string> }).acknowledgedAlerts?.has(pairKey)
        ) {
          return true;
        }
      }
    }
  }
  if (
    (view as { acknowledgedAlerts?: Set<string> }).acknowledgedAlerts?.has(ac.callsign) ||
    (view as { acknowledgedAlerts?: Set<string> }).acknowledgedAlerts?.has(ac.id)
  ) {
    return true;
  }
  return false;
}

export function isMsawAlertAcknowledged(
  ac: Aircraft,
  td: TrackDisplay | undefined,
  view: ScopeView,
  world: World,
): boolean {
  if (
    td?.msawAcknowledged ||
    (td as { laAcknowledged?: boolean } | undefined)?.laAcknowledged ||
    td?.alertAcknowledged ||
    (td as { acknowledged?: boolean } | undefined)?.acknowledged ||
    (td as { isAck?: boolean } | undefined)?.isAck ||
    (ac as { msawAcknowledged?: boolean }).msawAcknowledged ||
    (ac as { acknowledged?: boolean }).acknowledged
  ) {
    return true;
  }
  const msawAlerts = world.alerts?.msaw;
  if (msawAlerts) {
    for (const alert of msawAlerts) {
      if (
        alert.callsign === ac.callsign &&
        ((alert as { acknowledged?: boolean }).acknowledged || (alert as { isAck?: boolean }).isAck)
      ) {
        return true;
      }
    }
  }
  if (
    (view as { acknowledgedAlerts?: Set<string> }).acknowledgedAlerts?.has(ac.callsign) ||
    (view as { acknowledgedAlerts?: Set<string> }).acknowledgedAlerts?.has(ac.id)
  ) {
    return true;
  }
  return false;
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
  const isCaInhibited = isCaInhibitedForTrack(ac, td, view);
  const caSeverity = !isCaInhibited ? caSeverityForVisibleTrack(view, world, ac.callsign) : null;
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
    const isBlinkOn = isAlertBlinkOn(world.simTimeMs);
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
      const isBlinkOn = isAlertBlinkOn(world.simTimeMs);
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
  const isDwellHighlighted = view.dwellMode !== "OFF" && view.dwellLockedAircraftId === ac.id;
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
  const td = view.tracks.get(ac.id);
  const isCaInhibited = isCaInhibitedForTrack(ac, td, view);
  const caSeverity = !isCaInhibited ? caSeverityForVisibleTrack(view, world, ac.callsign) : null;
  if (isTracked && caSeverity) {
    return PALETTE.owned;
  }
  const identActive = td ? isIdentFlashing(td, world.simTimeMs) : false;
  return targetStrokeColor(trackOwnership(view, ac.id), identActive);
}

type AlertGlyph = {
  text: "Δ" | "*" | "+";
  color: string;
  visible: boolean;
};

/** MCI records are deliberately tolerant of the adapted alert row shape. */
function hasMciAlertForTrack(world: World, ac: Aircraft): boolean {
  const alerts = (world.alerts as { mci?: Array<Record<string, string | undefined>> }).mci;
  return Boolean(
    alerts?.some((alert) =>
      [
        alert.intruderSquawkOrCallsign,
        alert.intruder,
        alert.intruderSquawk,
        alert.squawk,
        alert.callsignA,
        alert.protectedCallsign,
        alert.protectedFlight,
        alert.callsignB,
        alert.callsign,
      ].includes(ac.callsign),
    ),
  );
}

/**
 * STARS Field 2 inhibit symbols sit immediately after the ACID. `*` is MSAW,
 * `Δ` is CA/MCI, and `+` is both inhibited. Field 0 above the datablock shows
 * active `LA`, `CA`, or slash-separated `LA/CA` indicators.
 */
function alertGlyphsForTrack(args: {
  caInhibited: boolean;
  msawInhibited: boolean;
  mciInhibited: boolean;
  normalColor: string;
}): AlertGlyph[] {
  const glyphs: AlertGlyph[] = [];
  const caOrMciInhibited = args.caInhibited || args.mciInhibited;
  if (args.msawInhibited && caOrMciInhibited) {
    glyphs.push({ text: "+", color: args.normalColor, visible: true });
  } else if (caOrMciInhibited) {
    glyphs.push({ text: "Δ", color: args.normalColor, visible: true });
  } else if (args.msawInhibited) {
    glyphs.push({ text: "*", color: args.normalColor, visible: true });
  }
  return glyphs;
}

export function drawDatablock(
  ctx: CanvasRenderingContext2D,
  ac: Aircraft,
  targetX: number,
  targetY: number,
  view: ScopeView,
  world: World,
  resolved?: ResolvedDatablockLayout,
): void {
  const visual = getDatablockVisualState(view, world, ac);
  if (!visual.visible) {
    return;
  }
  ctx.font = datablockFontCss(view.charSizes.dataBlocks);
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
  let line1WithoutAlert = base.line1;
  if (visual.line1Tag) {
    line1WithoutAlert = `${line1WithoutAlert} ${visual.line1Tag}`;
  }
  const lineH = datablockLineHeightPx(view.charSizes.dataBlocks);

  const isCaInhibited = isCaInhibitedForTrack(ac, td, view);
  const isCaPairInhibited = isCaPairInhibitedForTrack(view, world, ac);
  const caSeverity = !isCaInhibited ? caSeverityForVisibleTrack(view, world, ac.callsign) : null;
  const isMsawInhibited = Boolean(
    td?.msawInhibited ||
    (td as { inhibitMSAW?: boolean } | undefined)?.inhibitMSAW ||
    (td as { inhibitMsaw?: boolean } | undefined)?.inhibitMsaw ||
    (ac as { msawInhibited?: boolean }).msawInhibited,
  );
  const msawSeverity = !isMsawInhibited
    ? msawSeverityForCallsign(world.alerts.msaw, ac.callsign)
    : null;
  const mciActive = hasMciAlertForTrack(world, ac);
  const mciInhibited = mciActive && view.mciEnabled === false;
  const briteCh = mode === "limited" || mode === "partial" ? view.brite.ldb : view.brite.fdb;
  const alertGlyphs =
    mode === "full" || mode === "partial"
      ? alertGlyphsForTrack({
          caInhibited: isCaInhibited || isCaPairInhibited,
          msawInhibited: isMsawInhibited,
          mciInhibited,
          normalColor: applyBrite(PALETTE.owned, briteCh),
        })
      : [];
  // Field 2 inhibit symbols occupy inline cells immediately after the ACID.
  const line1 = [line1WithoutAlert, ...alertGlyphs.map((glyph) => glyph.text)].join(" ");
  const lines = { ...base, line1 };
  const metrics = datablockMetrics(lines, view.datablockCellWidthPx, lineH);
  const origin = datablockTopLeft(
    trackLeaderDir(view, ac.id),
    metrics,
    trackLeaderLength(view, ac.id),
  );
  const textX = resolved?.rect ? resolved.rect.x : targetX + origin.x;
  const textY = resolved?.rect ? resolved.rect.y : targetY + origin.y;

  ctx.fillStyle = applyBrite(visual.color, briteCh);
  ctx.fillText(line1WithoutAlert, textX, textY);
  let alertGlyphX = textX + ctx.measureText(line1WithoutAlert).width;
  for (const glyph of alertGlyphs) {
    alertGlyphX += ctx.measureText(" ").width;
    if (glyph.visible) {
      ctx.fillStyle = glyph.color;
      ctx.fillText(glyph.text, alertGlyphX, textY);
    }
    alertGlyphX += ctx.measureText(glyph.text).width;
  }
  if (mode === "full" || mode === "partial") {
    const caAcknowledged = isCaAlertAcknowledged(ac, td, view, world);
    const msawAcknowledged = isMsawAlertAcknowledged(ac, td, view, world);
    const blinkOn = isAlertBlinkOn(world.simTimeMs);
    const hasLa = msawSeverity != null;
    const hasCa = caSeverity != null || (mciActive && !mciInhibited);
    const requiresBlink =
      (hasLa && !msawAcknowledged) ||
      (caSeverity != null && !caAcknowledged) ||
      (mciActive && !mciInhibited);
    const line0 = [hasLa ? "LA" : null, hasCa ? "CA" : null].filter(Boolean).join("/");
    // LA/CA is one Field 0 indication. If either condition remains unacknowledged,
    // blink the complete indication rather than alternating LA/CA and CA.
    if (line0.length > 0 && (!requiresBlink || blinkOn)) {
      ctx.fillStyle = applyBrite(PALETTE.alert, briteCh);
      ctx.fillText(line0, textX, textY - lineH);
    }
    // Line 0 is the only red safety-alert field. Restore the normal datablock
    // color before painting Lines 2–3 so canvas state cannot bleed downward.
    ctx.fillStyle = applyBrite(visual.color, briteCh);
  }
  if (lines.line2 != null) {
    ctx.fillText(lines.line2, textX, textY + lineH);
  }
  if (lines.line3 != null) {
    const line3X = textX;
    const line3Y = textY + 2 * lineH;
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

  const layoutItems: DatablockLayoutInput[] = world.aircraft.flatMap((ac) => {
    const td = view.tracks.get(ac.id);
    const shown = displayAircraft(ac, td);
    if (
      !shown ||
      isPrimaryTarget(ac, td) ||
      !inAltitudeFilter(shown.altitudeFt, view.altitudeFilter)
    ) {
      return [];
    }
    const visual = getDatablockVisualState(view, world, ac);
    if (!visual.visible) return [];
    const mode = visual.mode;
    const derived = deriveScratchpads(ac, td);
    const handoff = handoffFor(world, ac.id);
    const handoffSectorId =
      handoff.kind === "inbound" || handoff.kind === "departure"
        ? handoff.kind === "departure" && handoff.fromSectorId === "TWR"
          ? "T"
          : handoff.fromSectorId
        : handoff.kind === "outbound" || handoff.kind === "pointout_outbound"
          ? handoff.toSectorId
          : handoff.kind === "pointout_inbound"
            ? handoff.fromSectorId
            : undefined;
    const squawk = td?.squawk ?? ac.squawk;
    const beaconCodeReadout = isBeaconatorReadout(view.beaconatorActive, td, world.simTimeMs);
    const callsign = beaconCodeReadout && squawk ? squawk : ac.callsign;
    const atpaReadout =
      mode === "full"
        ? atpaInTrailDatablockReadout(world.alerts.atpa, ac.callsign, {
            globalEnabled: view.atpa.inTrailDistance,
            trackEnabled: td?.atpaInTrailDistanceEnabled !== false,
          })
        : null;
    const base = linesForDatablock(
      { ...shown, callsign, squawk, atpaDistance: atpaReadout?.text },
      mode,
      {
        modeCVisible: view.modeCVisible,
        scratchpad: derived.sp1,
        sp1: derived.sp1,
        sp2: derived.sp2,
        handoffSectorId,
        queried: td ? isTrackQueried(td, world.simTimeMs) : false,
        simTimeMs: world.simTimeMs,
        beaconVisible: true,
      },
    );
    let line1 = visual.line1Tag ? `${base.line1} ${visual.line1Tag}` : base.line1;
    if (!visual.line1Tag && mode !== "limited" && mode !== "partial") {
      line1 = withInboundHandoffCue(line1, handoff);
    }
    const lines = { ...base, line1 };
    const p = nmToScreen(shown.xNm, shown.yNm, view.camera, size);
    if (!pointInLayoutBounds(p, { x: 0, y: 0, width: size.widthPx, height: size.heightPx })) {
      return [];
    }
    const metrics = datablockMetrics(
      lines,
      view.datablockCellWidthPx,
      datablockLineHeightPx(view.charSizes.dataBlocks),
    );
    const dir = trackLeaderDir(view, ac.id);
    const length = trackLeaderLength(view, ac.id);
    const origin = datablockTopLeft(dir, metrics, length);
    return [
      {
        aircraftId: ac.id,
        targetPoint: p,
        preferredRect: {
          x: p.x + origin.x,
          y: p.y + origin.y,
          width: metrics.widthPx,
          height: metrics.heightPx,
        },
        metrics,
        leaderDir: dir,
        leaderLengthPx: length,
        displayPriority: mode === "full" ? "full" : mode === "partial" ? "partial" : "limited",
        selected: world.selectedAircraftId === ac.id,
      },
    ];
  });
  const layouts = solveDatablockLayout(layoutItems, {
    bounds: { x: 0, y: 0, width: size.widthPx, height: size.heightPx },
    protectedGeometry: collectDatablockProtectedGeometry(world, view, size),
  });
  const layoutById = new Map(layouts.map((layout) => [layout.aircraftId, layout]));
  const preferredById = new Map(layoutItems.map((item) => [item.aircraftId, item.preferredRect]));
  const hasDensity = layouts.some((layout) => layout.unplaced);
  if (hasDensity) {
    ctx.fillStyle = applyBrite(PALETTE.caution, view.brite.fdb);
    ctx.font = datablockFontCss(view.charSizes.tools);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("DATABLOCK DENSITY", 8, 8);
  }

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
      const layout = layoutById.get(ac.id);
      const preferred = preferredById.get(ac.id);
      if (
        layout?.rect &&
        preferred &&
        (layout.rect.x !== preferred.x || layout.rect.y !== preferred.y)
      ) {
        const r = layout.rect;
        const ex = Math.max(r.x, Math.min(p.x, r.x + r.width));
        const ey = Math.max(r.y, Math.min(p.y, r.y + r.height));
        if (Math.hypot(ex - p.x, ey - p.y) > 1) {
          ctx.strokeStyle = leaderColor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
      } else if (layout?.rect) {
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
    const layout = layoutById.get(ac.id);
    if (!layout || layout.unplaced) continue;
    drawDatablock(ctx, shown, p.x, p.y, view, world, layout);
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

export interface SsaDrawResult {
  bottomY: number;
  bounds: ListRect;
  handleBounds: ListRect;
}

/**
 * Screen-fixed SSA + GI TEXT (CRC R07 analog). Phosphor-green mono. Never a Command.
 * FILTER / RANGE live here so the lower-left stays clear for the on-PPI list.
 * GI TEXT is authored facility lines (not a METAR panel / HUD). Empty slots never paint.
 */
export function drawSsa(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  cssWidth: number = 800,
  cssHeight: number = 600,
): SsaDrawResult {
  const placement = view.systemLists?.SSA ?? DEFAULT_SYSTEM_LIST_PLACEMENTS.SSA;
  if (!placement.visible) {
    return {
      bottomY: 0,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      handleBounds: { x: 0, y: 0, width: 0, height: 0 },
    };
  }

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

  const ssaX = Math.round(placement.x * cssWidth);
  const ssaY = Math.round(placement.y * cssHeight);
  let y = ssaY;
  let maxLineW = 0;
  let triW = 0;
  let triH = 0;

  for (const item of ssaLines) {
    if (item.text === "▼") {
      const listSize = view.charSizes.lists;
      const triFontSize = Math.round(listSize * 1.25);
      ctx.font = datablockFontCss(triFontSize);
      const metrics = ctx.measureText(item.text);
      triW = metrics.width > 0 ? metrics.width : Math.round(triFontSize * 0.85);
      triH = Math.round(triFontSize * 0.9);
      if (triW > maxLineW) maxLineW = triW;
      ctx.fillStyle = alertColor;
      ctx.fillText(item.text, ssaX, y);
      ctx.strokeStyle = defaultColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(ssaX, y, triW, triH);
      ctx.font = datablockFontCss(view.charSizes.lists);
      y += triH + Math.round(lineH * 0.25);
    } else {
      const w = ctx.measureText(item.text).width;
      if (w > maxLineW) maxLineW = w;
      ctx.fillStyle = item.style === "alert" || item.style === "spc" ? alertColor : defaultColor;
      ctx.fillText(item.text, ssaX, y);
      y += lineH;
    }
  }
  for (const line of giLines) {
    const w = ctx.measureText(line).width;
    if (w > maxLineW) maxLineW = w;
    ctx.fillStyle = defaultColor;
    ctx.fillText(line, ssaX, y);
    y += lineH;
  }

  const width = Math.max(maxLineW + 8, 80);
  const height = y - ssaY + 4;
  const bounds: ListRect = { x: ssaX, y: ssaY, width, height };
  const handleBounds: ListRect = {
    x: ssaX,
    y: ssaY,
    width,
    height: Math.max(triH + 4, 18),
  };
  return { bottomY: y, bounds, handleBounds };
}

export function drawChordHint(
  ctx: CanvasRenderingContext2D,
  view: ScopeView,
  cssWidth = 800,
  cssHeight = 600,
): void {
  const stars = formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed);
  const preview = formatPreviewReadout(view.preview);
  const hint = view.pendingChord?.hint;
  if (!stars && !preview && !hint) {
    return;
  }
  const placement = view.systemLists?.PREVIEW ?? DEFAULT_SYSTEM_LIST_PLACEMENTS.PREVIEW;
  if (!placement.visible) {
    return;
  }
  const x = Math.round(placement.x * (cssWidth > 0 ? cssWidth : 800));
  const y = Math.round(placement.y * (cssHeight > 0 ? cssHeight : 600));
  ctx.font = datablockFontCss(view.charSizes.lists);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  if (stars) {
    ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
    ctx.fillText(stars, x, y);
    return;
  }
  if (preview) {
    ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
    ctx.fillText(preview, x, y);
    return;
  }
  ctx.fillStyle = PALETTE.uiChrome;
  ctx.fillText(hint ?? "", x, y);
}

/**
 * GEO MAPS / CURRENT lists: Video Map Lists are drawn by drawSystemLists
 * as the interactive system list 'ML' (T02-106).
 */
export function drawMapLists(
  _ctx: CanvasRenderingContext2D,
  _view: ScopeView,
  _cssWidth: number,
): void {
  // Handled by drawSystemLists (ML)
}

export function drawSystemLists(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  cssWidth: number,
  cssHeight: number,
  ssaInfo?: SsaDrawResult,
): void {
  if (!view.systemLists) {
    return;
  }

  const lineH = datablockLineHeightPx(view.charSizes.lists);
  ctx.font = datablockFontCss(view.charSizes.lists);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const textColor = applyBrite(PALETTE.ssa, view.brite.lst);

  const activeRects: { id: string; bounds: ListRect; handleBounds?: ListRect }[] = [];
  const activeListEntries: {
    listId: string;
    rowIndex: number;
    callsign: string;
    mapId?: string;
    mapIndex?: number;
    bounds: ListRect;
  }[] = [];
  const airportId = world.catalog?.airportId ?? "KDEM";
  const seenCanonical = new Set<string>();

  const previewReadout =
    formatPreviewReadout(view.preview) ??
    formatStarsChordReadout(view.starsChordEntry, view.starsChordArmed) ??
    view.pendingChord?.hint;
  const previewPlacement = view.systemLists?.PREVIEW ?? DEFAULT_SYSTEM_LIST_PLACEMENTS.PREVIEW;
  if (previewReadout && previewPlacement.visible) {
    const x = Math.round(previewPlacement.x * cssWidth);
    const y = Math.round(previewPlacement.y * cssHeight);
    const width = Math.max(ctx.measureText(previewReadout).width + 8, 80);
    const height = lineH + 4;
    const bounds: ListRect = { x, y, width, height };
    activeRects.push({ id: "PREVIEW", bounds, handleBounds: bounds });
    if (view.listDrag?.showAllFrames) {
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
      ctx.fillText(`[${previewPlacement.frameTitle}]`, x, y - lineH);
    }
  }

  if (ssaInfo && (view.systemLists?.SSA?.visible ?? true)) {
    activeRects.push({
      id: "SSA",
      bounds: ssaInfo.bounds,
      handleBounds: ssaInfo.handleBounds,
    });
    if (view.listDrag?.showAllFrames) {
      const placement = view.systemLists?.SSA ?? DEFAULT_SYSTEM_LIST_PLACEMENTS.SSA;
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        ssaInfo.bounds.x - 2,
        ssaInfo.bounds.y - 2,
        ssaInfo.bounds.width + 4,
        ssaInfo.bounds.height + 4,
      );
      ctx.fillText(`[${placement.frameTitle}]`, ssaInfo.bounds.x, ssaInfo.bounds.y - lineH);
    }
  }

  for (const [id, placement] of Object.entries(view.systemLists)) {
    const canonical = canonicalSystemListId(id);
    if (seenCanonical.has(canonical) && !id.startsWith("TL_")) {
      continue;
    }
    seenCanonical.add(canonical);

    if (!placement.visible) {
      continue;
    }

    let lines: string[] = [];
    switch (canonical) {
      case "SIGN_ON":
        lines = buildSignOnList();
        break;
      case "FL":
        lines = buildTabFlightPlanList(world, placement.maxLines, view, placement.offset ?? 0);
        break;
      case "VL":
        lines = buildVfrList(
          world,
          placement.maxLines,
          view.vfrListDroppedCallsigns,
          view.tracks,
          placement.offset ?? 0,
        );
        break;
      case "TL": {
        const apCode0 = resolveTowerAirport(view, world, 0, airportId);
        const apXy0 = resolveAirportCoordinates(apCode0, view, world);
        lines = buildTowerArrivalList(
          world,
          apCode0,
          apXy0.xNm,
          apXy0.yNm,
          placement.maxLines,
          view.towerListDroppedCallsigns,
          placement.offset ?? 0,
        );
        break;
      }
      case "TOWER_2": {
        const apCode1 = resolveTowerAirport(view, world, 1, airportId);
        const apXy1 = resolveAirportCoordinates(apCode1, view, world);
        lines = buildTowerArrivalList(
          world,
          apCode1,
          apXy1.xNm,
          apXy1.yNm,
          placement.maxLines,
          view.towerListDroppedCallsigns,
          placement.offset ?? 0,
        );
        break;
      }
      case "TOWER_3": {
        const apCode2 = resolveTowerAirport(view, world, 2, airportId);
        const apXy2 = resolveAirportCoordinates(apCode2, view, world);
        lines = buildTowerArrivalList(
          world,
          apCode2,
          apXy2.xNm,
          apXy2.yNm,
          placement.maxLines,
          view.towerListDroppedCallsigns,
          placement.offset ?? 0,
        );
        break;
      }
      case "AL":
        lines = buildAlertList(world, placement.maxLines, view, placement.offset ?? 0);
        break;
      case "COAST":
        lines = buildCoastSuspendList([], placement.maxLines, placement.offset ?? 0);
        break;
      case "CRDA":
        lines = buildCrdaStatusList(
          view.crdaRpcConfigs,
          placement.maxLines,
          airportId,
          placement.offset ?? 0,
        );
        break;
      case "ML": {
        const cat = view.mapListMode === "CURRENT" ? "CURRENT" : "ALL";
        lines = buildVideoMapsListLines(view, cat, placement.maxLines, placement.offset ?? 0);
        break;
      }
      default:
        if (id.startsWith("TL_")) {
          const satId = id.slice(3);
          const satXy = resolveAirportCoordinates(satId, view, world);
          lines = buildTowerArrivalList(
            world,
            satId,
            satXy.xNm,
            satXy.yNm,
            placement.maxLines,
            view.towerListDroppedCallsigns,
            placement.offset ?? 0,
          );
        }
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

    const isMl = canonical === "ML";
    const isAl = canonical === "AL";
    const mlCategory = view.mapListMode === "CURRENT" ? "CURRENT" : "ALL";
    const mlEntries = isMl ? getVideoMapsEntries(view, mlCategory) : [];
    // Draw text lines and record entry hitboxes
    let textY = y;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // AL is a stable green operational list; alert state is conveyed by
      // datablock indicators and audio, never list-row flashing or red text.
      ctx.fillStyle = textColor;
      ctx.fillText(line, x, textY);
      if (i > 0 && !line.startsWith("MORE:")) {
        const hasMore = lines[1]?.startsWith("MORE:");
        const visibleRow = hasMore ? i - 2 : i - 1;
        const entryIdx = (placement.offset ?? 0) + visibleRow;
        if (isMl) {
          const targetEntry = mlEntries[entryIdx];
          if (targetEntry) {
            activeListEntries.push({
              listId: id,
              rowIndex: entryIdx,
              callsign: targetEntry.mapId,
              mapId: targetEntry.mapId,
              mapIndex: targetEntry.id,
              bounds: { x, y: textY, width, height: lineH },
            });
          }
        } else if (isAl) {
          const parts = line.trim().split(/\s+/);
          const callsign = parts[1] ?? "";
          if (callsign.length > 0) {
            activeListEntries.push({
              listId: id,
              rowIndex: entryIdx,
              callsign,
              bounds: { x, y: textY, width, height: lineH },
            });
          }
        } else {
          const parts = line.trim().split(/\s+/);
          // If first token is numeric index, callsign is second token, else first token
          const callsign = (/^\d+$/.test(parts[0] ?? "") ? parts[1] : parts[0]) ?? "";
          if (callsign.length > 0) {
            activeListEntries.push({
              listId: id,
              rowIndex: entryIdx,
              callsign: callsign.replace(/^\*/, ""),
              bounds: { x, y: textY, width, height: lineH },
            });
          }
        }
      }
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

  view.activeListRects = activeRects;
  view.activeListEntries = activeListEntries;

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
