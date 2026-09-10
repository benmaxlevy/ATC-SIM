/**
 * Analog: CRC STARS **ATPA** in-trail pairing (R07 “ATPA” overview — Monitor
 * Cone, Warning Cone, Alert Cone). Warning at **45 s** predicted violation is
 * the R07 value. R07 also paints Alert for a predicted violation within
 * **24 s**; this trainer does **not** — Alert is only an actual in-trail loss
 * (`distanceNm < requiredNm`). The 24 s band stays Warning.
 *
 * Minima come from each volume’s JSON (`basicSeparationNm`,
 * `reducedSeparationNm`, `reducedWithinNm`) plus optional FAA CWT wake
 * adaptation. R07 says cone length is “the distance required by wake category
 * or basic radar separation”; this evaluator uses only explicit CWT category
 * data and never reads aircraft type or display category.
 *
 * Scope display only. World writes `alerts.atpa`; the scope must not recompute
 * pairing. Eligibility matches T02-43 `isInsideAtpaVolume` (geometry only);
 * this module also requires `volume.enabled` and drops primary-only targets.
 */

import type { Aircraft } from "../aircraft";
import { alongTrackNm, courseChangeDeg, DEG2RAD, normalizeHeadingDeg } from "../nav/geometry";
import { magneticToTrueDeg } from "../nav/headingFrames";

/** R07 predicted-warning horizon (seconds). */
export const ATPA_WARNING_S = 45;
/**
 * R07 predicted-alert horizon (seconds). Cited only — `atpaStatus` does not
 * promote to alert on this timer. Alert is actual loss of required NM.
 */
export const ATPA_ALERT_S = 24;

const KT_TO_NM_PER_S = 1 / 3600;

export type AtpaStatus = "monitor" | "warning" | "alert";

export interface AtpaPair {
  trailingCallsign: string;
  leadingCallsign: string;
  volumeId: string;
  distanceNm: number;
  requiredNm: number;
  /** Actual evaluator output; optional for compatibility with read-only fixtures. */
  wakeSource?: "basic" | "wake" | "nowgt";
  closureKt: number;
  status: AtpaStatus;
}

/** Threshold + inbound course already resolved from the referenced approach. */
export interface AtpaVolumeGeometry {
  xNm: number;
  yNm: number;
  courseDeg: number;
}

/**
 * Volume fields the evaluator reads. Structural match for catalog
 * `AtpaVolume` — minima stay in JSON, never literals here.
 */
export interface AtpaVolumeParams {
  id: string;
  approachId: string;
  enabled: boolean;
  lengthNm: number;
  halfWidthNm: number;
  floorFt: number;
  ceilingFt: number;
  courseToleranceDeg: number;
  basicSeparationNm: number;
  reducedSeparationNm: number;
  reducedWithinNm: number;
  wakeAdaptation?: AtpaWakeAdaptation;
}

type CwtWakeCategory = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
type AtpaWakeMatrix = Readonly<
  Partial<Record<CwtWakeCategory, Readonly<Partial<Record<CwtWakeCategory, number>>>>>
>;

/** Structural copy of the scenario adaptation contract; core stays scenario-independent. */
export interface AtpaWakeAdaptation {
  enabled: boolean;
  nowgtSeparationNm: number;
  matrix: AtpaWakeMatrix;
}

export type AtpaTrack = Pick<
  Aircraft,
  | "callsign"
  | "xNm"
  | "yNm"
  | "headingDeg"
  | "altitudeFt"
  | "speedKt"
  | "primaryOnly"
  | "isPrimary"
  | "transponder"
  | "cwtWakeCategory"
>;

export type AtpaGeometryByVolumeId = Readonly<Record<string, AtpaVolumeGeometry>>;

function reciprocalCourseDeg(courseDeg: number): number {
  return normalizeHeadingDeg(courseDeg + 180);
}

/** Signed distance to threshold along the inbound final. Positive = still inbound. */
export function alongCourseDistanceNm(
  geometry: AtpaVolumeGeometry,
  xNm: number,
  yNm: number,
): number {
  return alongTrackNm(geometry, { xNm, yNm }, reciprocalCourseDeg(geometry.courseDeg));
}

function lateralOffsetNm(geometry: AtpaVolumeGeometry, xNm: number, yNm: number): number {
  const rad = reciprocalCourseDeg(geometry.courseDeg) * DEG2RAD;
  const dx = xNm - geometry.xNm;
  const dy = yNm - geometry.yNm;
  return dx * Math.cos(rad) - dy * Math.sin(rad);
}

/**
 * Geometry-only volume membership — same predicate as scenario
 * `isInsideAtpaVolume`. Callers must still filter `enabled`.
 */
