/**
 * Analog: CRC STARS target / position symbol (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: 6×6 CSS px unfilled square, north-up (do not rotate with heading),
 * 8 px heading tick along ground track (not a PTL). Ownership stroke is white
 * unowned / green owned (T02-08); selected is a yellow box, independent of
 * ownership. Not a sprite (R12). Not NAS STARS.
 */

import { PALETTE } from "./palette";
import { trackPaintColor, type TrackOwnership } from "./ownership";

export const TARGET_SIZE_PX = 6;
export const TARGET_STROKE_PX = 1;
export const HEADING_TICK_PX = 8;
export const HISTORY_DOT_SIZE_PX = 2;
/** 1 px yellow selection box sits this far outside the 6 px target. */
export const SELECTION_BOX_PAD_PX = 2;

/** Unowned track. Frozen phase-2 unowned white. */
export const UNOWNED_TRACK_COLOR = PALETTE.unowned;
/** Owned track after F3. Frozen phase-2 owned green. */
export const OWNED_TRACK_COLOR = PALETTE.owned;
/** Selected accent / IDENT flash. Frozen phase-2 selected yellow. */
export const SELECTED_ACCENT_COLOR = PALETTE.selected;
/** History brightness as a fraction of track color (frozen 40–70%). */
export const HISTORY_BRIGHTNESS = 0.55;

export function scaleHexColor(hex: string, factor: number): string {
  const n = hex.replace("#", "");
  const r = Math.round(parseInt(n.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(n.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(n.slice(4, 6), 16) * factor);
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

export function historyDotColor(trackColor: string): string {
  return scaleHexColor(trackColor, HISTORY_BRIGHTNESS);
}

export function targetStrokeColor(ownership: TrackOwnership, identFlashing: boolean): string {
  if (identFlashing) {
    return SELECTED_ACCENT_COLOR;
  }
  return trackPaintColor(ownership);
}

export function selectionBoxRect(
  x: number,
  y: number,
): { x: number; y: number; w: number; h: number } {
  const half = TARGET_SIZE_PX / 2 + SELECTION_BOX_PAD_PX;
  return {
    x: x - half,
    y: y - half,
    w: TARGET_SIZE_PX + SELECTION_BOX_PAD_PX * 2,
    h: TARGET_SIZE_PX + SELECTION_BOX_PAD_PX * 2,
  };
}

export function drawSelectionBox(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const box = selectionBoxRect(x, y);
  ctx.strokeStyle = SELECTED_ACCENT_COLOR;
  ctx.lineWidth = TARGET_STROKE_PX;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
}

/** Screen offset for the heading tick. 0° = north (up), 90° = east (right). */
export function headingTickOffset(headingDeg: number): { dx: number; dy: number } {
  const rad = (headingDeg * Math.PI) / 180;
  return {
    dx: Math.sin(rad) * HEADING_TICK_PX,
    dy: -Math.cos(rad) * HEADING_TICK_PX,
  };
}

export function drawTargetSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  headingDeg: number,
  strokeColor: string,
): void {
  const half = TARGET_SIZE_PX / 2;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = TARGET_STROKE_PX;
  ctx.strokeRect(x - half, y - half, TARGET_SIZE_PX, TARGET_SIZE_PX);
  const tick = headingTickOffset(headingDeg);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tick.dx, y + tick.dy);
  ctx.stroke();
}

export function drawHistoryDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void {
  const half = HISTORY_DOT_SIZE_PX / 2;
  ctx.fillStyle = color;
  ctx.fillRect(x - half, y - half, HISTORY_DOT_SIZE_PX, HISTORY_DOT_SIZE_PX);
}
