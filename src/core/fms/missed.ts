/**
 * Missed-approach stub (T04-07). DA or GO_AROUND leaves loc/GS, climbs the
 * published heading to climbToFt, then DIRECT to the missed fix.
 *
 * Analog: 7110.65 missed / go-around. Trainer delta: one heading + climb +
 * one DIRECT; no hold, no navaid-defined missed beyond that. Not NAS-certified.
 *
 * Heading still cancels this lateral path (applyIntent). LANDING / landingCleared
 * inhibit DA so T04-12 can prevent missed; this module does not despawn.
 */

import type { Aircraft } from "../aircraft";
import type { SessionLog } from "../events/session-log";

export const DEFAULT_DA_FT = 200;
export const DEFAULT_MISSED_HEADING_DEG = 270;
export const DEFAULT_MISSED_CLIMB_FT = 3000;
/** Level-off window before sequencing DIRECT (ticket ±100 ft). */
export const MISSED_LEVEL_TOLERANCE_FT = 100;

export interface MissedApproachSpec {
  headingDeg: number;
  climbToFt: number;
  directFixId?: string;
  daFt: number;
}

export interface MissedCatalogApproach {
  id: string;
  daFt?: number;
  missed?: {
    headingDeg: number;
    climbToFt: number;
    directFixId?: string;
  };
}

export interface MissedCatalog {
  approaches: ReadonlyArray<MissedCatalogApproach>;
}

export interface MissedFmsContext {
  catalog?: MissedCatalog | null;
  log?: SessionLog | null;
  simTimeMs: number;
}

export function isLandingInhibited(ac: Aircraft): boolean {
  if (ac.intent.landingCleared === true) {
    return true;
  }
  return ac.intent.lateral?.type === "LANDING";
}

export function isOnMissed(ac: Aircraft): boolean {
  return ac.intent.lateral?.type === "MISSED" || ac.intent.vertical?.type === "MISSED_CLIMB";
}

export function missedApproachId(ac: Aircraft): string | null {
  if (ac.intent.clearedApproachId) {
    return ac.intent.clearedApproachId;
  }
  const lateral = ac.intent.lateral;
  if (
    lateral &&
    (lateral.type === "INTERCEPT_LOC" ||
      lateral.type === "LOC" ||
      lateral.type === "MISSED" ||
      lateral.type === "LANDING")
  ) {
    return lateral.approachId;
  }
  const vertical = ac.intent.vertical;
  if (vertical?.type === "GS") {
    return vertical.approachId;
  }
  return null;
}

export function missedSpecFor(
  approachId: string,
  catalog?: MissedCatalog | null,
): MissedApproachSpec {
  const want = approachId.trim().toUpperCase();
  const approach = catalog?.approaches.find((item) => item.id.trim().toUpperCase() === want);
  return {
    headingDeg: approach?.missed?.headingDeg ?? DEFAULT_MISSED_HEADING_DEG,
    climbToFt: approach?.missed?.climbToFt ?? DEFAULT_MISSED_CLIMB_FT,
    directFixId: approach?.missed?.directFixId,
    daFt: approach?.daFt ?? DEFAULT_DA_FT,
  };
}

/**
 * Edge-triggered: first tick at/below DA on GS or LOC, or GO_AROUND.
 * Returns true when the missed path was armed this call.
 */
export function beginMissedApproach(
  ac: Aircraft,
  spec: MissedApproachSpec,
  ctx: { log?: SessionLog | null; simTimeMs: number },
  approachId: string,
): boolean {
  if (isLandingInhibited(ac) || isOnMissed(ac)) {
    return false;
  }
  ac.intent.assignedHeadingDeg = spec.headingDeg;
  ac.intent.turn = "SHORTEST";
  ac.intent.assignedAltitudeFt = spec.climbToFt;
  ac.intent.lateral = { type: "MISSED", approachId };
  ac.intent.vertical = { type: "MISSED_CLIMB", altitudeFt: spec.climbToFt };
  ac.intent.cross = undefined;
  ac.intent.locInterceptApproachId = null;
  ctx.log?.append({
    type: "nav.missed.started",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    approachId,
  });
  return true;
}

function shouldStartMissedAtDa(ac: Aircraft, daFt: number): boolean {
  if (isLandingInhibited(ac) || isOnMissed(ac)) {
    return false;
  }
  if (ac.altitudeFt > daFt) {
    return false;
  }
  const onGs = ac.intent.vertical?.type === "GS";
  const onLoc = ac.intent.lateral?.type === "LOC" && Boolean(ac.intent.clearedApproachId);
  return onGs || onLoc;
}

function maybeSequenceMissedDirect(ac: Aircraft, spec: MissedApproachSpec): void {
  if (ac.intent.lateral?.type !== "MISSED") {
    return;
  }
  if (ac.intent.vertical?.type !== "MISSED_CLIMB") {
    return;
  }
  if (Math.abs(ac.altitudeFt - spec.climbToFt) > MISSED_LEVEL_TOLERANCE_FT) {
    return;
  }
  const fixId = spec.directFixId;
  if (!fixId) {
    return;
  }
  ac.intent.lateral = { type: "DIRECT", fixId };
}

/**
 * Call once per aircraft per tick, before loc/GS FMS, so DA/GA leave the
 * glidepath the same tick they start missed.
 */
export function applyMissedFms(ac: Aircraft, ctx: MissedFmsContext): void {
  const approachId = missedApproachId(ac);
  if (!approachId) {
    return;
  }
  const spec = missedSpecFor(approachId, ctx.catalog);
  maybeSequenceMissedDirect(ac, spec);
  if (shouldStartMissedAtDa(ac, spec.daFt)) {
    beginMissedApproach(ac, spec, ctx, approachId);
  }
}
