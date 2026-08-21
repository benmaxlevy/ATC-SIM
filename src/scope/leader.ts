/**
 * Analog: CRC STARS L1–L9 **leader** direction (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: direction only; no leader-length DCB menu. Numpad 5 = overlay.
 * Pixel-constant 24 CSS px (not NM) so length does not explode at 5 NM range.
 * Limited datablocks use the same 24 px length. Always named **leader**.
 * Not NAS STARS.
 *
 * Numpad compass (canvas −Y is north):
 * ```
 * 7 NW   8 N   9 NE
 * 4 W    5 CTR 6 E
 * 1 SW   2 S   3 SE
 * ```
 *
 * Block placement relative to the leader end (2 px gap, except L5 overlay):
 * | Dir | Block vs leader end |
 * | 8 N | centered, bottom near end (block is north of the target) |
 * | 2 S | centered, top at end |
 * | 6 E | left at end, vertically centered |
 * | 4 W | right at end (block sits west so the line does not cross text) |
 * | 9/3/7/1 | analogous corners |
 * | 5 | top-left 4 px east and 4 px south of symbol center |
 */

import { TARGET_SIZE_PX } from "./targetSymbol";

export type LeaderDir = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Numpad 8 = north. Default at spawn for every track. */
export const DEFAULT_LEADER_DIR: LeaderDir = 8;

/** Pixel-constant leader length (phase README decision 8). Not nautical miles. */
export const LEADER_LENGTH_PX = 24;

export const LEADER_STROKE_PX = 1;

/** Gap from leader end to the datablock box (not used for L5 overlay). */
export const LEADER_BLOCK_GAP_PX = 2;

/**
 * L5 overlay: datablock top-left relative to symbol center. 4 px east + south
 * so the 6 px symbol stays visible (length 0, no leader stroke).
 */
export const L5_OVERLAY_GAP_PX = 4;

export interface DatablockMetrics {
  widthPx: number;
  heightPx: number;
}

/** Compass unit steps in canvas pixels (x east, y south). L5 is overlay. */
const COMPASS: Record<LeaderDir, { x: number; y: number }> = {
  1: { x: -1, y: 1 },
  2: { x: 0, y: 1 },
  3: { x: 1, y: 1 },
  4: { x: -1, y: 0 },
  5: { x: 0, y: 0 },
  6: { x: 1, y: 0 },
  7: { x: -1, y: -1 },
  8: { x: 0, y: -1 },
  9: { x: 1, y: -1 },
};

export function isLeaderDir(n: number): n is LeaderDir {
  return Number.isInteger(n) && n >= 1 && n <= 9;
}

/** Leader end relative to symbol center. L5 is ~0 length. */
export function leaderOffsetPx(dir: LeaderDir): { dx: number; dy: number } {
  const step = COMPASS[dir];
  const len = Math.hypot(step.x, step.y);
  if (len === 0) {
    return { dx: 0, dy: 0 };
  }
  return {
    dx: (step.x / len) * LEADER_LENGTH_PX,
    dy: (step.y / len) * LEADER_LENGTH_PX,
  };
}

/**
 * Leader start on the 6×6 symbol edge (not through the fill), or null for L5.
 */
export function leaderStartOffsetPx(dir: LeaderDir): { dx: number; dy: number } | null {
  if (dir === 5) {
    return null;
  }
  const end = leaderOffsetPx(dir);
  const half = TARGET_SIZE_PX / 2;
  const cheb = Math.max(Math.abs(end.dx), Math.abs(end.dy));
  if (cheb === 0) {
    return null;
  }
  return { dx: end.dx * (half / cheb), dy: end.dy * (half / cheb) };
}

/** Segment in symbol-center space, or null when there is no visible leader. */
export function leaderSegmentPx(
  dir: LeaderDir,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const start = leaderStartOffsetPx(dir);
  if (!start) {
    return null;
  }
  const end = leaderOffsetPx(dir);
  const len = Math.hypot(end.dx - start.dx, end.dy - start.dy);
  if (len <= 1) {
    return null;
  }
  return { x0: start.dx, y0: start.dy, x1: end.dx, y1: end.dy };
}

/**
 * Top-left of datablock line 1 relative to symbol center.
 * Anchor is the far end of the leader plus a 2 px gap (L5 uses the overlay gap).
 */
export function datablockTopLeft(
  dir: LeaderDir,
  metrics: DatablockMetrics,
): { x: number; y: number } {
  if (dir === 5) {
    return { x: L5_OVERLAY_GAP_PX, y: L5_OVERLAY_GAP_PX };
  }
  const end = leaderOffsetPx(dir);
  const step = COMPASS[dir];
  const w = metrics.widthPx;
  const h = metrics.heightPx;
  const gap = LEADER_BLOCK_GAP_PX;
  let x: number;
  let y: number;
  if (step.x > 0) {
    x = end.dx + gap;
  } else if (step.x < 0) {
    x = end.dx - gap - w;
  } else {
    x = end.dx - w / 2;
  }
  if (step.y < 0) {
    y = end.dy - gap - h;
  } else if (step.y > 0) {
    y = end.dy + gap;
  } else {
    y = end.dy - h / 2;
  }
  return { x, y };
}

/** 1 px stroke from the symbol edge to the leader end. Skip L5 / ≤1 px. */
export function drawLeaderLine(
  ctx: CanvasRenderingContext2D,
  symbolX: number,
  symbolY: number,
  dir: LeaderDir,
  color: string,
): void {
  const seg = leaderSegmentPx(dir);
  if (!seg) {
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = LEADER_STROKE_PX;
  ctx.beginPath();
  ctx.moveTo(symbolX + seg.x0, symbolY + seg.y0);
  ctx.lineTo(symbolX + seg.x1, symbolY + seg.y1);
  ctx.stroke();
}
