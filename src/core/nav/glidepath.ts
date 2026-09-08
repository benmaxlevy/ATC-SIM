/** ILS glidepath geometry. Trainer envelope only; not a certified receiver. */

import { DEFAULT_GS_BEAM_FULL_WIDTH_DEG } from "../../scenario/procedures/types";
import { DEG2RAD } from "./geometry";

export const FT_PER_NM = 6076.12;
export const GS_DEFAULT_ANGLE_DEG = 3;
export const GS_DEFAULT_TCH_FT = 50;
export const GS_DEFAULT_FIELD_ELEV_FT = 0;
export const GS_CAPTURE_ALONG_MIN_NM = 0.5;
export const GS_CAPTURE_ALONG_MAX_NM = 10;
export const GS_CAPTURE_NORMALIZED_ERROR = 0.25;
export const GS_RETAIN_NORMALIZED_ERROR = 1;

export interface GsParams {
  gsAngleDeg: number;
  tchFt: number;
  fieldElevFt: number;
  gsBeamFullWidthDeg: number;
}

export interface GsDeviation {
  deviationDeg: number;
  normalizedError: number;
  lowerEdgeDeg: number;
  upperEdgeDeg: number;
}

export interface GsCatalogApproach {
  id: string;
  gsAngleDeg?: number;
  tchFt?: number;
  gsBeamFullWidthDeg?: number;
}

export interface GsCatalog {
  fieldElevFt?: number;
  approaches: ReadonlyArray<GsCatalogApproach>;
}

export function kdemIls27GsParams(): GsParams {
  return {
    gsAngleDeg: GS_DEFAULT_ANGLE_DEG,
    tchFt: GS_DEFAULT_TCH_FT,
    fieldElevFt: GS_DEFAULT_FIELD_ELEV_FT,
    gsBeamFullWidthDeg: DEFAULT_GS_BEAM_FULL_WIDTH_DEG,
  };
}

export function gsAltitudeFt(distToThresholdNm: number, params: GsParams): number {
  return (
    params.fieldElevFt +
    params.tchFt +
    Math.tan(params.gsAngleDeg * DEG2RAD) * distToThresholdNm * FT_PER_NM
  );
}

export function gsGeometricVsFpm(gsAngleDeg: number, gsKt: number): number {
  return (-Math.tan(gsAngleDeg * DEG2RAD) * gsKt * FT_PER_NM) / 60;
}

/**
 * Angular error around catalog glidepath centerline. FAA AIM 1-1-9's 1.4°
 * total beam is normalized to +/- 1.0 full scale; positive is above path.
 */
export function gsDeviation(
  alongTrackNm: number,
  altFt: number,
  params: GsParams,
): GsDeviation | undefined {
  if (alongTrackNm <= 0) return undefined;
  const actualAngleDeg =
    (Math.atan2(altFt - params.fieldElevFt - params.tchFt, alongTrackNm * FT_PER_NM) * 180) /
    Math.PI;
  const halfBeamDeg = params.gsBeamFullWidthDeg / 2;
  const deviationDeg = actualAngleDeg - params.gsAngleDeg;
  return {
    deviationDeg,
    normalizedError: deviationDeg / halfBeamDeg,
    lowerEdgeDeg: params.gsAngleDeg - halfBeamDeg,
    upperEdgeDeg: params.gsAngleDeg + halfBeamDeg,
  };
}

export function gsParamsForApproach(
  approachId: string,
  catalog: GsCatalog | null | undefined,
): GsParams | undefined {
  if (!catalog) return undefined;
  const want = approachId.trim().toUpperCase();
  const approach = catalog.approaches.find((item) => item.id.trim().toUpperCase() === want);
  if (!approach) return undefined;
  return {
    gsAngleDeg: approach.gsAngleDeg ?? GS_DEFAULT_ANGLE_DEG,
    tchFt: approach.tchFt ?? GS_DEFAULT_TCH_FT,
    fieldElevFt: catalog.fieldElevFt ?? GS_DEFAULT_FIELD_ELEV_FT,
    gsBeamFullWidthDeg: approach.gsBeamFullWidthDeg ?? DEFAULT_GS_BEAM_FULL_WIDTH_DEG,
  };
}

export function gsShouldCapture(args: {
  alongTrackNm: number;
  normalizedError: number;
  wasBelow: boolean;
}): boolean {
  return (
    args.alongTrackNm >= GS_CAPTURE_ALONG_MIN_NM &&
    args.alongTrackNm <= GS_CAPTURE_ALONG_MAX_NM &&
    args.wasBelow &&
    Math.abs(args.normalizedError) <= GS_CAPTURE_NORMALIZED_ERROR
  );
}

export function gsShouldDropCapture(normalizedError: number): boolean {
  return normalizedError > GS_RETAIN_NORMALIZED_ERROR;
}