export function isInsideAtpaVolume(
  geometry: AtpaVolumeGeometry,
  volume: AtpaVolumeParams,
  track: Pick<AtpaTrack, "xNm" | "yNm" | "headingDeg" | "altitudeFt">,
  magVarDeg = 0,
): boolean {
  const alongNm = alongCourseDistanceNm(geometry, track.xNm, track.yNm);
  if (alongNm < 0 || alongNm > volume.lengthNm) {
    return false;
  }
  if (Math.abs(lateralOffsetNm(geometry, track.xNm, track.yNm)) > volume.halfWidthNm) {
    return false;
  }
  if (track.altitudeFt < volume.floorFt || track.altitudeFt > volume.ceilingFt) {
    return false;
  }
  return (
    courseChangeDeg(magneticToTrueDeg(track.headingDeg, magVarDeg), geometry.courseDeg) <=
    volume.courseToleranceDeg
  );
}

function isPrimaryOnlyTarget(track: AtpaTrack): boolean {
  return (
    track.primaryOnly === true ||
    track.isPrimary === true ||
    track.transponder === "primary" ||
    track.transponder === "none"
  );
}

function groundVelocityNmPerS(track: AtpaTrack, magVarDeg = 0): { vx: number; vy: number } {
  const rad = magneticToTrueDeg(track.headingDeg, magVarDeg) * DEG2RAD;
  const nmPerS = track.speedKt * KT_TO_NM_PER_S;
  return { vx: nmPerS * Math.sin(rad), vy: nmPerS * Math.cos(rad) };
}

/** Positive = closing (NM/h). Opening or parallel is ≤ 0. */
export function pairClosureKt(trailing: AtpaTrack, leading: AtpaTrack, magVarDeg = 0): number {
  const dx = trailing.xNm - leading.xNm;
  const dy = trailing.yNm - leading.yNm;
  const distNm = Math.hypot(dx, dy);
  if (distNm === 0) {
    return 0;
  }
  const tv = groundVelocityNmPerS(trailing, magVarDeg);
  const lv = groundVelocityNmPerS(leading, magVarDeg);
  const rangeRateNmPerS = (dx * (tv.vx - lv.vx) + dy * (tv.vy - lv.vy)) / distNm;
  return -rangeRateNmPerS / KT_TO_NM_PER_S;
}

/**
 * Basic radar only: reduced minimum when both tracks are inside
 * `volume.reducedWithinNm` of the threshold along the final.
 */
export function requiredSeparationNm(
  trailingAlongNm: number,
  leadingAlongNm: number,
  volume: AtpaVolumeParams,
): number {
  if (trailingAlongNm < volume.reducedWithinNm && leadingAlongNm < volume.reducedWithinNm) {
    return volume.reducedSeparationNm;
  }
  return volume.basicSeparationNm;
}

function cwtWakeCategory(value: unknown): CwtWakeCategory | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return /^[A-I]$/.test(normalized) ? (normalized as CwtWakeCategory) : undefined;
}

/** Resolve the explicit leader/follower wake relationship for one volume. */
export function wakeRequiredSeparationNm(
  leaderCategory: unknown,
  followerCategory: unknown,
  adaptation: AtpaWakeAdaptation,
): { requiredNm: number; wakeSource: "wake" | "nowgt" } {
  const leader = cwtWakeCategory(leaderCategory);
  const follower = cwtWakeCategory(followerCategory);
  const minimum =
    leader === undefined || follower === undefined
      ? undefined
      : adaptation.matrix[leader]?.[follower];
  if (minimum === undefined) {
    return { requiredNm: adaptation.nowgtSeparationNm, wakeSource: "nowgt" };
  }
  return { requiredNm: minimum, wakeSource: "wake" };
}

function requiredAtpaSeparation(
  trailing: AtpaTrack,
  leading: AtpaTrack,
  trailingAlongNm: number,
  leadingAlongNm: number,
  volume: AtpaVolumeParams,
): { requiredNm: number; wakeSource: "basic" | "wake" | "nowgt" } {
  const radarMinimum = requiredSeparationNm(trailingAlongNm, leadingAlongNm, volume);
  if (volume.wakeAdaptation?.enabled !== true) {
    return { requiredNm: radarMinimum, wakeSource: "basic" };
  }
  const wake = wakeRequiredSeparationNm(
    leading.cwtWakeCategory,
    trailing.cwtWakeCategory,
    volume.wakeAdaptation,
  );
  return {
    requiredNm: Math.max(radarMinimum, wake.requiredNm),
    wakeSource: wake.wakeSource,
  };
}

