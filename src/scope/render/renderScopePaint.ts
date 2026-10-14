/**
 * PPI paint stages. Draw order is owned by renderScope().
 */
import {
  caPairKey,
  caSeverityForCallsign,
  distanceNm,
  DEFAULT_TOWER_SECTOR_ID,
  handoffFor,
  msawSeverityForCallsign,
  type Aircraft,
  type World,
} from "@core";
import { inAltitudeFilter, shouldShowDatablockOutsideAltitudeFilter } from "../altitudeFilter";
import { type ScopeViewSize } from "../camera";
import { scopeProjectionFromView } from "../projection";
import {
  DATABLOCK_FIELD_GAP,
  buildDatablockRuntimeState,
  datablockMetrics,
  datablockSourceFromWorld,
  formatDatablockFields,
  fullDatablockLine3Parts,
  getSpecialPurposeCode,
  linesForDatablock,
  withInboundHandoffCue,
  type DatablockMode,
} from "../datablock";
import {
  datablockFontCss,
  datablockLineHeightPx,
  measureDatablockCellWidth,
  scopeFontSizePx,
  positionFontLevel,
  scopeFontAsset,
} from "../fonts";
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
import { formatPreviewDisplayReadout as formatPreviewReadout } from "../previewDisplayLabels";
import { formatFmaAlertDiagnostic } from "../fmaAlerts";
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
  TPA_RING_DIGIT_RADIUS_FRAC,
  manualTpaConePoints,
  tpaConeDigitPlacement,
  tpaConesToPaint,
  tpaRingDigitPlacement,
  tpaRingPoints,
  tpaRingsToPaint,
  tpaScreenRadiusPx,
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
import {
  BLINK_HALF_PERIOD_MS,
  PALETTE,
  applyBrite,
  isAlertBlinkOn,
  getBackgroundColor,
} from "../palette";
import {
  TARGET_PUCK_BG,
  drawHistoryDot,
  drawTargetSymbol,
  historyDotColor,
  isPrimaryTarget,
  targetStrokeColor,
} from "./targetSymbol";
import {
  filterActiveCaAlerts,
  isBeaconatorReadout,
  isIdentFlashing,
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
import { resolveActiveMinSep } from "../minimumSeparation";
import {
  allocateLowestFreeRblId,
  calculateRblReadout,
  resolveRblEndpointPose,
  type RangeBearingLine,
} from "../rangeBearingLines";

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
  ctx?: CanvasRenderingContext2D,
): ProtectedGeometry[] {
  const out: ProtectedGeometry[] = [];
  const tls = view.brite.tls ?? 100;
  if (tls > 0 && !ctx) {
    const pending = resolvePendingRblSegment(view, size);
    if (pending) {
      out.push({ kind: "segment", aircraftId: "rbl:pending", ...pending, strokePx: 1 });
    }
  }
  if (tls > 0 && ctx) {
    for (const layout of resolveRblScreenLayouts(ctx, world, view, size)) {
      out.push({ kind: "rect", aircraftId: `rbl:${layout.id}`, rect: layout.textRect });
      if (layout.visibleSegment) {
        out.push({
          kind: "segment",
          aircraftId: `rbl:${layout.id}`,
          ...layout.visibleSegment,
          strokePx: 1,
        });
      }
    }
  }
  const proj = scopeProjectionFromView(view, size);
  const point = (ac: Aircraft) => {
    const shown = displayAircraft(ac, view.tracks.get(ac.id));
    return shown ? proj.toScreen(shown.xNm, shown.yNm) : null;
  };
  for (const ac of world.aircraft) {
    const p = point(ac);
    if (!p) continue;
    const td = view.tracks.get(ac.id);
    out.push({
      kind: "circle",
      aircraftId: ac.id,
      center: p,
      radius: Math.max(
        7,
        view.charSizes.pos / 2 + 2,
        scopeFontSizePx(positionFontLevel(view.charSizes.pos)) / 2 + 2,
      ),
    });
    if (view.historyEnabled && td)
      for (const h of [historyDotsToDraw(td.history, view.historyDotCount)])
        for (let i = 0; i < h.eastNm.length; i += 1) {
          const q = proj.toScreen(h.eastNm[i]!, h.northNm[i]!);
          out.push({ kind: "circle", aircraftId: ac.id, center: q, radius: 2 });
        }
    const shown = displayAircraft(ac, td)!;
    const filtered = !inAltitudeFilter(
      shown.altitudeFt,
      td?.unassociated ? view.altitudeFilter : view.associatedAltitudeFilter,
    );
    if (
      shouldDrawPtlForTrack(
        shown.speedKt,
        filtered,
        td?.ownership === "owned",
        view.ptlOn,
        view.ptlOwn,
        view.ptlByAircraftId.get(ac.id),
      ) &&
      (!view.fmaSurveillance.enabled || view.fmaPtlSeconds > 0)
    ) {
      const ptlMin = view.fmaSurveillance.enabled ? view.fmaPtlSeconds / 60 : view.ptlMinutes;
      const e = ptlEndpoint(
        shown.xNm,
        shown.yNm,
        shown.headingDeg,
        shown.speedKt,
        ptlMin,
        world.navigation.magVarDeg,
      );
      out.push({
        kind: "segment",
        aircraftId: ac.id,
        from: p,
        to: proj.toScreen(e.eastNm, e.northNm),
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
      proj.toScreen(q.eastNm, q.northNm),
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
    const pts = manualTpaConePoints(
      shown.xNm,
      shown.yNm,
      shown.headingDeg,
      lengthNm,
      world.navigation.magVarDeg,
    ).map((q) => proj.toScreen(q.eastNm, q.northNm));
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
      proj.toScreen(q.eastNm, q.northNm),
    );
    out.push({
      kind: "polygon",
      aircraftId: trailing.id,
      aircraftIds: [trailing.id, leading.id],
      points: pts,
      strokePx: TPA_STROKE_PX,
    });
  }
  const minResolved = resolveActiveMinSep(view.minSep, view.tracks, world.navigation.magVarDeg);
  if (minResolved) {
    const { trackA, trackB, prediction, pair } = minResolved;
    const ptA = proj.toScreen(trackA.xNm, trackA.yNm);
    const ptB = proj.toScreen(trackB.xNm, trackB.yNm);
    const cpaA = proj.toScreen(prediction.posANm.xNm, prediction.posANm.yNm);
    const cpaB = proj.toScreen(prediction.posBNm.xNm, prediction.posBNm.yNm);
    // Projection lines
    out.push({
      kind: "segment",
      aircraftId: pair.aircraftIdA,
      from: ptA,
      to: cpaA,
      strokePx: PTL_STROKE_PX,
    });
    out.push({
      kind: "segment",
      aircraftId: pair.aircraftIdB,
      from: ptB,
      to: cpaB,
      strokePx: PTL_STROKE_PX,
    });
    // Separation segment
    out.push({
      kind: "segment",
      aircraftId: pair.aircraftIdA,
      from: cpaA,
      to: cpaB,
      strokePx: PTL_STROKE_PX,
    });
    // CPA triangles
    out.push({
      kind: "circle",
      aircraftId: pair.aircraftIdA,
      center: cpaA,
      radius: 6,
    });
    out.push({
      kind: "circle",
      aircraftId: pair.aircraftIdB,
      center: cpaB,
      radius: 6,
    });
    // Boxed readout rect
    const boxMetrics = calculateMinSepBoxMetrics(view, prediction);
    const { center: boxCenter } = computeMinSepBoxCenter(cpaA, cpaB, boxMetrics, size);
    out.push({
      kind: "rect",
      aircraftId: pair.aircraftIdA,
      rect: {
        x: boxCenter.x - boxMetrics.width / 2,
        y: boxCenter.y - boxMetrics.height / 2,
        width: boxMetrics.width,
        height: boxMetrics.height,
      },
    });
  }
  return out;
}

export function displayAircraft(ac: Aircraft, td: TrackDisplay | undefined): Aircraft | null {
  const report = td?.presentationReport ?? td?.lastReport;
  return report ? aircraftAtReport(ac, report) : null;
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

type FmaPointLike = { xNm: number; yNm: number };
type FmaSegment = [FmaPointLike, FmaPointLike];

/** Split a contour edge around collinear portions owned by suppressed boundaries. */
function visibleContourParts(start: FmaPointLike, end: FmaPointLike, hiddenEdges: FmaSegment[]) {
  const dx = end.xNm - start.xNm;
  const dy = end.yNm - start.yNm;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-18) return [] as FmaSegment[];
  const length = Math.sqrt(lengthSquared);
  const overlaps: Array<[number, number]> = [];
  for (const [a, b] of hiddenEdges) {
    if (
      Math.abs(dx * (a.yNm - start.yNm) - dy * (a.xNm - start.xNm)) > 1e-8 * length ||
      Math.abs(dx * (b.yNm - start.yNm) - dy * (b.xNm - start.xNm)) > 1e-8 * length
    ) {
      continue;
    }
    const ta = ((a.xNm - start.xNm) * dx + (a.yNm - start.yNm) * dy) / lengthSquared;
    const tb = ((b.xNm - start.xNm) * dx + (b.yNm - start.yNm) * dy) / lengthSquared;
    const low = Math.max(0, Math.min(ta, tb));
    const high = Math.min(1, Math.max(ta, tb));
    if (high - low > 1e-9) overlaps.push([low, high]);
  }
  overlaps.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of overlaps) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1] + 1e-9) {
      previous[1] = Math.max(previous[1], interval[1]);
    } else {
      merged.push([...interval]);
    }
  }
  const at = (t: number): FmaPointLike => ({
    xNm: start.xNm + dx * t,
    yNm: start.yNm + dy * t,
  });
  const visible: FmaSegment[] = [];
  let cursor = 0;
  for (const [low, high] of merged) {
    if (low > cursor + 1e-9) visible.push([at(cursor), at(low)]);
    cursor = Math.max(cursor, high);
  }
  if (cursor < 1 - 1e-9) visible.push([at(cursor), end]);
  return visible;
}

