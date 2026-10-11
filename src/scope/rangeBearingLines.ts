/**
 * Bounded, session-only Range-Bearing Line (RBL) model, geometry,
 * magnetic-bearing/traversal readouts, report-driven range smoothing cadence,
 * and generic optional radar-tileset boundary adaptation.
 *
 * Raytheon STARS TI 6191.409 Section 6.7 (pp. 6-55–56, PDF 585–586) & Section 6.8 (p. 6-58, PDF 588):
 * - Session collection holds at most nine numbered RBLs with stable IDs 1–9.
 * - Endpoints: static clicked ENU position, catalog fix ID + resolved ENU position, or track ID.
 * - Lowest free ID allocated on insertion; deletion never renumbers surviving lines.
 * - Tracks use latest displayed surveillance report pose (xNm, yNm, speedKt).
 * - Bearing runs from endpoint 1 to endpoint 2 using ENU course and trueToMagneticDeg with
 *   authored scenario navigation magVar applied once.
 * - Readout format: BBB/RR.RR[/M]-ID without NM suffix or box.
 *   - BBB: zero-padded whole degree, rounded north normalized to 000.
 *   - RR.RR: two decimal places. Overflow mask '***.**' when raw range > 999.99 NM.
 *   - M: integer minutes traversal duration (60 * dist / speedKt), no leading zero.
 *     Shown ONLY when exactly one endpoint is a track. Two tracks or no tracks omits [/M].
 *     Overflow mask '**' when raw time > 99 min.
 *     Trainer choice: positive distance with 0 speed displays '**'; coincident (0 NM) with 0 speed displays '0'.
 * - Range cadence:
 *   - Any range decrease or increase of >= 0.1 NM updates immediately.
 *   - Smaller increases wait until a report event at >= 4,500 ms after the last range update.
 *   - Bearing and traversal update on new reports.
 *   - Frame ticks / render passes without new reports do not advance range or reset the deadline.
 * - Radar tileset boundary:
 *   - Optional generic polygon in local ENU NM (at least 3 vertices).
 *   - Boundary-inclusive containment.
 *   - If either endpoint is outside the polygon, bearing is formatted as '777'.
 *   - Omitted polygon means unbounded trainer plane default (normal bearing).
 */

import {
  courseDeg,
  distanceNm,
  flightPlanForAircraft,
  trueToMagneticDeg,
  type NmEastNorth,
  type World,
} from "@core";
import type { SurveillanceReport } from "./surveillance";

/** Maximum number of active RBLs permitted per STARS Section 6.7. */
export const MAX_RBL_COUNT = 9;

/** Update cadence threshold for immediate range increase in NM (TI 6191.409 PDF 586). */
export const RBL_RANGE_INCREASE_THRESHOLD_NM = 0.1;

/** Delay threshold for subthreshold range increases in milliseconds (4.5 seconds). */
export const RBL_RANGE_CADENCE_DELAY_MS = 4500;

/** Raw range upper limit for overflow mask (999.99 NM). */
export const RBL_MAX_RAW_RANGE_NM = 999.99;

/** Raw traversal time upper limit for overflow mask (99 minutes). */
export const RBL_MAX_RAW_TIME_MIN = 99;

/** Special bearing formatted when either endpoint is outside the radar tileset boundary. */
export const RBL_OUTSIDE_TILESET_BEARING = "777";

/** RBL inputs must reference an actual, time-stamped displayed report. */
function isUsableRblReport(report: SurveillanceReport | undefined): report is SurveillanceReport {
  return Boolean(
    report &&
    Number.isFinite(report.xNm) &&
    Number.isFinite(report.yNm) &&
    Number.isFinite(report.reportedAtSimMs),
  );
}

/**
 * RBL endpoint variants:
 * - static: clicked ENU position
 * - fix: catalog fix ID with resolved ENU position
 * - track: canonical aircraft track ID
 */
export type RblEndpoint =
  | { kind: "static"; xNm: number; yNm: number }
  | { kind: "fix"; fixId: string; xNm: number; yNm: number }
  | { kind: "track"; aircraftId: string };

/**
 * Resolved geometric pose for an endpoint at calculation/display time.
 */
