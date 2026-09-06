/** Analog: CRC STARS datablock placement and leader controls (R07).
 *  Trainer delta: ATC-SIM automatically avoids Canvas2D rectangle collisions; this is not NAS STARS.
 *  The solver never changes a track's configured leader direction or length.
 */

import { datablockTopLeft, type DatablockMetrics, type LeaderDir } from "./leader";

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Aliases retained for callers using the existing DatablockRect vocabulary. */
  w?: number;
  h?: number;
}

export interface LayoutBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DatablockDisplayPriority = "full" | "partial" | "limited";

export interface DatablockLayoutInput {
  aircraftId: string;
  targetPoint: LayoutPoint;
  preferredRect: LayoutRect | { x: number; y: number; w: number; h: number };
  metrics: DatablockMetrics;
  leaderDir: LeaderDir;
  leaderLengthPx: number;
  displayPriority: DatablockDisplayPriority;
  selected?: boolean;
}

export interface ResolvedDatablockLayout {
  aircraftId: string;
  rect?: LayoutRect;
  leaderAnchor?: LayoutPoint;
  unplaced: boolean;
}

export interface DatablockLayoutOptions {
  bounds: LayoutBounds;
  /** Grid spacing used only after all compass candidates are exhausted. */
  gridStepPx?: number;
}

const PRIORITY: Record<DatablockDisplayPriority, number> = {
  full: 1,
  partial: 2,
  limited: 3,
};

const COMPASS_ORDER: LeaderDir[] = [8, 9, 6, 3, 2, 1, 4, 7, 5];

function dimensions(rect: DatablockLayoutInput["preferredRect"]): {
  width: number;
  height: number;
} {
  const width = "width" in rect ? rect.width : rect.w;
  const height = "height" in rect ? rect.height : rect.h;
  return {
    width: width ?? 0,
    height: height ?? 0,
  };
}

function makeRect(x: number, y: number, width: number, height: number): LayoutRect {
  return { x, y, width, height, w: width, h: height };
}

function inBounds(rect: LayoutRect, bounds: LayoutBounds): boolean {
  return (
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    rect.x + rect.width <= bounds.x + bounds.width &&
    rect.y + rect.height <= bounds.y + bounds.height
  );
}

/** A datablock is laid out only while its target symbol is on the PPI. */
export function pointInLayoutBounds(point: LayoutPoint, bounds: LayoutBounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/** Rectangles touching at an edge do not overlap. */
export function datablockRectsOverlap(a: LayoutRect, b: LayoutRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function free(rect: LayoutRect, accepted: readonly LayoutRect[], bounds: LayoutBounds): boolean {
  return inBounds(rect, bounds) && accepted.every((other) => !datablockRectsOverlap(rect, other));
}

function candidateFor(item: DatablockLayoutInput, dir: LeaderDir): LayoutRect {
  const origin = datablockTopLeft(dir, item.metrics, item.leaderLengthPx);
  return makeRect(
    item.targetPoint.x + origin.x,
    item.targetPoint.y + origin.y,
    item.metrics.widthPx,
    item.metrics.heightPx,
  );
}

function candidateDirections(preferred: LeaderDir): LeaderDir[] {
  return [preferred, ...COMPASS_ORDER.filter((dir) => dir !== preferred)];
}

/** Radial offsets preserve the configured leader geometry while moving the box farther from the target. */
function radialCandidates(item: DatablockLayoutInput): LayoutRect[] {
  const preferred = candidateFor(item, item.leaderDir);
  const dx = preferred.x - item.targetPoint.x;
  const dy = preferred.y - item.targetPoint.y;
  const distance = Math.hypot(dx, dy) || 1;
  return [48, 72, 96].map((radius) =>
    makeRect(
      preferred.x + (dx / distance) * radius,
      preferred.y + (dy / distance) * radius,
      item.metrics.widthPx,
      item.metrics.heightPx,
    ),
  );
}

/**
 * Resolve visible datablocks in deterministic priority order.
 * Preferred placement is attempted first; later compass and viewport-grid positions
 * are considered only when needed. No result is returned overlapping an earlier one.
 */
export function solveDatablockLayout(
  items: readonly DatablockLayoutInput[],
  options: DatablockLayoutOptions,
): ResolvedDatablockLayout[] {
  const ordered = [...items].sort(
    (a, b) =>
      Number(Boolean(b.selected)) - Number(Boolean(a.selected)) ||
      PRIORITY[a.displayPriority] - PRIORITY[b.displayPriority] ||
      a.aircraftId.localeCompare(b.aircraftId),
  );
  const accepted: LayoutRect[] = [];
  const results = new Map<string, ResolvedDatablockLayout>();
  const step = Math.max(1, options.gridStepPx ?? 4);

  for (const item of ordered) {
    const size = dimensions(item.preferredRect);
    const preferred = makeRect(item.preferredRect.x, item.preferredRect.y, size.width, size.height);
    const candidates = [
      preferred,
      ...candidateDirections(item.leaderDir).map((dir) => candidateFor(item, dir)),
      ...radialCandidates(item),
    ];
    let resolved = candidates.find((candidate) => free(candidate, accepted, options.bounds));

    if (!resolved) {
      for (
        let y = options.bounds.y;
        y <= options.bounds.y + options.bounds.height - size.height && !resolved;
        y += step
      ) {
        for (
          let x = options.bounds.x;
          x <= options.bounds.x + options.bounds.width - size.width;
          x += step
        ) {
          const candidate = makeRect(x, y, size.width, size.height);
          if (free(candidate, accepted, options.bounds)) {
            resolved = candidate;
            break;
          }
        }
      }
    }

    if (resolved) {
      accepted.push(resolved);
      results.set(item.aircraftId, {
        aircraftId: item.aircraftId,
        rect: resolved,
        leaderAnchor: item.targetPoint,
        unplaced: false,
      });
    } else {
      results.set(item.aircraftId, { aircraftId: item.aircraftId, unplaced: true });
    }
  }

  return items.map((item) => results.get(item.aircraftId)!);
}

export const resolveDatablockLayout = solveDatablockLayout;
