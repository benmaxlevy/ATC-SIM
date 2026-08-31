/**
 * WX mosaic state. Display only — T02-70 DCB later. Do not steer aircraft.
 *
 * VIP 1–6 bins use data-provided dBZ breaks (default JO 7110.65 30/40/50 plus
 * trainer splits). Not per-facility. Not painted here (T02-69 owns PPI overlay).
 */

/** STARS precipitation buttons 1–6. 0 = no VIP / clear-air / unknown. */
export type VipLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type VipBin = 0 | VipLevel;

/** Six DCB WX level latches. Index 0 is VIP 1. */
export type WxLevels = readonly [boolean, boolean, boolean, boolean, boolean, boolean];

export const DEFAULT_WX_LEVELS: WxLevels = [false, false, false, false, false, false];

/**
 * Trainer VIP lower edges (dBZ). TEMP: level 1 starts at 5 so WX1 paints
 * IEM cyan/clear-air (was 18). Restore 18 after the visual check.
 * 30 / 40 / 50 cite JO 7110.65 (light <30, moderate 30–40, heavy 40–50,
 * extreme >50). Extra 36 / 41 / 46 / 51 splits are trainer choices, not
 * facility bins.
 */
export const DEFAULT_WX_VIP_BREAKS_DBZ: readonly number[] = [5, 30, 36, 41, 46, 51];

export const WX_REFRESH_MS = 5 * 60 * 1000;
export const DEFAULT_WX_PAD_NM = 80;
export const WX_GETMAP_MIN_PX = 256;
export const WX_GETMAP_MAX_PX = 512;

export interface WxBbox {
  westLon: number;
  southLat: number;
  eastLon: number;
  northLat: number;
}

export interface WxMapSize {
  widthPx: number;
  heightPx: number;
}

/**
 * Fetched N0Q mosaic, already binned to six packed VIP masks.
 * Decode happens at fetch time, never in the animation loop.
 */
export interface WxMosaic extends WxBbox {
  widthPx: number;
  heightPx: number;
  /** Packed bits, row-major (row 0 = north). One plane per VIP 1–6. */
  vipMasks: readonly [Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  fetchedAtMs: number;
}

export function cloneWxLevels(levels: WxLevels = DEFAULT_WX_LEVELS): WxLevels {
  return [levels[0], levels[1], levels[2], levels[3], levels[4], levels[5]];
}
