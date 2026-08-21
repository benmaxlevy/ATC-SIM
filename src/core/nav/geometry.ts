/**
 * Local-NM geometry for DIRECT / STAR fly-by (T04-03). T04-05 loc intercept
 * reuses `courseDeg`. +x east, +y north; heading 0 = north.
 *
 * Fly-by radius uses the same rate-one turn as T01-03 (`TURN_RATE_DEG_PER_S`).
 */

import { TURN_RATE_DEG_PER_S } from "../kinematics";
import { normalizeHeadingDeg } from "../geo/coords";
import { shortestDeltaDeg } from "../kinematics";

export interface NmPoint {
  xNm: number;
  yNm: number;
}

/** Floor / cap for fly-by lead distance (NM). */
export const FLYBY_FLOOR_NM = 0.2;
export const FLYBY_CAP_NM = 4;
/** Treat course changes smaller than this as 1° so tan(θ/2) is never 0. */
export const FLYBY_MIN_TURN_DEG = 1;
/** Lone DIRECT fly-over: sequence inside this NM (plus TAS/dt slack). */
export const DIRECT_SEQUENCE_NM = 0.3;

/**
 * True course from `from` to `to` in `[0, 360)`.
 * `atan2(east, north)` so 90° is +x and 0° is +y.
 */
export function courseDeg(from: NmPoint, to: NmPoint): number {
  const dx = to.xNm - from.xNm;
  const dy = to.yNm - from.yNm;
  return normalizeHeadingDeg((Math.atan2(dx, dy) * 180) / Math.PI);
}

export function distanceNm(from: NmPoint, to: NmPoint): number {
  return Math.hypot(to.xNm - from.xNm, to.yNm - from.yNm);
}

/**
 * Along-track NM to `to` along `headingDeg` (positive = target ahead).
 * Abeam / past when this is ≤ 0.
 */
export function alongTrackNm(from: NmPoint, to: NmPoint, headingDeg: number): number {
  const rad = (normalizeHeadingDeg(headingDeg) * Math.PI) / 180;
  const dx = to.xNm - from.xNm;
  const dy = to.yNm - from.yNm;
  return dx * Math.sin(rad) + dy * Math.cos(rad);
}

/**
 * Turn radius (NM) at TAS for a constant `turnRateDegPerS` rate-one turn:
 * `ω = rate * π/180`; `R = (tas/3600) / ω` ≈ `tas / 188.5` at 3°/s.
 */
export function turnRadiusNm(tasKt: number, turnRateDegPerS: number = TURN_RATE_DEG_PER_S): number {
  const omegaRadS = (turnRateDegPerS * Math.PI) / 180;
  if (omegaRadS <= 0 || !Number.isFinite(tasKt) || tasKt <= 0) {
    return 0;
  }
  return tasKt / 3600 / omegaRadS;
}

/** Absolute heading change in `[0, 180]`. */
export function courseChangeDeg(fromCourseDeg: number, toCourseDeg: number): number {
  return Math.abs(shortestDeltaDeg(fromCourseDeg, toCourseDeg));
}

/**
 * Distance to start a fly-by for course change `θ`: `R * tan(θ/2)`.
 * `θ` is absolute degrees (min 1°). Clamped to `[0.2, 4]` NM.
 */
export function flyByStartNm(tasKt: number, courseChangeAbsDeg: number): number {
  const thetaDeg = Math.max(FLYBY_MIN_TURN_DEG, Math.abs(courseChangeAbsDeg));
  const thetaRad = (thetaDeg * Math.PI) / 180;
  const d = turnRadiusNm(tasKt) * Math.tan(thetaRad / 2);
  if (!Number.isFinite(d) || d < 0) {
    return FLYBY_FLOOR_NM;
  }
  return Math.min(FLYBY_CAP_NM, Math.max(FLYBY_FLOOR_NM, d));
}

/**
 * Lone DIRECT (no next course): sequence when closer than this so the
 * aircraft does not orbit the fix. `max(0.3, 2 * dt * tas / 3600)`.
 */
export function flyOverSequenceNm(tasKt: number, dtS: number): number {
  const slack = (2 * dtS * Math.max(0, tasKt)) / 3600;
  return Math.max(DIRECT_SEQUENCE_NM, slack);
}