const FMA_NTZ_STROKE_PX = 3;

export function drawFmaLayers(
  ctx: CanvasRenderingContext2D,
  view: ScopeView,
  size?: ScopeViewSize,
): void {
  if (!view.fmaSurveillance.enabled) {
    return;
  }
  const amz = view.fmaAmzs?.find((a) => a.id === view.fmaSurveillance.selectedAmzId);
  if (!amz) {
    return;
  }
  const viewSize: ScopeViewSize = size ?? {
    widthPx: ctx.canvas.width,
    heightPx: ctx.canvas.height,
  };
  const proj = scopeProjectionFromView(view, viewSize);

  // 1. Reference lines: spaced 200 ft in world coords, show iff rangeNm / MAG <= 16 NM.
  // BRITE: ref (0 suppresses paint)
  const refBrite = view.brite.ref ?? 100;
  const mag = view.fmaMag ?? 1;
  const showReferenceLines = view.camera.rangeNm / mag <= 16;
  const disabledNtzs = view.fmaAlertInhibit.ntzIds ?? new Set<string>();
  const hiddenNozEdges: FmaSegment[] = amz.ntzs
    .filter((ntz) => disabledNtzs.has(ntz.id))
    .flatMap((ntz) =>
      ntz.polygon.points.map(
        (point, i, points) => [point, points[(i + 1) % points.length]!] as FmaSegment,
      ),
    );
  if (showReferenceLines && refBrite > 0 && amz.referenceLines.length > 0) {
    ctx.save();
    ctx.strokeStyle = applyBrite("#FFFFFF", refBrite);
    ctx.lineWidth = 0.65;
    ctx.setLineDash([]);
    for (const [p1, p2] of amz.referenceLines) {
      for (const [visibleStart, visibleEnd] of visibleContourParts(p1, p2, hiddenNozEdges)) {
        const s1 = proj.toScreen(visibleStart.xNm, visibleStart.yNm);
        const s2 = proj.toScreen(visibleEnd.xNm, visibleEnd.yNm);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 2. AMZ outline: light blue RGB 173,216,230 (#ADD8E6).
  // BRITE: amz (0 suppresses paint)
  const amzBrite = view.brite.amz ?? 100;
  if (amzBrite > 0 && amz.boundary.points.length >= 2) {
    ctx.save();
    ctx.strokeStyle = applyBrite("#ADD8E6", amzBrite);
    ctx.lineWidth = 1;
    const pts = amz.boundary.points.map((p) => proj.toScreen(p.xNm, p.yNm));
    tracePolyline(ctx, pts, true);
    ctx.stroke();
    ctx.restore();
  }

  // 3. NOZ contours use RWY brightness as the manual's available trainer grouping.
  // BRITE: rwy (0 suppresses paint)
  const rwyBrite = view.brite.rwy ?? 100;
  if (rwyBrite > 0) {
    ctx.save();
    ctx.strokeStyle = applyBrite("#FFFFFF", rwyBrite);
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (const member of amz.members) {
      for (let i = 0; i < member.noz.points.length; i++) {
        const start = member.noz.points[i]!;
        const end = member.noz.points[(i + 1) % member.noz.points.length]!;
        for (const [visibleStart, visibleEnd] of visibleContourParts(start, end, hiddenNozEdges)) {
          const s1 = proj.toScreen(visibleStart.xNm, visibleStart.yNm);
          const s2 = proj.toScreen(visibleEnd.xNm, visibleEnd.yNm);
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 4. Runway graphics, course lines, fix bars:
  // BRITE: rwy (0 suppresses paint)
  if (rwyBrite > 0) {
    ctx.save();
    // Runway: gray (#808080), with dashed white course extensions.
    if (amz.runwayGraphics.length > 0) {
      ctx.strokeStyle = applyBrite("#808080", rwyBrite);
      ctx.lineWidth = 5;
      ctx.setLineDash([]);
      for (const rwy of amz.runwayGraphics) {
        const s1 = proj.toScreen(rwy.threshold.xNm, rwy.threshold.yNm);
        const s2 = proj.toScreen(rwy.departureEnd.xNm, rwy.departureEnd.yNm);
        ctx.beginPath();
        if (
          rwy.threshold.xNm === rwy.departureEnd.xNm &&
          rwy.threshold.yNm === rwy.departureEnd.yNm
        ) {
          // Show an unknown-length runway as a screen-space threshold marker,
          // not a fabricated geographic segment.
          const along = proj.toScreen(
            rwy.threshold.xNm + Math.sin((amz.courseTrueDeg * Math.PI) / 180),
            rwy.threshold.yNm + Math.cos((amz.courseTrueDeg * Math.PI) / 180),
          );
          const dx = along.x - s1.x;
          const dy = along.y - s1.y;
          const length = Math.hypot(dx, dy) || 1;
          ctx.moveTo(s1.x - (dy / length) * 2.5, s1.y + (dx / length) * 2.5);
          ctx.lineTo(s1.x + (dy / length) * 2.5, s1.y - (dx / length) * 2.5);
        } else {
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
        }
        ctx.stroke();
      }
    }

    // Course lines: white (#FFFFFF), dashed and visually thin.
    if (amz.courseLines.length > 0) {
      ctx.strokeStyle = applyBrite("#FFFFFF", rwyBrite);
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 4]);
      for (const cl of amz.courseLines) {
        if (cl.approach) {
          const s1 = proj.toScreen(cl.approach[0].xNm, cl.approach[0].yNm);
          const s2 = proj.toScreen(cl.approach[1].xNm, cl.approach[1].yNm);
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
        }
        if (cl.departure) {
          const s1 = proj.toScreen(cl.departure[0].xNm, cl.departure[0].yNm);
          const s2 = proj.toScreen(cl.departure[1].xNm, cl.departure[1].yNm);
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.stroke();
        }
      }
    }

    // Fix bars: span only their runway's NOZ at each charted FAF station.
    if (amz.fixBars && amz.fixBars.length > 0) {
      ctx.strokeStyle = applyBrite("#FFFFFF", rwyBrite);
      ctx.lineWidth = FMA_NTZ_STROKE_PX;
      ctx.setLineDash([]);
      for (const fb of amz.fixBars) {
        const s1 = proj.toScreen(fb.segment[0].xNm, fb.segment[0].yNm);
        const s2 = proj.toScreen(fb.segment[1].xNm, fb.segment[1].yNm);
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // 5. NTZ outlines are the final FMA stroke layer so runway/course/fix strokes
  // cannot obscure the alert hierarchy where adapted geometry overlaps.
  // BRITE: ntz (0 suppresses paint)
  const ntzBrite = view.brite.ntz ?? 100;
  if (ntzBrite > 0 && amz.ntzs.length > 0) {
    ctx.save();
    ctx.lineWidth = FMA_NTZ_STROKE_PX;
    ctx.setLineDash([]);
    for (const ntz of amz.ntzs) {
      if (disabledNtzs.has(ntz.id)) continue;
      const sev = view.fmaAlertOutlines.get(ntz.id);
      const strokeColor = sev === "RED" ? "#FF0000" : sev === "YELLOW" ? "#FFFF00" : "#FFFFFF";
      ctx.strokeStyle = applyBrite(strokeColor, ntzBrite);
      const pts = ntz.polygon.points.map((p) => proj.toScreen(p.xNm, p.yNm));
      tracePolyline(ctx, pts, true);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawMapLayers(
  ctx: CanvasRenderingContext2D,
  cache: MapCache,
  view: ScopeView,
  size?: ScopeViewSize,
): void {
  const fmaActive = view.fmaSurveillance.enabled;
  const fmaMag = view.fmaMag ?? 1;
  const suppressRings = fmaActive && fmaMag > 1;

  if (!suppressRings) {
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
  }

  const mpa = applyBrite(PALETTE.map, view.brite.mpa);
  const mpb = applyBrite(PALETTE.mapDim, view.brite.mpb);

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

  drawFmaLayers(ctx, view, size);
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

function targetTextColor(ownership: TrackOwnership): string {
  return ownership === "unowned" ? PALETTE.targetGreen : PALETTE[ownership];
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
    (ho.kind === "outbound" && ho.status === "accepted" && ownership !== "unowned") ||
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

  // 3. Outbound accepted handoff: blink white for 5s, then stay solid white.
  if (ho.kind === "outbound" && ho.status === "accepted" && td?.ownership !== "unowned") {
    const flashDeadline =
      td?.outboundFlashUntilSimMs ??
      (ho.acceptedAtSimMs != null ? ho.acceptedAtSimMs + 5000 : undefined);
    const isFlashing = flashDeadline != null && world.simTimeMs < flashDeadline;
    const isBlinkOn = isAlertBlinkOn(world.simTimeMs);
    return {
      color: PALETTE.owned,
      visible: isFlashing ? isBlinkOn : true,
      mode: "full",
      leaderColor: PALETTE.owned,
    };
  }

  // Manual §5.1.9 pp. 5-18–19: initiated handoff shows receiver TCP and uses
  // Handoff Attention white; trainer Center ownership stub stays separate.
  if (ho.kind === "outbound" && ho.status !== "accepted") {
    return {
      color: PALETTE.owned,
      visible: true,
      mode: "full",
      leaderColor: PALETTE.owned,
    };
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
      const baseColor = targetTextColor(td?.ownership ?? "unowned");
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
      const baseColor = targetTextColor(td?.ownership ?? "unowned");
      return {
        color: td?.highlighted ? PALETTE.highlight : baseColor,
        visible: true,
        mode: "full",
        line1Tag: isUnOn ? "UN" : undefined,
        leaderColor: td?.highlighted ? PALETTE.highlight : baseColor,
      };
    }
  }

  function computeBaseDatablockMode(td?: TrackDisplay): "full" | "partial" | "limited" {
    // TERM CNTL leaves the radar target alive but removes its plan. Never
    // allow selection, forced-FDB state, or an FSL mode to restore the plan
    // callsign on an unassociated target.
    if (td?.unassociated) {
      return "limited";
    }
    if (td?.forcedFdb) {
      return "full";
    }
    return (
      td?.datablockMode ??
      (ownership === "owned" ? "full" : td?.unassociated ? "limited" : "partial")
    );
  }

  // 7. Track highlight (Cyan #00FFFF) or Dwell highlight
  const isDwellHighlighted = view.dwellMode !== "OFF" && view.dwellLockedAircraftId === ac.id;
  if (td?.highlighted || isDwellHighlighted) {
    const baseMode = computeBaseDatablockMode(td);
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
  const baseMode = computeBaseDatablockMode(td);
  const mode =
    isBeaconatorReadout(view.beaconatorActive, td, world.simTimeMs) && baseMode === "partial"
      ? "full"
      : baseMode;
  const baseColor = targetTextColor(ownership);

  return {
    color: baseColor,
    visible: true,
    mode,
    leaderColor: baseColor,
  };
}

function isEmergencyDatablockException(world: World, ac: Aircraft): boolean {
  return Boolean(
    ac.spc ||
    world.alerts.ca.some(
      (alert) => alert.callsignA === ac.callsign || alert.callsignB === ac.callsign,
    ) ||
    world.alerts.msaw.some((alert) => alert.callsign === ac.callsign),
  );
}

function shouldPaintDatablock(view: ScopeView, world: World, ac: Aircraft, td?: TrackDisplay) {
  const handoff = handoffFor(world, ac.id);
  // SPI/IDENT (Fig. 2-23) forces the LDB RBC + Mode C display even when
  // unassociated altitude/beacon filters would suppress them.
  if (td && isIdentFlashing(td, world.simTimeMs)) {
    return true;
  }
  return shouldShowDatablockOutsideAltitudeFilter({
    inFilter: inAltitudeFilter(
      ac.altitudeFt,
      td?.unassociated ? view.altitudeFilter : view.associatedAltitudeFilter,
    ),
    ownership: td?.ownership,
    retainedFdb: td?.retainedFdbOutsideAltitudeFilter,
    emergency: isEmergencyDatablockException(world, ac),
    pendingHandoff: handoff.kind === "inbound" || handoff.kind === "departure",
  });
}

function trackLeaderDir(view: ScopeView, aircraftId: string): LeaderDir {
  const td = view.tracks.get(aircraftId);
  if (td?.leaderDirManual) {
    return td.leaderDir;
  }
  if (view.fmaRunwayLeaders && view.fmaRunwayLeaders.size > 0) {
    const sp1 = (td?.manualSp1 || td?.sp1 || "").trim().toUpperCase();
    const sp2 = (td?.manualSp2 || td?.sp2 || "").trim().toUpperCase();
    const activeAmz = view.fmaAmzs?.find((a) => a.id === view.fmaSurveillance?.selectedAmzId);
    for (const [rwy, dir] of view.fmaRunwayLeaders.entries()) {
      if (dir === null || dir === undefined) continue;
      const rUpper = rwy.toUpperCase();
      const rBare = rUpper.replace(/^0+/, "");
      const matchesSp = (sp: string) =>
        sp === rUpper ||
        sp === rBare ||
        sp === `I${rUpper}` ||
        sp === `I${rBare}` ||
        sp === `R${rUpper}` ||
        sp === `R${rBare}`;
      if (matchesSp(sp1) || matchesSp(sp2)) {
        return dir;
      }
      if (activeAmz?.runwayAliases?.[rwy]) {
        for (const alias of activeAmz.runwayAliases[rwy]) {
          const aUpper = alias.toUpperCase();
          const aBare = aUpper.replace(/^0+/, "");
          if (matchesSp(aUpper) || matchesSp(aBare)) {
            return dir;
          }
        }
      }
    }
  }
  return td?.leaderDir ?? view.defaultLeaderDir ?? DEFAULT_LEADER_DIR;
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
  // TI 6191.409: SPI/IDENT is datablock "ID" text only; the target symbol
  // does not bloom, flash, or change color.
  return targetStrokeColor(trackOwnership(view, ac.id), false);
}

type AlertGlyph = {
  text: "Δ" | "*" | "+" | "▼";
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

/** Project only existing CA renderer state into limited Field 0. */
function ldbField0Indicators(
  view: ScopeView,
  world: World,
  ac: Aircraft,
  td: TrackDisplay | undefined,
): string[] {
  const caInhibited = isCaInhibitedForTrack(ac, td, view);
  const caPairInhibited = isCaPairInhibitedForTrack(view, world, ac);
  const mciActive = hasMciAlertForTrack(world, ac);
  const mciInhibited = mciActive && view.mciEnabled === false;
  const hasCa =
    (!caInhibited &&
      !caPairInhibited &&
      caSeverityForVisibleTrack(view, world, ac.callsign) != null) ||
    (mciActive && !mciInhibited);
  return hasCa ? ["CA"] : [];
}

/**
 * STARS Field 2 inhibit symbols sit immediately after the ACID. `*` is MSAW,
 * `Δ` is CA/MCI, and `+` is both inhibited. Field 0 above the datablock shows
 * active `LA`, `CA`, or slash-separated `LA/CA` indicators on full/partial blocks.
 * Limited blocks project only the existing `CA` state per Figure 2-23.
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

type Field0AlertState = {
  text: string;
  requiresBlink: boolean;
  color: string;
};

const FMA_PRIMARY_FIELD0_TEXT: Record<string, string> = {
  NTZ_WARNING: "NTZ",
  SURVEILLANCE_LOST: "CST",
  RUNWAY_ERROR: "RWY",
  NTZ_CAUTION: "NTZ",
};

/** Existing renderer alert state projected into physical Field 0. */
function field0AlertState(
  ac: Aircraft,
  td: TrackDisplay | undefined,
  view: ScopeView,
  world: World,
  mode: DatablockMode,
): Field0AlertState {
  if (mode !== "full" && mode !== "partial")
    return { text: "", requiresBlink: false, color: PALETTE.alert };
  const caInhibited = isCaInhibitedForTrack(ac, td, view);
  const caSeverity = !caInhibited ? caSeverityForVisibleTrack(view, world, ac.callsign) : null;
  const msawInhibited = Boolean(
    td?.msawInhibited ||
    td?.msawCurrentAlertInhibited ||
    td?.msawProcessingInhibited ||
    (td as { inhibitMSAW?: boolean } | undefined)?.inhibitMSAW ||
    (td as { inhibitMsaw?: boolean } | undefined)?.inhibitMsaw ||
    (ac as { msawInhibited?: boolean }).msawInhibited,
  );
  const msawSeverity = !msawInhibited
    ? msawSeverityForCallsign(world.alerts.msaw, ac.callsign)
    : null;
  const mciActive = hasMciAlertForTrack(world, ac);
  const mciInhibited = mciActive && view.mciEnabled === false;
  const hasLa = msawSeverity != null;
  const hasCa = caSeverity != null || (mciActive && !mciInhibited);
  const fma = view.fmaAlertResults.get(ac.id);
  const episode = fma?.episode;
  const warning = Boolean(episode && episode.condition !== "NTZ_CAUTION");
  const fmaText = fma?.primary ? (FMA_PRIMARY_FIELD0_TEXT[fma.primary] ?? null) : null;
  const nom = fma?.supplementary.nom ? "NOM" : null;
  const existing = [hasLa ? "LA" : null, hasCa ? "CA" : null].filter(Boolean);
  const isRedAlert = warning || hasLa || caSeverity != null || (mciActive && !mciInhibited);
  return {
    text: [fmaText, nom, ...existing].filter(Boolean).join("/"),
    color: isRedAlert
      ? PALETTE.alert
      : fma?.primary === "NTZ_CAUTION" || nom
        ? PALETTE.caution
        : PALETTE.alert,
    requiresBlink:
      (warning && Boolean(episode && !view.fmaAcknowledgedEpisodeIds.has(episode.id))) ||
      (hasLa && !isMsawAlertAcknowledged(ac, td, view, world)) ||
      (caSeverity != null && !isCaAlertAcknowledged(ac, td, view, world)) ||
      (mciActive && !mciInhibited),
  };
}

function field0WithAlerts(staticField0: string | undefined, alertText: string): string | undefined {
  const values = [staticField0, alertText].filter(
    (value): value is string => value != null && value.length > 0,
  );
  return values.length > 0 ? values.join("/") : undefined;
}

type ScopeDatablockPresentation = {
  runtime: ReturnType<typeof buildDatablockRuntimeState>;
  visual: DatablockVisualState;
  mode: DatablockMode;
  handoff: ReturnType<typeof handoffFor>;
  datablockSource: ReturnType<typeof datablockSourceFromWorld>;
  atpaReadout: ReturnType<typeof atpaInTrailDatablockReadout>;
  base: ReturnType<typeof linesForDatablock>;
  lines: ReturnType<typeof linesForDatablock>;
  line1WithoutAlert: string;
  alertGlyphs: AlertGlyph[];
  field0Alerts: Field0AlertState;
};

export function datablockRenderSnapshotKey(view: ScopeView, world: World): string {
  return JSON.stringify({
    modeCVisible: view.modeCVisible,
    beaconatorActive: view.beaconatorActive,
    sectorId: view.sectorId,
    charSizePx: view.charSizePx,
    cellWidthPx: view.datablockCellWidthPx,
    tracks: [...view.tracks.entries()].map(([id, track]) => [
      id,
      track.ownership,
      track.unassociated,
      track.datablockMode,
      track.forcedFdb,
      track.derivedPlanId,
      track.scratchpad,
      track.sp1,
      track.sp2,
      track.queriedUntilSimMs,
      track.beaconatorUntilSimMs,
      track.leaderDir,
      track.leaderLengthPx,
    ]),
    aircraftIds: world.aircraft.map((aircraft) => aircraft.id),
    handoffs: [...world.handoffs.entries()],
    fmaMag: view.fmaMag,
    fmaMode: view.fmaSurveillance.enabled,
    fmaAmzId: view.fmaSurveillance.selectedAmzId,
  });
}

/** One source/formatting projection shared by paint and layout. */
export function buildScopeDatablockPresentation(
  view: ScopeView,
  world: World,
  ac: Aircraft,
  visual: DatablockVisualState = getDatablockVisualState(view, world, ac),
): ScopeDatablockPresentation {
  const td = view.tracks.get(ac.id);
  const mode = visual.mode;
  const field0Indicators =
    mode === "limited" ? ldbField0Indicators(view, world, ac, td) : undefined;
  // TI 6191.409 SPI: FDB Line 2 Field 5 = GS + "ID", PDB Line 1 Field 4 = "ID",
  // LDB Line 1 Field 1 = flashing "ID" next to the RBC. Symbol is unchanged.
  const identActive = td ? isIdentFlashing(td, world.simTimeMs) : false;
  const runtime = buildDatablockRuntimeState(world, ac, {
    track: td,
    mode,
    modeCVisible: view.modeCVisible,
    beaconatorActive: view.beaconatorActive,
    localTcp: view.sectorId,
    atpa: {
      enabled: view.atpa.inTrailDistance,
      trackEnabled: td?.atpaInTrailDistanceEnabled !== false,
    },
    fieldInputs: {
      identIndicator: mode === "partial" && identActive ? "ID" : undefined,
      identActive: mode === "full" && identActive ? true : undefined,
      ...(mode === "limited" && identActive
        ? { identActive: true, identBlinkOn: isAlertBlinkOn(world.simTimeMs) }
        : {}),
      field0Indicators,
    },
  });
  const handoff = runtime.display.handoff;
  const datablockSource = runtime.source;
  const atpaReadout =
    mode === "full"
      ? atpaInTrailDatablockReadout(world.alerts.atpa, ac.callsign, {
          globalEnabled: view.atpa.inTrailDistance,
          trackEnabled: td?.atpaInTrailDistanceEnabled !== false,
        })
      : null;
  const base = linesForDatablock(datablockSource, mode, runtime.options);
  const isCaInhibited = isCaInhibitedForTrack(ac, td, view);
  const isCaPairInhibited = isCaPairInhibitedForTrack(view, world, ac);
  const isMsawInhibited = Boolean(
    td?.msawInhibited ||
    td?.msawCurrentAlertInhibited ||
    td?.msawProcessingInhibited ||
    (td as { inhibitMSAW?: boolean } | undefined)?.inhibitMSAW ||
    (td as { inhibitMsaw?: boolean } | undefined)?.inhibitMsaw ||
    (ac as { msawInhibited?: boolean }).msawInhibited,
  );
  const mciInhibited = hasMciAlertForTrack(world, ac) && view.mciEnabled === false;
  const briteCh = mode === "limited" || mode === "partial" ? view.brite.ldb : view.brite.fdb;
  let alertGlyphs =
    mode === "full" || mode === "partial"
      ? alertGlyphsForTrack({
          caInhibited: isCaInhibited || isCaPairInhibited,
          msawInhibited: isMsawInhibited,
          mciInhibited,
          normalColor: applyBrite(PALETTE.owned, briteCh),
        })
      : [];
  const fmaInhibited =
    view.fmaSurveillance.enabled && Boolean(view.fmaAlertInhibit.aircraftIds?.has(ac.id));
  const activeAmz = view.fmaAmzs.find((amz) => amz.id === view.fmaSurveillance.selectedAmzId);
  const disabledNtzs = view.fmaAlertInhibit.ntzIds ?? new Set<string>();
  const allNtzsDisabled = Boolean(
    activeAmz &&
    (activeAmz.ntzs.length === 0 || activeAmz.ntzs.every((ntz) => disabledNtzs.has(ntz.id))),
  );
  if ((mode === "full" || mode === "partial") && fmaInhibited && !allNtzsDisabled) {
    alertGlyphs = [{ text: "▼", color: applyBrite(PALETTE.owned, briteCh), visible: true }];
  }
  const taggedLine = visual.line1Tag ? `${base.line1} ${visual.line1Tag}` : base.line1;
  let line1WithoutAlert = taggedLine;
  if (!visual.line1Tag && mode !== "limited" && mode !== "partial") {
    line1WithoutAlert = withInboundHandoffCue(line1WithoutAlert, handoff);
  }
  const line1 = `${line1WithoutAlert.slice(0, datablockSource.callsign.length)}${alertGlyphs
    .map((glyph) => glyph.text)
    .join("")}${line1WithoutAlert.slice(datablockSource.callsign.length)}`;
  const field0Alerts = field0AlertState(ac, td, view, world, mode);
  return {
    runtime,
    visual,
    mode,
    handoff,
    datablockSource,
    atpaReadout,
    base,
    line1WithoutAlert,
    alertGlyphs,
    field0Alerts,
    lines: {
      ...base,
      line1,
      line0: field0WithAlerts(base.line0, field0Alerts.text),
    },
  };
}

function measuredDatablockMetrics(
  ctx: CanvasRenderingContext2D,
  lines: Parameters<typeof datablockMetrics>[0],
  cellWidth: number,
  lineHeight: number,
) {
  const metrics = datablockMetrics(lines, cellWidth, lineHeight);
  const widths = [lines.line0, lines.line1, lines.line2, lines.line3]
    .filter((line): line is string => line != null)
    .map((line) => {
      const measured = ctx.measureText(line);
      return Math.max(measured.width, measured.actualBoundingBoxRight || 0);
    });
  return { ...metrics, widthPx: Math.max(cellWidth, ...widths) };
}

export function drawDatablock(
  ctx: CanvasRenderingContext2D,
  ac: Aircraft,
  targetX: number,
  targetY: number,
  view: ScopeView,
  world: World,
  resolved?: ResolvedDatablockLayout,
  presentation?: ScopeDatablockPresentation,
): void {
  const td = view.tracks.get(ac.id);
  if (!shouldPaintDatablock(view, world, ac, td)) {
    return;
  }
  const visual = getDatablockVisualState(view, world, ac);
  if (!visual.visible) {
    return;
  }
  ctx.font = datablockFontCss(view.charSizes.dataBlocks);
  const snapshot = presentation ?? buildScopeDatablockPresentation(view, world, ac, visual);
  const {
    runtime,
    mode,
    base,
    lines,
    line1WithoutAlert,
    alertGlyphs,
    field0Alerts,
    datablockSource,
    atpaReadout,
  } = snapshot;
  const callsign = runtime.source.callsign;
  const lineH = datablockLineHeightPx(view.charSizes.dataBlocks);
  const briteCh = mode === "limited" || mode === "partial" ? view.brite.ldb : view.brite.fdb;
  // Field 2 inhibit symbols occupy inline cells immediately after the ACID.
  const line1Prefix = line1WithoutAlert.startsWith(callsign) ? callsign : line1WithoutAlert;
  const metrics = measuredDatablockMetrics(ctx, lines, view.datablockCellWidthPx, lineH);
  const origin = datablockTopLeft(
    trackLeaderDir(view, ac.id),
    metrics,
    trackLeaderLength(view, ac.id),
  );
  const textX = resolved?.rect ? resolved.rect.x : targetX + origin.x;
  const textY =
    (resolved?.rect ? resolved.rect.y : targetY + origin.y) + (lines.line0 != null ? lineH : 0);

  ctx.fillStyle = applyBrite(visual.color, briteCh);
  let alertGlyphX: number;
  if (alertGlyphs.length === 0) {
    ctx.fillText(line1WithoutAlert, textX, textY);
    alertGlyphX = textX + ctx.measureText(line1WithoutAlert).width;
  } else {
    const line1Suffix = line1WithoutAlert.slice(line1Prefix.length);
    ctx.fillText(line1Prefix, textX, textY);
    alertGlyphX = textX + ctx.measureText(line1Prefix).width;
    for (const glyph of alertGlyphs) {
      if (glyph.visible) {
        ctx.fillStyle = glyph.color;
        ctx.fillText(glyph.text, alertGlyphX, textY);
      }
      alertGlyphX += ctx.measureText(glyph.text).width;
    }
    ctx.fillText(line1Suffix, alertGlyphX, textY);
  }
  if (lines.line0 != null) {
    const line0Y = textY - lineH;
    const staticField0 = base.line0;
    if (staticField0 != null) {
      const primarySpc = getSpecialPurposeCode(datablockSource);
      const field0Color =
        mode === "limited" ||
        primarySpc === "EM" ||
        primarySpc === "RF" ||
        primarySpc === "HJ" ||
        primarySpc === "LL"
          ? PALETTE.alert
          : PALETTE.caution;
      ctx.fillStyle = applyBrite(field0Color, briteCh);
      ctx.fillText(staticField0, textX, line0Y);
    }
    const showAlerts =
      field0Alerts.text.length > 0 &&
      (!field0Alerts.requiresBlink || isAlertBlinkOn(world.simTimeMs));
    if (showAlerts) {
      ctx.fillStyle = applyBrite(field0Alerts.color, briteCh);
      const separator = staticField0 == null ? "" : "/";
      const alertX = textX + ctx.measureText(`${staticField0 ?? ""}${separator}`).width;
      ctx.fillText(`${separator}${field0Alerts.text}`, alertX, line0Y);
    }
    ctx.fillStyle = applyBrite(visual.color, briteCh);
  }
  if (lines.line2 != null) {
    ctx.fillText(lines.line2, textX, textY + lineH);
  }
  if (lines.line3 != null) {
    const line3X = textX;
    const line3Y = textY + 2 * lineH;
    const fields = formatDatablockFields(datablockSource, runtime.options);
    const parts = fullDatablockLine3Parts(datablockSource);
    const mismatchIsCurrentPhase =
      parts.squawkField != null &&
      parts.assignedBeaconField != null &&
      fields.field7 === parts.assignedBeaconField;
    if (atpaReadout) {
      const prefix = [parts.assignedField, parts.squawkField]
        .filter((part): part is string => part != null && part.length > 0)
        .join(DATABLOCK_FIELD_GAP);
      const atpaX =
        prefix.length > 0
          ? line3X + ctx.measureText(`${prefix}${DATABLOCK_FIELD_GAP}`).width
          : line3X;
      if (prefix.length > 0) {
        ctx.fillText(prefix, line3X, line3Y);
        ctx.fillStyle = applyBrite(atpaReadoutColor(atpaReadout.status), briteCh);
        ctx.fillText(atpaReadout.text, atpaX, line3Y);
      } else {
        ctx.fillStyle = applyBrite(atpaReadoutColor(atpaReadout.status), briteCh);
        ctx.fillText(atpaReadout.text, line3X, line3Y);
      }
      if (mismatchIsCurrentPhase) {
        const assignedX =
          atpaX + ctx.measureText(`${atpaReadout.text}${DATABLOCK_FIELD_GAP}`).width;
        if (isAlertBlinkOn(world.simTimeMs)) {
          ctx.fillStyle = applyBrite(visual.color, briteCh);
          ctx.fillText(parts.assignedBeaconField!, assignedX, line3Y);
        }
      }
    } else {
      if (!mismatchIsCurrentPhase) {
        ctx.fillText(lines.line3, line3X, line3Y);
      } else {
        // Manual §2.12 / §5.6.1: RBC stays in Field 6 while the ABC in
        // Field 7 blinks. Reserve the ABC cell even during its off phase so
        // the datablock never shifts while Fields 6–8 continue time-sharing.
        const fieldGap = DATABLOCK_FIELD_GAP;
        const reportedX = line3X;
        const assignedX = reportedX + ctx.measureText(`${fields.field6}${fieldGap}`).width;
        ctx.fillText(fields.field6, reportedX, line3Y);
        if (isAlertBlinkOn(world.simTimeMs)) {
          ctx.fillText(fields.field7, assignedX, line3Y);
        }
        if (fields.field8.length > 0) {
          const field8X = assignedX + ctx.measureText(`${fields.field7}${fieldGap}`).width;
          ctx.fillText(fields.field8, field8X, line3Y);
        }
      }
    }
  }
}

// Display cell heights can increase placement search work. Reuse a solved layout
// only while every solver input (including measured text and obstacles) is equal.
const datablockLayoutCache = new WeakMap<
  ScopeView,
  { key: string; layouts: ResolvedDatablockLayout[] }
>();

interface RblScreenLayout {
  id: number | "pending";
  text: string;
  textRect: { x: number; y: number; width: number; height: number };
  visibleSegment: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
}

/** Clip to the PPI so only visible line geometry becomes a datablock obstacle. */
function clipRblSegment(
  from: { x: number; y: number },
  to: { x: number; y: number },
  width: number,
  height: number,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let low = 0;
  let high = 1;
  for (const [p, q] of [
    [-dx, from.x],
    [dx, width - from.x],
    [-dy, from.y],
    [dy, height - from.y],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return null;
  }
  return {
    from: { x: from.x + low * dx, y: from.y + low * dy },
    to: { x: from.x + high * dx, y: from.y + high * dy },
  };
}

/** A pending RBL follows the pointer without allocating a numbered line. */
function resolvePendingRblSegment(view: ScopeView, size: ScopeViewSize) {
  const first = view.rbl.pendingFirstEndpoint;
  const cursor = view.cursorHoverPos;
  if (!first || !cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
    return null;
  }
  const pose = resolveRblEndpointPose(first, view.tracks);
  if (!pose) return null;
  const proj = scopeProjectionFromView(view, size);
  return clipRblSegment(proj.toScreen(pose.xNm, pose.yNm), cursor, size.widthPx, size.heightPx);
}

/** Shared measured layout for both RBL paint and protected datablock geometry. */
function resolveRblScreenLayouts(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): RblScreenLayout[] {
  ctx.save();
  ctx.font = datablockFontCss(view.charSizes.tools);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const lineHeight = datablockLineHeightPx(view.charSizes.tools);
  const layouts: RblScreenLayout[] = [];
  const proj = scopeProjectionFromView(view, size);
  try {
    const entries: { id: number | "pending"; line: RangeBearingLine }[] = Array.from(
      view.rbl.lines.values(),
      (line) => ({ id: line.id, line }),
    );
    const first = view.rbl.pendingFirstEndpoint;
    const cursor = view.cursorHoverPos;
    const pose = first ? resolveRblEndpointPose(first, view.tracks) : null;
    if (first && pose && cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
      const end = proj.toWorld(cursor.x, cursor.y);
      const endpoint2 = { kind: "static" as const, xNm: end.eastNm, yNm: end.northNm };
      entries.push({
        id: "pending",
        line: {
          // Peek at the prospective ID; never reserve or insert a preview line.
          // Zero only marks a full collection and is omitted from the readout.
          id: allocateLowestFreeRblId(view.rbl) ?? 0,
          endpoint1: first,
          endpoint2,
          displayedRangeNm: distanceNm(pose, endpoint2),
          lastRangeUpdateSimMs: world.simTimeMs,
        },
      });
    }
    for (const { id, line } of entries) {
      const calc = calculateRblReadout(
        line,
        view.tracks,
        world.navigation.magVarDeg,
        view.rbl.radarTilesetBoundaryNm,
      );
      if (!calc) continue;
      const from = proj.toScreen(calc.endpoint1Pose.xNm, calc.endpoint1Pose.yNm);
      const to = proj.toScreen(calc.endpoint2Pose.xNm, calc.endpoint2Pose.yNm);
      const text = line.id === 0 ? calc.readoutText.replace(/-0$/, "") : calc.readoutText;
      const width = ctx.measureText(text).width;
      const height = lineHeight;
      layouts.push({
        id,
        text,
        textRect: {
          x: Math.max(0, Math.min(size.widthPx - width, to.x + 6)),
          y: Math.max(0, Math.min(size.heightPx - height, to.y + 4)),
          width,
          height,
        },
        visibleSegment: clipRblSegment(from, to, size.widthPx, size.heightPx),
      });
    }
  } finally {
    ctx.restore();
  }
  return layouts;
}

/** RBL lines are plain measured display geometry, separate from track hit targets. */
export function drawRangeBearingLines(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const tlsBrite = view.brite.tls ?? 100;
  if (tlsBrite <= 0) return;
  const ink = applyBrite(PALETTE.ptl, tlsBrite);
  ctx.save();
  try {
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1;
    ctx.font = datablockFontCss(view.charSizes.tools);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const layout of resolveRblScreenLayouts(ctx, world, view, size)) {
      if (layout.visibleSegment) {
        ctx.beginPath();
        ctx.moveTo(layout.visibleSegment.from.x, layout.visibleSegment.from.y);
        ctx.lineTo(layout.visibleSegment.to.x, layout.visibleSegment.to.y);
        ctx.stroke();
      }
      ctx.fillText(layout.text, layout.textRect.x, layout.textRect.y);
    }
  } finally {
    ctx.restore();
  }
}

export function drawTracks(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  // A render owns the only valid presentation/layout snapshot. Pickers must
  // never retain results across a world/view render boundary.
  view.datablockRenderSnapshot = undefined;
  const proj = scopeProjectionFromView(view, size);
  const historyCount = view.historyEnabled ? view.historyDotCount : 0;
  if (historyCount > 0) {
    for (const ac of world.aircraft) {
      const td = view.tracks.get(ac.id);
      if (!(td?.presentationReport ?? td?.lastReport)) {
        continue;
      }
      const dots = historyDotsToDraw(td.history, historyCount);
      const n = dots.eastNm.length;
      for (let i = 0; i < n; i += 1) {
        const p = proj.toScreen(dots.eastNm[i]!, dots.northNm[i]!);
        drawHistoryDot(ctx, p.x, p.y, applyBrite(historyDotColor(i, n), view.brite.hst));
      }
    }
  }

  if (
    (view.ptlOn || view.ptlOwn || view.ptlByAircraftId.size > 0) &&
    (!view.fmaSurveillance.enabled || view.fmaPtlSeconds > 0)
  ) {
    drawPredictedTrackLines(ctx, world, view, size);
  }

  drawTpaRings(ctx, world, view, size);
  drawManualTpaCones(ctx, world, view, size);
  drawAtpaCones(ctx, world, view, size);

  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    const shown = displayAircraft(ac, td);
    const report = td?.presentationReport ?? td?.lastReport;
    if (!shown || !report) {
      continue;
    }
    const p = proj.toScreen(shown.xNm, shown.yNm);
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
    const targetSymbolColor = ownership === "unowned" ? PALETTE.targetGreen : color;
    const squawk = td?.squawk ?? ac.squawk;
    let sectorId = td?.sectorId;
    if (!sectorId) {
      if (ho.kind === "inbound") {
        // Pending inbound target keeps transferring owner symbol; Field 4
        // separately shows local receiving TCP.
        sectorId = ho.fromSectorId === DEFAULT_TOWER_SECTOR_ID ? "T" : ho.fromSectorId;
      } else if (ho.kind === "departure") {
        sectorId = ho.fromSectorId === "TWR" ? "T" : ho.fromSectorId;
      } else if (ho.kind === "outbound" && ho.status === "accepted" && ownership !== "unowned") {
        sectorId = ho.toSectorId === DEFAULT_TOWER_SECTOR_ID ? "T" : ho.toSectorId;
      } else if (ownership === "tower") {
        sectorId = "T";
      } else if (ownership === "center") {
        sectorId = "C";
      } else {
        sectorId = view.sectorId ?? "D";
      }
    }

    const antenna = report.sourceSiteId
      ? view.radarSites.find((site) => site.id === report.sourceSiteId)
      : undefined;
    drawTargetSymbol(
      ctx,
      p.x,
      p.y,
      applyBrite(isPrimary ? PALETTE.positionSymbol : targetSymbolColor, posBrite),
      {
        isPrimary,
        ownership,
        tracked: isTracked,
        squawk,
        beaconSelect: view.beaconSelectCodes,
        sectorId,
        surveillancePaint: report.paint,
        groundTrackDeg: report.headingDeg,
        reportXNm: report.xNm,
        reportYNm: report.yNm,
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

  const presentationById = new Map<string, ScopeDatablockPresentation>();
  const layoutItems: DatablockLayoutInput[] = world.aircraft.flatMap((ac) => {
    const td = view.tracks.get(ac.id);
    const shown = displayAircraft(ac, td);
    if (!shown || isPrimaryTarget(ac, td) || !shouldPaintDatablock(view, world, ac, td)) {
      return [];
    }
    const visual = getDatablockVisualState(view, world, ac);
    if (!visual.visible) return [];
    const presentation = buildScopeDatablockPresentation(view, world, ac, visual);
    presentationById.set(ac.id, presentation);
    const { mode, lines } = presentation;
    const p = proj.toScreen(shown.xNm, shown.yNm);
    if (!pointInLayoutBounds(p, { x: 0, y: 0, width: size.widthPx, height: size.heightPx })) {
      return [];
    }
    const metrics = measuredDatablockMetrics(
      ctx,
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
  const layoutOptions = {
    bounds: { x: 0, y: 0, width: size.widthPx, height: size.heightPx },
    protectedGeometry: collectDatablockProtectedGeometry(world, view, size, ctx),
  };
  const layoutKey = JSON.stringify([layoutItems, layoutOptions]);
  const cachedLayout = datablockLayoutCache.get(view);
  const layouts =
    cachedLayout?.key === layoutKey
      ? cachedLayout.layouts
      : solveDatablockLayout(layoutItems, layoutOptions);
  if (cachedLayout?.key !== layoutKey) datablockLayoutCache.set(view, { key: layoutKey, layouts });
  const layoutById = new Map(layouts.map((layout) => [layout.aircraftId, layout]));
  view.datablockRenderSnapshot = {
    world,
    simTimeMs: world.simTimeMs,
    viewKey: datablockRenderSnapshotKey(view, world),
    widthPx: size.widthPx,
    heightPx: size.heightPx,
    camera: { ...view.camera },
    presentations: new Map(
      layoutItems.map((item) => {
        const presentation = presentationById.get(item.aircraftId)!;
        const rect = item.preferredRect;
        return [
          item.aircraftId,
          {
            mode: presentation.mode,
            lines: presentation.lines,
            preferredRect: {
              x: rect.x,
              y: rect.y,
              width: "width" in rect ? rect.width : rect.w,
              height: "height" in rect ? rect.height : rect.h,
            },
          },
        ];
      }),
    ),
    layouts: layoutById,
  };
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
    if (!shouldPaintDatablock(view, world, ac, td)) {
      continue;
    }
    const p = proj.toScreen(shown.xNm, shown.yNm);
    const visual = getDatablockVisualState(view, world, ac);
    if (visual.visible) {
      const briteCh =
        visual.mode === "limited" || visual.mode === "partial" ? view.brite.ldb : view.brite.fdb;
      const leaderColor = applyBrite(visual.leaderColor, briteCh);
      const layout = layoutById.get(ac.id);
      const preferred = preferredById.get(ac.id);
      const leaderDir = layout?.leaderDir ?? trackLeaderDir(view, ac.id);
      const leaderLength = layout?.leaderLengthPx ?? trackLeaderLength(view, ac.id);
      if (
        layout?.rect &&
        preferred &&
        (layout.rect.x !== preferred.x || layout.rect.y !== preferred.y)
      ) {
        if (layout.leaderAligned !== false) {
          drawLeaderLine(ctx, p.x, p.y, leaderDir, leaderColor, leaderLength, view.charSizes.pos);
        } else {
          const r = layout.rect;
          const ex = Math.max(r.x, Math.min(p.x, r.x + r.width));
          const ey = Math.max(r.y, Math.min(p.y, r.y + r.height));
          const hasLeader = leaderSegmentPx(leaderDir, leaderLength, view.charSizes.pos) !== null;
          if (hasLeader && Math.hypot(ex - p.x, ey - p.y) > 1) {
            ctx.strokeStyle = leaderColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
          }
        }
      } else if (layout?.rect) {
        drawLeaderLine(ctx, p.x, p.y, leaderDir, leaderColor, leaderLength, view.charSizes.pos);
      }
    }
  }

  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    const shown = displayAircraft(ac, td);
    if (!shown || isPrimaryTarget(ac, td)) {
      continue;
    }
    if (!shouldPaintDatablock(view, world, ac, td)) {
      continue;
    }
    const p = proj.toScreen(shown.xNm, shown.yNm);
    const layout = layoutById.get(ac.id);
    if (!layout || layout.unplaced) continue;
    drawDatablock(ctx, shown, p.x, p.y, view, world, layout, presentationById.get(ac.id));
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
  const proj = scopeProjectionFromView(view, size);
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
    const p = proj.toScreen(placed.eastNm, placed.northNm);
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
  const proj = scopeProjectionFromView(view, size);
  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    const shown = displayAircraft(ac, td);
    if (!shown) {
      continue;
    }
    const altitudeFiltered = !inAltitudeFilter(
      shown.altitudeFt,
      td?.unassociated ? view.altitudeFilter : view.associatedAltitudeFilter,
    );
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
    const ptlMin = view.fmaSurveillance.enabled ? view.fmaPtlSeconds / 60 : view.ptlMinutes;
    if (ptlMin <= 0) {
      continue;
    }
    const end = ptlEndpoint(
      shown.xNm,
      shown.yNm,
      shown.headingDeg,
      shown.speedKt,
      ptlMin,
      world.navigation.magVarDeg,
    );
    const from = proj.toScreen(shown.xNm, shown.yNm);
    const to = proj.toScreen(end.eastNm, end.northNm);
    const capTickPx = Math.max(2, view.charSizes.tools - 8);
    drawPredictedTrackLine(
      ctx,
      from.x,
      from.y,
      to.x,
      to.y,
      applyBrite(PALETTE.ptl, view.brite.tls),
      capTickPx,
    );
  }
}

/**
 * CRC TPA J-rings: world-NM mileage circles about selected (or owned) tracks
 * plus per-track `*J` rings. Stroke is TLS/tools (`TPA_STROKE_COLOR`), not CA
 * red. Radius digits sit inside the ring across both axes from the datablock unless inhibited.
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
  const proj = scopeProjectionFromView(view, size);
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
    const pts = worldPts.map((p) => proj.toScreen(p.eastNm, p.northNm));
    tracePolyline(ctx, pts, false);
    ctx.stroke();
    if (tpaSizeReadoutEnabled(view.tracks.get(ac.id))) {
      const datablockDir = trackLeaderDir(view, ac.id);
      const initialDigit = tpaRingDigitPlacement(shown.xNm, shown.yNm, radiusNm, datablockDir);
      const ringRadiusPx = tpaScreenRadiusPx(radiusNm, view.camera, size);
      const halfTextWidthPx = ctx.measureText(initialDigit.text).width / 2;
      const halfTextHeightPx = datablockLineHeightPx(view.charSizes.tools) / 2;
      const radialEastPx = initialDigit.eastNm - shown.xNm;
      const radialNorthPx = initialDigit.northNm - shown.yNm;
      const radialLengthNm = Math.hypot(radialEastPx, radialNorthPx) || 1;
      const radialEastUnit = radialEastPx / radialLengthNm;
      const radialNorthUnit = radialNorthPx / radialLengthNm;
      const halfTextRadialExtentPx =
        Math.abs(radialEastUnit) * halfTextWidthPx + Math.abs(radialNorthUnit) * halfTextHeightPx;
      if (ringRadiusPx <= halfTextRadialExtentPx + 1) {
        continue;
      }
      const safeRadiusFrac =
        ringRadiusPx > 0
          ? Math.min(
              TPA_RING_DIGIT_RADIUS_FRAC,
              Math.max(0, (ringRadiusPx - halfTextRadialExtentPx - 1) / ringRadiusPx),
            )
          : 0;
      const digit = tpaRingDigitPlacement(
        shown.xNm,
        shown.yNm,
        radiusNm,
        datablockDir,
        safeRadiusFrac,
      );
      const p = proj.toScreen(digit.eastNm, digit.northNm);
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
  const proj = scopeProjectionFromView(view, size);
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
    const worldPts = manualTpaConePoints(
      shown.xNm,
      shown.yNm,
      shown.headingDeg,
      lengthNm,
      world.navigation.magVarDeg,
    );
    if (worldPts.length < 2) {
      continue;
    }
    const pts = worldPts.map((p) => proj.toScreen(p.eastNm, p.northNm));
    if (tpaSizeReadoutEnabled(view.tracks.get(ac.id))) {
      const digit = tpaConeDigitPlacement(
        shown.xNm,
        shown.yNm,
        shown.headingDeg,
        lengthNm,
        world.navigation.magVarDeg,
      );
      const p = proj.toScreen(digit.eastNm, digit.northNm);
      const gap = coneDigitGapBox(
        ctx,
        digit.text,
        p.x,
        p.y,
        datablockLineHeightPx(view.charSizes.tools),
      );
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
 * Stroke either cone type so its lines stop at the mileage digits and pick up
 * again on the far side (Fig 38/39), instead of running through the numerals.
 * Both manual TPA and ATPA use this one path/stroke implementation.
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
  ctx.moveTo(gap.x, gap.y);
  ctx.lineTo(gap.x, gap.y + gap.height);
  ctx.lineTo(gap.x + gap.width, gap.y + gap.height);
  ctx.lineTo(gap.x + gap.width, gap.y);
  ctx.closePath();
  ctx.clip();
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
  const proj = scopeProjectionFromView(view, size);
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
    const pts = worldPts.map((p) => proj.toScreen(p.eastNm, p.northNm));
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
        const digit = proj.toScreen(placed.eastNm, placed.northNm);
        gap = coneDigitGapBox(
          ctx,
          placed.text,
          digit.x,
          digit.y,
          datablockLineHeightPx(view.charSizes.tools),
        );
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
    unassociatedFilter: view.altitudeFilter,
    associatedFilter: view.associatedAltitudeFilter,
    visibility: view.ssaFilter,
    ptlMinutes: view.ptlMinutes,
    fmaMode: view.fmaSurveillance.enabled,
    fmaPtlSeconds: view.fmaPtlSeconds,
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
      const triFontSize = lineH;
      ctx.font = datablockFontCss(view.charSizes.lists);
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
  const fmaDiagnostic = formatFmaAlertDiagnostic(
    view.fmaAlertDiagnostics,
    view.fmaScenarioDiagnostics,
  );
  if (!stars && !preview && !hint && !fmaDiagnostic && !view.lastWarning) {
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
  } else if (preview) {
    ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
    const lines = preview.split("\n");
    const lineH = datablockLineHeightPx(view.charSizes.lists);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i]!, x, y + i * lineH);
    }
  } else if (hint) {
    ctx.fillStyle = PALETTE.uiChrome;
    ctx.fillText(hint, x, y);
  }
  const occupiedLines = stars ? 1 : preview ? preview.split("\n").length : hint ? 1 : 0;
  if (fmaDiagnostic) {
    ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
    ctx.fillText(fmaDiagnostic, x, y + occupiedLines * datablockLineHeightPx(view.charSizes.lists));
  }
  if (view.lastWarning && (!preview || !preview.split("\n").includes(view.lastWarning))) {
    ctx.fillStyle = applyBrite(PALETTE.ssa, view.brite.lst);
    ctx.fillText(
      view.lastWarning,
      x,
      y + (occupiedLines + (fmaDiagnostic ? 1 : 0)) * datablockLineHeightPx(view.charSizes.lists),
    );
  }
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
    const lines = previewReadout.split("\n");
    let maxW = 0;
    for (const line of lines) {
      const w = ctx.measureText(line).width;
      if (w > maxW) maxW = w;
    }
    const width = Math.max(maxW + 8, 80);
    const height = lines.length * lineH + 4;
    const bounds: ListRect = { x, y, width, height };
    activeRects.push({ id: "PREVIEW", bounds, handleBounds: bounds });
    if (view.listDrag?.showAllFrames) {
      ctx.strokeStyle = "#259925";
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
      ctx.strokeStyle = "#259925";
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
      ctx.strokeStyle = "#259925";
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
    ctx.strokeStyle = "#259925";
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
    ctx.strokeStyle = "#259925";
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

/** Triangle marker dimensions in pixels. Upright triangle pointing north. */
export const MIN_SEP_TRIANGLE_HALF_BASE_PX = 5;
export const MIN_SEP_TRIANGLE_HEIGHT_PX = 9;

export interface MinSepBoxMetrics {
  text1: string;
  text2: string | null;
  width: number;
  height: number;
  lineHeight: number;
  padX: number;
  padY: number;
}

export function formatMinSepDistance(distanceNm: number): string {
  // If predicted separation is 0 (or rounds to 0.00), show exact 0.00 NM
  const rounded = Math.abs(distanceNm) < 0.005 ? "0.00" : distanceNm.toFixed(2);
  return `${rounded} NM`;
}

export function calculateMinSepBoxMetrics(
  view: ScopeView,
  prediction: { distanceNm: number; isIncreasingDistance: boolean },
): MinSepBoxMetrics {
  const text1 = formatMinSepDistance(prediction.distanceNm);
  const text2 = prediction.isIncreasingDistance ? "NO XING" : null;
  const fontLevel = view.charSizes.tools - 8;
  const lineHeight = scopeFontSizePx(fontLevel);
  // Monospace font character advance estimation
  const charWidth =
    scopeFontAsset(fontLevel).advances[48]! * (lineHeight / scopeFontAsset(fontLevel).height);
  const maxChars = Math.max(text1.length, text2?.length ?? 0);
  const padX = 4;
  const padY = 3;
  const textWidth = Math.ceil(maxChars * charWidth);
  const textHeight = text2 !== null ? lineHeight * 2 + 2 : lineHeight;
  const width = textWidth + padX * 2;
  const height = textHeight + padY * 2;
  return {
    text1,
    text2,
    width,
    height,
    lineHeight,
    padX,
    padY,
  };
}

/**
 * Calculates adaptive center position for the Minimum Separation readout box.
 * If the pixel distance between CPA A and CPA B is below `minInlineSpanPx`,
 * the box is offset perpendicular to the segment (pointing upwards/rightwards)
 * with clearance margin so it does not collide with or obscure the CPA triangles.
 * Coordinates are un-clamped to viewport edges so the box moves naturally with pan.
 */
export function computeMinSepBoxCenter(
  cpaA: { x: number; y: number },
  cpaB: { x: number; y: number },
  boxMetrics: MinSepBoxMetrics,
  _size?: ScopeViewSize,
): { center: { x: number; y: number }; isOffset: boolean } {
  const nominalMidX = (cpaA.x + cpaB.x) / 2;
  const nominalMidY = (cpaA.y + cpaB.y) / 2;
  const dPx = Math.hypot(cpaB.x - cpaA.x, cpaB.y - cpaA.y);
  const minInlineSpanPx = Math.max(boxMetrics.width + 12, 50);

  if (dPx >= minInlineSpanPx) {
    return {
      center: { x: nominalMidX, y: nominalMidY },
      isOffset: false,
    };
  }

  let perpX: number;
  let perpY: number;

  if (dPx < 1e-3) {
    perpX = 0;
    perpY = -1;
  } else {
    // Normal vector perpendicular to (cpaB - cpaA)
    const dx = (cpaB.x - cpaA.x) / dPx;
    const dy = (cpaB.y - cpaA.y) / dPx;
    // Perpendicular (-dy, dx)
    perpX = -dy;
    perpY = dx;
    // Prefer pointing generally upward (screen y negative) or rightward if horizontal
    if (perpY > 0 || (Math.abs(perpY) < 1e-6 && perpX < 0)) {
      perpX = -perpX;
      perpY = -perpY;
    }
  }

  const offsetDistPx = boxMetrics.height / 2 + MIN_SEP_TRIANGLE_HEIGHT_PX + 14;
  const targetX = nominalMidX + perpX * offsetDistPx;
  const targetY = nominalMidY + perpY * offsetDistPx;

  return {
    center: { x: targetX, y: targetY },
    isOffset: true,
  };
}

/**
 * Draws upright CPA triangle marker centered at (x, y).
 * Upright means base is horizontal at bottom, apex points north (up).
 */
export function drawUprightCpaTriangle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const halfBase = MIN_SEP_TRIANGLE_HALF_BASE_PX;
  const h = MIN_SEP_TRIANGLE_HEIGHT_PX;
  // Center triangle vertically around y: apex at y - h/2, base at y + h/2
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + halfBase, y + h / 2);
  ctx.lineTo(x - halfBase, y + h / 2);
  ctx.closePath();
  ctx.fill();
}

/**
 * Paint stage for Minimum-Separation Graphics (Raytheon STARS §6.4, Figure 6-1).
 *
 * - Draws projection lines from each track report pose to its CPA position.
 * - Draws two filled upright triangle markers at CPA positions.
 * - Draws connecting line segment between CPA positions.
 * - Draws rectangular mileage box at segment midpoint, clamped to viewport.
 * - Shows boxed two-decimal NM value, plus 'NO XING' underneath when separation is increasing.
 * - Ink uses white PALETTE.ptl modulated by view.brite.tls. Zero TLS hides ink.
 * - Text uses view.charSizes.tools.
 */
export function drawMinimumSeparation(
  ctx: CanvasRenderingContext2D,
  world: World,
  view: ScopeView,
  size: ScopeViewSize,
): void {
  const resolved = resolveActiveMinSep(view.minSep, view.tracks, world.navigation.magVarDeg);
  if (!resolved) {
    return;
  }
  const tlsBrite = view.brite.tls ?? 100;
  if (tlsBrite <= 0) {
    // Zero brightness hides all MIN ink while retaining active pair
    return;
  }

  const { trackA, trackB, prediction } = resolved;
  const proj = scopeProjectionFromView(view, size);
  const ptA = proj.toScreen(trackA.xNm, trackA.yNm);
  const ptB = proj.toScreen(trackB.xNm, trackB.yNm);
  const cpaA = proj.toScreen(prediction.posANm.xNm, prediction.posANm.yNm);
  const cpaB = proj.toScreen(prediction.posBNm.xNm, prediction.posBNm.yNm);

  const white = applyBrite(PALETTE.ptl, tlsBrite);
  const bg = getBackgroundColor(view.brite?.bkc ?? 100);

  ctx.save();
  try {
    ctx.strokeStyle = white;
    ctx.fillStyle = white;
    ctx.lineWidth = PTL_STROKE_PX;

    // 1. Projection line from report A to CPA A
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(cpaA.x, cpaA.y);
    ctx.stroke();

    // 2. Projection line from report B to CPA B
    ctx.beginPath();
    ctx.moveTo(ptB.x, ptB.y);
    ctx.lineTo(cpaB.x, cpaB.y);
    ctx.stroke();

    // 3. Separation line segment joining CPA A and CPA B
    ctx.beginPath();
    ctx.moveTo(cpaA.x, cpaA.y);
    ctx.lineTo(cpaB.x, cpaB.y);
    ctx.stroke();

    // 4. Boxed distance readout and optional NO XING cue (drawn between the two triangles or offset if close)
    const boxMetrics = calculateMinSepBoxMetrics(view, prediction);
    const { center: boxCenter } = computeMinSepBoxCenter(cpaA, cpaB, boxMetrics, size);

    const boxX = Math.round(boxCenter.x - boxMetrics.width / 2);
    const boxY = Math.round(boxCenter.y - boxMetrics.height / 2);

    // Fill background so line/geometry behind box doesn't obscure text
    ctx.fillStyle = bg;
    ctx.fillRect(boxX, boxY, boxMetrics.width, boxMetrics.height);

    // Stroke rectangular mileage box border
    ctx.strokeStyle = white;
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxMetrics.width, boxMetrics.height);

    // Draw text inside box using TOOLS font
    ctx.font = datablockFontCss(view.charSizes.tools);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = white;

    if (boxMetrics.text2 !== null) {
      const lineSpacing = boxMetrics.lineHeight + 2;
      const firstLineY = boxY + boxMetrics.padY + boxMetrics.lineHeight / 2;
      const secondLineY = firstLineY + lineSpacing;
      ctx.fillText(boxMetrics.text1, boxCenter.x, firstLineY);
      ctx.fillText(boxMetrics.text2, boxCenter.x, secondLineY);
    } else {
      ctx.fillText(boxMetrics.text1, boxCenter.x, boxCenter.y);
    }

    // 5. Upright CPA triangle markers (painted independently on top of distance box and segment)
    ctx.fillStyle = white;
    drawUprightCpaTriangle(ctx, cpaA.x, cpaA.y);
    drawUprightCpaTriangle(ctx, cpaB.x, cpaB.y);
  } finally {
    ctx.restore();
  }
}