export interface ResolvedRblEndpointPose {
  xNm: number;
  yNm: number;
  speedKt?: number;
}

/**
 * Internal state for an individual Range-Bearing Line.
 */
export interface RangeBearingLine {
  id: number;
  endpoint1: RblEndpoint;
  endpoint2: RblEndpoint;
  /** Currently displayed smoothed/cadenced range in NM. */
  displayedRangeNm: number;
  /** Simulation timestamp in milliseconds when displayedRangeNm was last updated. */
  lastRangeUpdateSimMs: number;
}

/**
 * Session collection state for Range-Bearing Lines.
 */
export interface RangeBearingLineState {
  lines: Map<number, RangeBearingLine>;
  radarTilesetBoundaryNm?: NmEastNorth[];
  /** Staged first endpoint awaiting second endpoint during RBL creation. */
  pendingFirstEndpoint: RblEndpoint | null;
}

/**
 * Create an empty RBL session state.
 */
export function createRangeBearingLineState(options?: {
  radarTilesetBoundaryNm?: NmEastNorth[];
}): RangeBearingLineState {
  return {
    lines: new Map(),
    radarTilesetBoundaryNm: options?.radarTilesetBoundaryNm
      ? [...options.radarTilesetBoundaryNm]
      : undefined,
    pendingFirstEndpoint: null,
  };
}

/**
 * Clear all RBL lines (e.g. on scenario reload or *T <ENTER>).
 */
export function clearRangeBearingLines(state: RangeBearingLineState): void {
  state.lines.clear();
  state.pendingFirstEndpoint = null;
}

/**
 * Cancel pending RBL creation on view, clearing pendingFirstEndpoint and disarming preview if armed.
 * Preserves active RBL collection.
 */
export function cancelRblPending(state: RangeBearingLineState): void {
  state.pendingFirstEndpoint = null;
}

/**
 * Check whether RBL creation is pending (first endpoint staged or preview armed for RBL).
 */
export function isRblPending(state: RangeBearingLineState): boolean {
  return state.pendingFirstEndpoint !== null;
}

/**
 * Set or update the radar tileset boundary on the RBL state.
 */
export function setRblRadarTilesetBoundary(
  state: RangeBearingLineState,
  boundary?: readonly NmEastNorth[],
): void {
  state.radarTilesetBoundaryNm = boundary ? [...boundary] : undefined;
}

/**
 * Find the lowest unused integer ID in 1–9.
 * Returns null if all 9 slots are filled.
 */
export function allocateLowestFreeRblId(state: RangeBearingLineState): number | null {
  for (let id = 1; id <= MAX_RBL_COUNT; id++) {
    if (!state.lines.has(id)) {
      return id;
    }
  }
  return null;
}

/**
 * Check boundary-inclusive point-in-polygon containment for 2D ENU points.
 * Returns true if inside or on any edge/vertex of the polygon.
 */