export function atpaStatus(distanceNm: number, requiredNm: number, closureKt: number): AtpaStatus {
  if (distanceNm < requiredNm) {
    return "alert";
  }
  if (closureKt <= 0) {
    return "monitor";
  }
  const gapNm = distanceNm - requiredNm;
  const timeToViolationS = gapNm / (closureKt * KT_TO_NM_PER_S);
  if (timeToViolationS <= ATPA_WARNING_S) {
    return "warning";
  }
  return "monitor";
}

export function atpaPairKey(
  pair: Pick<AtpaPair, "trailingCallsign" | "leadingCallsign" | "volumeId">,
): string {
  return `${pair.trailingCallsign}|${pair.leadingCallsign}|${pair.volumeId}`;
}

/**
 * Resolve threshold xy + inbound course from catalog approaches/fixes.
 * Skips a volume whose approach or threshold is missing rather than throwing.
 */
export function resolveAtpaGeometry(
  catalog: {
    approaches: ReadonlyArray<{
      id: string;
      courseDeg?: number;
      publishedCourseMagneticDeg?: number;
      thresholdFixId?: string;
    }>;
    fixes: ReadonlyArray<{ id: string; xNm?: number; yNm?: number }>;
  },
  volumes: ReadonlyArray<{ id: string; approachId: string }>,
  magVarDeg = 0,
): Record<string, AtpaVolumeGeometry> {
  const out: Record<string, AtpaVolumeGeometry> = {};
  for (const volume of volumes) {
    const approach = catalog.approaches.find((item) => item.id === volume.approachId);
    const publishedCourse = approach?.publishedCourseMagneticDeg ?? approach?.courseDeg;
    if (approach === undefined || publishedCourse === undefined) {
      continue;
    }
    const thresholdFixId = approach.thresholdFixId;
    if (thresholdFixId === undefined) {
      continue;
    }
    const threshold = catalog.fixes.find((item) => item.id === thresholdFixId);
    if (
      threshold === undefined ||
      typeof threshold.xNm !== "number" ||
      typeof threshold.yNm !== "number"
    ) {
      continue;
    }
    out[volume.id] = {
      xNm: threshold.xNm,
      yNm: threshold.yNm,
      courseDeg: magneticToTrueDeg(publishedCourse, magVarDeg),
    };
  }
  return out;
}

interface EligibleTrack {
  track: AtpaTrack;
  alongNm: number;
}

/**
 * In-trail pairs per enabled volume. Each trailing track’s leader is the next
 * track ahead in the same volume (nearest smaller along-course distance).
 * Frontmost track produces no pair. Allocation is per-volume eligible set.
 */
export function evaluateAtpa(
  aircraft: readonly AtpaTrack[],
  volumes: readonly AtpaVolumeParams[],
  geometry: AtpaGeometryByVolumeId,
  magVarDeg = 0,
): AtpaPair[] {
  const out: AtpaPair[] = [];
  for (const volume of volumes) {
    if (!volume.enabled) {
      continue;
    }
    const geom = geometry[volume.id];
    if (geom === undefined) {
      continue;
    }
    const eligible: EligibleTrack[] = [];
    for (const track of aircraft) {
      if (isPrimaryOnlyTarget(track)) {
        continue;
      }
      if (!isInsideAtpaVolume(geom, volume, track, magVarDeg)) {
        continue;
      }
      eligible.push({ track, alongNm: alongCourseDistanceNm(geom, track.xNm, track.yNm) });
    }
    eligible.sort(
      (a, b) => a.alongNm - b.alongNm || a.track.callsign.localeCompare(b.track.callsign),
    );
    for (let i = 1; i < eligible.length; i += 1) {
      const trailing = eligible[i]!;
      const leading = eligible[i - 1]!;
      const distanceNm = Math.hypot(
        trailing.track.xNm - leading.track.xNm,
        trailing.track.yNm - leading.track.yNm,
      );
      const required = requiredAtpaSeparation(
        trailing.track,
        leading.track,
        trailing.alongNm,
        leading.alongNm,
        volume,
      );
      const closureKt = pairClosureKt(trailing.track, leading.track, magVarDeg);
      out.push({
        trailingCallsign: trailing.track.callsign,
        leadingCallsign: leading.track.callsign,
        volumeId: volume.id,
        distanceNm,
        requiredNm: required.requiredNm,
        wakeSource: required.wakeSource,
        closureKt,
        status: atpaStatus(distanceNm, required.requiredNm, closureKt),
      });
    }
  }
  out.sort(
    (a, b) =>
      a.volumeId.localeCompare(b.volumeId) ||
      a.trailingCallsign.localeCompare(b.trailingCallsign) ||
      a.leadingCallsign.localeCompare(b.leadingCallsign),
  );
  return out;
}
