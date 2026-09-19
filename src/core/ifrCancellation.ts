/**
 * Pilot IFR cancellation and operational reversion to VFR (T04-75).
 * FAA JO 7110.65 §4-2-10, §5-1-13, §7-9-2/3; AIM §5-1-15.
 */

import type { Aircraft } from "./aircraft";
import type { SessionLog } from "./events/session-log";
import type { World } from "./world";
import type { RegionalFacility } from "../scenario/regional";
import { isAircraftInsideClassB, isSafeVfrContinuationAvailable } from "./vfrNavigation";

export interface IfrCancellationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Apply controller acknowledgment of a pilot-initiated IFR cancellation.
 * Reverts operational rules to VFR, clears active clearance and approach guidance,
 * restores autonomous VFR navigation without modifying editable flight plans,
 * radar advisory service, or beacon codes.
 */
export function applyIfrCancellation(
  world: Pick<World, "aircraft" | "simTimeMs"> & {
    sessionLog?: SessionLog | null;
    regional?: unknown;
  },
  aircraft: Aircraft,
  atWallMs = 0,
  log?: SessionLog | null,
): IfrCancellationResult {
  const regional = world.regional as RegionalFacility | undefined;
  if (aircraft.flightRules !== "IFR") {
    return { ok: false, reason: "CANCELLATION: aircraft is not operating IFR" };
  }
  if (!aircraft.cancellationPending) {
    return { ok: false, reason: "CANCELLATION: no pending pilot IFR cancellation" };
  }
  const isAirborne =
    aircraft.airborne !== undefined ? aircraft.airborne === true : aircraft.altitudeFt > 0;
  if (!isAirborne) {
    return { ok: false, reason: "CANCELLATION: aircraft is on ground" };
  }
  if (isAircraftInsideClassB(aircraft, regional)) {
    return { ok: false, reason: "CANCELLATION: cannot cancel IFR inside Class B airspace" };
  }
  if (!isSafeVfrContinuationAvailable(aircraft, regional)) {
    return { ok: false, reason: "CANCELLATION: unable to establish safe VFR continuation" };
  }

  // Atomic state reversion:
  aircraft.flightRules = "VFR";
  aircraft.maintainVfr = true;
  delete aircraft.activeClearance;
  delete aircraft.clearanceLimit;
  delete aircraft.clearanceAccess;
  delete aircraft.clearanceFrequency;
  delete aircraft.cancellationPending;

  // Clear active approach guidance
  aircraft.intent.clearedApproachId = null;
  aircraft.intent.locInterceptApproachId = null;
  aircraft.intent.expectedApproachId = null;

  if (aircraft.intent.vertical?.type === "GS" || aircraft.intent.vertical?.type === "GLIDEPATH") {
    aircraft.intent.vertical = { type: "ASSIGNED" };
    aircraft.intent.assignedAltitudeFt = aircraft.altitudeFt;
  }

  const lateralType = aircraft.intent.lateral?.type;
  if (
    lateralType === "LOC" ||
    lateralType === "INTERCEPT_LOC" ||
    lateralType === "VECTOR_PENDING" ||
    lateralType === "VISUAL_FINAL"
  ) {
    aircraft.intent.lateral = { type: "HEADING", headingDeg: aircraft.headingDeg };
    aircraft.intent.assignedHeadingDeg = aircraft.headingDeg;
  }
  aircraft.radarVectorPending = undefined;
  delete aircraft.radarContact;

  // Restore ambient VFR alert eligibility
  if (aircraft.ambientVfr) {
    aircraft.ambientVfr.alertEligibility = "AMBIENT_SUPPRESSED";
  }

  const sessionLog = log ?? world.sessionLog ?? undefined;
  sessionLog?.append({
    type: "pilot.cancel_ifr.acknowledged",
    atSimMs: world.simTimeMs,
    atWallMs,
    callsign: aircraft.callsign,
    aircraftId: aircraft.id,
  });

  return { ok: true };
}
