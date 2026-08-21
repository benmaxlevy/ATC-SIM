/**
 * Analog: CRC STARS limited display colors (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: frozen hex from phases/02-scope/README.md. No red in phase 2
 * (alerts are phase 4). Not NAS STARS.
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
  uiChrome: "#9AA0A6",
  uiChromeBg: "#111111",
} as const;

export type Palette = typeof PALETTE;
