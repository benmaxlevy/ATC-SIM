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
import { trueToMagneticDeg } from "./nav/headingFrames";
import type { RegionalAirspaceVolume, RegionalAirport } from "../scenario/regional";

export const CLASS_B_HORIZONTAL_MARGIN_NM = 1.0;
export const CLASS_B_VERTICAL_MARGIN_FT = 500;
export const MAX_PLANNER_ATTEMPTS = 10;
export const VFR_TRACON_EXIT_RADIUS_NM = 28;

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

/** Extract 2D boundary polygon vertices (in NM) from a regional airspace volume. */
export function extractVolumePolygonNm(volume: RegionalAirspaceVolume): Point2D[] {
  const vertices: Point2D[] = [];
  for (const seg of volume.segments) {
    if (seg.boundaryViaType === "CIRCLE" && seg.arcOriginNm && seg.arcDistanceNm) {
      // Discretize circle into 36 vertices (every 10 degrees)
      const numPoints = 36;
      for (let i = 0; i < numPoints; i++) {
        const rad = (i * 2 * Math.PI) / numPoints;
        vertices.push({
          xNm: seg.arcOriginNm.xNm + seg.arcDistanceNm * Math.sin(rad),
          yNm: seg.arcOriginNm.yNm + seg.arcDistanceNm * Math.cos(rad),
        });
      }
    } else if (
      (seg.boundaryViaType === "CLOCKWISE_ARC" ||
        seg.boundaryViaType === "COUNTER_CLOCKWISE_ARC") &&
      seg.arcOriginNm &&
      seg.arcDistanceNm
    ) {
      // Arc endpoint + intermediate samples if bearing available
      vertices.push({ xNm: seg.positionNm.xNm, yNm: seg.positionNm.yNm });
    } else {
      vertices.push({ xNm: seg.positionNm.xNm, yNm: seg.positionNm.yNm });
    }
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
  for (const vol of avoidanceVolumes) {
    if (isPointInside3dVolume(waypoints[0]!, vol, margins)) {
      return false;
    }
  }

  // Check each leg
  for (let i = 1; i < waypoints.length; i++) {
    const p1 = waypoints[i - 1]!;
    const p2 = waypoints[i]!;
    for (const vol of avoidanceVolumes) {
      if (checkSweptSegmentVolumeCollision(p1, p2, vol, margins)) {
        return false;
      }
    }
  }

  return true;
}

export interface ZoneGeometry {
  id: string;
  name?: string;
  bounds?: {
    minXNm: number;
    maxXNm: number;
    minYNm: number;
    maxYNm: number;
  };
  centerNm?: Point2D;
  radiusNm?: number;
  polygon?: Point2D[];
  waypoints?: Point2D[];
}

/** Sample a 2D candidate point within a zone. */
export function samplePointInZone(zone: ZoneGeometry, rng: () => number): Point2D {
  if (zone.bounds) {
    const { minXNm, maxXNm, minYNm, maxYNm } = zone.bounds;
    return {
      xNm: minXNm + rng() * (maxXNm - minXNm),
      yNm: minYNm + rng() * (maxYNm - minYNm),
    };
  }
  if (zone.centerNm && zone.radiusNm) {
    const r = Math.sqrt(rng()) * zone.radiusNm;
    const theta = rng() * 2 * Math.PI;
    return {
      xNm: zone.centerNm.xNm + r * Math.sin(theta),
      yNm: zone.centerNm.yNm + r * Math.cos(theta),
    };
  }
  if (zone.waypoints && zone.waypoints.length > 0) {
    const wp = zone.waypoints[Math.floor(rng() * zone.waypoints.length)]!;
    // Slight jitter around waypoint
    return {
      xNm: wp.xNm + (rng() - 0.5) * 2,
      yNm: wp.yNm + (rng() - 0.5) * 2,
    };
  }
  // Default box if undefined
  return { xNm: (rng() - 0.5) * 20, yNm: 15 + rng() * 10 };
}

export interface RoutePlanningOptions {
  mission: AmbientVfrMission;
  zone: ZoneGeometry;
  altitudeFt: number;
  speedKt: number;
  destinationAirport?: RegionalAirport;
  avoidanceVolumes: readonly RegionalAirspaceVolume[];
  rng: () => number;
  maxAttempts?: number;
  margins?: AvoidanceMargin;
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
  const { mission, zone, altitudeFt, speedKt, destinationAirport, avoidanceVolumes, rng, margins } =
    options;
  const maxAttempts = options.maxAttempts ?? MAX_PLANNER_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const initialPt = samplePointInZone(zone, rng);
    const spawnPoint: Point3D = { ...initialPt, altitudeFt };

    // Check spawn point
    let spawnSafe = true;
    for (const vol of avoidanceVolumes) {
      if (isPointInside3dVolume(spawnPoint, vol, margins)) {
        spawnSafe = false;
        break;
      }
    }
    if (!spawnSafe) continue;

    const waypoints: VfrNavWaypoint[] = [];

    if (mission === "LOCAL") {
      // 3 persistent waypoints inside zone
      const numWps = 3;
      for (let w = 0; w < numWps; w++) {
        const pt = samplePointInZone(zone, rng);
        waypoints.push({ ...pt, altitudeFt, speedKt, targetToleranceNm: 1.2 });
      }
    } else if (mission === "TRANSIT") {
      // Corridor crossing: route from spawn toward opposite boundary
      const currentDist = Math.hypot(spawnPoint.xNm, spawnPoint.yNm);
      const angle = Math.atan2(spawnPoint.xNm, spawnPoint.yNm);
      // Target opposite side (angle + PI + slight angle variance)
      const targetAngle = angle + Math.PI + (rng() - 0.5) * 0.8;
      const targetDist = VFR_TRACON_EXIT_RADIUS_NM + 2;
      const exitPt: Point2D = {
        xNm: targetDist * Math.sin(targetAngle),
        yNm: targetDist * Math.cos(targetAngle),
      };

      // Intermediate waypoint to guide corridor around center
      const side = (attempt % 2 === 0 ? 1 : -1) * (rng() > 0.5 ? 1 : -1);
      const midAngle = angle + (Math.PI / 2) * side + (rng() - 0.5) * 0.4;
      const midDist = Math.max(18, currentDist * 0.8) + attempt * 1.5;
      const midPt: Point2D = {
        xNm: midDist * Math.sin(midAngle),
        yNm: midDist * Math.cos(midAngle),
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
    }

    // Verify complete swept route against avoidance volumes
    const fullRoute: Point3D[] = [spawnPoint, ...waypoints];
    if (isRouteSafeFromAvoidance(fullRoute, avoidanceVolumes, margins)) {
      const firstTarget = waypoints[0] ?? { xNm: spawnPoint.xNm + 1, yNm: spawnPoint.yNm };
      const headingDeg = Math.round(courseDeg(spawnPoint, firstTarget));
      return {
        spawnPose: { ...spawnPoint, headingDeg, speedKt },
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
 */
export function stepVfrAircraftNavigation(
  ac: Aircraft,
  simTimeMs: number,
  magVarDeg = 0,
  log?: SessionLog | null,
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

  // Terminal conditions
  if (vfr.mission === "LOCAL") {
    if ((vfr.waypointIndex ?? 0) >= wps.length) {
      if (vfr.phase !== "EXITING") {
        const dwellUntil = vfr.dwellUntilSimMs ?? vfr.spawnedAtSimMs + 900_000;
        if (simTimeMs >= dwellUntil) {
          vfr.phase = "EXITING";
          // Add exit vector away from center
          const angle = Math.atan2(ac.xNm, ac.yNm);
          const exitDist = VFR_TRACON_EXIT_RADIUS_NM + 3;
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
    if (vfr.phase === "EXITING" && distFromArp >= VFR_TRACON_EXIT_RADIUS_NM) {
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
    if ((vfr.waypointIndex ?? 0) > 0 && distFromArp >= VFR_TRACON_EXIT_RADIUS_NM) {
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
