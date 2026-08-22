/**
 * Tower-handoff land stub (T04-12). After HO, keep loc/GS to the threshold,
 * then despawn. DA does not start missed when LANDING / landingCleared.
 *
 * Analog: 7110.65 radar handoff to the tower (R01). Trainer delta: scope key
 * only — not a frequency change, not NAS initiate/accept. Not a readback.
 * Not NAS-certified.
 */

import type { Aircraft } from "../aircraft";
import type { SessionLog } from "../events/session-log";
import { locAxisForApproach, locDeviation, type LocAxis } from "../nav/localizer";
import type { World } from "../world";
import {
  isLandingInhibited,
  isOnMissed,
  missedApproachId,
  missedSpecFor,
} from "./missed";

/** Offer HO from this along-track inward (documented gate). */
export const TOWER_HANDOFF_GATE_NM = 5;
/**
 * Advertised inner edge of the HO window. Passing this without HO does not
 * lock out the stub — they can still HO until DA.
 */
export const TOWER_HANDOFF_INNER_NM = 1;
/** Threshold despawn: along-track at/past the rwy and at or below this MSL. */
export const LANDING_ALT_MAX_FT = 100;
/** Alternate despawn: planar distance to RW27 / threshold. */
export const LANDING_RW_DIST_NM = 0.2;

export interface LandingFmsContext {
  log?: SessionLog | null;
  simTimeMs: number;
}

function locAxisForAircraft(ac: Aircraft, world: World): LocAxis | undefined {
  const approachId = missedApproachId(ac);
  if (!approachId) {
    return undefined;
  }
  return locAxisForApproach(approachId, world.catalog, world.fixRegistry);
}

/**
 * True when the selected arrival is on loc/GS inside 5 NM and not yet handed
 * off. Inner 1 NM is the advertised window; HO remains legal until DA.
 */
export function isTowerHandoffEligible(ac: Aircraft, world: World): boolean {
  if (isLandingInhibited(ac) || isOnMissed(ac)) {
    return false;
  }
  const lat = ac.intent.lateral?.type;
  const vert = ac.intent.vertical?.type;
  if (lat !== "LOC" && vert !== "GS") {
    return false;
  }
  const approachId = missedApproachId(ac);
  if (!approachId) {
    return false;
  }
  const axis = locAxisForAircraft(ac, world);
  if (!axis) {
    return false;
  }
  const along = locDeviation({ xNm: ac.xNm, yNm: ac.yNm }, axis).alongTrackNm;
  if (along > TOWER_HANDOFF_GATE_NM || along <= 0) {
    return false;
  }
  const spec = missedSpecFor(approachId, world.catalog);
  return ac.altitudeFt > spec.daFt;
}

/**
 * Scope stub: set LANDING + landingCleared. Emits `handoff.tower`. Never a
 * Command or readback. Returns false if already landing / missed / no approach.
 */
export function acceptTowerHandoff(ac: Aircraft, ctx: LandingFmsContext): boolean {
  if (isLandingInhibited(ac) || isOnMissed(ac)) {
    return false;
  }
  const approachId = missedApproachId(ac);
  if (!approachId) {
    return false;
  }
  ac.intent.landingCleared = true;
  ac.intent.lateral = { type: "LANDING", approachId };
  ctx.log?.append({
    type: "handoff.tower",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    approachId,
  });
  return true;
}

export function hasReachedThreshold(ac: Aircraft, axis: LocAxis | undefined): boolean {
  const thresholdXNm = axis?.thresholdXNm ?? 0;
  const thresholdYNm = axis?.thresholdYNm ?? 0;
  const distNm = Math.hypot(ac.xNm - thresholdXNm, ac.yNm - thresholdYNm);
  if (distNm < LANDING_RW_DIST_NM) {
    return true;
  }
  if (!axis) {
    return false;
  }
  const along = locDeviation({ xNm: ac.xNm, yNm: ac.yNm }, axis).alongTrackNm;
  return along <= 0 && ac.altitudeFt <= LANDING_ALT_MAX_FT;
}

function emitLanded(ac: Aircraft, approachId: string, ctx: LandingFmsContext): void {
  ctx.log?.append({
    type: "nav.landed",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    approachId,
  });
}

/**
 * After kinematics: despawn LANDING / landingCleared arrivals that reached
 * the threshold. Mutates `world.aircraft`. Strips/PPI must tolerate missing ids.
 */
export function despawnLandedAircraft(world: World): void {
  const gone = new Set<string>();
  const ctx: LandingFmsContext = {
    log: world.sessionLog,
    simTimeMs: world.simTimeMs,
  };
  for (const ac of world.aircraft) {
    if (!isLandingInhibited(ac)) {
      continue;
    }
    const approachId = missedApproachId(ac);
    if (!approachId) {
      continue;
    }
    const axis = locAxisForAircraft(ac, world);
    if (!hasReachedThreshold(ac, axis)) {
      continue;
    }
    emitLanded(ac, approachId, ctx);
    gone.add(ac.id);
  }
  if (gone.size === 0) {
    return;
  }
  world.aircraft = world.aircraft.filter((ac) => !gone.has(ac.id));
  if (world.selectedAircraftId && gone.has(world.selectedAircraftId)) {
    world.selectedAircraftId = null;
  }
}
