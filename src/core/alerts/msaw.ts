import type { Aircraft } from "../aircraft";

/**
 * Analog: JO 7110.65 / FOA STARS **MSAW** (R01, R02, R05) — aircraft below a
 * minimum-vectoring-altitude floor. UI word is **MSAW**, not GPWS / TAWS /
 * “terrain alarm.”
 *
 * Trainer delta: lite MVA polygons in NM, MSL only (no radar altitude). Not
 * NAS parameters. Not certified MSAW.
 */

/** Red when MSL is strictly below `floorFt - MSAW_RED_BELOW_FT`. */
export const MSAW_RED_BELOW_FT = 300;

/**
 * KDEM ILS 27 FAF distance (NM). Inhibit uses planar distance to RW27 when
 * T04-06 GS fly-through is not present yet.
 */
export const MSAW_FAF_DISTANCE_NM = 6;

export interface MvaVertex {
  xNm: number;
  yNm: number;
}

export interface MvaPolygon {
  id: string;
  minAltitudeFt: number;
  verticesNm: MvaVertex[];
}

/**
 * Facility MVA chart. Rectangles v1 are legal; `polygonContains` is even-odd
 * PIP so non-rect polygons can land later without a schema change.
 */
export interface MvaChart {
  airportId: string;
  defaultMinAltitudeFt: number;
  polygons: MvaPolygon[];
  /** Author note only. Evaluator ignores this. */
  note?: string;
}

/** Threshold + FAF gate for loc/GS/landing inhibit. */
export interface MsawInhibitGeom {
  thresholdXNm: number;
  thresholdYNm: number;
  fafDistanceNm: number;
}

export type MsawSeverity = "caution" | "alert";

export interface MsawAlert {
  callsign: string;
  severity: MsawSeverity;
  altFt: number;
  floorFt: number;
}

/** Lateral types that never inhibit MSAW (vectors / published path / missed). */
const NEVER_INHIBIT_LATERAL = new Set(["HEADING", "DIRECT", "PROCEDURE", "MISSED"]);

/**
 * Even-odd point-in-polygon. Boundary hits are treated as outside (strict
 * ray-crossing). Tests use interior points.
 */
export function polygonContains(vertices: readonly MvaVertex[], xNm: number, yNm: number): boolean {
  if (vertices.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const vi = vertices[i]!;
    const vj = vertices[j]!;
    const intersect =
      vi.yNm > yNm !== vj.yNm > yNm &&
      xNm < ((vj.xNm - vi.xNm) * (yNm - vi.yNm)) / (vj.yNm - vi.yNm) + vi.xNm;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Floor at `(x, y)`: among containing polygons, **maximum** `minAltitudeFt`
 * (higher floor wins). If the point is in none, `defaultMinAltitudeFt`.
 */
export function msawFloorFt(xNm: number, yNm: number, chart: MvaChart): number {
  let floor: number | null = null;
  for (const poly of chart.polygons) {
    if (!polygonContains(poly.verticesNm, xNm, yNm)) {
      continue;
    }
    floor = floor === null ? poly.minAltitudeFt : Math.max(floor, poly.minAltitudeFt);
  }
  return floor ?? chart.defaultMinAltitudeFt;
}

/**
 * Yellow: `alt < floor` and `alt >= floor - 300`. Red: `alt < floor - 300`.
 * At or above the floor: no MSAW.
 */
export function msawSeverityForAltitude(altFt: number, floorFt: number): MsawSeverity | null {
  if (altFt >= floorFt) {
    return null;
  }
  if (altFt >= floorFt - MSAW_RED_BELOW_FT) {
    return "caution";
  }
  return "alert";
}

/**
 * Inhibit when `lateral` is LOC | LANDING or `vertical` is GS, **and** planar
 * distance to threshold `<= fafDistanceNm`. HEADING / DIRECT / PROCEDURE /
 * MISSED never inhibit. Missing modes behave like heading.
 */
export function isMsawInhibited(ac: Aircraft, geom: MsawInhibitGeom): boolean {
  const lat = ac.intent.lateral?.type;
  const vert = ac.intent.vertical?.type;
  if (lat !== undefined && NEVER_INHIBIT_LATERAL.has(lat)) {
    return false;
  }
  if (vert === "MISSED_CLIMB") {
    return false;
  }
  const approachMode = lat === "LOC" || lat === "LANDING" || vert === "GS";
  if (!approachMode) {
    return false;
  }
  const distNm = Math.hypot(ac.xNm - geom.thresholdXNm, ac.yNm - geom.thresholdYNm);
  return distNm <= geom.fafDistanceNm;
}

/**
 * Highest MSAW severity for this callsign, or `null`.
 */
export function msawSeverityForCallsign(
  msaw: readonly MsawAlert[],
  callsign: string,
): MsawSeverity | null {
  const touches = msaw.filter((a) => a.callsign === callsign);
  if (touches.length === 0) {
    return null;
  }
  return touches.some((a) => a.severity === "alert") ? "alert" : "caution";
}

export const DEFAULT_MSAW_INHIBIT: MsawInhibitGeom = {
  thresholdXNm: 0,
  thresholdYNm: 0,
  fafDistanceNm: MSAW_FAF_DISTANCE_NM,
};

/**
 * Per-aircraft MSAW. Scope must not call this; it reads `world.alerts.msaw`.
 */
export function evaluateMsaw(
  aircraft: readonly Aircraft[],
  chart: MvaChart,
  inhibit: MsawInhibitGeom = DEFAULT_MSAW_INHIBIT,
): MsawAlert[] {
  const out: MsawAlert[] = [];
  for (const ac of aircraft) {
    if (isMsawInhibited(ac, inhibit)) {
      continue;
    }
    const floorFt = msawFloorFt(ac.xNm, ac.yNm, chart);
    const severity = msawSeverityForAltitude(ac.altitudeFt, floorFt);
    if (severity === null) {
      continue;
    }
    out.push({
      callsign: ac.callsign,
      severity,
      altFt: ac.altitudeFt,
      floorFt,
    });
  }
  out.sort((a, b) => a.callsign.localeCompare(b.callsign));
  return out;
}
