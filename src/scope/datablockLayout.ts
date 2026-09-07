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

export type ProtectedGeometry =
  | { kind: "rect"; aircraftId: string; rect: LayoutRect }
  | { kind: "circle"; aircraftId: string; center: LayoutPoint; radius: number }
  | { kind: "segment"; aircraftId: string; from: LayoutPoint; to: LayoutPoint; strokePx?: number }
  | {
      kind: "polyline" | "polygon";
      aircraftId: string;
      aircraftIds?: readonly string[];
      points: LayoutPoint[];
      strokePx?: number;
    };

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
  protectedGeometry?: readonly ProtectedGeometry[];
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

/** CSS-pixel obstacle tests. Own-target geometry is ignored by the solver. */
export function protectedGeometryOverlaps(rect: LayoutRect, obstacle: ProtectedGeometry): boolean {
  const r = { x: rect.x - 1, y: rect.y - 1, width: rect.width + 2, height: rect.height + 2 };
  if (obstacle.kind === "rect") return datablockRectsOverlap(r, obstacle.rect);
  if (obstacle.kind === "circle") {
    const x = Math.max(r.x, Math.min(obstacle.center.x, r.x + r.width));
    const y = Math.max(r.y, Math.min(obstacle.center.y, r.y + r.height));
    return Math.hypot(x - obstacle.center.x, y - obstacle.center.y) <= obstacle.radius;
  }
  const pts = obstacle.kind === "segment" ? [obstacle.from, obstacle.to] : obstacle.points;
  const stroke = (obstacle.strokePx ?? 1) / 2 + 1;
  const orient = (a: LayoutPoint, b: LayoutPoint, c: LayoutPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const on = (a: LayoutPoint, b: LayoutPoint, p: LayoutPoint) =>
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y);
  const intersects = (a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint) =>
    (orient(a, b, c) === 0 && on(a, b, c)) ||
    (orient(a, b, d) === 0 && on(a, b, d)) ||
    (orient(c, d, a) === 0 && on(c, d, a)) ||
    (orient(c, d, b) === 0 && on(c, d, b)) ||
    (orient(a, b, c) > 0 !== orient(a, b, d) > 0 && orient(c, d, a) > 0 !== orient(c, d, b) > 0);
  const distance = (p: LayoutPoint, a: LayoutPoint, b: LayoutPoint) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const d = dx * dx + dy * dy;
    const t = d === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const segmentDistance = (a: LayoutPoint, b: LayoutPoint, c: LayoutPoint, d: LayoutPoint) =>
    intersects(a, b, c, d)
      ? 0
      : Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b));
  const edges: [LayoutPoint, LayoutPoint][] = [
    [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
    ],
    [
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
    ],
    [
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ],
    [
      { x: r.x, y: r.y + r.height },
      { x: r.x, y: r.y },
    ],
  ];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!,
      b = pts[i]!;
    if (edges.some(([c, d]) => segmentDistance(a, b, c, d) <= stroke)) return true;
  }
  if (obstacle.kind === "polygon") {
    const p = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]!,
        b = pts[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
        inside = !inside;
    }
    if (inside) return true;
    for (let i = 0; i < pts.length; i += 1) {
      if (
        segmentDistance(pts[i]!, pts[(i + 1) % pts.length]!, edges[0]![0], edges[0]![1]) <=
          stroke ||
        edges.some(([a, b]) => segmentDistance(pts[i]!, pts[(i + 1) % pts.length]!, a, b) <= stroke)
      )
        return true;
    }
  }
  return false;
}

function freeWithObstacles(
  rect: LayoutRect,
  accepted: readonly LayoutRect[],
  bounds: LayoutBounds,
  obstacles: readonly ProtectedGeometry[],
  aircraftId: string,
): boolean {
  return (
    free(rect, accepted, bounds) &&
    obstacles.every(
      (o) =>
        o.aircraftId === aircraftId ||
        ("aircraftIds" in o && o.aircraftIds?.includes(aircraftId)) ||
        !protectedGeometryOverlaps(rect, o),
    )
  );
}

export function resolvedLeaderObstacle(
  item: DatablockLayoutInput,
  rect: LayoutRect,
): ProtectedGeometry {
  const x = Math.max(rect.x, Math.min(item.targetPoint.x, rect.x + rect.width));
  const y = Math.max(rect.y, Math.min(item.targetPoint.y, rect.y + rect.height));
  return {
    kind: "segment",
    aircraftId: item.aircraftId,
    from: item.targetPoint,
    to: { x, y },
    strokePx: 1,
  };
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
  const resolvedLeaderObstacles: ProtectedGeometry[] = [];
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
    const obstacles = [...(options.protectedGeometry ?? []), ...resolvedLeaderObstacles];
    let resolved = candidates.find((candidate) =>
      freeWithObstacles(candidate, accepted, options.bounds, obstacles, item.aircraftId),
    );

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
          if (freeWithObstacles(candidate, accepted, options.bounds, obstacles, item.aircraftId)) {
            resolved = candidate;
            break;
          }
        }
      }
    }

    if (resolved) {
      accepted.push(resolved);
      resolvedLeaderObstacles.push(resolvedLeaderObstacle(item, resolved));
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
