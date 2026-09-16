/**
 * Autonomous VFR navigation and 3D Class B avoidance (T04-71).
 *
 * Implements:
 * - Swept 3D volume intersection testing with horizontal and vertical boundary margins
 * - Airspace shelf floor/ceiling compliance and turn/climb/descent safety
 * - Persistent waypoint navigation for LOCAL, TRANSIT, and AIRPORT_BOUND missions
 * - Natural exits and observable destination tower handoffs
 * - Bounded route planning with deterministic failure reporting (vfr.spawn.skipped / NO_SAFE_ROUTE)
 *
 * Generic: operates on scenario coordinates and regional catalog volumes without facility-specific branches.
 */

import type { Aircraft, AmbientVfrMission } from "./aircraft";
import type { SessionLog } from "./events/session-log";
import { courseDeg, distanceNm } from "./nav/geometry";
import { magneticToTrueDeg, trueToMagneticDeg } from "./nav/headingFrames";
import type {
  RegionalAirspaceVolume,
  RegionalAirport,
  RegionalFacility,
} from "../scenario/regional";

export const CLASS_B_HORIZONTAL_MARGIN_NM = 1.0;
export const CLASS_B_VERTICAL_MARGIN_FT = 500;
export const MAX_PLANNER_ATTEMPTS = 10;
export const VFR_TRACON_EXIT_RADIUS_NM = 28;

/** Arc tessellation step for CLOCKWISE_ARC / COUNTER_CLOCKWISE_ARC segments. */
export const VFR_ARC_TESSELLATION_STEP_DEG = 5;
/** Full-circle fallback discretization for CIRCLE and lone-arc segments. */
export const VFR_CIRCLE_TESSELLATION_POINTS = 36;
/** Look-ahead distance for the per-tick avoidance guard. */
export const VFR_AVOIDANCE_PROBE_NM = 2;
/** Heading offsets tried by the per-tick avoidance guard (deg, true). */
export const VFR_AVOIDANCE_TURN_OFFSETS_DEG = [30, -30, 45, -45, 60, -60, 90, -90];

/**
 * Fallback ARP-centered spawn radius (T04-77 legacy 30 NM). Ambient VFR
 * spawns uniformly inside the scenario-coverage disc around the scenario
 * ARP; see `resolveVfrSpawnRadiusNm`. Spawns inside Bravo are excluded by
 * the avoidance guard, never by area shaping.
 */
export const VFR_TRAINING_HALF_EXTENT_NM = 30;

/** Stable zoneId marker for box-spawned ambient VFR (zones were deleted in T04-77). */
export const VFR_TRAINING_BOX_ID = "training-box";

export interface Point2D {
  xNm: number;
  yNm: number;
}

export interface Point3D extends Point2D {
  altitudeFt: number;
}

export interface VfrNavWaypoint extends Point3D {
  speedKt?: number;
  targetToleranceNm?: number;
}

export interface AvoidanceMargin {
  horizontalMarginNm?: number;
  verticalMarginFt?: number;
}

/** Check whether a regional airspace volume is marked for VFR avoidance. */
export function isVfrAvoidanceVolume(volume: RegionalAirspaceVolume): boolean {
  return volume.type === "CONTROLLED" && volume.class === "B";
}

/** True bearing (deg, clockwise from north) from one NM point to another. */
export function bearingDegNm(from: Point2D, to: Point2D): number {
  const raw = (Math.atan2(to.xNm - from.xNm, to.yNm - from.yNm) * 180) / Math.PI;
  return ((raw % 360) + 360) % 360;
}

function normalizeBearingDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Tessellate a circular arc (origin + radius, start bearing -> end bearing)
 * into polyline points. `clockwise=true` sweeps bearings upward (N->E->S->W).
 * Emits intermediate points plus the end point; the start point is excluded
 * because the caller already emitted the previous chain vertex.
 */
function tessellateArcNm(
  origin: Point2D,
  radiusNm: number,
  startBearingDeg: number,
  endBearingDeg: number,
  clockwise: boolean,
): Point2D[] {
  const start = normalizeBearingDeg(startBearingDeg);
  const end = normalizeBearingDeg(endBearingDeg);
  let span: number;
  if (clockwise) {
    span = (end - start + 360) % 360;
  } else {
    span = (start - end + 360) % 360;
  }
  // Identical bearings mean a full loop, not a zero-length arc.
  if (span === 0) span = 360;
  const steps = Math.max(1, Math.ceil(span / VFR_ARC_TESSELLATION_STEP_DEG));
  const points: Point2D[] = [];
  for (let i = 1; i <= steps; i++) {
    const bearing = clockwise ? start + (span * i) / steps : start - (span * i) / steps;
    const rad = (normalizeBearingDeg(bearing) * Math.PI) / 180;
    points.push({
      xNm: origin.xNm + radiusNm * Math.sin(rad),
      yNm: origin.yNm + radiusNm * Math.cos(rad),
    });
  }
  return points;
}

/** Discretize a full circle into a closed polyline (every 360/numPoints deg). */
function tessellateCircleNm(origin: Point2D, radiusNm: number): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i < VFR_CIRCLE_TESSELLATION_POINTS; i++) {
    const rad = (i * 2 * Math.PI) / VFR_CIRCLE_TESSELLATION_POINTS;
    points.push({
      xNm: origin.xNm + radiusNm * Math.sin(rad),
      yNm: origin.yNm + radiusNm * Math.cos(rad),
    });
  }
  return points;
}

