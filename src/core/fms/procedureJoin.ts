/**
 * Join a named STAR/SID (JOIN or VIA). DCT to a procedure fix is not a join.
 */

import type { CatalogSid, CatalogStar } from "./vertical";

export interface ProcedureJoinCatalog {
  stars?: ReadonlyArray<CatalogStar> | null;
  sids?: ReadonlyArray<CatalogSid> | null;
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
    const routeFixIds = [...transition.legs.map((leg) => wantFix(leg.fixId)), ...commonIds];
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

function sidRoutes(sid: CatalogSid): string[][] {
  if (sid.legs && sid.legs.length > 0) {
    return [sid.legs.map((leg) => wantFix(leg.fixId))];
  }
  const rts =
    sid.runwayTransitions && sid.runwayTransitions.length > 0
      ? sid.runwayTransitions
      : [undefined];
  const ets =
    sid.enrouteTransitions && sid.enrouteTransitions.length > 0
      ? sid.enrouteTransitions
      : [undefined];
  const commonIds = (sid.common ?? []).map((leg) => wantFix(leg.fixId));
  const results: string[][] = [];

  for (const rt of rts) {
    for (const et of ets) {
      const route: string[] = [];
      if (rt) {
        for (const leg of rt.legs) {
          route.push(wantFix(leg.fixId));
        }
      }
      for (const fixId of commonIds) {
        if (route.length === 0 || route[route.length - 1] !== fixId) {
          route.push(fixId);
        }
      }
      if (et) {
        for (const leg of et.legs) {
          const fixId = wantFix(leg.fixId);
          if (route.length === 0 || route[route.length - 1] !== fixId) {
            route.push(fixId);
          }
        }
      }
      if (route.length > 0) {
        const key = route.join(">");
        if (!results.some((r) => r.join(">") === key)) {
          results.push(route);
        }
      }
    }
  }
  return results;
}

function sidHitsForFix(sid: CatalogSid, fixId: string): ProcedureJoin[] {
  const routes = sidRoutes(sid);
  const hits: ProcedureJoin[] = [];
  for (const routeFixIds of routes) {
    const toFixIndex = routeFixIds.indexOf(fixId);
    if (toFixIndex >= 0) {
      hits.push({ starId: sid.id, routeFixIds, toFixIndex });
    }
  }
  return hits;
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
    sidHits.push(...sidHitsForFix(sid, want));
  }
  const preferred = [...starHits, ...sidHits].find(
    (hit) => hit.starId.trim().toUpperCase() === prefer,
  );
  if (preferred) {
    return preferred;
  }
  return starHits[0] ?? sidHits[0];
}

function routesForProcedureId(catalog: ProcedureJoinCatalog, procedureId: string): ProcedureJoin[] {
  const want = wantFix(procedureId);
  const routes: ProcedureJoin[] = [];
  for (const star of catalog.stars ?? []) {
    if (wantFix(star.id) !== want) {
      continue;
    }
    const commonIds = (star.common ?? []).map((leg) => wantFix(leg.fixId));
    const transitions = star.transitions ?? [];
    if (transitions.length === 0 && commonIds.length > 0) {
      routes.push({ starId: star.id, routeFixIds: commonIds, toFixIndex: 0 });
      continue;
    }
    for (const transition of transitions) {
      routes.push({
        starId: star.id,
        routeFixIds: [...transition.legs.map((leg) => wantFix(leg.fixId)), ...commonIds],
        toFixIndex: 0,
      });
    }
  }
  for (const sid of catalog.sids ?? []) {
    if (wantFix(sid.id) !== want) {
      continue;
    }
    const sidRouteList = sidRoutes(sid);
    for (const routeFixIds of sidRouteList) {
      routes.push({ starId: sid.id, routeFixIds, toFixIndex: 0 });
    }
  }
  return routes;
}

export interface JoinNamedProcedureArgs {
  catalog?: ProcedureJoinCatalog | null;
  procedureId: string;
  current?:
    | { type: "PROCEDURE"; starId: string; routeFixIds: readonly string[]; toFixIndex: number }
    | { type: "DIRECT"; fixId: string }
    | null;
  xNm?: number;
  yNm?: number;
  fixXy?: (id: string) => { xNm: number; yNm: number } | undefined;
}

/**
 * Lateral path for VIA/CVIA. Keeps an existing PROCEDURE of this id. Else
 * joins from a DIRECT/current fix on it, a unique SID/STAR route, or the
 * nearest published fix when position is known. Does not guess a random
 * transition when several exist and there is no hint.
 */
export function joinNamedProcedure(args: JoinNamedProcedureArgs): ProcedureJoin | undefined {
  const want = wantFix(args.procedureId);
  if (!want || !args.catalog) {
    return undefined;
  }
  const current = args.current;
  if (current?.type === "PROCEDURE" && wantFix(current.starId) === want) {
    return {
      starId: current.starId,
      routeFixIds: [...current.routeFixIds],
      toFixIndex: current.toFixIndex,
    };
  }
  const hintFixId =
    current?.type === "DIRECT"
      ? current.fixId
      : current?.type === "PROCEDURE"
        ? current.routeFixIds[current.toFixIndex]
        : undefined;
  if (hintFixId) {
    const fromHint = procedureRouteContainingFix(args.catalog, hintFixId, want);
    if (fromHint && wantFix(fromHint.starId) === want) {
      return fromHint;
    }
  }
  const routes = routesForProcedureId(args.catalog, want);
  if (routes.length === 1) {
    return routes[0];
  }
  if (routes.length > 1 && args.xNm !== undefined && args.yNm !== undefined && args.fixXy) {
    let best: { join: ProcedureJoin; dist: number } | undefined;
    for (const route of routes) {
      for (let i = 0; i < route.routeFixIds.length; i += 1) {
        const xy = args.fixXy(route.routeFixIds[i]!);
        if (!xy) {
          continue;
        }
        const dist = Math.hypot(args.xNm - xy.xNm, args.yNm - xy.yNm);
        if (!best || dist < best.dist) {
          best = { join: { ...route, toFixIndex: i }, dist };
        }
      }
    }
    return best?.join;
  }
  return undefined;
}
