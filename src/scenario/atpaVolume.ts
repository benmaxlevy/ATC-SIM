/**
 * ATPA approach-volume geometry (R07 CRC STARS “ATPA (Automatic Terminal
 * Proximity Alert)” overview).
 *
 * Volume dimensions are authored trainer adaptation, not NAS data — R07 names
 * the enabled-volume concept but never publishes sizes. Minima are basic radar
 * separation only; this module does not vary them by aircraft type.
 *
 * Scope display only. Walks `approachId` for threshold and inbound course so a
 * second runway or airport is another JSON row, not an `if`.
 */

import type { Aircraft } from "@core";
import { alongTrackNm, courseChangeDeg, DEG2RAD, normalizeHeadingDeg } from "@core";
import type { AtpaVolume, ProcedureCatalog } from "./procedures/types";

export type AtpaTrackPose = Pick<Aircraft, "xNm" | "yNm" | "headingDeg" | "altitudeFt">;

export interface AtpaVolumeGeometry {
  xNm: number;
  yNm: number;
  courseDeg: number;
}

export function atpaVolumeThreshold(
  catalog: ProcedureCatalog,
  volume: AtpaVolume,
): AtpaVolumeGeometry {
  const approach = catalog.approaches.find((item) => item.id === volume.approachId);
  if (approach === undefined) {
    throw new Error(`ATPA volume ${volume.id} references unknown approach ${volume.approachId}`);
  }
  const thresholdFixId = approach.thresholdFixId;
  if (thresholdFixId === undefined) {
    throw new Error(`Approach ${approach.id} has no thresholdFixId`);
  }
  const threshold = catalog.fixes.find((item) => item.id === thresholdFixId);
  if (threshold === undefined) {
    throw new Error(`Approach ${approach.id} threshold ${thresholdFixId} is not in the catalog`);
  }
  if (approach.courseDeg === undefined) {
    throw new Error(`Approach ${approach.id} has no courseDeg`);
  }
  return { xNm: threshold.xNm, yNm: threshold.yNm, courseDeg: approach.courseDeg };
}

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

/** Perpendicular offset from the final centerline (right of the outbound reciprocal). */
export function lateralOffsetNm(geometry: AtpaVolumeGeometry, xNm: number, yNm: number): number {
  const rad = reciprocalCourseDeg(geometry.courseDeg) * DEG2RAD;
  const dx = xNm - geometry.xNm;
  const dy = yNm - geometry.yNm;
  return dx * Math.cos(rad) - dy * Math.sin(rad);
}

export function isInsideAtpaVolume(
  geometry: AtpaVolumeGeometry,
  volume: AtpaVolume,
  track: AtpaTrackPose,
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
  return courseChangeDeg(track.headingDeg, geometry.courseDeg) <= volume.courseToleranceDeg;
}
