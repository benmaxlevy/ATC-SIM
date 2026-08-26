/**
 * ILS glidepath geometry (T04-06). Height is feet MSL; field elev 0 at KDEM.
 *
 * Analog: 7110.65 ILS — hold assigned until established on the loc, then
 * intercept GS from below. Trainer delta: no autoland / flare / radio altimeter.
 *
 * `gsAltFt = fieldElevFt + tchFt + tan(gsAngle) * distToThresholdNm * 6076.12`
 */

import { DEG2RAD } from "./geometry";

export const FT_PER_NM = 6076.12;
export const GS_DEFAULT_ANGLE_DEG = 3;
export const GS_DEFAULT_TCH_FT = 50;
export const GS_DEFAULT_FIELD_ELEV_FT = 0;

/** Capture only inside this along-track window (do not capture at 18 NM). */
export const GS_CAPTURE_ALONG_MIN_NM = 0.5;
export const GS_CAPTURE_ALONG_MAX_NM = 10;

/** Previous tick must be this far below GS to count as "from below." */
export const GS_WAS_BELOW_FT = 20;
/** Capture window below GS (ft). Tight enough to stay inside the 150 ft track band. */
export const GS_CAPTURE_BELOW_FT = 120;
/** Capture window above GS (ft). Above this at first opportunity → refuse. */
export const GS_CAPTURE_ABOVE_FT = 50;
/** After capture, more than this above GS → drop to ASSIGNED. */
export const GS_DROP_ABOVE_FT = 150;

export interface GsParams {
  gsAngleDeg: number;
  tchFt: number;
  fieldElevFt: number;
}

/** Catalog fields stepWorld needs for GS. Extra approach keys are fine. */
export interface GsCatalogApproach {
  id: string;
  gsAngleDeg?: number;
  tchFt?: number;
}

export interface GsCatalog {
  fieldElevFt?: number;
  approaches: ReadonlyArray<GsCatalogApproach>;
}

/** KDEM ILS 27: 3° / TCH 50 / elev 0. GS intercept assigned 2000 at ~6 NM. */
export function kdemIls27GsParams(): GsParams {
  return {
    gsAngleDeg: GS_DEFAULT_ANGLE_DEG,
    tchFt: GS_DEFAULT_TCH_FT,
    fieldElevFt: GS_DEFAULT_FIELD_ELEV_FT,
  };
}

/**
 * Glidepath MSL altitude at `distToThresholdNm` along the loc.
 * Distance is along-track when established (T04-05 loc axis).
 */
export function gsAltitudeFt(distToThresholdNm: number, params: GsParams): number {
  const angleRad = params.gsAngleDeg * DEG2RAD;
  return params.fieldElevFt + params.tchFt + Math.tan(angleRad) * distToThresholdNm * FT_PER_NM;
}

/**
 * Geometric GS vertical speed (fpm). Negative is descent.
 * `gsKt` is ground speed (IAS=TAS until T04-11 wind).
 */
export function gsGeometricVsFpm(gsAngleDeg: number, gsKt: number): number {
  const angleRad = gsAngleDeg * DEG2RAD;
  return (-Math.tan(angleRad) * gsKt * FT_PER_NM) / 60;
}

export function gsParamsForApproach(
  approachId: string,
  catalog: GsCatalog | null | undefined,
): GsParams | undefined {
  if (!catalog) {
    return undefined;
  }
  const want = approachId.trim().toUpperCase();
  const approach = catalog.approaches.find((item) => item.id.trim().toUpperCase() === want);
  if (!approach) {
    return undefined;
  }
  return {
    gsAngleDeg: approach.gsAngleDeg ?? GS_DEFAULT_ANGLE_DEG,
    tchFt: approach.tchFt ?? GS_DEFAULT_TCH_FT,
    fieldElevFt: catalog.fieldElevFt ?? GS_DEFAULT_FIELD_ELEV_FT,
  };
}

/**
 * Capture only after loc established, from below, inside 0.5–10 NM.
 * `wasBelow` is true if a previous tick had `alt < gsAlt - 20`.
 * Window is `gsAlt - 120 <= alt <= gsAlt + 50` (inside the 200 ft README bound).
 */
export function gsShouldCapture(args: {
  alongTrackNm: number;
  altFt: number;
  gsAltFt: number;
  wasBelow: boolean;
}): boolean {
  if (args.alongTrackNm < GS_CAPTURE_ALONG_MIN_NM || args.alongTrackNm > GS_CAPTURE_ALONG_MAX_NM) {
    return false;
  }
  if (args.altFt > args.gsAltFt + GS_CAPTURE_ABOVE_FT) {
    return false;
  }
  if (!args.wasBelow) {
    return false;
  }
  return (
    args.altFt >= args.gsAltFt - GS_CAPTURE_BELOW_FT &&
    args.altFt <= args.gsAltFt + GS_CAPTURE_ABOVE_FT
  );
}

export function gsShouldDropCapture(altFt: number, gsAltFt: number): boolean {
  return altFt > gsAltFt + GS_DROP_ABOVE_FT;
}
