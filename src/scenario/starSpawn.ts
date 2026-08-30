/**
 * Analog: JO 7110.65 descend via / AIM Descend Via — fly the published STAR
 * lateral path and the published altitude/speed restrictions.
 * Trainer delta: inbound spawn pose is derived from catalog first-transition-leg
 * plus first-leg course, not chart scrape. Not NAS STARS.
 */

import {
  alongTrackNm,
  buildFixRegistry,
  courseDeg,
  DIRECT_SEQUENCE_NM,
  distanceNm,
  mulberry32,
  normalizeHeadingDeg,
  type NmPoint,
} from "@core";
import { resolveRunwayHeading, resolveRunwayThreshold } from "./departureSpawn";
import type {
  AltConstraint,
  ProcedureCatalog,
  SpeedConstraint,
  StarLeg,
  StarProcedure,
  StarTransition,
} from "./procedures/types";

export interface StarSlot {
  starId: string;
  transitionId: string;
}

export interface OutermostStarFix {
  fixId: string;
  xNm: number;
  yNm: number;
}

export interface StarInboundPose {
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
  routeFixIds: string[];
  /** Always 0 — aircraft is inbound to the gate fix. */
  toFixIndex: 0;
  gateFixId: string;
}

export interface StarRouteAssignment {
  starId: string;
  transitionId: string;
  stackIndex: number;
  pose: StarInboundPose;
}

/** Extra NM before the gate so distance(gate) > 0 and heading is defined. */
export const STAR_SPAWN_GATE_OFFSET_NM = 0.25;
/**
 * Along-track gap for trailers on the same transition.
 * 2 NM sat inside CA (3 NM / 1000 ft) so same-STAR jets painted as a pile.
 * 8 NM is in-trail on the first-leg extension and stays clear of CA.
 */
export const STAR_SPAWN_STAGGER_NM = 8;
/** Seeded variation avoids mirrored arrival pairs on matching STAR transitions. */
export const STAR_SPAWN_STAGGER_JITTER_NM = 4;
/** Spawn above an AT_OR_ABOVE so VIA has room to descend (T04-12 used 11000). */
export const STAR_SPAWN_VIA_ALT_MARGIN_FT = 1000;

function findStarTransition(
  catalog: ProcedureCatalog,
  starId: string,
  transitionId: string,
): { star: StarProcedure; transition: StarTransition } {
  const wantStar = starId.trim().toUpperCase();
  const wantTrans = transitionId.trim().toUpperCase();
  const star = catalog.stars.find((item) => item.id.trim().toUpperCase() === wantStar);
  if (!star) {
    throw new Error(`Unknown STAR ${starId}`);
  }
  const transition = star.transitions.find((item) => item.id.trim().toUpperCase() === wantTrans);
  if (!transition) {
    throw new Error(`Unknown transition ${transitionId} on ${starId}`);
  }
  return { star, transition };
}

function requireGateLeg(catalog: ProcedureCatalog, starId: string, transitionId: string): StarLeg {
  const { transition } = findStarTransition(catalog, starId, transitionId);
  const leg = transition.legs[0];
  if (!leg) {
    throw new Error(`Empty transition legs on ${starId} ${transitionId}`);
  }
  return leg;
}

function fixXy(catalog: ProcedureCatalog, fixId: string): NmPoint {
  const registered = buildFixRegistry(catalog).require(fixId);
  return { xNm: registered.xNm, yNm: registered.yNm };
}

function spawnAltitudeFt(constraint: AltConstraint | undefined, gateFixId: string): number {
  if (!constraint) {
    throw new Error(`STAR gate ${gateFixId} has no altitude constraint`);
  }
  const raw =
    constraint.type === "AT_OR_ABOVE"
      ? constraint.altitudeFt + STAR_SPAWN_VIA_ALT_MARGIN_FT
      : constraint.altitudeFt;
  return Math.round(raw / 100) * 100;
}

function spawnSpeedKt(constraint: SpeedConstraint | undefined, gateFixId: string): number {
  if (!constraint) {
    throw new Error(`STAR gate ${gateFixId} has no speed constraint`);
  }
  return constraint.speedKt;
}

/**
 * Resolve transition legs then common (ids only — xy comes from the catalog).
 */
export function starRouteFixIds(
  catalog: ProcedureCatalog,
  starId: string,
  transitionId: string,
): string[] {
  const { star, transition } = findStarTransition(catalog, starId, transitionId);
  return [...transition.legs.map((leg) => leg.fixId), ...star.common.map((leg) => leg.fixId)];
}

/**
 * First unpassed STAR fix for an authored pose. Gate-offset spawns stay index
 * 0. Mid-STAR poses skip fixes already behind the aircraft so VIA does not
 * turn outbound toward a gate outside the range rings.
 */
