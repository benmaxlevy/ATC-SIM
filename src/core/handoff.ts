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

import type { World } from "./world";

export const DEFAULT_INBOUND_SECTOR_ID = "C";

/** Stable `command.rejected` reason while inbound HO is pending. */
export const HANDOFF_PENDING_REASON = "handoff-pending";

export type TrackHandoff = { kind: "none" } | { kind: "inbound"; fromSectorId: string };

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
