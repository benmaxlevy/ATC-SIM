/**
 * Join a STAR/SID at a named fix after DCT.
 * Analog: “proceed direct [fix], rest of the arrival/departure.”
 * Trainer: DCT to a catalog procedure fix flies that fix then remaining legs.
 * A navaid or random fix that is not on a STAR/SID stays lone DIRECT.
 */

import type { CatalogStar } from "./vertical";

export interface ProcedureJoinCatalog {
  stars?: ReadonlyArray<CatalogStar> | null;
  sids?: ReadonlyArray<{
    id: string;
    legs?: ReadonlyArray<{ fixId: string }>;
  }> | null;
}

export interface ProcedureJoin {
  starId: string;
  routeFixIds: string[];
  toFixIndex: number;
}

function wantFix(id: string): string {
  return id.trim().toUpperCase();
}

function starHitsForFix(star: CatalogStar, fixId: string): ProcedureJoin[] {
  const commonIds = (star.common ?? []).map((leg) => wantFix(leg.fixId));
  const commonIdx = commonIds.indexOf(fixId);
  const hits: ProcedureJoin[] = [];
  for (const transition of star.transitions ?? []) {
    const routeFixIds = [
      ...transition.legs.map((leg) => wantFix(leg.fixId)),
      ...commonIds,
    ];
    const toFixIndex = routeFixIds.indexOf(fixId);
    if (toFixIndex >= 0) {
      hits.push({ starId: star.id, routeFixIds, toFixIndex });
    }
  }
  if (commonIdx >= 0 && hits.length !== 1) {
    return [
      {
        starId: star.id,
        routeFixIds: commonIds.slice(commonIdx),
        toFixIndex: 0,
      },
    ];
  }
  return hits;
}

function sidJoin(
  sid: { id: string; legs?: ReadonlyArray<{ fixId: string }> },
  fixId: string,
): ProcedureJoin | undefined {
  const routeFixIds = (sid.legs ?? []).map((leg) => wantFix(leg.fixId));
  const toFixIndex = routeFixIds.indexOf(fixId);
  if (toFixIndex < 0) {
    return undefined;
  }
  return { starId: sid.id, routeFixIds, toFixIndex };
}

/**
 * Remaining STAR/SID path starting at `fixId`. Prefers `preferStarId` when set
 * (current PROCEDURE or VIA). Common-only fixes (MERGE) join at common, not a
 * random transition.
 */
export function procedureRouteContainingFix(
  catalog: ProcedureJoinCatalog | null | undefined,
  fixId: string,
  preferStarId?: string | null,
): ProcedureJoin | undefined {
  const want = wantFix(fixId);
  if (!want || !catalog) {
    return undefined;
  }
  const prefer = preferStarId?.trim().toUpperCase() || undefined;
  const starHits: ProcedureJoin[] = [];
  for (const star of catalog.stars ?? []) {
    starHits.push(...starHitsForFix(star, want));
  }
  const sidHits: ProcedureJoin[] = [];
  for (const sid of catalog.sids ?? []) {
    const hit = sidJoin(sid, want);
    if (hit) {
      sidHits.push(hit);
    }
  }
  const preferred = [...starHits, ...sidHits].find(
    (hit) => hit.starId.trim().toUpperCase() === prefer,
  );
  if (preferred) {
    return preferred;
  }
  return starHits[0] ?? sidHits[0];
}