export function authoredStarToFixIndex(
  catalog: ProcedureCatalog,
  starId: string,
  transitionId: string,
  pose: NmPoint,
): number {
  const routeFixIds = starRouteFixIds(catalog, starId, transitionId);
  if (routeFixIds.length === 0) {
    throw new Error(`STAR ${starId} ${transitionId} has no route fixes`);
  }
  const registry = buildFixRegistry(catalog);
  for (let i = 0; i < routeFixIds.length; i += 1) {
    const current = registry.require(routeFixIds[i]!);
    let next: NmPoint | undefined;
    for (let nextIndex = i + 1; nextIndex < routeFixIds.length; nextIndex += 1) {
      const candidate = registry.require(routeFixIds[nextIndex]!);
      if (distanceNm(current, candidate) > 1e-6) {
        next = candidate;
        break;
      }
    }
    if (!next) {
      return i;
    }
    const along = alongTrackNm(current, pose, courseDeg(current, next));
    if (along < DIRECT_SEQUENCE_NM) {
      return i;
    }
  }
  return routeFixIds.length - 1;
}

/** Every `(starId, transitionId)` pair matching activeRunwayId (or all if omitted/fallback) in catalog array order. */
export function listStarSlots(catalog: ProcedureCatalog, activeRunwayId?: string): StarSlot[] {
  const allSlots: StarSlot[] = [];
  for (const star of catalog.stars) {
    for (const transition of star.transitions) {
      allSlots.push({ starId: star.id, transitionId: transition.id });
    }
  }

  if (!activeRunwayId) {
    return allSlots;
  }

  const cleanRwy = activeRunwayId.replace(/^RW/i, "").trim().toUpperCase();
  const paddedRwy = cleanRwy.length === 1 ? cleanRwy.padStart(2, "0") : cleanRwy;

  // 1. Explicit runway tagging on transition
  const explicitMatches: StarSlot[] = [];
  for (const star of catalog.stars) {
    for (const transition of star.transitions) {
      const rId = transition.runwayId?.replace(/^RW/i, "").trim().toUpperCase();
      const rIdPadded = rId?.length === 1 ? rId.padStart(2, "0") : rId;
      const matchId = rId && (rId === cleanRwy || rIdPadded === paddedRwy);
      const matchRunways = transition.runways?.some((r) => {
        const c = r.replace(/^RW/i, "").trim().toUpperCase();
        const cp = c.length === 1 ? c.padStart(2, "0") : c;
        return c === cleanRwy || cp === paddedRwy;
      });
      if (matchId || matchRunways) {
        explicitMatches.push({ starId: star.id, transitionId: transition.id });
      }
    }
  }
  if (explicitMatches.length > 0) {
    return explicitMatches;
  }

  // If runway does not exist at this facility, fallback to all slots
  const hasRunway =
    catalog.fixes.some(
      (f) =>
        f.kind === "THRESHOLD" &&
        (f.id.toUpperCase() === `RW${cleanRwy}` ||
          f.id.toUpperCase() === `RW${paddedRwy}` ||
          f.id.toUpperCase() === cleanRwy ||
          f.id.toUpperCase() === paddedRwy),
    ) ||
    catalog.approaches.some((app) => {
      const r = app.runway.replace(/^RW/i, "").trim().toUpperCase();
      return r === cleanRwy || r === paddedRwy;
    }) ||
    catalog.sids.some((s) =>
      s.runwayTransitions?.some((rt) => {
        const r = rt.runwayId.replace(/^RW/i, "").trim().toUpperCase();
        return r === cleanRwy || r === paddedRwy;
      }),
    );

  if (!hasRunway) {
    return allSlots;
  }

  // 2. Geometric flow alignment heuristic toward runway threshold
  const threshold = resolveRunwayThreshold(catalog, activeRunwayId);
  const rwyHeading = resolveRunwayHeading(catalog, undefined, activeRunwayId);
  const geoMatches: StarSlot[] = [];

  for (const star of catalog.stars) {
    for (const transition of star.transitions) {
      const lastFixId =
        star.common.length > 0
          ? star.common[star.common.length - 1]!.fixId
          : transition.legs[transition.legs.length - 1]?.fixId;
      if (!lastFixId) continue;
      try {
        const lastFix = fixXy(catalog, lastFixId);
        const bearingToThreshold = courseDeg(lastFix, threshold);
        let diffDeg = Math.abs(normalizeHeadingDeg(bearingToThreshold - rwyHeading));
        if (diffDeg > 180) {
          diffDeg = 360 - diffDeg;
        }
        if (diffDeg <= 90) {
          geoMatches.push({ starId: star.id, transitionId: transition.id });
        }
      } catch {
        // ignore missing fix
      }
    }
  }

  if (geoMatches.length > 0) {
    return geoMatches;
  }

  // 3. Graceful fallback
  return allSlots;
}

