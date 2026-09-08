/**
 * Localizer position geometry. Sense position, never heading.
 *
 * Trainer full scale uses FAA AIM 1-1-9's 700 ft total threshold width, then
 * widens by catalog angular slope. It is not certified radio propagation.
 */

import { DEFAULT_LOC_FULL_SCALE_HALF_WIDTH_FT_AT_THRESHOLD } from "../../scenario/procedures/types";
import type { FixRegistry } from "./fixRegistry";
import { courseChangeDeg } from "./geometry";
import type { NmPoint } from "./geometry";
import { magneticToTrueDeg } from "./headingFrames";

export const LOC_ALONG_MIN_NM = 0.5;
export const LOC_INTERCEPT_HEADING_MAX_DEG = 45;
export const LOC_BREAKOUT_S = 5;
export const LOC_DEFAULT_BEAM_HALF_WIDTH_DEG = 2.5;
export const LOC_DEFAULT_LENGTH_NM = 18;
export const LOC_CAPTURE_NORMALIZED_ERROR = 0.25;
export const LOC_RETAIN_NORMALIZED_ERROR = 1;
export const FT_PER_NM = 6076.12;

export interface LocAxis {
  approachId: string;
  thresholdXNm: number;
  thresholdYNm: number;
  /** Published/controller inbound course, magnetic. */
  publishedCourseMagneticDeg?: number;
  /** Geometric inbound axis, true degrees. */
  geometricCourseTrueDeg?: number;
  /** @deprecated use publishedCourseMagneticDeg. */
  courseDeg: number;
  lengthNm: number;
  beamHalfWidthDeg: number;
  locFullScaleHalfWidthFtAtThreshold: number;
}

export interface LocDeviation {
  alongTrackNm: number;
  crossTrackNm: number;
  /** Degrees. Positive = right of inbound course (north for course 270). */
  deviationDeg: number;
}

export interface LocEnvelope {
  fullScaleHalfWidthNm: number;
  normalizedError: number;
}

export interface LocCatalogApproach {
  id: string;
  courseDeg?: number;
  publishedCourseMagneticDeg?: number;
  lengthNm?: number;
  beamHalfWidthDeg?: number;
  locFullScaleHalfWidthFtAtThreshold?: number;
  thresholdFixId?: string;
}

export interface LocCatalog {
  approaches: ReadonlyArray<LocCatalogApproach>;
}

export function locDeviation(pos: NmPoint, axis: LocAxis): LocDeviation {
  const rad = ((axis.geometricCourseTrueDeg ?? axis.courseDeg) * Math.PI) / 180;
  const inboundEast = Math.sin(rad);
  const inboundNorth = Math.cos(rad);
  const dx = pos.xNm - axis.thresholdXNm;
  const dy = pos.yNm - axis.thresholdYNm;
  const alongTrackNm = -(dx * inboundEast + dy * inboundNorth);
  const rightEast = Math.cos(rad);
  const rightNorth = -Math.sin(rad);
  const crossTrackNm = dx * rightEast + dy * rightNorth;
  return {
    alongTrackNm,
    crossTrackNm,
    deviationDeg: (Math.atan2(crossTrackNm, alongTrackNm) * 180) / Math.PI,
  };
}

/** Full-scale envelope, undefined behind threshold. */
export function locEnvelope(deviation: LocDeviation, axis: LocAxis): LocEnvelope | undefined {
  if (deviation.alongTrackNm < 0) return undefined;
  const fullScaleHalfWidthNm =
    axis.locFullScaleHalfWidthFtAtThreshold / FT_PER_NM +
    Math.max(0, deviation.alongTrackNm) * Math.tan((axis.beamHalfWidthDeg * Math.PI) / 180);
  return { fullScaleHalfWidthNm, normalizedError: deviation.crossTrackNm / fullScaleHalfWidthNm };
}

/** Capture inside 0.25 full scale, in front of threshold and inside loc length. */
export function locShouldCapture(args: {
  deviation: LocDeviation;
  headingDeg: number;
  axis: LocAxis;
  requireInterceptHeading?: boolean;
}): boolean {
  const { alongTrackNm } = args.deviation;
  if (!(alongTrackNm > LOC_ALONG_MIN_NM && alongTrackNm < args.axis.lengthNm)) return false;
  const envelope = locEnvelope(args.deviation, args.axis);
  if (!envelope || Math.abs(envelope.normalizedError) > LOC_CAPTURE_NORMALIZED_ERROR) return false;
  return (
    args.requireInterceptHeading === false ||
    courseChangeDeg(args.headingDeg, args.axis.publishedCourseMagneticDeg ?? args.axis.courseDeg) <= LOC_INTERCEPT_HEADING_MAX_DEG ||
    Math.abs(envelope.normalizedError) <= LOC_CAPTURE_NORMALIZED_ERROR
  );
}

export function locShouldBreakout(normalizedError: number): boolean {
  return Math.abs(normalizedError) > LOC_RETAIN_NORMALIZED_ERROR;
}

export function kdemIls27LocAxis(): LocAxis {
  return {
    approachId: "ILS27",
    thresholdXNm: 0,
    thresholdYNm: 0,
    publishedCourseMagneticDeg: 270,
    geometricCourseTrueDeg: 270,
    courseDeg: 270,
    lengthNm: LOC_DEFAULT_LENGTH_NM,
    beamHalfWidthDeg: LOC_DEFAULT_BEAM_HALF_WIDTH_DEG,
    locFullScaleHalfWidthFtAtThreshold: DEFAULT_LOC_FULL_SCALE_HALF_WIDTH_FT_AT_THRESHOLD,
  };
}

export function locAxisForApproach(
  approachId: string,
  catalog: LocCatalog | null | undefined,
  registry: FixRegistry | null | undefined,
  magVarDeg = 0,
): LocAxis | undefined {
  if (!catalog) return undefined;
  const want = approachId.trim().toUpperCase();
  const approach = catalog.approaches.find((item) => item.id.trim().toUpperCase() === want);
  const published = approach?.publishedCourseMagneticDeg ?? approach?.courseDeg;
  if (!approach || published === undefined || approach.lengthNm === undefined)
    return undefined;
  const threshold = approach.thresholdFixId ? registry?.get(approach.thresholdFixId) : undefined;
  return {
    approachId: approach.id,
    thresholdXNm: threshold?.xNm ?? 0,
    thresholdYNm: threshold?.yNm ?? 0,
    publishedCourseMagneticDeg: published,
    geometricCourseTrueDeg: magneticToTrueDeg(published, magVarDeg),
    courseDeg: published,
    lengthNm: approach.lengthNm,
    beamHalfWidthDeg: approach.beamHalfWidthDeg ?? LOC_DEFAULT_BEAM_HALF_WIDTH_DEG,
    locFullScaleHalfWidthFtAtThreshold:
      approach.locFullScaleHalfWidthFtAtThreshold ??
      DEFAULT_LOC_FULL_SCALE_HALF_WIDTH_FT_AT_THRESHOLD,
  };
}