/**
 * Extract 2D boundary polygon vertices (in NM) from a regional airspace volume.
 *
 * Generic: walks the volume's own segments in sequence order. GREAT_CIRCLE /
 * RHUMB_LINE / END edges contribute their endpoint; CLOCKWISE_ARC /
 * COUNTER_CLOCKWISE_ARC edges are tessellated from the previous chain vertex
 * around the arc origin; CIRCLE edges discretize to a full ring. A lone arc
 * segment with no predecessor falls back to a full circle around its origin,
 * which conservatively contains the true arc.
 */
export function extractVolumePolygonNm(volume: RegionalAirspaceVolume): Point2D[] {
  const vertices: Point2D[] = [];
  const ordered = [...volume.segments].sort((a, b) => a.sequence - b.sequence);
  let prevPos: Point2D | null = null;
  for (const seg of ordered) {
    const curr: Point2D = { xNm: seg.positionNm.xNm, yNm: seg.positionNm.yNm };
    if (seg.boundaryViaType === "CIRCLE" && seg.arcOriginNm && seg.arcDistanceNm) {
      vertices.push(
        ...tessellateCircleNm(
          { xNm: seg.arcOriginNm.xNm, yNm: seg.arcOriginNm.yNm },
          seg.arcDistanceNm,
        ),
      );
    } else if (
      (seg.boundaryViaType === "CLOCKWISE_ARC" ||
        seg.boundaryViaType === "COUNTER_CLOCKWISE_ARC") &&
      seg.arcOriginNm &&
      seg.arcDistanceNm
    ) {
      const origin: Point2D = { xNm: seg.arcOriginNm.xNm, yNm: seg.arcOriginNm.yNm };
      const clockwise = seg.boundaryViaType === "CLOCKWISE_ARC";
      if (prevPos === null) {
        // Lone arc with no chain predecessor: conservative full circle.
        vertices.push(...tessellateCircleNm(origin, seg.arcDistanceNm));
      } else {
        vertices.push(
          ...tessellateArcNm(
            origin,
            seg.arcDistanceNm,
            bearingDegNm(origin, prevPos),
            bearingDegNm(origin, curr),
            clockwise,
          ),
        );
      }
    } else {
      vertices.push(curr);
    }
    prevPos = curr;
  }
  return vertices;
}

