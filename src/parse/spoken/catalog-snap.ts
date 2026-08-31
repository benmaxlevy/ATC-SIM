/**
 * Floor + margin snap onto T03-16 ranked catalog ids.
 * Does not re-score. Unique exact/alias/near-miss in catalog-ground stays first.
 */

/** Minimum T03-16 retrieve score to consider a snap. Frozen by T03-17 tests. */
export const SNAP_SCORE_FLOOR = 0.8;

/** Minimum best−second gap. Smaller gaps are ties (including 0.91 vs 0.89). */
export const SNAP_SCORE_MARGIN = 0.05;

export interface RankedCatalogHit {
  id: string;
  score: number;
}

export type SnapResult =
  | { kind: "snap"; id: string }
  | { kind: "tie"; ids: string[] }
  | { kind: "weak" }
  | { kind: "none" };

function compactToken(token: string): string {
  return token.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function closeCluster(ranked: readonly RankedCatalogHit[]): string[] {
  const best = ranked[0]!;
  const ids: string[] = [];
  for (const hit of ranked) {
    if (hit.score < SNAP_SCORE_FLOOR) {
      break;
    }
    if (best.score - hit.score >= SNAP_SCORE_MARGIN) {
      break;
    }
    ids.push(hit.id);
  }
  return ids;
}

/**
 * Snap a spoken token onto a ranked catalog id only when the winner is clearly
 * best. `preferIds` is a tie-break only — never a hard filter.
 */
// R01 proceed direct uses published identifiers; T03-17 snap is trainer ASR repair with floor+margin, not NAS.
export function snapFix(
  token: string,
  ranked: readonly RankedCatalogHit[],
  preferIds?: ReadonlySet<string>,
): SnapResult {
  if (compactToken(token).length < 2 || ranked.length === 0) {
    return { kind: "none" };
  }

  const ordered =
    ranked.length === 1
      ? ranked
      : [...ranked].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = ordered[0]!;
  if (best.score < SNAP_SCORE_FLOOR) {
    return { kind: "weak" };
  }

  const aboveFloor = ordered.filter((hit) => hit.score >= SNAP_SCORE_FLOOR);
  const second = ordered[1];
  const marginClear = second === undefined || best.score - second.score >= SNAP_SCORE_MARGIN;
  if (aboveFloor.length === 1 || marginClear) {
    return { kind: "snap", id: best.id };
  }

  const ids = closeCluster(ordered);
  if (preferIds !== undefined && preferIds.size > 0) {
    const preferred = ids.filter((id) => preferIds.has(id));
    if (preferred.length === 1) {
      return { kind: "snap", id: preferred[0]! };
    }
  }
  return { kind: "tie", ids };
}
