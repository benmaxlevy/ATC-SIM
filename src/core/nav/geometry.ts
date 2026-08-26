import { TURN_RATE_DEG_PER_S, shortestDeltaDeg } from "../kinematics";

export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

export interface NmEastNorth {
  xNm: number;
  yNm: number;
}

export type NmPoint = NmEastNorth;

export const DEG2RAD = Math.PI / 180;
const NM_PER_DEG_LAT = 60;

function originCosLat(origin: LatLon): number {
  if (Math.abs(origin.latDeg) >= 90) {
    throw new RangeError("ENU origin latitude cannot be at a pole (|latDeg| >= 90)");
  }
  return Math.cos(origin.latDeg * DEG2RAD);
}

export function latLonToNm(point: LatLon, origin: LatLon): NmEastNorth {
  const cosLat = originCosLat(origin);
  return {
    xNm: (point.lonDeg - origin.lonDeg) * NM_PER_DEG_LAT * cosLat,
    yNm: (point.latDeg - origin.latDeg) * NM_PER_DEG_LAT,
  };
}

export function nmToLatLon(en: NmEastNorth, origin: LatLon): LatLon {
  const cosLat = originCosLat(origin);
  return {
    latDeg: origin.latDeg + en.yNm / NM_PER_DEG_LAT,
    lonDeg: origin.lonDeg + en.xNm / (NM_PER_DEG_LAT * cosLat),
  };
}

export function normalizeHeadingDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export const FLYBY_FLOOR_NM = 0.2;
export const FLYBY_CAP_NM = 4;
export const FLYBY_MIN_TURN_DEG = 1;
export const DIRECT_SEQUENCE_NM = 0.3;

export function courseDeg(from: NmPoint, to: NmPoint): number {
  const dx = to.xNm - from.xNm;
  const dy = to.yNm - from.yNm;
  return normalizeHeadingDeg(Math.atan2(dx, dy) / DEG2RAD);
}

export function distanceNm(from: NmPoint, to: NmPoint): number {
  return Math.hypot(to.xNm - from.xNm, to.yNm - from.yNm);
}

export function alongTrackNm(from: NmPoint, to: NmPoint, headingDeg: number): number {
  const rad = normalizeHeadingDeg(headingDeg) * DEG2RAD;
  const dx = to.xNm - from.xNm;
  const dy = to.yNm - from.yNm;
  return dx * Math.sin(rad) + dy * Math.cos(rad);
}

export function turnRadiusNm(tasKt: number, turnRateDegPerS: number = TURN_RATE_DEG_PER_S): number {
  const omegaRadS = turnRateDegPerS * DEG2RAD;
  if (omegaRadS <= 0 || !Number.isFinite(tasKt) || tasKt <= 0) {
    return 0;
  }
  return tasKt / 3600 / omegaRadS;
}

export function courseChangeDeg(fromCourseDeg: number, toCourseDeg: number): number {
  return Math.abs(shortestDeltaDeg(fromCourseDeg, toCourseDeg));
}

export function flyByStartNm(tasKt: number, courseChangeAbsDeg: number): number {
  const thetaDeg = Math.max(FLYBY_MIN_TURN_DEG, Math.abs(courseChangeAbsDeg));
  const thetaRad = thetaDeg * DEG2RAD;
  const d = turnRadiusNm(tasKt) * Math.tan(thetaRad / 2);
  if (!Number.isFinite(d) || d < 0) {
    return FLYBY_FLOOR_NM;
  }
  return Math.min(FLYBY_CAP_NM, Math.max(FLYBY_FLOOR_NM, d));
}

export function flyOverSequenceNm(tasKt: number, dtS: number): number {
  const slack = (2 * dtS * Math.max(0, tasKt)) / 3600;
  return Math.max(DIRECT_SEQUENCE_NM, slack);
}