/** Even-odd ray casting point-in-polygon test. */
export function pointInPolygon2D(point: Point2D, polygon: readonly Point2D[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersect =
      pi.yNm > point.yNm !== pj.yNm > point.yNm &&
      point.xNm < ((pj.xNm - pi.xNm) * (point.yNm - pi.yNm)) / (pj.yNm - pi.yNm) + pi.xNm;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/** Squared Euclidean distance between two points. */
function distSq(a: Point2D, b: Point2D): number {
  const dx = a.xNm - b.xNm;
  const dy = a.yNm - b.yNm;
  return dx * dx + dy * dy;
}

/** Distance from point P to line segment AB. */
export function distPointToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const l2 = distSq(a, b);
  if (l2 === 0) return Math.hypot(p.xNm - a.xNm, p.yNm - a.yNm);
  const t = Math.max(
    0,
    Math.min(1, ((p.xNm - a.xNm) * (b.xNm - a.xNm) + (p.yNm - a.yNm) * (b.yNm - a.yNm)) / l2),
  );
  const projX = a.xNm + t * (b.xNm - a.xNm);
  const projY = a.yNm + t * (b.yNm - a.yNm);
  return Math.hypot(p.xNm - projX, p.yNm - projY);
}

/** Check if 2D line segments AB and CD intersect. */
export function segmentsIntersect2D(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  function ccw(p1: Point2D, p2: Point2D, p3: Point2D): number {
    return (p2.xNm - p1.xNm) * (p3.yNm - p1.yNm) - (p2.yNm - p1.yNm) * (p3.xNm - p1.xNm);
  }

  const cp1 = ccw(a, b, c);
  const cp2 = ccw(a, b, d);
  const cp3 = ccw(c, d, a);
  const cp4 = ccw(c, d, b);

  if (
    ((cp1 > 0 && cp2 < 0) || (cp1 < 0 && cp2 > 0)) &&
    ((cp3 > 0 && cp4 < 0) || (cp3 < 0 && cp4 > 0))
  ) {
    return true;
  }

  // Collinear / endpoint touches
  if (distPointToSegment(c, a, b) < 1e-9) return true;
  if (distPointToSegment(d, a, b) < 1e-9) return true;
  if (distPointToSegment(a, c, d) < 1e-9) return true;
  if (distPointToSegment(b, c, d) < 1e-9) return true;

  return false;
}

/** Minimum distance between two 2D line segments AB and CD. */
export function distSegmentToSegment(a: Point2D, b: Point2D, c: Point2D, d: Point2D): number {
  if (segmentsIntersect2D(a, b, c, d)) {
    return 0;
  }
  return Math.min(
    distPointToSegment(a, c, d),
    distPointToSegment(b, c, d),
    distPointToSegment(c, a, b),
    distPointToSegment(d, a, b),
  );
}

/**
 * A volume is degenerate when its tessellated boundary cannot form a polygon
 * (fewer than 3 vertices). This happens when an importer fragments a shelf
 * boundary so each volume holds a single GREAT_CIRCLE point or lone arc
 * record. Degenerate volumes can never test inside on their own.
 */
export function isDegenerateAvoidanceVolume(volume: RegionalAirspaceVolume): boolean {
  return extractVolumePolygonNm(volume).length < 3;
}

/** Grouping key for fragmented avoidance volumes: facility + class + center. */
function avoidanceGroupKey(volume: RegionalAirspaceVolume): string {
  return `${volume.type}|${volume.class ?? ""}|${volume.centerAirportId ?? ""}`;
}

/**
 * Andrew's monotone-chain convex hull. Returns hull vertices CCW without a
 * duplicated closing vertex. Generic geometry, no facility knowledge.
 */
function convexHullNm(points: readonly Point2D[]): Point2D[] {
  const deduped: Point2D[] = [];
  const seen = new Set<string>();
  for (const p of points) {
    const key = `${p.xNm.toFixed(9)}:${p.yNm.toFixed(9)}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push({ xNm: p.xNm, yNm: p.yNm });
    }
  }
  if (deduped.length < 3) return deduped;
  const sorted = [...deduped].sort((a, b) => a.xNm - b.xNm || a.yNm - b.yNm);
  const cross = (o: Point2D, a: Point2D, b: Point2D): number =>
    (a.xNm - o.xNm) * (b.yNm - o.yNm) - (a.yNm - o.yNm) * (b.xNm - o.xNm);
  const lower: Point2D[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point2D[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

const groupedFallbackCache = new WeakMap<
  readonly RegionalAirspaceVolume[],
  RegionalAirspaceVolume[]
>();

/**
 * Build conservative grouped fallback volumes for fragmented avoidance data.
 *
 * Degenerate volumes (see isDegenerateAvoidanceVolume) that share a facility,
 * class, and center airport are merged: their tessellated vertices form one
 * convex-hull polygon whose vertical band spans the group's min floor to max
 * ceiling. Well-formed (non-degenerate) volumes are never merged, so precise
 * shelf geometry keeps its exact floors and gaps. Results are cached per
 * input array reference; callers holding a stable avoidance list pay once.
 */
export function buildGroupedAvoidanceVolumes(
  volumes: readonly RegionalAirspaceVolume[],
): RegionalAirspaceVolume[] {
  const cached = groupedFallbackCache.get(volumes);
  if (cached) return cached;

  const byGroup = new Map<string, RegionalAirspaceVolume[]>();
  for (const vol of volumes) {
    if (!isVfrAvoidanceVolume(vol) || !isDegenerateAvoidanceVolume(vol)) continue;
    const key = avoidanceGroupKey(vol);
    const list = byGroup.get(key) ?? [];
    list.push(vol);
    byGroup.set(key, list);
  }

  const grouped: RegionalAirspaceVolume[] = [];
  for (const [key, members] of byGroup) {
    const vertices: Point2D[] = [];
    for (const member of members) {
      vertices.push(...extractVolumePolygonNm(member));
    }
    const hull = convexHullNm(vertices);
    if (hull.length < 3) continue;
    const first = members[0]!;
    const lowerLimitFt = Math.min(...members.map((m) => m.lowerLimitFt));
    const upperLimitFt = Math.max(...members.map((m) => m.upperLimitFt));
    grouped.push({
      id: `GROUPED:${key}`,
      name: `GROUPED AVOIDANCE ${key}`,
      type: "CONTROLLED",
      ...(first.class !== undefined ? { class: first.class } : {}),
      ...(first.centerAirportId !== undefined ? { centerAirportId: first.centerAirportId } : {}),
      lowerLimit: { unit: "MSL", reference: "MSL", altitudeFt: lowerLimitFt },
      upperLimit: { unit: "MSL", reference: "MSL", altitudeFt: upperLimitFt },
      lowerLimitFt,
      upperLimitFt,
      segments: hull.map((pt, index) => ({
        sequence: index + 1,
        boundaryVia: "G",
        boundaryViaType: "GREAT_CIRCLE",
        position: { latDeg: 0, lonDeg: 0 },
        positionNm: { xNm: pt.xNm, yNm: pt.yNm },
      })),
    });
  }

  groupedFallbackCache.set(volumes, grouped);
  return grouped;
}

/**
 * Test whether a 3D point is inside any avoidance volume, including grouped
 * fallback volumes that cover fragmented (degenerate) shelf data.
 */
export function isPointInsideAvoidanceVolumes(
  point: Point3D,
  avoidanceVolumes: readonly RegionalAirspaceVolume[],
  margins?: AvoidanceMargin,
): boolean {
  for (const vol of avoidanceVolumes) {
    if (isPointInside3dVolume(point, vol, margins)) return true;
  }
  for (const vol of buildGroupedAvoidanceVolumes(avoidanceVolumes)) {
    if (isPointInside3dVolume(point, vol, margins)) return true;
  }
  return false;
}

/**
 * Test whether a swept 3-D segment intersects any avoidance volume, including
 * grouped fallback volumes that cover fragmented (degenerate) shelf data.
 */
export function isSegmentUnsafeFromAvoidance(
  p1: Point3D,
  p2: Point3D,
  avoidanceVolumes: readonly RegionalAirspaceVolume[],
  margins?: AvoidanceMargin,
): boolean {
  for (const vol of avoidanceVolumes) {
    if (checkSweptSegmentVolumeCollision(p1, p2, vol, margins)) return true;
  }
  for (const vol of buildGroupedAvoidanceVolumes(avoidanceVolumes)) {
    if (checkSweptSegmentVolumeCollision(p1, p2, vol, margins)) return true;
  }
  return false;
}
/**
 * Test whether a 3D point is inside an airspace volume (including boundary margins).
 */
export function isPointInside3dVolume(
  point: Point3D,
  volume: RegionalAirspaceVolume,
  margins?: AvoidanceMargin,
): boolean {
  const hMargin = margins?.horizontalMarginNm ?? CLASS_B_HORIZONTAL_MARGIN_NM;
  const vMargin = margins?.verticalMarginFt ?? CLASS_B_VERTICAL_MARGIN_FT;

  const effectiveFloor = volume.lowerLimitFt - vMargin;
  const effectiveCeiling = volume.upperLimitFt + vMargin;

  if (point.altitudeFt < effectiveFloor || point.altitudeFt > effectiveCeiling) {
    return false;
  }

  const poly = extractVolumePolygonNm(volume);
  if (poly.length < 3) return false;

  if (pointInPolygon2D(point, poly)) {
    return true;
  }

  // Check distance to polygon boundary against horizontal margin
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i++) {
    if (distPointToSegment(point, poly[i]!, poly[j]!) <= hMargin) {
      return true;
    }
  }

  return false;
}

/**
 * Test whether a swept 3-D segment (p1 -> p2) intersects an airspace volume.
 * Evaluates both horizontal swept collision (with boundary margin) and
 * vertical overlap with [floorFt, ceilingFt] (with vertical margin).
 */
export function checkSweptSegmentVolumeCollision(
  p1: Point3D,
  p2: Point3D,
  volume: RegionalAirspaceVolume,
  margins?: AvoidanceMargin,
): boolean {
  const hMargin = margins?.horizontalMarginNm ?? CLASS_B_HORIZONTAL_MARGIN_NM;
  const vMargin = margins?.verticalMarginFt ?? CLASS_B_VERTICAL_MARGIN_FT;

  const minAlt = Math.min(p1.altitudeFt, p2.altitudeFt);
  const maxAlt = Math.max(p1.altitudeFt, p2.altitudeFt);

  const effectiveFloor = volume.lowerLimitFt - vMargin;
  const effectiveCeiling = volume.upperLimitFt + vMargin;

  // 1. Vertical interval overlap check
  if (maxAlt < effectiveFloor || minAlt > effectiveCeiling) {
    return false;
  }

  const poly = extractVolumePolygonNm(volume);
  if (poly.length < 3) return false;

  // 2. Either endpoint inside 3D volume
  if (isPointInside3dVolume(p1, volume, margins) || isPointInside3dVolume(p2, volume, margins)) {
    return true;
  }

  // 3. Horizontal segment vs polygon boundary edges
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i++) {
    const e1 = poly[i]!;
    const e2 = poly[j]!;

    if (distSegmentToSegment(p1, p2, e1, e2) <= hMargin) {
      // The horizontal segment approaches or crosses the polygon boundary.
      // Now verify if the altitude at the point of closest approach or intersection
      // overlaps the volume's vertical band.
      // Sample 11 points along the segment to check intermediate climb/descent
      const samples = 10;
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const alt = p1.altitudeFt + t * (p2.altitudeFt - p1.altitudeFt);
        if (alt >= effectiveFloor && alt <= effectiveCeiling) {
          const pt = {
            xNm: p1.xNm + t * (p2.xNm - p1.xNm),
            yNm: p1.yNm + t * (p2.yNm - p1.yNm),
          };
          if (pointInPolygon2D(pt, poly) || distPointToSegment(pt, e1, e2) <= hMargin) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/** Check whether a multi-leg route penetrates any avoidance volumes. */
export function isRouteSafeFromAvoidance(
  waypoints: readonly Point3D[],
  avoidanceVolumes: readonly RegionalAirspaceVolume[],
  margins?: AvoidanceMargin,
): boolean {
  if (waypoints.length === 0) return true;
  if (avoidanceVolumes.length === 0) return true;

  // Check initial waypoint pose
  if (!isRouteEndpointSafe(waypoints[0]!, avoidanceVolumes, margins)) {
    return false;
  }

  // Check each leg
  for (let i = 1; i < waypoints.length; i++) {
    const p1 = waypoints[i - 1]!;
    const p2 = waypoints[i]!;
    if (isSegmentUnsafeFromAvoidance(p1, p2, avoidanceVolumes, margins)) {
      return false;
    }
  }

  return true;
}

function isRouteEndpointSafe(
  point: Point3D,
  avoidanceVolumes: readonly RegionalAirspaceVolume[],
  margins?: AvoidanceMargin,
): boolean {
  return !isPointInsideAvoidanceVolumes(point, avoidanceVolumes, margins);
}

/**
 * ARP-centered spawn area for ambient VFR spawn/LOCAL sampling.
 * `halfExtentNm` is the scenario coverage radius (see
 * `resolveVfrSpawnRadiusNm`): the whole scenario region outside Class B is
 * on the table, not a fixed 30 NM square. `VFR_TRAINING_HALF_EXTENT_NM`
 * remains the fallback when a scenario declares no coverage.
 */
export interface VfrTrainingBox {
  centerNm: Point2D;
  halfExtentNm: number;
}

/** Sample a 2D candidate point uniformly inside the training box. */
export function samplePointInBox(box: VfrTrainingBox, rng: () => number): Point2D {
  return {
    xNm: box.centerNm.xNm + (rng() * 2 - 1) * box.halfExtentNm,
    yNm: box.centerNm.yNm + (rng() * 2 - 1) * box.halfExtentNm,
  };
}

/** Sample a 2D candidate point uniformly inside the scenario-radius disc. */
export function samplePointInDisc(box: VfrTrainingBox, rng: () => number): Point2D {
  const radiusNm = box.halfExtentNm * Math.sqrt(rng());
  const theta = rng() * 2 * Math.PI;
  return {
    xNm: box.centerNm.xNm + radiusNm * Math.sin(theta),
    yNm: box.centerNm.yNm + radiusNm * Math.cos(theta),
  };
}

/** Liftoff sampling radius around a satellite departure ARP (T04-79, NM). */
export const SATELLITE_LIFTOFF_RADIUS_NM = 2;
/** Minimal safe-leg length after liftoff (NM); full corridor geometry is T04-80. */
export const SATELLITE_MIN_LEG_NM = 5;
/** Seeded jitter added to the minimal safe leg (NM), drawn from the route stream. */
export const SATELLITE_LEG_JITTER_NM = 3;

export interface RoutePlanningOptions {
  mission: AmbientVfrMission;
  box: VfrTrainingBox;
  altitudeFt: number;
  speedKt: number;
  destinationAirport?: RegionalAirport;
  /**
   * Departure satellite airport for `SATELLITE_DEPARTURE` (T04-79). Liftoff is
   * sampled within `SATELLITE_LIFTOFF_RADIUS_NM` of its ARP; the corridor
   * beyond a minimal safe leg belongs to T04-80.
   */
  originAirport?: RegionalAirport;
  /**
   * Pre-sampled liftoff pose (placement-stream draws). Heading is magnetic.
   * When omitted, liftoff is sampled near the origin ARP with `rng`.
   */
  liftoffPose?: SatelliteLiftoffPose;
  /** Magnetic variation for heading-frame conversion/projection. Defaults to 0. */
  magVarDeg?: number;
  avoidanceVolumes: readonly RegionalAirspaceVolume[];
  rng: () => number;
  maxAttempts?: number;
  margins?: AvoidanceMargin;
  /** TRACON exit radius. Defaults to `VFR_TRACON_EXIT_RADIUS_NM` (legacy 28). */
  exitRadiusNm?: number;
}

/** Pre-sampled liftoff pose for a satellite departure (T04-79). Heading is magnetic. */
export interface SatelliteLiftoffPose extends Point3D {
  headingDeg: number;
  speedKt: number;
}

export interface PlannedVfrRoute {
  spawnPose: Point3D & { headingDeg: number; speedKt: number };
  waypoints: VfrNavWaypoint[];
}

/**
 * Plan a persistent waypoint route for an ambient VFR aircraft, ensuring the entire swept 3D path
 * remains outside Class B avoidance volumes.
 * Returns null if no safe candidate route is found within maxAttempts.
 */
export function planSafeVfrRoute(options: RoutePlanningOptions): PlannedVfrRoute | null {
  const { mission, box, altitudeFt, speedKt, destinationAirport, avoidanceVolumes, rng, margins } =
    options;
  const maxAttempts = options.maxAttempts ?? MAX_PLANNER_ATTEMPTS;
  const exitRadiusNm = options.exitRadiusNm ?? VFR_TRACON_EXIT_RADIUS_NM;
  const magVarDeg = options.magVarDeg ?? 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let spawnPoint: Point3D;
    let spawnHeadingDeg: number | undefined;
    let spawnSpeedKt = speedKt;

    if (mission === "SATELLITE_DEPARTURE") {
      const origin = options.originAirport;
      if (!origin) {
        return null;
      }
      if (options.liftoffPose) {
        spawnPoint = {
          xNm: options.liftoffPose.xNm,
          yNm: options.liftoffPose.yNm,
          altitudeFt: options.liftoffPose.altitudeFt,
        };
        spawnHeadingDeg = options.liftoffPose.headingDeg;
        spawnSpeedKt = options.liftoffPose.speedKt;
      } else {
        // Fallback sampling near the origin ARP (T04-80 replaces with placed liftoff).
        const radiusNm = SATELLITE_LIFTOFF_RADIUS_NM * Math.sqrt(rng());
        const theta = rng() * 2 * Math.PI;
        spawnPoint = {
          xNm: origin.arpNm.xNm + radiusNm * Math.sin(theta),
          yNm: origin.arpNm.yNm + radiusNm * Math.cos(theta),
          altitudeFt,
        };
      }
      // Liftoff inside avoidance is rejected like any other unsafe spawn point.
      if (isPointInsideAvoidanceVolumes(spawnPoint, avoidanceVolumes, margins)) continue;
    } else {
      const initialPt = samplePointInDisc(box, rng);
      spawnPoint = { ...initialPt, altitudeFt };

      // Check spawn point (including grouped fallback for fragmented shelves)
      if (isPointInsideAvoidanceVolumes(spawnPoint, avoidanceVolumes, margins)) continue;
    }

    const waypoints: VfrNavWaypoint[] = [];

    if (mission === "LOCAL") {
      // 3 persistent waypoints inside the scenario-radius disc
      const numWps = 3;
      for (let w = 0; w < numWps; w++) {
        const pt = samplePointInDisc(box, rng);
        waypoints.push({ ...pt, altitudeFt, speedKt, targetToleranceNm: 1.2 });
      }
    } else if (mission === "TRANSIT") {
      // Corridor crossing: route from spawn toward opposite boundary
      const dx = spawnPoint.xNm - box.centerNm.xNm;
      const dy = spawnPoint.yNm - box.centerNm.yNm;
      const currentDist = Math.hypot(dx, dy);
      const angle = Math.atan2(dx, dy);
      // Target opposite side (angle + PI + slight angle variance)
      const targetAngle = angle + Math.PI + (rng() - 0.5) * 0.8;
      const targetDist = exitRadiusNm + 2;
      const exitPt: Point2D = {
        xNm: box.centerNm.xNm + targetDist * Math.sin(targetAngle),
        yNm: box.centerNm.yNm + targetDist * Math.cos(targetAngle),
      };

      // Intermediate waypoint to guide corridor around center
      const side = (attempt % 2 === 0 ? 1 : -1) * (rng() > 0.5 ? 1 : -1);
      const midAngle = angle + (Math.PI / 2) * side + (rng() - 0.5) * 0.4;
      const midDist = Math.max(Math.min(18, exitRadiusNm * 0.6), currentDist * 0.8) + attempt * 1.5;
      const midPt: Point2D = {
        xNm: box.centerNm.xNm + midDist * Math.sin(midAngle),
        yNm: box.centerNm.yNm + midDist * Math.cos(midAngle),
      };

      waypoints.push({ ...midPt, altitudeFt, speedKt, targetToleranceNm: 2.0 });
      waypoints.push({ ...exitPt, altitudeFt, speedKt, targetToleranceNm: 2.0 });
    } else if (mission === "AIRPORT_BOUND") {
      if (!destinationAirport) {
        continue;
      }
      const destArp = destinationAirport.arpNm;
      const destElev = destinationAirport.fieldElevFt;
      // Pattern altitude: ~1000 ft AGL or minimum safe
      const patternAlt = Math.max(destElev + 1000, 1500);

      // Try direct path on attempt 0, lateral dogleg on subsequent attempts
      const course = Math.atan2(destArp.xNm - spawnPoint.xNm, destArp.yNm - spawnPoint.yNm);
      const perpAngle = course + Math.PI / 2;
      const doglegOffset =
        attempt === 0 ? 0 : (attempt % 2 === 0 ? 1 : -1) * (4 + (attempt / 2) * 3);

      const midPt: Point2D = {
        xNm: (spawnPoint.xNm + destArp.xNm) / 2 + doglegOffset * Math.sin(perpAngle),
        yNm: (spawnPoint.yNm + destArp.yNm) / 2 + doglegOffset * Math.cos(perpAngle),
      };
      // Descend toward pattern altitude
      const midAlt = attempt > 2 ? patternAlt : Math.round((altitudeFt + patternAlt) / 2);

      waypoints.push({ ...midPt, altitudeFt: midAlt, speedKt, targetToleranceNm: 1.5 });
      // Final tower handoff waypoint at destination
      waypoints.push({
        xNm: destArp.xNm,
        yNm: destArp.yNm,
        altitudeFt: patternAlt,
        speedKt: Math.min(speedKt, 120),
        targetToleranceNm: 2.5,
      });
    } else if (mission === "SATELLITE_DEPARTURE") {
      // Minimal safe leg on the liftoff heading (T04-79); full corridor geometry is T04-80.
      let trueHeadingDeg: number;
      if (spawnHeadingDeg !== undefined) {
        trueHeadingDeg = magneticToTrueDeg(spawnHeadingDeg, magVarDeg);
      } else {
        const origin = options.originAirport!;
        trueHeadingDeg =
          (Math.atan2(spawnPoint.xNm - origin.arpNm.xNm, spawnPoint.yNm - origin.arpNm.yNm) * 180) /
          Math.PI;
        spawnHeadingDeg = trueToMagneticDeg(trueHeadingDeg, magVarDeg);
      }
      const legLenNm = SATELLITE_MIN_LEG_NM + rng() * SATELLITE_LEG_JITTER_NM;
      const legRad = (trueHeadingDeg * Math.PI) / 180;
      waypoints.push({
        xNm: spawnPoint.xNm + legLenNm * Math.sin(legRad),
        yNm: spawnPoint.yNm + legLenNm * Math.cos(legRad),
        altitudeFt,
        speedKt: spawnSpeedKt,
        targetToleranceNm: 2.0,
      });
    }

    // Verify complete swept route against avoidance volumes
    const fullRoute: Point3D[] = [spawnPoint, ...waypoints];
    if (isRouteSafeFromAvoidance(fullRoute, avoidanceVolumes, margins)) {
      const firstTarget = waypoints[0] ?? { xNm: spawnPoint.xNm + 1, yNm: spawnPoint.yNm };
      const headingDeg =
        spawnHeadingDeg !== undefined
          ? Math.round(spawnHeadingDeg)
          : Math.round(courseDeg(spawnPoint, firstTarget));
      return {
        spawnPose: { ...spawnPoint, headingDeg, speedKt: spawnSpeedKt },
        waypoints,
      };
    }
  }

  return null;
}

export interface NavStepResult {
  exited: boolean;
  handoff: boolean;
}

/**
 * Step autonomous navigation for one ambient VFR aircraft.
 * Updates assigned heading and altitude towards the active waypoint.
 * Detects waypoint sequencing, dwell expiration, and natural exits.
 *
 * When avoidance volumes are provided, a per-tick guard deflects the assigned
 * heading if the probe point ahead would enter Class B. This covers LOCAL
 * loops and EXIT radial legs that route planning never validated.
 */
export function stepVfrAircraftNavigation(
  ac: Aircraft,
  simTimeMs: number,
  magVarDeg = 0,
  log?: SessionLog | null,
  avoidanceVolumes?: readonly RegionalAirspaceVolume[],
  exitRadiusNm: number = VFR_TRACON_EXIT_RADIUS_NM,
): NavStepResult {
  const vfr = ac.ambientVfr;
  if (!vfr || !vfr.waypoints || vfr.waypoints.length === 0) {
    return { exited: false, handoff: false };
  }

  const wps = vfr.waypoints;
  const curIdx = vfr.waypointIndex ?? 0;

  // If waypoints are active
  if (curIdx < wps.length) {
    const wp = wps[curIdx]!;
    const distToWp = distanceNm(ac, wp);
    const tolerance = wp.targetToleranceNm ?? 1.2;

    if (distToWp <= tolerance) {
      // Sequence to next waypoint
      vfr.waypointIndex = curIdx + 1;
    } else {
      // Steer toward current waypoint
      const trueBrg = courseDeg(ac, wp);
      ac.intent.assignedHeadingDeg = trueToMagneticDeg(trueBrg, magVarDeg);
      if (wp.altitudeFt !== undefined && ac.intent.controllerAssignedAltitudeFt === undefined) {
        ac.intent.assignedAltitudeFt = wp.altitudeFt;
      }
      if (wp.speedKt !== undefined && ac.intent.controllerAssignedSpeedKt === undefined) {
        ac.intent.assignedSpeedKt = wp.speedKt;
      }
    }
  }

  const distFromArp = Math.hypot(ac.xNm, ac.yNm);

  // Per-tick avoidance guard (LOCAL loops and EXIT radials are unplanned legs).
  if (
    avoidanceVolumes !== undefined &&
    avoidanceVolumes.length > 0 &&
    (vfr.waypointIndex ?? 0) < wps.length
  ) {
    applyAvoidanceGuard(ac, magVarDeg, avoidanceVolumes);
  }

  // Terminal conditions
  if (vfr.mission === "LOCAL") {
    if ((vfr.waypointIndex ?? 0) >= wps.length) {
      if (vfr.phase !== "EXITING") {
        const dwellUntil = vfr.dwellUntilSimMs ?? vfr.spawnedAtSimMs + 900_000;
        if (simTimeMs >= dwellUntil) {
          vfr.phase = "EXITING";
          // Add exit vector away from center
          const angle = Math.atan2(ac.xNm, ac.yNm);
          const exitDist = exitRadiusNm + 3;
          vfr.waypoints.push({
            xNm: exitDist * Math.sin(angle),
            yNm: exitDist * Math.cos(angle),
            altitudeFt: ac.altitudeFt,
            speedKt: ac.speedKt,
            targetToleranceNm: 2.0,
          });
        } else {
          // Loop local waypoints until dwell expires
          vfr.waypointIndex = 0;
        }
      }
    }
    if (vfr.phase === "EXITING" && distFromArp >= exitRadiusNm) {
      log?.append({
        type: "vfr.exit",
        callsign: ac.callsign,
        mission: "LOCAL",
        reason: "DWELL_EXPIRED",
        atSimMs: simTimeMs,
        atWallMs: simTimeMs,
      });
      return { exited: true, handoff: false };
    }
  } else if (vfr.mission === "TRANSIT") {
    if ((vfr.waypointIndex ?? 0) > 0 && distFromArp >= exitRadiusNm) {
      log?.append({
        type: "vfr.exit",
        callsign: ac.callsign,
        mission: "TRANSIT",
        reason: "BOUNDARY_EXIT",
        atSimMs: simTimeMs,
        atWallMs: simTimeMs,
      });
      return { exited: true, handoff: false };
    }
  } else if (vfr.mission === "AIRPORT_BOUND") {
    if ((vfr.waypointIndex ?? 0) >= wps.length) {
      log?.append({
        type: "vfr.tower.handoff",
        callsign: ac.callsign,
        destinationAirportId: vfr.destinationAirportId,
        atSimMs: simTimeMs,
        atWallMs: simTimeMs,
      });
      return { exited: true, handoff: true };
    }
  }

  return { exited: false, handoff: false };
}

/**
 * Deflect the assigned heading when the probe point ahead (or the current
 * position) would be inside Class B avoidance. Tries ±30–90° offsets in
 * increasing order and keeps the first heading whose probe stays outside.
 * Generic: no facility-specific branches.
 */
function applyAvoidanceGuard(
  ac: Aircraft,
  magVarDeg: number,
  avoidanceVolumes: readonly RegionalAirspaceVolume[],
): void {
  const assigned = ac.intent.assignedHeadingDeg;
  // Both Aircraft.headingDeg and intent.assignedHeadingDeg are magnetic.
  const trueHeading =
    assigned !== undefined
      ? magneticToTrueDeg(assigned, magVarDeg)
      : magneticToTrueDeg(ac.headingDeg, magVarDeg);

  const probeFor = (trueDeg: number): Point3D => {
    const rad = (trueDeg * Math.PI) / 180;
    return {
      xNm: ac.xNm + VFR_AVOIDANCE_PROBE_NM * Math.sin(rad),
      yNm: ac.yNm + VFR_AVOIDANCE_PROBE_NM * Math.cos(rad),
      altitudeFt: ac.altitudeFt,
    };
  };

  const current: Point3D = { xNm: ac.xNm, yNm: ac.yNm, altitudeFt: ac.altitudeFt };
  if (
    !isPointInsideAvoidanceVolumes(current, avoidanceVolumes) &&
    !isPointInsideAvoidanceVolumes(probeFor(trueHeading), avoidanceVolumes)
  ) {
    return;
  }

  for (const offset of VFR_AVOIDANCE_TURN_OFFSETS_DEG) {
    const candidate = normalizeBearingDeg(trueHeading + offset);
    if (!isPointInsideAvoidanceVolumes(probeFor(candidate), avoidanceVolumes)) {
      ac.intent.assignedHeadingDeg = trueToMagneticDeg(candidate, magVarDeg);
      return;
    }
  }

  // No escaping heading within ±90°: hold a 90° turn to limit penetration.
  ac.intent.assignedHeadingDeg = trueToMagneticDeg(
    normalizeBearingDeg(trueHeading + 90),
    magVarDeg,
  );
}

/**
 * Test whether an aircraft is currently within any Class B avoidance volume (T04-75).
 */
export function isAircraftInsideClassB(
  aircraft: Aircraft,
  regional?: RegionalFacility | null,
): boolean {
  if (!regional?.airspaces || regional.airspaces.length === 0) {
    return false;
  }
  const classBVolumes = regional.airspaces.filter(isVfrAvoidanceVolume);
  return isPointInsideAvoidanceVolumes(
    { xNm: aircraft.xNm, yNm: aircraft.yNm, altitudeFt: aircraft.altitudeFt },
    classBVolumes,
  );
}

/**
 * Check whether a safe autonomous VFR continuation path exists from aircraft's current position avoiding Class B (T04-75).
 */
export function isSafeVfrContinuationAvailable(
  aircraft: Aircraft,
  regional?: RegionalFacility | null,
): boolean {
  if ((aircraft as unknown as { continuationBlocked?: boolean }).continuationBlocked) {
    return false;
  }
  if (!regional?.airspaces || regional.airspaces.length === 0) {
    return true;
  }
  const classBVolumes = regional.airspaces.filter(isVfrAvoidanceVolume);
  if (classBVolumes.length === 0) {
    return true;
  }

  const currentPos: Point3D = {
    xNm: aircraft.xNm,
    yNm: aircraft.yNm,
    altitudeFt: aircraft.altitudeFt,
  };

  if (isPointInsideAvoidanceVolumes(currentPos, classBVolumes)) {
    return false;
  }

  // If aircraft has ambientVfr with remaining waypoints, verify route to remaining waypoints
  if (aircraft.ambientVfr?.waypoints && aircraft.ambientVfr.waypoints.length > 0) {
    const curIdx = aircraft.ambientVfr.waypointIndex ?? 0;
    const remainingWps = aircraft.ambientVfr.waypoints.slice(curIdx);
    if (remainingWps.length > 0) {
      const routePoints: Point3D[] = [
        currentPos,
        ...remainingWps.map((wp) => ({
          xNm: wp.xNm,
          yNm: wp.yNm,
          altitudeFt: wp.altitudeFt ?? aircraft.altitudeFt,
        })),
      ];
      if (isRouteSafeFromAvoidance(routePoints, classBVolumes)) {
        return true;
      }
    }
  }

  // If destination airport exists, check if direct or dogleg path avoids Class B
  const destId =
    aircraft.ambientVfr?.destinationAirportId ??
    aircraft.destinationAirport ??
    aircraft.destination;
  if (destId && regional.airports) {
    const destAirport = regional.airports.find(
      (a) => (a.icao ?? (a as { id?: string }).id ?? "").toUpperCase() === destId.toUpperCase(),
    );
    if (destAirport) {
      const destElev = destAirport.fieldElevFt ?? 1000;
      const patternAlt = Math.max(destElev + 1000, 1500);
      const destPos: Point3D = {
        xNm: destAirport.arpNm.xNm,
        yNm: destAirport.arpNm.yNm,
        altitudeFt: patternAlt,
      };

      // 1. Direct path
      if (isRouteSafeFromAvoidance([currentPos, destPos], classBVolumes)) {
        return true;
      }

      // 2. Dogleg paths around Class B
      const course = Math.atan2(destPos.xNm - currentPos.xNm, destPos.yNm - currentPos.yNm);
      const perpAngle = course + Math.PI / 2;
      for (const sign of [1, -1]) {
        for (const offsetNm of [6, 12, 18, 24, 30]) {
          const midPt: Point3D = {
            xNm: (currentPos.xNm + destPos.xNm) / 2 + sign * offsetNm * Math.sin(perpAngle),
            yNm: (currentPos.yNm + destPos.yNm) / 2 + sign * offsetNm * Math.cos(perpAngle),
            altitudeFt: Math.round((currentPos.altitudeFt + patternAlt) / 2),
          };
          if (isRouteSafeFromAvoidance([currentPos, midPt, destPos], classBVolumes)) {
            return true;
          }
        }
      }
      return false;
    }
  }

  return true;
}
