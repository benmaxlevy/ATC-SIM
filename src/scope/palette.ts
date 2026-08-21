/**
 * Analog: CRC STARS limited display colors (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: frozen hex from phases/02-scope/README.md. No red in phase 2
 * (alerts are phase 4). DCB BRITE steps map strokes only — track / datablock
 * colors stay on this palette. Not NAS STARS.
 */

export const PALETTE = {
  background: "#000000",
  /** Runway, localizer feather, coastline — digital / video map. */
  map: "#00AA00",
  /** Range rings. */
  mapDim: "#006600",
  /** Pale mint (T02-18). Not webpage grey `#DDDDDD`. Not red. */
  unowned: "#B8E0D0",
  owned: "#00FF66",
  selected: "#FFFF00",
  /**
   * DCB cell fill (T02-16). Dark green on the glass, not the T02-10 `#111`
   * toolbar. Pressed cells invert to `map` on `background`.
   */
  dcbCell: "#003300",
  uiChrome: "#9AA0A6",
  uiChromeBg: "#111111",
} as const;

export type Palette = typeof PALETTE;

/** DCB BRITE map-stroke steps (R07 analog). Does not recolor tracks / datablocks. */
export const MAP_BRITE_STEPS = [
  { map: "#006600", mapDim: "#003300" },
  { map: "#00AA00", mapDim: "#006600" },
  { map: "#00EE00", mapDim: "#00AA00" },
] as const;

export type MapBriteIndex = 0 | 1 | 2;
export const DEFAULT_MAP_BRITE_INDEX: MapBriteIndex = 1;

export function mapBriteColors(index: MapBriteIndex): (typeof MAP_BRITE_STEPS)[MapBriteIndex] {
  return MAP_BRITE_STEPS[index] ?? MAP_BRITE_STEPS[DEFAULT_MAP_BRITE_INDEX];
}
