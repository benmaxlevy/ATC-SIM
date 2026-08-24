/**
 * Analog: FAA JO 7210.3 3-9-1 National Color Standard (terminal) + FAA HF
 * 2008 STARS TCW RGB table + CRC STARS TCW (docs.virtualnas.net/crc/stars — R07)
 * + vice STARS monitor (Boston Approach screenshot; not ERAM).
 * Trainer delta: one TCW-like set, not MDM3/MDM4 clones, not a NY screenshot.
 * DCB BRITE is per drawn channel (MPA/MPB/FDB/LDB/…) as a 0–100 intensity
 * multiply on this palette — hues stay the T02-08 roles. WX/WXC/BKC are
 * stored no-ops (no weather). Not a brightness slider.
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
  /**
   * Tower-handoff ownership stub (T04-12). Trainer cyan, not CA/MSAW yellow/red.
   * Not NAS handoff / other-TCP.
   */
  tower: "#00DDFF",
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

/**
 * Analog: CRC STARS DCB BRITE channels (R07).
 * Trainer delta: discrete 0–100 in steps of 10 applied as a multiply on the
 * existing palette hex (hue stays green/white/blue/gray). WX / WXC / BKC are
 * stored no-ops — no weather paint. CMP is stored; we have no compass `N`
 * tick so the cell is disabled. BCN / PRI are stored no-ops: one fusion
 * position symbol uses POS. Not a brightness slider. Not NAS STARS.
 */
export const BRITE_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export type BriteLevel = (typeof BRITE_STEPS)[number];
export const DEFAULT_BRITE_LEVEL: BriteLevel = 100;

export type BriteChannel =
  | "dcb"
  | "mpa"
  | "mpb"
  | "fdb"
  | "lst"
  | "pos"
  | "ldb"
  | "oth"
  | "tls"
  | "rr"
  | "hst"
  | "cmp"
  | "bcn"
  | "pri"
  | "wx"
  | "wxc"
  | "bkc";

export type BriteState = Record<BriteChannel, BriteLevel>;

/** Live paint channels. Disabled cells still store a value for PREF later. */
export const BRITE_PAINT_CHANNELS = [
  "dcb",
  "mpa",
  "mpb",
  "fdb",
  "lst",
  "pos",
  "ldb",
  "oth",
  "tls",
  "rr",
  "hst",
] as const satisfies readonly BriteChannel[];

/**
 * CMP: no compass `N` tick. BCN/PRI: one fusion symbol (POS is live).
 * WX/WXC/BKC: no weather / no CRC BKC.
 */
export const BRITE_DISABLED_CHANNELS = [
  "cmp",
  "bcn",
  "pri",
  "wx",
  "wxc",
  "bkc",
] as const satisfies readonly BriteChannel[];

export const DEFAULT_BRITE: BriteState = {
  dcb: DEFAULT_BRITE_LEVEL,
  mpa: DEFAULT_BRITE_LEVEL,
  mpb: DEFAULT_BRITE_LEVEL,
  fdb: DEFAULT_BRITE_LEVEL,
  lst: DEFAULT_BRITE_LEVEL,
  pos: DEFAULT_BRITE_LEVEL,
  ldb: DEFAULT_BRITE_LEVEL,
  oth: DEFAULT_BRITE_LEVEL,
  tls: DEFAULT_BRITE_LEVEL,
  rr: DEFAULT_BRITE_LEVEL,
  hst: DEFAULT_BRITE_LEVEL,
  cmp: DEFAULT_BRITE_LEVEL,
  bcn: DEFAULT_BRITE_LEVEL,
  pri: DEFAULT_BRITE_LEVEL,
  wx: DEFAULT_BRITE_LEVEL,
  wxc: DEFAULT_BRITE_LEVEL,
  bkc: DEFAULT_BRITE_LEVEL,
};

export function cloneBrite(brite: BriteState = DEFAULT_BRITE): BriteState {
  return { ...brite };
}

export function snapBriteLevel(value: number): BriteLevel {
  if (!Number.isFinite(value)) {
    return DEFAULT_BRITE_LEVEL;
  }
  const clamped = Math.max(0, Math.min(100, Math.round(value / 10) * 10));
  return clamped as BriteLevel;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length === 3) {
    return {
      r: Number.parseInt(h[0]! + h[0], 16),
      g: Number.parseInt(h[1]! + h[1], 16),
      b: Number.parseInt(h[2]! + h[2], 16),
    };
  }
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function toHex2(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0").toUpperCase();
}

/**
 * Multiply a palette hex by BRITE 0–100. Preserves hue; 100 = the palette
 * color. Draw code should call this instead of sprinkling ad-hoc alpha.
 */
export function applyBrite(hex: string, channel: number): string {
  const t = snapBriteLevel(channel) / 100;
  const { r, g, b } = parseHexRgb(hex);
  return `#${toHex2(Math.round(r * t))}${toHex2(Math.round(g * t))}${toHex2(Math.round(b * t))}`;
}

/** @deprecated T02-26: per-channel `applyBrite`. Kept so T02-17 tests can migrate. */
export const MAP_BRITE_STEPS = [
  { map: "#5A5A5A", mapDim: "#3C3C3C" },
  { map: "#8C8C8C", mapDim: "#606060" },
  { map: "#B4B4B4", mapDim: "#8C8C8C" },
] as const;

/** @deprecated T02-26: use `BriteLevel` / `brite.mpa`. */
export type MapBriteIndex = 0 | 1 | 2;
export const DEFAULT_MAP_BRITE_INDEX: MapBriteIndex = 1;

/** @deprecated T02-26: use `applyBrite(PALETTE.map, brite.mpa)`. */
export function mapBriteColors(index: MapBriteIndex): (typeof MAP_BRITE_STEPS)[MapBriteIndex] {
  return MAP_BRITE_STEPS[index] ?? MAP_BRITE_STEPS[DEFAULT_MAP_BRITE_INDEX];
}

/** History dot color: index 0 is oldest in the ring buffer. */
export function historyTrailColor(indexFromOldest: number, count: number): string {
  const fromNewest = Math.max(0, count - 1 - indexFromOldest);
  return HISTORY_TRAIL[Math.min(fromNewest, HISTORY_TRAIL.length - 1)] ?? HISTORY_TRAIL[0];
}