/**
 * First published transition leg — never `common[0]`, never an ILS FAF.
 */
export function outermostStarFix(
  catalog: ProcedureCatalog,
  starId: string,
  transitionId: string,
): OutermostStarFix {
  const leg = requireGateLeg(catalog, starId, transitionId);
  const xy = fixXy(catalog, leg.fixId);
  return { fixId: leg.fixId, xNm: xy.xNm, yNm: xy.yNm };
}

/**
 * Aircraft on the first-leg inbound extension, heading toward the gate.
 */
export function starInboundPose(
  catalog: ProcedureCatalog,
  starId: string,
  transitionId: string,
  alongTrackOffsetNm: number,
): StarInboundPose {
  if (!Number.isFinite(alongTrackOffsetNm) || alongTrackOffsetNm < 0) {
    throw new Error(
      `alongTrackOffsetNm must be a finite non-negative number (got ${String(alongTrackOffsetNm)})`,
    );
  }
  const gateLeg = requireGateLeg(catalog, starId, transitionId);
  const routeFixIds = starRouteFixIds(catalog, starId, transitionId);
  const nextFixId = routeFixIds[1];
  if (!nextFixId) {
    throw new Error(`STAR ${starId} ${transitionId} has no next fix after the gate`);
  }
  const gate = fixXy(catalog, gateLeg.fixId);
  const next = fixXy(catalog, nextFixId);
  const headingDeg = courseDeg(gate, next);
  const backAzimuth = normalizeHeadingDeg(headingDeg + 180);
  const rad = (backAzimuth * Math.PI) / 180;
  return {
    xNm: gate.xNm + alongTrackOffsetNm * Math.sin(rad),
    yNm: gate.yNm + alongTrackOffsetNm * Math.cos(rad),
    headingDeg,
    altitudeFt: spawnAltitudeFt(gateLeg.altConstraint, gateLeg.fixId),
    speedKt: spawnSpeedKt(gateLeg.speedConstraint, gateLeg.fixId),
    routeFixIds,
    toFixIndex: 0,
    gateFixId: gateLeg.fixId,
  };
}

function slotKey(slot: StarSlot): string {
  return `${slot.starId}\0${slot.transitionId}`;
}

export interface AssignStarRoutesArgs {
  catalog: ProcedureCatalog;
  count: number;
  seed: number;
  activeRunwayId?: string;
}

/**
 * Analog: JO 7110.65 descend via / AIM Descend Via — spawned traffic already
 * complies with the published STAR (VIA armed; same as T04-12 spawn-on-VIA).
 * Trainer delta: seeded slot mix over catalog STAR transitions. Small packs
 * stack the first chosen transition so north/south STARs do not spawn as a
 * mirrored pair. Later remainder draws may still mix slots. Not NAS STARS.
 */
export function assignStarRoutes(args: AssignStarRoutesArgs): StarRouteAssignment[] {
  const { catalog, count, seed, activeRunwayId } = args;
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`assignStarRoutes count must be a non-negative integer (got ${String(count)})`);
  }
  const slots = listStarSlots(catalog, activeRunwayId);
  if (count > 0 && slots.length === 0) {
    throw new Error("assignStarRoutes needs at least one STAR transition slot");
  }
  const rng = mulberry32(seed >>> 0);
  const stackNext = new Map<string, number>();
  const assignments: StarRouteAssignment[] = [];
  const stackOnPrimary = Math.min(count, Math.max(2, Math.ceil(count / 2)));
  const primaryIdx =
    slots.length === 0 ? 0 : Math.min(Math.floor(rng() * slots.length), slots.length - 1);
  for (let i = 0; i < count; i += 1) {
    const idx =
      i < stackOnPrimary
        ? primaryIdx
        : Math.min(Math.floor(rng() * slots.length), slots.length - 1);
    const slot = slots[idx]!;
    const key = slotKey(slot);
    const stackIndex = stackNext.get(key) ?? 0;
    stackNext.set(key, stackIndex + 1);
    const alongTrackOffsetNm =
      STAR_SPAWN_GATE_OFFSET_NM +
      stackIndex * STAR_SPAWN_STAGGER_NM +
      rng() * STAR_SPAWN_STAGGER_JITTER_NM;
    assignments.push({
      starId: slot.starId,
      transitionId: slot.transitionId,
      stackIndex,
      pose: starInboundPose(catalog, slot.starId, slot.transitionId, alongTrackOffsetNm),
    });
  }
  return assignments;
}
