/**
 * Analog: STARS-like monospace on the PPI / full datablock (R07 FDB/LDB).
 * Trainer delta: IBM Plex Mono (SIL OFL) or system monospace — not a licensed
 * STARS face (`phases/_shared/non-goals.md`). Not NAS STARS.
 */

export const SCOPE_FONT_STACK =
  '"IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace';

/** Frozen 12 px on a 1080p PPI (phase README decision 6). */
export const DATABLOCK_FONT_PX = 12;

/** Character-cell line box; matches font size so Mode C columns stack. */
export const DATABLOCK_LINE_HEIGHT_PX = 12;

export const DATABLOCK_FONT = `${DATABLOCK_FONT_PX}px ${SCOPE_FONT_STACK}`;

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
