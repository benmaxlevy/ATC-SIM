/**
 * Analog: JO 7110.65 descend via / AIM Descend Via — fly the published STAR
 * lateral path and the published altitude/speed restrictions.
 * Trainer delta: inbound spawn pose is derived from catalog first-transition-leg
 * plus first-leg course, not chart scrape. Not NAS STARS.
 */

import { buildFixRegistry, courseDeg, mulberry32, normalizeHeadingDeg, type NmPoint } from "@core";
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
/** Along-track gap used by T04-14 trailers on the same transition. */
export const STAR_SPAWN_STAGGER_NM = 2;
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

/** Every `(starId, transitionId)` pair in catalog array order. */
export function listStarSlots(catalog: ProcedureCatalog): StarSlot[] {
  const slots: StarSlot[] = [];
  for (const star of catalog.stars) {
    for (const transition of star.transitions) {
      slots.push({ starId: star.id, transitionId: transition.id });
    }
  }
  return slots;
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

/**
 * Analog: JO 7110.65 descend via / AIM Descend Via — spawned traffic already
 * complies with the published STAR (VIA armed; same as T04-12 spawn-on-VIA).
 * Trainer delta: pose from catalog first-leg + seed mix over `(starId,
 * transitionId)` slots. Not random vectors. Not NAS STARS.
 */
export function assignStarRoutes(args: {
  catalog: ProcedureCatalog;
  count: number;
  seed: number;
}): StarRouteAssignment[] {
  const { catalog, count, seed } = args;
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`assignStarRoutes count must be a non-negative integer (got ${String(count)})`);
  }
  const slots = listStarSlots(catalog);
  if (count > 0 && slots.length === 0) {
    throw new Error("assignStarRoutes needs at least one STAR transition slot");
  }
  const rng = mulberry32(seed >>> 0);
  const stackNext = new Map<string, number>();
  const assignments: StarRouteAssignment[] = [];
  for (let i = 0; i < count; i += 1) {
    let slot: StarSlot;
    if (i < slots.length) {
      slot = slots[i]!;
    } else {
      const idx = Math.min(Math.floor(rng() * slots.length), slots.length - 1);
      slot = slots[idx]!;
    }
    const key = slotKey(slot);
    const stackIndex = stackNext.get(key) ?? 0;
    stackNext.set(key, stackIndex + 1);
    const alongTrackOffsetNm = STAR_SPAWN_GATE_OFFSET_NM + stackIndex * STAR_SPAWN_STAGGER_NM;
    assignments.push({
      starId: slot.starId,
      transitionId: slot.transitionId,
      stackIndex,
      pose: starInboundPose(catalog, slot.starId, slot.transitionId, alongTrackOffsetNm),
    });
  }
  return assignments;
}
