/**
 * Localizer axis geometry (T04-05). Sense the loc with **position**, never heading.
 * Wind (T04-11) must not break capture.
 *
 * KDEM ILS 27: threshold `(tx, ty)`, inbound course 270, length 18 NM, ±2.5°.
 * Inbound unit vector ≈ `(-1, 0)`. Along-track positive *in front* of rwy 27
 * (east) ≈ `x - tx`. Cross-track north-positive ≈ `y - ty`.
 *
 * Angular deviation (deg): `atan2(crossTrackNm, alongTrackNm) * 180/π` when
 * along-track `> 0.5 NM`. Sign: **positive deviation = north of course**.
 */

import type { FixRegistry } from "./fixRegistry";
import { courseChangeDeg } from "./geometry";
import type { NmPoint } from "./geometry";

/** Along-track must exceed this to capture and to treat angular δ as reliable. */
export const LOC_ALONG_MIN_NM = 0.5;
/** Capture when |δ| is inside this window (degrees). */
export const LOC_CAPTURE_DEV_DEG = 0.5;
/** Capture when |cross-track| is inside this window (NM). */
export const LOC_CAPTURE_CROSS_NM = 0.15;
/** Intercept heading must be within this of inbound, unless already |δ| < 0.5°. */
export const LOC_INTERCEPT_HEADING_MAX_DEG = 45;
/** Once LOC, break out if |δ| exceeds this for LOC_BREAKOUT_S. */
export const LOC_BREAKOUT_DEV_DEG = 2.5;
export const LOC_BREAKOUT_S = 5;
export const LOC_DEFAULT_BEAM_HALF_WIDTH_DEG = 2.5;
export const LOC_DEFAULT_LENGTH_NM = 18;

export interface LocAxis {
  approachId: string;
  thresholdXNm: number;
  thresholdYNm: number;
  /** Inbound course, degrees [0, 360). KDEM ILS 27 is 270. */
  courseDeg: number;
  lengthNm: number;
  beamHalfWidthDeg: number;
}

export interface LocDeviation {
  alongTrackNm: number;
  crossTrackNm: number;
  /** Degrees. Positive = north of course. */
  deviationDeg: number;
}

/** Catalog fields stepWorld needs for loc intercept. Extra approach keys are fine. */
export interface LocCatalogApproach {
  id: string;
  courseDeg?: number;
  lengthNm?: number;
  beamHalfWidthDeg?: number;
  thresholdFixId?: string;
}

export interface LocCatalog {
  approaches: ReadonlyArray<LocCatalogApproach>;
}

/**
 * Signed loc deviation at `pos`.
 * Along-track > 0 is in front of the threshold (inside the loc, toward the FAF).
 * Cross-track > 0 is north of the inbound course.
 */
export function locDeviation(pos: NmPoint, axis: LocAxis): LocDeviation {
  const rad = (axis.courseDeg * Math.PI) / 180;
  const inboundEast = Math.sin(rad);
  const inboundNorth = Math.cos(rad);
  const dx = pos.xNm - axis.thresholdXNm;
  const dy = pos.yNm - axis.thresholdYNm;
  const alongTrackNm = -(dx * inboundEast + dy * inboundNorth);
  const rightEast = Math.cos(rad);
  const rightNorth = -Math.sin(rad);
  const crossTrackNm = dx * rightEast + dy * rightNorth;
  const deviationDeg = (Math.atan2(crossTrackNm, alongTrackNm) * 180) / Math.PI;
  return { alongTrackNm, crossTrackNm, deviationDeg };
}

/**
 * Capture when all of:
 * 1. `0.5 NM < alongTrack < lengthNm` (in front of threshold, inside loc)
 * 2. intercept heading within 45° of inbound **or** already `|δ| < 0.5°`
 * 3. `|δ| < 0.5°` **or** `|crossTrack| < 0.15 NM`
 *
 * Never capture behind the threshold (along-track ≤ 0).
 */
export function locShouldCapture(args: {
  deviation: LocDeviation;
  headingDeg: number;
  axis: LocAxis;
}): boolean {
  const { alongTrackNm, crossTrackNm, deviationDeg } = args.deviation;
  if (!(alongTrackNm > LOC_ALONG_MIN_NM && alongTrackNm < args.axis.lengthNm)) {
    return false;
  }
  const headingOk =
    courseChangeDeg(args.headingDeg, args.axis.courseDeg) <= LOC_INTERCEPT_HEADING_MAX_DEG ||
    Math.abs(deviationDeg) < LOC_CAPTURE_DEV_DEG;
  if (!headingOk) {
    return false;
  }
  return Math.abs(deviationDeg) < LOC_CAPTURE_DEV_DEG || Math.abs(crossTrackNm) < LOC_CAPTURE_CROSS_NM;
}

export function locShouldBreakout(deviationDeg: number): boolean {
  return Math.abs(deviationDeg) > LOC_BREAKOUT_DEV_DEG;
}

/** KDEM ILS 27 loc axis: threshold at ARP, inbound 270, 18 NM. */
export function kdemIls27LocAxis(): LocAxis {
  return {
    approachId: "ILS27",
    thresholdXNm: 0,
    thresholdYNm: 0,
    courseDeg: 270,
    lengthNm: LOC_DEFAULT_LENGTH_NM,
    beamHalfWidthDeg: LOC_DEFAULT_BEAM_HALF_WIDTH_DEG,
  };
}

export function locAxisForApproach(
  approachId: string,
  catalog: LocCatalog | null | undefined,
  registry: FixRegistry | null | undefined,
): LocAxis | undefined {
  if (!catalog) {
    return undefined;
  }
  const want = approachId.trim().toUpperCase();
  const approach = catalog.approaches.find((item) => item.id.trim().toUpperCase() === want);
  if (!approach || approach.courseDeg === undefined || approach.lengthNm === undefined) {
    return undefined;
  }
  let thresholdXNm = 0;
  let thresholdYNm = 0;
  if (approach.thresholdFixId && registry) {
    const threshold = registry.get(approach.thresholdFixId);
    if (threshold) {
      thresholdXNm = threshold.xNm;
      thresholdYNm = threshold.yNm;
    }
  }
  return {
    approachId: approach.id,
    thresholdXNm,
    thresholdYNm,
    courseDeg: approach.courseDeg,
    lengthNm: approach.lengthNm,
    beamHalfWidthDeg: approach.beamHalfWidthDeg ?? LOC_DEFAULT_BEAM_HALF_WIDTH_DEG,
  };
}
