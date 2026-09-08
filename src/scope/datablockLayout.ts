/** Analog: CRC STARS datablock placement and leader controls (R07).
 *  Trainer delta: ATC-SIM automatically avoids Canvas2D rectangle collisions; this is not NAS STARS.
 *  The solver never changes a track's configured leader direction or length.
 */

import {
  datablockTopLeft,
  effectiveLeaderLengthPx,
  LEADER_LENGTH_STEPS_PX,
  type DatablockMetrics,
  type LeaderDir,
} from "./leader";

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
  leaderDir?: LeaderDir;
  leaderLengthPx?: number;
  /** True when rect follows leader geometry; false for radial/grid fallback. */
  leaderAligned?: boolean;
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
    // A polygon may be wholly contained by the datablock, so no polygon edge
    // crosses the rectangle and the rectangle center need not be inside it.
    // The expanded rectangle preserves the one-pixel clearance requirement.
    if (pts.some((point) => pointInLayoutBounds(point, r))) return true;
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

function leaderClearOfAcceptedBlocks(
  item: DatablockLayoutInput,
  rect: LayoutRect,
  accepted: readonly LayoutRect[],
): boolean {
  const leader = resolvedLeaderObstacle(item, rect);
  return (
    leader === null ||
    accepted.every(
      (other) =>
        // Co-located targets can put the line origin inside an earlier block;
        // only reject crossings beyond that shared target origin.
        pointInLayoutBounds(item.targetPoint, other) || !protectedGeometryOverlaps(other, leader),
    )
  );
}

export function resolvedLeaderObstacle(
  item: DatablockLayoutInput,
  rect: LayoutRect,
): ProtectedGeometry | null {
  if (effectiveLeaderLengthPx(item.leaderDir, item.leaderLengthPx) <= 0) {
    return null;
  }
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
  return candidateForLength(item, dir, item.leaderLengthPx);
}

function candidateForLength(
  item: DatablockLayoutInput,
  dir: LeaderDir,
  lengthPx: number,
): LayoutRect {
  const origin = datablockTopLeft(dir, item.metrics, lengthPx);
  return makeRect(
    item.targetPoint.x + origin.x,
    item.targetPoint.y + origin.y,
    item.metrics.widthPx,
    item.metrics.heightPx,
  );
}

interface LayoutCandidate {
  rect: LayoutRect;
  dir: LeaderDir;
  lengthPx: number;
  leaderAligned: boolean;
}

function candidateDirections(preferred: LeaderDir): LeaderDir[] {
  return [preferred, ...COMPASS_ORDER.filter((dir) => dir !== preferred)];
}

function rectClearance(a: LayoutRect, b: LayoutRect): number {
  const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
  const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
  return Math.hypot(dx, dy);
}

function circleClearance(
  rect: LayoutRect,
  obstacle: Extract<ProtectedGeometry, { kind: "circle" }>,
): number {
  const x = Math.max(rect.x, Math.min(obstacle.center.x, rect.x + rect.width));
  const y = Math.max(rect.y, Math.min(obstacle.center.y, rect.y + rect.height));
  return Math.max(0, Math.hypot(x - obstacle.center.x, y - obstacle.center.y) - obstacle.radius);
}

