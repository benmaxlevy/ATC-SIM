/**
 * Analog: CRC STARS target / position symbol (docs.virtualnas.net/crc/stars — R07).
 * FAA 3-9-1: search/fusion symbol blue; history blue; FDB white/green by ownership.
 * Trainer delta: 8×8 CSS px unfilled **diamond** (T02-18; was a 6×6 box in T02-03),
 * north-up (do not rotate with heading), 8 px heading tick along ground track
 * (not a PTL). CSI-like one-char stub (`*` unowned, `G` after F3) is trainer
 * sugar in/near the symbol — not a real NAS CSI. Diamond stroke is search-target
 * blue; FDB/leader use ownership white/green. Selected is a yellow box,
 * independent of ownership. Not a sprite (R12). Not an airplane. Not NAS STARS.
 */

import { SCOPE_FONT_STACK } from "./fonts";
import { PALETTE, historyTrailColor } from "./palette";
import { ownershipStubChar, type TrackOwnership } from "./ownership";

/** Frozen T02-18 position-symbol shape. Axis-aligned diamond, not heading-rotated. */
export const TARGET_SHAPE = "diamond" as const;

/** Bounding box of the diamond (vertex to opposite vertex). 7–9 CSS px band. */
export const TARGET_SIZE_PX = 8;
export const TARGET_STROKE_PX = 1;
export const HEADING_TICK_PX = 8;
export const HISTORY_DOT_SIZE_PX = 3;
/** 1 px yellow selection box sits this far outside the diamond bounding box. */
export const SELECTION_BOX_PAD_PX = 2;

/** CSI-like stub: one character, IBM Plex Mono, slightly smaller than the FDB. */
export const OWNERSHIP_STUB_FONT_PX = 9;
export const OWNERSHIP_STUB_FONT = `${OWNERSHIP_STUB_FONT_PX}px ${SCOPE_FONT_STACK}`;

/** Unowned FDB / leader. CRC other-TCP green. */
export const UNOWNED_TRACK_COLOR = PALETTE.unowned;
/** Owned FDB / leader after F3. CRC owned white. */
export const OWNED_TRACK_COLOR = PALETTE.owned;
/** Selected accent / IDENT flash. Frozen phase-2 selected yellow. */
export const SELECTED_ACCENT_COLOR = PALETTE.selected;
/** Search/fusion position symbol. FAA (30,120,255). */
export const POSITION_SYMBOL_COLOR = PALETTE.positionSymbol;

export function historyDotColor(indexFromOldest: number, count: number): string {
  return historyTrailColor(indexFromOldest, count);
}

export function targetStrokeColor(_ownership: TrackOwnership, identFlashing: boolean): string {
  if (identFlashing) {
    return SELECTED_ACCENT_COLOR;
  }
  return POSITION_SYMBOL_COLOR;
}

/** North / east / south / west vertices of the axis-aligned diamond. */
export function targetDiamondVertices(
  x: number,
  y: number,
): [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] {
  const half = TARGET_SIZE_PX / 2;
  return [
    { x, y: y - half },
    { x: x + half, y },
    { x, y: y + half },
    { x: x - half, y },
  ];
}

/** True when `points` is the four-vertex diamond centered near (cx, cy). */
export function isTargetDiamondPath(
  points: ReadonlyArray<{ x: number; y: number }>,
  cx: number,
  cy: number,
  slopPx = 2,
): boolean {
  if (points.length < 4) {
    return false;
  }
  const expected = targetDiamondVertices(cx, cy);
  for (let i = 0; i < 4; i += 1) {
    const p = points[i]!;
    const e = expected[i]!;
    if (Math.abs(p.x - e.x) > slopPx || Math.abs(p.y - e.y) > slopPx) {
      return false;
    }
  }
  return true;
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

function strokeDiamond(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const verts = targetDiamondVertices(x, y);
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  ctx.lineTo(verts[1].x, verts[1].y);
  ctx.lineTo(verts[2].x, verts[2].y);
  ctx.lineTo(verts[3].x, verts[3].y);
  ctx.closePath();
  ctx.stroke();
}

export function drawOwnershipStub(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ownership: TrackOwnership,
  color: string,
): void {
  ctx.font = OWNERSHIP_STUB_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(ownershipStubChar(ownership), x, y);
}

export function drawTargetSymbol(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  headingDeg: number,
  strokeColor: string,
  ownership?: TrackOwnership,
): void {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = TARGET_STROKE_PX;
  strokeDiamond(ctx, x, y);
  const tick = headingTickOffset(headingDeg);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + tick.dx, y + tick.dy);
  ctx.stroke();
  if (ownership !== undefined) {
    drawOwnershipStub(ctx, x, y, ownership, strokeColor);
  }
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
