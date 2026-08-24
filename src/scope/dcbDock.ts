/**
 * Analog: CRC STARS DCB position TOP / LEFT / RIGHT / BOTTOM (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: one DCB at a time along a PPI edge. LEFT/RIGHT are a vertical
 * cell stack; TOP/BOTTOM stay horizontal. Drawable PPI size is the host minus
 * DCB thickness on that edge (T02-01 range circle inscribed in the remaining
 * rect). SSA / strip list stay screen-fixed on the canvas, not a chrome overlay.
 * Not NAS STARS.
 *
 * Scope display state only. Never a Command, readback, or intent.
 */

export type DcbDock = "TOP" | "LEFT" | "RIGHT" | "BOTTOM";

/** Same 36 px thickness as the horizontal bar (two text rows + 1 px gutters). */
export const DCB_THICKNESS_PX = 36;

export function isVerticalDcbDock(dock: DcbDock): boolean {
  return dock === "LEFT" || dock === "RIGHT";
}

/**
 * Camera view size after reserving DCB thickness on the docked edge.
 * Canvas clientWidth/Height should match this remaining rect.
 */
export function drawablePpiSize(
  hostWidthPx: number,
  hostHeightPx: number,
  dock: DcbDock,
  thicknessPx: number = DCB_THICKNESS_PX,
): { widthPx: number; heightPx: number } {
  if (isVerticalDcbDock(dock)) {
    return { widthPx: Math.max(0, hostWidthPx - thicknessPx), heightPx: hostHeightPx };
  }
  return { widthPx: hostWidthPx, heightPx: Math.max(0, hostHeightPx - thicknessPx) };
}
