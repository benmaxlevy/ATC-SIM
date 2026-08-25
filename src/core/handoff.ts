/**
 * Analog: CRC STARS “Accepting a Handoff” — slew/click the inbound track
 * (docs.virtualnas.net/crc/stars — R07). JO 7110.65 radar identification /
 * radar handoff is what a real HO means (R01); this trainer is not NAS.
 *
 * Trainer delta: default STAR arrivals spawn pending inbound from sector `C`
 * (ARTCC analog, not a second networked TCP). No pointout, redirect, or
 * refuse/recall. Owned FDB stays white (`PALETTE.owned` / T02-08); pending
 * inbound stays unowned green. Scope click-to-accept is T04-17; F3 INIT CNTL
 * on a pending inbound is take-track (same helper). Not a Command IR type.
 * Phase 5 must not score these events.
 */

import type { Aircraft } from "./aircraft";
import type { SessionLog } from "./events/session-log";
import { isLandingInhibited, isOnMissed } from "./fms/missed";
import { isTowerHandoffEligible } from "./fms/landing";
import type { World } from "./world";

export const DEFAULT_INBOUND_SECTOR_ID = "C";
export const DEFAULT_CENTER_SECTOR_ID = "C";
export const DEFAULT_TOWER_SECTOR_ID = "TWR";

/** Stable `command.rejected` reason while inbound HO is pending. */
export const HANDOFF_PENDING_REASON = "handoff-pending";

export type TrackHandoff =
  | { kind: "none" }
  | { kind: "inbound"; fromSectorId: string }
  | { kind: "departure"; fromSectorId: string }
  | { kind: "outbound"; toSectorId: string };

export const NONE_HANDOFF: TrackHandoff = { kind: "none" };

/** Radio that changes intent is allowed only when the track is not inbound-pending. */
export function isRadioCommandAllowed(handoff: TrackHandoff): boolean {
  return handoff.kind !== "inbound";
}

export function assertHandoffOwned(
  handoff: TrackHandoff,
): { ok: true } | { ok: false; reason: typeof HANDOFF_PENDING_REASON } {
  if (isRadioCommandAllowed(handoff)) {
    return { ok: true };
  }
  return { ok: false, reason: HANDOFF_PENDING_REASON };
}

export function handoffFor(world: World, aircraftId: string): TrackHandoff {
  return world.handoffs.get(aircraftId) ?? NONE_HANDOFF;
}

/**
 * Mark a STAR-inbound spawn as pending HO from the transferring sector.
 * Emits `handoff.inbound.offered` once (spawn, not every tick). Scope action
 * later; not a Command.
 */
export function offerInboundHandoff(
  world: World,
  aircraft: { id: string; callsign: string },
  fromSectorId: string = DEFAULT_INBOUND_SECTOR_ID,
): void {
  world.handoffs.set(aircraft.id, { kind: "inbound", fromSectorId });
  world.sessionLog?.append({
    type: "handoff.inbound.offered",
    atSimMs: world.simTimeMs,
    atWallMs: 0,
    callsign: aircraft.callsign,
    fromSectorId,
  });
}

/**
 * Mark a departure spawn from Local Control / Tower.
 * Emits `handoff.departure.spawned` once.
 */
export function offerDepartureHandoff(
  world: World,
  aircraft: { id: string; callsign: string },
  fromSectorId: string = DEFAULT_TOWER_SECTOR_ID,
  details?: { runwayId?: string; sidId?: string },
): void {
  world.handoffs.set(aircraft.id, { kind: "departure", fromSectorId });
  world.sessionLog?.append({
    type: "handoff.departure.spawned",
    atSimMs: world.simTimeMs,
    atWallMs: 0,
    callsign: aircraft.callsign,
    fromSectorId,
    ...(details?.runwayId ? { runwayId: details.runwayId } : {}),
    ...(details?.sidId ? { sidId: details.sidId } : {}),
  });
}

/** Authored / downwind bench: commandable without HO. */
export function setHandoffNone(world: World, aircraftId: string): void {
  world.handoffs.set(aircraftId, { kind: "none" });
}

/**
 * Take the inbound track: clear pending HO so radio can apply. F3 / T04-17
 * paint owned white on the scope copy. Returns false if not inbound-pending.
 */
export function acceptInboundHandoff(world: World, aircraftId: string, atWallMs = 0): boolean {
  const current = handoffFor(world, aircraftId);
  if (current.kind !== "inbound") {
    return false;
  }
  const ac = world.aircraft.find((item) => item.id === aircraftId);
  if (!ac) {
    return false;
  }
  world.handoffs.set(aircraftId, { kind: "none" });
  world.sessionLog?.append({
    type: "handoff.inbound.accepted",
    atSimMs: world.simTimeMs,
    atWallMs,
    callsign: ac.callsign,
    fromSectorId: current.fromSectorId,
  });
  return true;
}

/**
 * True when aircraft is a departure/outbound climbing toward boundary
 * (altitude >= 5,000 ft or distance from ARP >= 12 NM or climbing on SID, not on approach).
 */
export function isCenterHandoffEligible(ac: Aircraft, world: World): boolean {
  if (isLandingInhibited(ac) || isOnMissed(ac)) {
    return false;
  }
  const lat = ac.intent.lateral?.type;
  if (lat === "LOC" || lat === "LANDING" || ac.intent.clearedApproachId) {
    return false;
  }
  if (isTowerHandoffEligible(ac, world)) {
    return false;
  }
  const ho = handoffFor(world, ac.id);
  if (ho.kind === "outbound" || ho.kind === "inbound") {
    return false;
  }
  if (ac.intent.vertical?.type === "VIA_STAR") {
    return false;
  }
  if (
    ac.intent.vertical?.type === "VIA_SID" ||
    Boolean(ac.intent.lateral?.sidId) ||
    ho.kind === "departure"
  ) {
    return true;
  }
  const distFromArp = Math.hypot(ac.xNm, ac.yNm);
  if (ac.altitudeFt >= 5000 || distFromArp >= 12) {
    return true;
  }
  return false;
}

export interface CenterHandoffContext {
  world?: World;
  log?: SessionLog | null;
  simTimeMs: number;
}

/**
 * Initiate outbound handoff to Enroute Center (sector C / Z).
 * Logs handoff.center and handoff.outbound.initiated, sets outbound handoff state.
 */
export function initiateCenterHandoff(
  ac: Aircraft,
  ctx: CenterHandoffContext,
  toSectorId: string = DEFAULT_CENTER_SECTOR_ID,
): boolean {
  if (ctx.world) {
    ctx.world.handoffs.set(ac.id, { kind: "outbound", toSectorId });
  }
  ctx.log?.append({
    type: "handoff.center",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    toSectorId,
  });
  ctx.log?.append({
    type: "handoff.outbound.initiated",
    atSimMs: ctx.simTimeMs,
    atWallMs: 0,
    callsign: ac.callsign,
    toSectorId,
  });
  return true;
}