export function isPointInsideOrOnPolygon(
  point: { xNm: number; yNm: number },
  polygon: readonly NmEastNorth[],
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  const px = point.xNm;
  const py = point.yNm;

  // First check if the point lies directly on any boundary segment (boundary-inclusive)
  const EPSILON = 1e-9;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i++) {
    const a = polygon[j]!;
    const b = polygon[i]!;

    const minX = Math.min(a.xNm, b.xNm) - EPSILON;
    const maxX = Math.max(a.xNm, b.xNm) + EPSILON;
    const minY = Math.min(a.yNm, b.yNm) - EPSILON;
    const maxY = Math.max(a.yNm, b.yNm) + EPSILON;

    if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
      // Cross product to check collinearity: (px - a.x) * (b.y - a.y) - (py - a.y) * (b.x - a.x)
      const cross = (px - a.xNm) * (b.yNm - a.yNm) - (py - a.yNm) * (b.xNm - a.xNm);
      if (Math.abs(cross) <= EPSILON) {
        return true;
      }
    }
  }

  // Standard ray-casting for interior
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i++) {
    const vi = polygon[i]!;
    const vj = polygon[j]!;
    const intersect =
      vi.yNm > py !== vj.yNm > py &&
      px < ((vj.xNm - vi.xNm) * (py - vi.yNm)) / (vj.yNm - vi.yNm) + vi.xNm;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Resolve an endpoint's current pose from static coordinates, catalog fix, or track report.
 */
export function resolveRblEndpointPose(
  endpoint: RblEndpoint,
  tracks: Map<string, { lastReport?: SurveillanceReport }>,
): ResolvedRblEndpointPose | null {
  if (endpoint.kind === "static" || endpoint.kind === "fix") {
    if (!Number.isFinite(endpoint.xNm) || !Number.isFinite(endpoint.yNm)) {
      return null;
    }
    return { xNm: endpoint.xNm, yNm: endpoint.yNm };
  }

  if (endpoint.kind === "track") {
    const report = tracks.get(endpoint.aircraftId)?.lastReport;
    if (!isUsableRblReport(report)) {
      return null;
    }
    return {
      xNm: report.xNm,
      yNm: report.yNm,
      speedKt: Number.isFinite(report.speedKt) ? report.speedKt : undefined,
    };
  }

  return null;
}

/**
 * Insert a new Range-Bearing Line into state.
 * Allocates lowest free ID 1–9. Computes initial distance at simMs.
 * Returns the created line, or null if capacity (9 lines) is exceeded or poses cannot be resolved.
 */
export function insertRangeBearingLine(
  state: RangeBearingLineState,
  endpoint1: RblEndpoint,
  endpoint2: RblEndpoint,
  tracks: Map<string, { lastReport?: SurveillanceReport }>,
  simMs = 0,
): RangeBearingLine | null {
  const id = allocateLowestFreeRblId(state);
  if (id === null) {
    return null;
  }

  const pose1 = resolveRblEndpointPose(endpoint1, tracks);
  const pose2 = resolveRblEndpointPose(endpoint2, tracks);
  if (!pose1 || !pose2) {
    return null;
  }

  const initialRawDistanceNm = distanceNm(pose1, pose2);
  const line: RangeBearingLine = {
    id,
    endpoint1,
    endpoint2,
    displayedRangeNm: initialRawDistanceNm,
    lastRangeUpdateSimMs: simMs,
  };

  state.lines.set(id, line);
  return line;
}

/**
 * Remove an individual RBL by ID.
 * Returns true if the line was removed, false if not found.
 * Does not renumber surviving lines.
 */
export function removeRangeBearingLine(state: RangeBearingLineState, id: number): boolean {
  return state.lines.delete(id);
}

/**
 * Apply the STARS report-driven range cadence logic for a single line:
 * - Any range decrease updates immediately.
 * - Any range increase >= 0.1 NM updates immediately.
 * - Smaller increases update only when the report event occurs at >= 4,500 ms since lastRangeUpdateSimMs.
 * Returns updated displayedRangeNm.
 */
export function updateRblCadenceRange(
  currentDisplayedRangeNm: number,
  calculatedRangeNm: number,
  lastRangeUpdateSimMs: number,
  reportSimMs: number,
): { displayedRangeNm: number; lastRangeUpdateSimMs: number } {
  // Check if decrease
  if (calculatedRangeNm < currentDisplayedRangeNm) {
    return {
      displayedRangeNm: calculatedRangeNm,
      lastRangeUpdateSimMs: reportSimMs,
    };
  }

  const delta = calculatedRangeNm - currentDisplayedRangeNm;

  // Check if increase >= 0.1 NM
  // Using a tiny epsilon (1e-6) so 0.100 NM is safely recognized as >= 0.1 NM
  if (delta >= RBL_RANGE_INCREASE_THRESHOLD_NM - 1e-6) {
    return {
      displayedRangeNm: calculatedRangeNm,
      lastRangeUpdateSimMs: reportSimMs,
    };
  }

  // Smaller increase (< 0.1 NM): check if elapsed time >= 4,500 ms
  if (reportSimMs - lastRangeUpdateSimMs >= RBL_RANGE_CADENCE_DELAY_MS) {
    return {
      displayedRangeNm: calculatedRangeNm,
      lastRangeUpdateSimMs: reportSimMs,
    };
  }

  // Subthreshold increase before deadline: keep current displayed range and timestamp
  return {
    displayedRangeNm: currentDisplayedRangeNm,
    lastRangeUpdateSimMs,
  };
}

/**
 * Format bearing string per TI 6191.409 Section 6.7:
 * - Outside radar tileset boundary: "777".
 * - Inside / unbounded: nearest whole degree, zero-padded 3 digits, rounded north normalized to "000".
 */
export function formatRblBearing(
  trueCourseDeg: number,
  magVarDeg: number,
  isOutsideTileset: boolean,
): string {
  if (isOutsideTileset) {
    return RBL_OUTSIDE_TILESET_BEARING;
  }

  const magneticDeg = trueToMagneticDeg(trueCourseDeg, magVarDeg);
  let roundedDeg = Math.round(magneticDeg) % 360;
  if (roundedDeg < 0) {
    roundedDeg += 360;
  }
  // Rounded north is normalized to 000 per STARS specification (p. 6-56 / PDF 586)
  if (roundedDeg === 360 || roundedDeg === 0) {
    return "000";
  }

  return roundedDeg.toString().padStart(3, "0");
}

/**
 * Format range string:
 * - Raw range > 999.99 NM: '***.**'.
 * - Otherwise: two decimal places (e.g. '5.14', '0.00').
 */
export function formatRblRange(rawRangeNm: number): string {
  if (rawRangeNm > RBL_MAX_RAW_RANGE_NM) {
    return "***.**";
  }
  return rawRangeNm.toFixed(2);
}

/**
 * Format traversal time string:
 * - Traversal duration formula: 60 * distanceNm / groundSpeedKt.
 * - Shown ONLY when exactly one endpoint is a track. Two tracks or no tracks omits traversal duration.
 * - Raw time > 99 min: '**'.
 * - Zero speed with positive distance: '**'.
 * - Zero speed with coincident distance (0 NM): '0'.
 * - Normal: nearest integer minute with NO leading zeros (e.g. '3', '15', '0').
 */
export function formatRblTraversalMinutes(
  distanceNmVal: number,
  groundSpeedKt?: number,
): string | null {
  if (groundSpeedKt === undefined || !Number.isFinite(groundSpeedKt)) {
    return null;
  }

  if (groundSpeedKt <= 0) {
    if (distanceNmVal > 0) {
      return "**";
    }
    return "0";
  }

  const rawMinutes = (60 * distanceNmVal) / groundSpeedKt;
  if (rawMinutes > RBL_MAX_RAW_TIME_MIN) {
    return "**";
  }

  const roundedMinutes = Math.round(rawMinutes);
  return roundedMinutes.toString();
}

/**
 * Calculated readout and geometry for a Range-Bearing Line.
 */
export interface RblReadoutCalculation {
  id: number;
  readoutText: string;
  bearingStr: string;
  rangeStr: string;
  traversalStr: string | null;
  rawDistanceNm: number;
  displayedRangeNm: number;
  magneticBearingDeg: number;
  endpoint1Pose: ResolvedRblEndpointPose;
  endpoint2Pose: ResolvedRblEndpointPose;
  isOutsideTileset: boolean;
}

/**
 * Calculate the active readout and poses for an RBL.
 * Handles radar tileset boundary check, magnetic bearing, smoothed displayed range,
 * and traversal duration if exactly one track endpoint exists.
 */
export function calculateRblReadout(
  line: RangeBearingLine,
  tracks: Map<string, { lastReport?: SurveillanceReport }>,
  magVarDeg = 0,
  radarTilesetBoundaryNm?: readonly NmEastNorth[],
): RblReadoutCalculation | null {
  const pose1 = resolveRblEndpointPose(line.endpoint1, tracks);
  const pose2 = resolveRblEndpointPose(line.endpoint2, tracks);
  if (!pose1 || !pose2) {
    return null;
  }

  const rawDist = distanceNm(pose1, pose2);
  const trueBearing = courseDeg(pose1, pose2);
  const magBearing = trueToMagneticDeg(trueBearing, magVarDeg);

  let isOutside = false;
  if (radarTilesetBoundaryNm && radarTilesetBoundaryNm.length >= 3) {
    const pt1Inside = isPointInsideOrOnPolygon(pose1, radarTilesetBoundaryNm);
    const pt2Inside = isPointInsideOrOnPolygon(pose2, radarTilesetBoundaryNm);
    if (!pt1Inside || !pt2Inside) {
      isOutside = true;
    }
  }

  const bearingStr = formatRblBearing(trueBearing, magVarDeg, isOutside);
  const rangeStr = formatRblRange(line.displayedRangeNm);

  // Traversal duration: shown ONLY when exactly one endpoint is a track
  const isTrack1 = line.endpoint1.kind === "track";
  const isTrack2 = line.endpoint2.kind === "track";
  let traversalStr: string | null = null;

  if ((isTrack1 && !isTrack2) || (!isTrack1 && isTrack2)) {
    const trackSpeed = isTrack1 ? pose1.speedKt : pose2.speedKt;
    traversalStr = formatRblTraversalMinutes(rawDist, trackSpeed);
  }

  const readoutText =
    traversalStr !== null
      ? `${bearingStr}/${rangeStr}/${traversalStr}-${line.id}`
      : `${bearingStr}/${rangeStr}-${line.id}`;

  return {
    id: line.id,
    readoutText,
    bearingStr,
    rangeStr,
    traversalStr,
    rawDistanceNm: rawDist,
    displayedRangeNm: line.displayedRangeNm,
    magneticBearingDeg: magBearing,
    endpoint1Pose: pose1,
    endpoint2Pose: pose2,
    isOutsideTileset: isOutside,
  };
}

/**
 * Step/tick all active RBLs on incoming surveillance report events:
 * If an active line references the reported aircraft track, recalculates
 * current distance and applies updateRblCadenceRange using the report's simMs.
 */
export function onRblSurveillanceReport(
  state: RangeBearingLineState,
  aircraftId: string,
  tracks: Map<string, { lastReport?: SurveillanceReport }>,
  reportSimMs: number,
): void {
  for (const line of state.lines.values()) {
    const touchesTrack =
      (line.endpoint1.kind === "track" && line.endpoint1.aircraftId === aircraftId) ||
      (line.endpoint2.kind === "track" && line.endpoint2.aircraftId === aircraftId);

    if (!touchesTrack) {
      continue;
    }

    const pose1 = resolveRblEndpointPose(line.endpoint1, tracks);
    const pose2 = resolveRblEndpointPose(line.endpoint2, tracks);
    if (!pose1 || !pose2) {
      continue;
    }

    const calculatedRangeNm = distanceNm(pose1, pose2);
    const updated = updateRblCadenceRange(
      line.displayedRangeNm,
      calculatedRangeNm,
      line.lastRangeUpdateSimMs,
      reportSimMs,
    );

    line.displayedRangeNm = updated.displayedRangeNm;
    line.lastRangeUpdateSimMs = updated.lastRangeUpdateSimMs;
  }
}

/**
 * Result of resolving a typed RBL endpoint string against World navigation fixes and tracks.
 */
export type ResolveRblEndpointResult =
  { kind: "resolved"; endpoint: RblEndpoint } | { kind: "error"; reason: string };

/**
 * Check if a token resolves to a catalog fix in world.catalog / world.fixRegistry.
 * Fix must have length 3–7 characters per STARS Rev30 Section 6.7.
 */
export function lookupCatalogFix(
  token: string,
  world: World,
): { fixId: string; xNm: number; yNm: number } | null {
  const norm = token.trim().toUpperCase();
  if (norm.length < 3 || norm.length > 7) {
    return null;
  }

  // 1. world.fixRegistry check
  if (world.fixRegistry) {
    const reg = world.fixRegistry.get(norm);
    if (
      reg &&
      typeof reg.xNm === "number" &&
      Number.isFinite(reg.xNm) &&
      typeof reg.yNm === "number" &&
      Number.isFinite(reg.yNm)
    ) {
      return { fixId: reg.id, xNm: reg.xNm, yNm: reg.yNm };
    }
  }

  // 2. world.catalog fixes & navaids fallback
  if (world.catalog) {
    const fix = world.catalog.fixes.find((f) => f.id.toUpperCase() === norm);
    if (
      fix &&
      typeof fix.xNm === "number" &&
      Number.isFinite(fix.xNm) &&
      typeof fix.yNm === "number" &&
      Number.isFinite(fix.yNm)
    ) {
      return { fixId: fix.id, xNm: fix.xNm, yNm: fix.yNm };
    }
    const navaid = world.catalog.navaids.find((n) => n.id.toUpperCase() === norm);
    if (
      navaid &&
      typeof navaid.xNm === "number" &&
      Number.isFinite(navaid.xNm) &&
      typeof navaid.yNm === "number" &&
      Number.isFinite(navaid.yNm)
    ) {
      return { fixId: navaid.id, xNm: navaid.xNm, yNm: navaid.yNm };
    }
  }

  return null;
}

/**
 * Resolve a typed track identifier (full ACID or 4-digit beacon code) against living tracks.
 * Track must be present in world.aircraft, have a living state and a finite surveillance report.
 * Returns:
 * - { kind: "resolved", aircraftId }
 * - { kind: "dupId", acid, activeTcps, inactiveTcps }
 * - { kind: "dupBcn" }
 * - { kind: "noFlight" }
 */
export function lookupRblTrack(
  token: string,
  world: World,
  tracks: Map<string, { lastReport?: SurveillanceReport }>,
):
  | { kind: "resolved"; aircraftId: string }
  | { kind: "dupId"; acid: string; activeTcps: string[]; inactiveTcps: string[] }
  | { kind: "dupBcn" }
  | { kind: "noFlight" } {
  const norm = token.trim().toUpperCase();
  if (norm.length === 0) {
    return { kind: "noFlight" };
  }

  const isBeacon = /^[0-7]{4}$/.test(norm);

  if (isBeacon) {
    // RBL beacon entry is grounded only by the beacon in the current report.
    const matchingIds: string[] = [];
    for (const ac of world.aircraft) {
      const repSquawk = ac.reportedSquawk;
      if (repSquawk === norm) {
        const report = tracks.get(ac.id)?.lastReport;
        if (isUsableRblReport(report)) {
          matchingIds.push(ac.id);
        }
      }
    }

    if (matchingIds.length === 0) {
      return { kind: "noFlight" };
    }
    if (matchingIds.length > 1) {
      return { kind: "dupBcn" };
    }
    return { kind: "resolved", aircraftId: matchingIds[0]! };
  }

  // Match by ACID
  // Living aircraft with its displayed operational ACID (or raw callsign when
  // no operational plan is correlated), having a finite report.
  const matchingAcIds = new Set<string>();
  for (const ac of world.aircraft) {
    const report = tracks.get(ac.id)?.lastReport;
    if (!isUsableRblReport(report)) {
      continue;
    }
    const plan = flightPlanForAircraft(world, ac.id);
    const acid = plan?.acid ?? ac.callsign;
    if (acid.toUpperCase() === norm) {
      matchingAcIds.add(ac.id);
    }
  }

  if (matchingAcIds.size > 0) {
    const matchingPlans = world.flightPlans.filter((p) => p.acid.toUpperCase() === norm);
    const trackIds = [...matchingAcIds];
    const plansNotRepresentedByTracks = matchingPlans.filter(
      (plan) =>
        !trackIds.some((aircraftId) => flightPlanForAircraft(world, aircraftId)?.id === plan.id),
    );
    if (matchingAcIds.size > 1 || plansNotRepresentedByTracks.length > 0) {
      const activeTcps: string[] = [];
      const inactiveTcps: string[] = [];
      for (const plan of matchingPlans) {
        if (plan.tcp) {
          const isActive = plan.status === "active";
          if (isActive) {
            if (!activeTcps.includes(plan.tcp)) activeTcps.push(plan.tcp);
          } else {
            if (!inactiveTcps.includes(plan.tcp)) inactiveTcps.push(plan.tcp);
          }
        }
      }
      return { kind: "dupId", acid: norm, activeTcps, inactiveTcps };
    }
    return { kind: "resolved", aircraftId: trackIds[0]! };
  }

  return { kind: "noFlight" };
}

/**
 * Format the multiline DUP ID error with supplemental TCP rows if available:
 * DUP ID <ACID>
 * FLIGHT ACTIVE AT <TCP>
 * FLIGHT INACTIVE AT <TCP(s)>
 */
export function formatDupIdError(
  acid: string,
  activeTcps: readonly string[],
  inactiveTcps: readonly string[],
): string {
  const lines: string[] = [`DUP ID ${acid}`];
  if (activeTcps.length > 0) {
    lines.push(`FLIGHT ACTIVE AT ${activeTcps.join(", ")}`);
  }
  if (inactiveTcps.length > 0) {
    lines.push(`FLIGHT INACTIVE AT ${inactiveTcps.join(", ")}`);
  }
  return lines.join("\n");
}

/**
 * Resolve a typed first-stage RBL operand.
 * Input format: either typed fix (without leading space after T) or typed track with REQUIRED leading space.
 * Fix lookup (length 3-7) beats ACID even in the space form.
 */
export function resolveRblFirstEndpoint(
  rawOperand: string,
  world: World,
  tracks: Map<string, { lastReport?: SurveillanceReport }>,
): ResolveRblEndpointResult {
  const hasLeadingSpace = rawOperand.startsWith(" ");
  const trimmed = rawOperand.trim();

  if (trimmed.length === 0) {
    return { kind: "error", reason: "FORMAT" };
  }
  if (/\s/.test(trimmed)) {
    return { kind: "error", reason: "FORMAT" };
  }

  // 1. Fix lookup: 3-7 characters. Fix wins over matching ACID even in space form.
  const fix = lookupCatalogFix(trimmed, world);
  if (fix) {
    return {
      kind: "resolved",
      endpoint: { kind: "fix", fixId: fix.fixId, xNm: fix.xNm, yNm: fix.yNm },
    };
  }

  // If no fix was found and no leading space was provided, an ACID cannot become a track:
  // "A first typed ACID without the required SPACE cannot become a track; unknown fix yields NO FLIGHT."
  if (!hasLeadingSpace) {
    if (/^\d+$/.test(trimmed)) {
      return { kind: "error", reason: "RBL ID" };
    }
    return { kind: "error", reason: "NO FLIGHT" };
  }

  // Leading space provided: resolve as track (ACID or beacon)
  const trackResult = lookupRblTrack(trimmed, world, tracks);
  if (trackResult.kind === "resolved") {
    return {
      kind: "resolved",
      endpoint: { kind: "track", aircraftId: trackResult.aircraftId },
    };
  }
  if (trackResult.kind === "dupId") {
    return {
      kind: "error",
      reason: formatDupIdError(trackResult.acid, trackResult.activeTcps, trackResult.inactiveTcps),
    };
  }
  if (trackResult.kind === "dupBcn") {
    return { kind: "error", reason: "DUP BCN" };
  }
  return { kind: "error", reason: "NO FLIGHT" };
}

/**
 * Resolve a typed second-stage RBL operand.
 * No leading space is required in stage 2.
 * Fix lookup (length 3-7) beats ACID.
 */
export function resolveRblSecondEndpoint(
  rawOperand: string,
  world: World,
  tracks: Map<string, { lastReport?: SurveillanceReport }>,
): ResolveRblEndpointResult {
  const trimmed = rawOperand.trim();
  if (trimmed.length === 0) {
    return { kind: "error", reason: "FORMAT" };
  }
  if (/\s/.test(trimmed)) {
    return { kind: "error", reason: "FORMAT" };
  }

  // 1. Fix lookup: 3-7 characters.
  const fix = lookupCatalogFix(trimmed, world);
  if (fix) {
    return {
      kind: "resolved",
      endpoint: { kind: "fix", fixId: fix.fixId, xNm: fix.xNm, yNm: fix.yNm },
    };
  }

  // 2. Track lookup (ACID or beacon)
  const trackResult = lookupRblTrack(trimmed, world, tracks);
  if (trackResult.kind === "resolved") {
    return {
      kind: "resolved",
      endpoint: { kind: "track", aircraftId: trackResult.aircraftId },
    };
  }
  if (trackResult.kind === "dupId") {
    return {
      kind: "error",
      reason: formatDupIdError(trackResult.acid, trackResult.activeTcps, trackResult.inactiveTcps),
    };
  }
  if (trackResult.kind === "dupBcn") {
    return { kind: "error", reason: "DUP BCN" };
  }
  return { kind: "error", reason: "NO FLIGHT" };
}
