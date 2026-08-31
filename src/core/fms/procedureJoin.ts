/**
 * Join a named STAR/SID (JOIN or VIA). DCT to a procedure fix is not a join.
 */

import type {
  CatalogSid,
  CatalogSidLeg,
  CatalogSidRunwayTransition,
  CatalogStar,
} from "./vertical";

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
    sid.runwayTransitions && sid.runwayTransitions.length > 0 ? sid.runwayTransitions : [undefined];
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
        let etLegs: readonly CatalogSidLeg[] | undefined;
        if (rt && et.runwayTransitions && et.runwayTransitions.length > 0) {
          const wantRwy = rt.runwayId.replace(/^RW/i, "").trim().toUpperCase();
          const rtMatch = et.runwayTransitions.find(
            (r) => r.runwayId.replace(/^RW/i, "").trim().toUpperCase() === wantRwy,
          );
          if (rtMatch) {
            etLegs = rtMatch.legs;
          }
        }
        if (!etLegs) {
          etLegs = et.legs ?? et.runwayTransitions?.[0]?.legs;
        }
        if (etLegs) {
          for (const leg of etLegs) {
            const fixId = wantFix(leg.fixId);
            if (route.length === 0 || route[route.length - 1] !== fixId) {
              route.push(fixId);
            }
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
  /** Named STAR transition. Omit to keep the existing no-guess VIA path. */
  transitionId?: string;
  /** Scenario active runway; runway-tagged transitions must match. */
  activeRunwayId?: string | null;
  current?:
    | {
        type: "PROCEDURE";
        starId?: string;
        sidId?: string;
        routeFixIds: readonly string[];
        toFixIndex: number;
      }
    | { type: "DIRECT"; fixId: string }
    | null;
  xNm?: number;
  yNm?: number;
  fixXy?: (id: string) => { xNm: number; yNm: number } | undefined;
}

export type StarTransitionJoinReason =
  "UNKNOWN_PROCEDURE" | "UNKNOWN_TRANSITION" | "AMBIGUOUS_TRANSITION" | "NOT_ON_COURSE";

export interface JoinStarTransitionArgs {
  catalog?: ProcedureJoinCatalog | null;
  procedureId: string;
  transitionId: string;
  activeRunwayId?: string | null;
  remainingFixIds?: readonly string[] | null;
  /** Full current PROCEDURE route; used to retain the SID runway after it is sequenced. */
  currentRouteFixIds?: readonly string[] | null;
}

export type JoinStarTransitionResult =
  { ok: true; join: ProcedureJoin } | { ok: false; reason: StarTransitionJoinReason };

function padRunwayId(runwayId: string): string {
  const clean = runwayId.replace(/^RW/i, "").trim().toUpperCase();
  const side = /[LRC]$/.test(clean) ? clean.slice(-1) : "";
  const num = side ? clean.slice(0, -1) : clean;
  return `${num.padStart(2, "0")}${side}`;
}

function isRunwayTagged(transition: { runwayId?: string; runways?: readonly string[] }): boolean {
  return transition.runwayId !== undefined || (transition.runways?.length ?? 0) > 0;
}

function transitionMatchesActiveRunway(
  transition: { runwayId?: string; runways?: readonly string[] },
  activeRunwayId: string,
): boolean {
  const want = padRunwayId(activeRunwayId);
  if (transition.runwayId !== undefined && padRunwayId(transition.runwayId) === want) {
    return true;
  }
  return transition.runways?.some((id) => padRunwayId(id) === want) ?? false;
}

function starRouteFromTransition(
  star: CatalogStar,
  transition: NonNullable<CatalogStar["transitions"]>[number],
): string[] {
  const commonIds = (star.common ?? []).map((leg) => wantFix(leg.fixId));
  const route = transition.legs.map((leg) => wantFix(leg.fixId));
  for (const fixId of commonIds) {
    if (route.length === 0 || route[route.length - 1] !== fixId) {
      route.push(fixId);
    }
  }
  return route;
}

/**
 * Analog: JO 7110.65 Descend Via / arrival amendment (R01); AIM procedure-name
 * and transition phraseology (R03). Trainer delta: join is catalog-backed JSON,
 * not NAS adaptation. Prove a shared remaining-route fix before mutating path.
 */
export function joinStarTransition(args: JoinStarTransitionArgs): JoinStarTransitionResult {
  const wantProc = wantFix(args.procedureId);
  const wantTrans = wantFix(args.transitionId);
  if (!wantProc) {
    return { ok: false, reason: "UNKNOWN_PROCEDURE" };
  }
  if (!wantTrans || !args.catalog) {
    return { ok: false, reason: "UNKNOWN_TRANSITION" };
  }

  const stars = (args.catalog.stars ?? []).filter((star) => wantFix(star.id) === wantProc);
  if (stars.length === 0) {
    return { ok: false, reason: "UNKNOWN_PROCEDURE" };
  }

  type Eligible = {
    star: CatalogStar;
    transition: NonNullable<CatalogStar["transitions"]>[number];
  };
  const eligible: Eligible[] = [];
  for (const star of stars) {
    for (const transition of star.transitions ?? []) {
      if (wantFix(transition.id) !== wantTrans) {
        continue;
      }
      if (isRunwayTagged(transition)) {
        if (
          !args.activeRunwayId ||
          !transitionMatchesActiveRunway(transition, args.activeRunwayId)
        ) {
          continue;
        }
      }
      eligible.push({ star, transition });
    }
  }
  if (eligible.length === 0) {
    return { ok: false, reason: "UNKNOWN_TRANSITION" };
  }
  if (eligible.length > 1) {
    return { ok: false, reason: "AMBIGUOUS_TRANSITION" };
  }

  const { star, transition } = eligible[0]!;
  const transitionRoute = starRouteFromTransition(star, transition);
  const remaining = (args.remainingFixIds ?? [])
    .map((id) => wantFix(id))
    .filter((id) => id.length > 0);
  const commonFix = remaining.find((fixId) => transitionRoute.includes(fixId));
  if (!commonFix) {
    return { ok: false, reason: "NOT_ON_COURSE" };
  }
  const joinIndex = transitionRoute.indexOf(commonFix);
  return {
    ok: true,
    join: {
      starId: star.id,
      routeFixIds: transitionRoute.slice(joinIndex),
      toFixIndex: 0,
    },
  };
}

function sidLegFixIds(legs: readonly CatalogSidLeg[] | undefined): string[] {
  return (legs ?? []).map((leg) => wantFix(leg.fixId)).filter((id) => id.length > 0);
}

function appendUniqueFixIds(route: string[], fixIds: readonly string[]): void {
  for (const fixId of fixIds) {
    if (route.length === 0 || route[route.length - 1] !== fixId) {
      route.push(fixId);
    }
  }
}

function composeSidRoute(
  sid: CatalogSid,
  runwayId: string | undefined,
  enrouteId: string | undefined,
): string[] {
  const route: string[] = [];
  const wantRwy = runwayId ? padRunwayId(runwayId) : undefined;
  if (wantRwy) {
    const rt = sid.runwayTransitions?.find((item) => padRunwayId(item.runwayId) === wantRwy);
    if (rt) {
      appendUniqueFixIds(route, sidLegFixIds(rt.legs));
    }
  }
  appendUniqueFixIds(route, sidLegFixIds(sid.common));
  if (enrouteId) {
    const wantEt = wantFix(enrouteId);
    const et = sid.enrouteTransitions?.find((item) => wantFix(item.id) === wantEt);
    if (et) {
      let etLegs = et.legs;
      if (wantRwy && et.runwayTransitions && et.runwayTransitions.length > 0) {
        const rtMatch = et.runwayTransitions.find((item) => padRunwayId(item.runwayId) === wantRwy);
        if (rtMatch) {
          etLegs = rtMatch.legs;
        }
      }
      if (!etLegs) {
        etLegs = et.runwayTransitions?.[0]?.legs;
      }
      appendUniqueFixIds(route, sidLegFixIds(etLegs));
    }
  }
  return route;
}

function sidRunwayIds(sid: CatalogSid): string[] {
  return (sid.runwayTransitions ?? []).map((item) => item.runwayId);
}

function exclusiveSidRunwayFixes(sid: CatalogSid, runwayId: string): Set<string> {
  const want = padRunwayId(runwayId);
  const own = new Set<string>();
  const shared = new Set<string>(sidLegFixIds(sid.common));
  for (const rt of sid.runwayTransitions ?? []) {
    const ids = sidLegFixIds(rt.legs);
    if (padRunwayId(rt.runwayId) === want) {
      for (const id of ids) {
        own.add(id);
      }
    } else {
      for (const id of ids) {
        shared.add(id);
      }
    }
  }
  for (const id of shared) {
    own.delete(id);
  }
  return own;
}

function exclusiveSidEnrouteFixes(sid: CatalogSid, enrouteId: string): Set<string> {
  const want = wantFix(enrouteId);
  const own = new Set<string>();
  const shared = new Set<string>(sidLegFixIds(sid.common));
  for (const rt of sid.runwayTransitions ?? []) {
    for (const id of sidLegFixIds(rt.legs)) {
      shared.add(id);
    }
  }
  for (const et of sid.enrouteTransitions ?? []) {
    const ids = [
      ...sidLegFixIds(et.legs),
      ...(et.runwayTransitions ?? []).flatMap((rt) => sidLegFixIds(rt.legs)),
    ];
    if (wantFix(et.id) === want) {
      for (const id of ids) {
        own.add(id);
      }
    } else {
      for (const id of ids) {
        shared.add(id);
      }
    }
  }
  for (const id of shared) {
    own.delete(id);
  }
  return own;
}

function inferSidRunwayId(
  sid: CatalogSid,
  routeFixIds: readonly string[],
  activeRunwayId?: string | null,
): string | undefined {
  const hits: string[] = [];
  for (const rt of sid.runwayTransitions ?? []) {
    const exclusive = exclusiveSidRunwayFixes(sid, rt.runwayId);
    if (routeFixIds.some((id) => exclusive.has(wantFix(id)))) {
      hits.push(rt.runwayId);
    }
  }
  if (hits.length === 1) {
    return hits[0];
  }
  if (activeRunwayId) {
    const match = sid.runwayTransitions?.find(
      (item) => padRunwayId(item.runwayId) === padRunwayId(activeRunwayId),
    );
    if (match) {
      return match.runwayId;
    }
  }
  if ((sid.runwayTransitions?.length ?? 0) === 1) {
    return sid.runwayTransitions![0]!.runwayId;
  }
  return undefined;
}

function inferSidEnrouteId(sid: CatalogSid, routeFixIds: readonly string[]): string | undefined {
  const hits: string[] = [];
  for (const et of sid.enrouteTransitions ?? []) {
    const exclusive = exclusiveSidEnrouteFixes(sid, et.id);
    if (routeFixIds.some((id) => exclusive.has(wantFix(id)))) {
      hits.push(et.id);
    }
  }
  if (hits.length === 1) {
    return hits[0];
  }
  if ((sid.enrouteTransitions?.length ?? 0) === 1) {
    return sid.enrouteTransitions![0]!.id;
  }
  return undefined;
}

function matchSidRunwayTransition(
  sid: CatalogSid,
  transitionId: string,
): CatalogSidRunwayTransition | undefined {
  const want = wantFix(transitionId);
  const padded = padRunwayId(transitionId);
  return sid.runwayTransitions?.find((item) => {
    const rtPad = padRunwayId(item.runwayId);
    return rtPad === padded || wantFix(`RW${rtPad}`) === want;
  });
}

function firstSharedFix(
  remaining: readonly string[],
  route: readonly string[],
): string | undefined {
  return remaining.find((fixId) => route.includes(fixId));
}

function joinAtSharedFix(
  sidId: string,
  route: string[],
  remaining: readonly string[],
): JoinStarTransitionResult {
  const commonFix = firstSharedFix(remaining, route);
  if (!commonFix) {
    return { ok: false, reason: "NOT_ON_COURSE" };
  }
  const joinIndex = route.indexOf(commonFix);
  return {
    ok: true,
    join: {
      starId: sidId,
      routeFixIds: route.slice(joinIndex),
      toFixIndex: 0,
    },
  };
}

/**
 * Analog: JO 7110.65 Climb Via / SID amendment (R01); AIM procedure-name and
 * transition phraseology (R03). Trainer delta: join is catalog JSON, not NAS.
 * Named enroute keeps the active runway transition and switches only at a
 * shared remaining-route fix. Runway-transition change only while still on
 * runway-transition legs. Catalog fixIds only — never flatten RF/hold/heading
 * legs into TF.
 */
export function joinSidTransition(args: JoinStarTransitionArgs): JoinStarTransitionResult {
  const wantProc = wantFix(args.procedureId);
  const wantTrans = wantFix(args.transitionId);
  if (!wantProc) {
    return { ok: false, reason: "UNKNOWN_PROCEDURE" };
  }
  if (!wantTrans || !args.catalog) {
    return { ok: false, reason: "UNKNOWN_TRANSITION" };
  }

  const sids = (args.catalog.sids ?? []).filter((sid) => wantFix(sid.id) === wantProc);
  if (sids.length === 0) {
    return { ok: false, reason: "UNKNOWN_PROCEDURE" };
  }

  type EnrouteHit = {
    sid: CatalogSid;
    transition: NonNullable<CatalogSid["enrouteTransitions"]>[number];
  };
  const enrouteHits: EnrouteHit[] = [];
  for (const sid of sids) {
    for (const transition of sid.enrouteTransitions ?? []) {
      if (wantFix(transition.id) === wantTrans) {
        enrouteHits.push({ sid, transition });
      }
    }
  }
  if (enrouteHits.length > 1) {
    return { ok: false, reason: "AMBIGUOUS_TRANSITION" };
  }
  if (enrouteHits.length === 1) {
    return joinSidEnrouteAmendment(enrouteHits[0]!.sid, enrouteHits[0]!.transition.id, args);
  }

  type RunwayHit = { sid: CatalogSid; runwayId: string };
  const runwayHits: RunwayHit[] = [];
  for (const sid of sids) {
    const rt = matchSidRunwayTransition(sid, wantTrans);
    if (rt) {
      runwayHits.push({ sid, runwayId: rt.runwayId });
    }
  }
  if (runwayHits.length === 0) {
    return { ok: false, reason: "UNKNOWN_TRANSITION" };
  }
  if (runwayHits.length > 1) {
    return { ok: false, reason: "AMBIGUOUS_TRANSITION" };
  }
  return joinSidRunwayAmendment(runwayHits[0]!.sid, runwayHits[0]!.runwayId, args);
}

function hintRouteFixIds(args: JoinStarTransitionArgs): string[] {
  const current = (args.currentRouteFixIds ?? [])
    .map((id) => wantFix(id))
    .filter((id) => id.length > 0);
  if (current.length > 0) {
    return current;
  }
  return (args.remainingFixIds ?? []).map((id) => wantFix(id)).filter((id) => id.length > 0);
}

function remainingOrEmpty(args: JoinStarTransitionArgs): string[] {
  return (args.remainingFixIds ?? []).map((id) => wantFix(id)).filter((id) => id.length > 0);
}

function joinSidEnrouteAmendment(
  sid: CatalogSid,
  enrouteId: string,
  args: JoinStarTransitionArgs,
): JoinStarTransitionResult {
  const remaining = remainingOrEmpty(args);
  const hint = hintRouteFixIds(args);
  const inferredRwy = inferSidRunwayId(sid, hint, args.activeRunwayId);
  const candidates: string[][] = [];
  if (inferredRwy) {
    candidates.push(composeSidRoute(sid, inferredRwy, enrouteId));
  } else if (sidRunwayIds(sid).length === 0) {
    candidates.push(composeSidRoute(sid, undefined, enrouteId));
  } else {
    for (const runwayId of sidRunwayIds(sid)) {
      candidates.push(composeSidRoute(sid, runwayId, enrouteId));
    }
    candidates.push(composeSidRoute(sid, undefined, enrouteId));
  }
  const unique = candidates.filter((route, index, all) => {
    const key = route.join(">");
    return key.length > 0 && all.findIndex((item) => item.join(">") === key) === index;
  });
  const commonFix = remaining.find((fixId) => unique.some((route) => route.includes(fixId)));
  if (!commonFix) {
    return { ok: false, reason: "NOT_ON_COURSE" };
  }
  const matching = unique.filter((route) => route.includes(commonFix));
  const suffixes = matching.map((route) => route.slice(route.indexOf(commonFix)));
  const firstKey = suffixes[0]!.join(">");
  if (suffixes.some((item) => item.join(">") !== firstKey)) {
    return { ok: false, reason: "AMBIGUOUS_TRANSITION" };
  }
  return {
    ok: true,
    join: { starId: sid.id, routeFixIds: suffixes[0]!, toFixIndex: 0 },
  };
}

function joinSidRunwayAmendment(
  sid: CatalogSid,
  runwayId: string,
  args: JoinStarTransitionArgs,
): JoinStarTransitionResult {
  const remaining = remainingOrEmpty(args);
  const hint = hintRouteFixIds(args);
  const currentRwy = inferSidRunwayId(sid, hint, args.activeRunwayId);
  if (!currentRwy) {
    return { ok: false, reason: "NOT_ON_COURSE" };
  }
  const runwayFixes = exclusiveSidRunwayFixes(sid, currentRwy);
  const stillOnRunway = remaining.some((id) => runwayFixes.has(id));
  if (!stillOnRunway) {
    return { ok: false, reason: "NOT_ON_COURSE" };
  }
  const currentEt = inferSidEnrouteId(sid, hint);
  const route = composeSidRoute(sid, runwayId, currentEt);
  return joinAtSharedFix(sid.id, route, remaining);
}

/**
 * STAR first (T04-43), then SID (T04-44). Unknown STAR id is not a SID miss
 * when the id exists on `catalog.sids`.
 */
export function joinProcedureTransition(args: JoinStarTransitionArgs): JoinStarTransitionResult {
  const stars = (args.catalog?.stars ?? []).filter(
    (star) => wantFix(star.id) === wantFix(args.procedureId),
  );
  if (stars.length > 0) {
    return joinStarTransition(args);
  }
  return joinSidTransition(args);
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
  if (args.transitionId) {
    const currentProc = args.current?.type === "PROCEDURE" ? args.current : null;
    const onThisProc =
      currentProc &&
      ((currentProc.starId && wantFix(currentProc.starId) === want) ||
        (currentProc.sidId && wantFix(currentProc.sidId) === want));
    const remainingFixIds = onThisProc
      ? currentProc.routeFixIds.slice(currentProc.toFixIndex)
      : undefined;
    const currentRouteFixIds = onThisProc ? currentProc.routeFixIds : undefined;
    const resolved = joinProcedureTransition({
      catalog: args.catalog,
      procedureId: args.procedureId,
      transitionId: args.transitionId,
      activeRunwayId: args.activeRunwayId,
      remainingFixIds,
      currentRouteFixIds,
    });
    return resolved.ok ? resolved.join : undefined;
  }
  const current = args.current;
  if (current?.type === "PROCEDURE" && current.starId && wantFix(current.starId) === want) {
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