function candidateClearance(
  rect: LayoutRect,
  accepted: readonly LayoutRect[],
  obstacles: readonly ProtectedGeometry[],
): number {
  const clearances = accepted.map((other) => rectClearance(rect, other));
  for (const obstacle of obstacles) {
    if (obstacle.kind === "rect") {
      clearances.push(rectClearance(rect, obstacle.rect));
    } else if (obstacle.kind === "circle") {
      clearances.push(circleClearance(rect, obstacle));
    }
  }
  return clearances.length > 0 ? Math.min(...clearances) : Number.POSITIVE_INFINITY;
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

function candidateIsFree(
  item: DatablockLayoutInput,
  candidate: LayoutCandidate,
  accepted: readonly LayoutRect[],
  bounds: LayoutBounds,
  obstacles: readonly ProtectedGeometry[],
): boolean {
  return (
    freeWithObstacles(candidate.rect, accepted, bounds, obstacles, item.aircraftId) &&
    leaderClearOfAcceptedBlocks(
      { ...item, leaderDir: candidate.dir, leaderLengthPx: candidate.lengthPx },
      candidate.rect,
      accepted,
    )
  );
}

function chooseBestCandidate(
  item: DatablockLayoutInput,
  candidates: readonly LayoutCandidate[],
  accepted: readonly LayoutRect[],
  bounds: LayoutBounds,
  obstacles: readonly ProtectedGeometry[],
): LayoutCandidate | undefined {
  let best: LayoutCandidate | undefined;
  let bestClearance = -1;
  for (const candidate of candidates) {
    if (!candidateIsFree(item, candidate, accepted, bounds, obstacles)) {
      continue;
    }
    const clearance = candidateClearance(candidate.rect, accepted, obstacles);
    if (
      best === undefined ||
      clearance > bestClearance ||
      (clearance === bestClearance && candidate.lengthPx < best.lengthPx)
    ) {
      best = candidate;
      bestClearance = clearance;
    }
  }
  return best;
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
    const obstacles = [...(options.protectedGeometry ?? []), ...resolvedLeaderObstacles];
    const preferredCandidate: LayoutCandidate = {
      rect: preferred,
      dir: item.leaderDir,
      lengthPx: item.leaderLengthPx,
      leaderAligned: true,
    };
    let resolvedCandidate = candidateIsFree(
      item,
      preferredCandidate,
      accepted,
      options.bounds,
      obstacles,
    )
      ? preferredCandidate
      : chooseBestCandidate(
          item,
          candidateDirections(item.leaderDir).map((dir) => ({
            rect: candidateFor(item, dir),
            dir,
            lengthPx: item.leaderLengthPx,
            leaderAligned: true,
          })),
          accepted,
          options.bounds,
          obstacles,
        );

    if (!resolvedCandidate) {
      resolvedCandidate = chooseBestCandidate(
        item,
        candidateDirections(item.leaderDir).flatMap((dir) =>
          LEADER_LENGTH_STEPS_PX.map((lengthPx) => ({
            rect: candidateForLength(item, dir, lengthPx),
            dir,
            lengthPx,
            leaderAligned: true,
          })),
        ),
        accepted,
        options.bounds,
        obstacles,
      );
    }

    if (!resolvedCandidate) {
      resolvedCandidate = chooseBestCandidate(
        item,
        radialCandidates(item).map((rect) => ({
          rect,
          dir: item.leaderDir,
          lengthPx: item.leaderLengthPx,
          leaderAligned: false,
        })),
        accepted,
        options.bounds,
        obstacles,
      );
    }

    if (!resolvedCandidate) {
      for (
        let y = options.bounds.y;
        y <= options.bounds.y + options.bounds.height - size.height && !resolvedCandidate;
        y += step
      ) {
        for (
          let x = options.bounds.x;
          x <= options.bounds.x + options.bounds.width - size.width;
          x += step
        ) {
          const candidate: LayoutCandidate = {
            rect: makeRect(x, y, size.width, size.height),
            dir: item.leaderDir,
            lengthPx: item.leaderLengthPx,
            leaderAligned: false,
          };
          if (candidateIsFree(item, candidate, accepted, options.bounds, obstacles)) {
            resolvedCandidate = candidate;
            break;
          }
        }
      }
    }

    if (resolvedCandidate) {
      accepted.push(resolvedCandidate.rect);
      const leaderObstacle = resolvedLeaderObstacle(
        { ...item, leaderDir: resolvedCandidate.dir, leaderLengthPx: resolvedCandidate.lengthPx },
        resolvedCandidate.rect,
      );
      if (leaderObstacle) {
        resolvedLeaderObstacles.push(leaderObstacle);
      }
      results.set(item.aircraftId, {
        aircraftId: item.aircraftId,
        rect: resolvedCandidate.rect,
        leaderAnchor: item.targetPoint,
        leaderDir: resolvedCandidate.dir,
        leaderLengthPx: resolvedCandidate.lengthPx,
        leaderAligned: resolvedCandidate.leaderAligned,
        unplaced: false,
      });
    } else {
      results.set(item.aircraftId, { aircraftId: item.aircraftId, unplaced: true });
    }
  }

  return items.map((item) => results.get(item.aircraftId)!);
}

export const resolveDatablockLayout = solveDatablockLayout;
