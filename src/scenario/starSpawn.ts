/**
 * Analog: JO 7110.65 descend via / AIM Descend Via — fly the published STAR
 * lateral path and the published altitude/speed restrictions.
 * Trainer delta: inbound spawn pose is derived from catalog first-transition-leg
 * plus first-leg course, not chart scrape. Not NAS STARS.
 */

import { buildFixRegistry, courseDeg, normalizeHeadingDeg, type NmPoint } from "@core";
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
