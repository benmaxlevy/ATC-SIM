/**
 * Analog: CRC STARS CHAR SIZE (DCB / FDB / LDB / lists) (R07).
 * Trainer delta: IBM Plex Mono (SIL OFL) or system monospace — not a licensed
 * STARS face (`phases/_shared/non-goals.md`). CHAR SIZE is per-subsystem px
 * (DATA BLOCKS / LISTS / DCB / TOOLS / POS), not a font picker. DCB stays 10–12 px so two lines still fit the 36 px bar. POS is a
 * small discrete diamond px set, not a sprite scale. Not NAS STARS.
 */

export const SCOPE_FONT_STACK =
  '"IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace';

/** Frozen 12 px on a 1080p PPI (phase README decision 6). Default CHAR SIZE. */
export const DATABLOCK_FONT_PX = 12;

/**
 * CHAR SIZE DATA BLOCKS/LISTS/TOOLS levels 0–6, mapped to usable font px.
 * Readouts show trainer levels; state keeps actual render sizes.
 */
export const CHAR_SIZE_STEPS_PX = [8, 9, 10, 11, 12, 13, 14] as const;
export type CharSizePx = (typeof CHAR_SIZE_STEPS_PX)[number];
export const DEFAULT_CHAR_SIZE_PX: CharSizePx = 12;

/**
 * DCB cell text. Two lines must still fit the 36 px bar (T02-16).
 * CHAR SIZE DCB levels 0–2, mapped to 10/11/12 px so two lines fit the bar.
 */
export const DCB_CHAR_SIZE_STEPS_PX = [10, 11, 12] as const;
export type DcbCharSizePx = (typeof DCB_CHAR_SIZE_STEPS_PX)[number];
export const DEFAULT_DCB_CHAR_SIZE_PX: DcbCharSizePx = 11;

/**
 * CHAR SIZE POS levels 0–6, mapped to discrete CSS px, not a sprite scale.
 * Default level 4 keeps existing 8 px symbols.
 */
export const POS_SIZE_STEPS_PX = [4, 5, 6, 7, 8, 9, 10] as const;
export type PosSizePx = (typeof POS_SIZE_STEPS_PX)[number];
export const DEFAULT_POS_SIZE_PX: PosSizePx = 8;

export type CharSizeChannel = "dataBlocks" | "lists" | "dcb" | "tools" | "pos";

export interface CharSizes {
  /** FDB/LDB font px. */
  dataBlocks: CharSizePx;
  /** SSA + on-PPI strip list. */
  lists: CharSizePx;
  /** DCB cell text. */
  dcb: DcbCharSizePx;
  /** PTL cap tick / range-ring labels if any; else PTL-adjacent tools. */
  tools: CharSizePx;
  /** Position-symbol diamond px. */
  pos: PosSizePx;
}

export const DEFAULT_CHAR_SIZES: CharSizes = {
  dataBlocks: DEFAULT_CHAR_SIZE_PX,
  lists: DEFAULT_CHAR_SIZE_PX,
  dcb: DEFAULT_DCB_CHAR_SIZE_PX,
  tools: DEFAULT_CHAR_SIZE_PX,
  pos: DEFAULT_POS_SIZE_PX,
};

export function cloneCharSizes(sizes: CharSizes = DEFAULT_CHAR_SIZES): CharSizes {
  return {
    dataBlocks: sizes.dataBlocks,
    lists: sizes.lists,
    dcb: sizes.dcb,
    tools: sizes.tools,
    pos: sizes.pos,
  };
}

/** Character-cell line box; matches font size so Mode C columns stack. */
export const DATABLOCK_LINE_HEIGHT_PX = 12;

export const DATABLOCK_FONT = `${DATABLOCK_FONT_PX}px ${SCOPE_FONT_STACK}`;

export function datablockFontCss(sizePx: number = DATABLOCK_FONT_PX): string {
  return `${sizePx}px ${SCOPE_FONT_STACK}`;
}

export function datablockLineHeightPx(sizePx: number = DATABLOCK_FONT_PX): number {
  return sizePx;
}

/**
 * Fallback when Canvas `measureText("0")` is 0 (jsdom / tests).
 * IBM Plex Mono 12 px tabular figure is ~0.6 em.
 */
export const DEFAULT_DATABLOCK_CELL_PX = 7.2;

export function measureDatablockCellWidth(ctx: {
  measureText(text: string): { width: number };
}): number {
  const width = ctx.measureText("0").width;
  return width > 0 ? width : DEFAULT_DATABLOCK_CELL_PX;
}
