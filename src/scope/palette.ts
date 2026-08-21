/**
 * Analog: FAA JO 7210.3 3-9-1 National Color Standard (terminal) + FAA HF
 * 2008 STARS TCW RGB table + CRC STARS TCW (docs.virtualnas.net/crc/stars — R07)
 * + vice STARS monitor (Boston Approach screenshot; not ERAM).
 * Trainer delta: one TCW-like set, not MDM3/MDM4 clones, not a NY screenshot.
 * DCB BRITE steps map strokes only — track / datablock / SSA colors stay here.
 * Phase 2 reserved yellow/red; phase 4 CA/MSAW uses them. Not NAS STARS.
 *
 * Grammar (do not invert):
 * - Background black; video maps / range rings dim gray
 * - Owned FDB white after F3; unowned / other-TCP FDB green
 * - Search/fusion position symbol blue; history trail blue (not track-tinted)
 * - PTL white; SSA / DCB / lists phosphor green
 * - Phase 4 CA/MSAW: caution yellow then alert red (lite trainer, not NAS)
 */

export const PALETTE = {
  background: "#000000",
  /** Video maps A/B — FAA dim gray (140,140,140). Not phosphor green. */
  map: "#8C8C8C",
  /** Range rings — FAA dark gray (96,96,96). Dimmer than maps. */
  mapDim: "#606060",
  /** Unowned / other-TCP full or limited datablock — FAA/CRC green (0,255,0). */
  unowned: "#00FF00",
  /** Owned datablock after F3 INIT CNTL — CRC/FAA white. */
  owned: "#FFFFFF",
  /** Selection box, IDENT flash, unassociated/point-out analog — yellow. */
  selected: "#FFFF00",
  /** Search/fusion position symbol — FAA (30,120,255). Independent of FDB color. */
  positionSymbol: "#1E78FF",
  /** Newest history trail — FAA History Blue 1 (30,80,200). */
  history: "#1E50C8",
  /** PTL / min-sep analog — FAA white. */
  ptl: "#FFFFFF",
  /**
   * CA/MSAW caution (yellow). Lite 3 NM / 1000 ft trainer, not NAS parameters.
   * Do not label “STARS CA.”
   */
  caution: "#FFFF00",
  /** CA/MSAW alert (red). Lite trainer, not NAS-certified. */
  alert: "#FF0000",
  /** SSA, lists, DCB text — FAA list/preview green. Not map gray. */
  ssa: "#00FF00",
  /**
   * DCB cell fill (T02-16). Dark green on the glass, not the T02-10 `#111`
   * toolbar. Pressed cells invert to `ssa` on `background`.
   */
  dcbCell: "#003300",
  dcbText: "#00FF00",
  uiChrome: "#9AA0A6",
  uiChromeBg: "#111111",
} as const;

export type Palette = typeof PALETTE;

/**
 * FAA HF 2008 STARS TCW history blues, newest → oldest.
 * (30,80,200), (70,70,170), (50,50,130), (40,40,110), (30,30,90).
 */
export const HISTORY_TRAIL = ["#1E50C8", "#4646AA", "#323282", "#28286E", "#1E1E5A"] as const;

/** DCB BRITE map-stroke steps (R07 analog). Gray, not green. Does not recolor tracks. */
export const MAP_BRITE_STEPS = [
  { map: "#5A5A5A", mapDim: "#3C3C3C" },
  { map: "#8C8C8C", mapDim: "#606060" },
  { map: "#B4B4B4", mapDim: "#8C8C8C" },
] as const;

export type MapBriteIndex = 0 | 1 | 2;
export const DEFAULT_MAP_BRITE_INDEX: MapBriteIndex = 1;

export function mapBriteColors(index: MapBriteIndex): (typeof MAP_BRITE_STEPS)[MapBriteIndex] {
  return MAP_BRITE_STEPS[index] ?? MAP_BRITE_STEPS[DEFAULT_MAP_BRITE_INDEX];
}

/** History dot color: index 0 is oldest in the ring buffer. */
export function historyTrailColor(indexFromOldest: number, count: number): string {
  const fromNewest = Math.max(0, count - 1 - indexFromOldest);
  return HISTORY_TRAIL[Math.min(fromNewest, HISTORY_TRAIL.length - 1)] ?? HISTORY_TRAIL[0];
}
