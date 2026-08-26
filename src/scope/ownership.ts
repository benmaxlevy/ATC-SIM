/**
 * Analog: CRC STARS INIT CNTL / F3 initiate track
 * (docs.virtualnas.net/crc/stars — R07). Real CRC associates a target with a
 * flight plan (callsign + slew; beacon must match). Owned datablocks there
 * turn white. VATSIMism: auto-associate only if callsign matches the plan —
 * we do not copy that.
 * CRC STARS handoff (docs.virtualnas.net/crc/stars — R07); 7110.65 radar handoff (R01).
 *
 * Trainer delta: F3 is a color stub only (unowned green FDB → owned white FDB,
 * matching CRC INIT CNTL). Position symbol stays search-target blue. No NAS
 * associate, no second facility, no beacon pairing. Selection is a yellow box,
 * independent of ownership. F3 is initiate track, not browser find. F4 drop is
 * trainer sugar, not STARS terminate / TERM CNTL. Shift+H when loc/GS along-track
 * ≤ 5 NM (still allowed until DA). Sets LANDING + tower ownership color. Not
 * NAS initiate/accept. Not a readback. Not Command IR. Not NAS STARS.
 */

import {
  acceptTowerHandoff,
  initiateCenterHandoff,
  isCenterHandoffEligible,
  isTowerHandoffEligible,
  type World,
} from "@core";
import { PALETTE } from "./palette";
import { ensureTrackDisplay, selectedTrackId, type TrackDisplay } from "./trackDisplay";

export type TrackOwnership = "unowned" | "owned" | "tower" | "center";

/** CRC analog: initiate track / INIT CNTL. Color only — not NAS association. */
export const INITIATE_TRACK_HELP =
  "F3 INIT TRACK (color only) — CRC analog initiate track. Not NAS association. F3 is initiate track, not browser find.";

/** Trainer sugar: owned → unowned. Not STARS terminate. */
export const DROP_TRACK_HELP = "F4 drop is trainer sugar, not STARS terminate.";

/** CRC analog: radar handoff. Color + LANDING/outbound stub — not NAS initiate/accept. */
export const HANDOFF_HELP =
  "Shift+H initiate handoff: Tower (if on approach) or Center (if climbing outbound).";
export const TOWER_HANDOFF_HELP = HANDOFF_HELP;

export function applyInitiateTrack(_current: TrackOwnership): TrackOwnership {
  return "owned";
}

export function applyDropTrack(_current: TrackOwnership): TrackOwnership {
  return "unowned";
}

export function applyTowerOwnership(_current: TrackOwnership): TrackOwnership {
  return "tower";
}

export function applyCenterOwnership(_current: TrackOwnership): TrackOwnership {
  return "center";
}

export const NO_SEL_HINT = "NO SEL";

export function trackPaintColor(ownership: TrackOwnership): string {
  return PALETTE[ownership];
}

/**
 * CSI-like one-char stub in/near the position symbol. Trainer sugar, not a
 * real NAS CSI field. `*` unowned; `G` after F3; `T` tower; `C` center.
 */
export function ownershipStubChar(ownership: TrackOwnership): "*" | "G" | "T" | "C" {
  if (ownership === "owned") {
    return "G";
  }
  if (ownership === "tower") {
    return "T";
  }
  if (ownership === "center") {
    return "C";
  }
  return "*";
}

export interface HandoffResult {
  applied: boolean;
  target: "tower" | "center" | null;
  hint: string | null;
}

/**
 * Always-on Shift+H: auto-detects whether the handoff targets Tower
 * (for arrivals established on final) or Center (for climbing departures).
 */
export function applyHandoffToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): HandoffResult {
  const id = selectedTrackId(world);
  if (!id) {
    return { applied: false, target: null, hint: NO_SEL_HINT };
  }
  const ac = world.aircraft.find((item) => item.id === id);
  if (!ac) {
    return { applied: false, target: null, hint: null };
  }
  if (isTowerHandoffEligible(ac, world)) {
    const ok = acceptTowerHandoff(ac, {
      log: world.sessionLog,
      simTimeMs: world.simTimeMs,
    });
    if (!ok) {
      return { applied: false, target: null, hint: null };
    }
    const td = ensureTrackDisplay(tracks, id);
    td.ownership = applyTowerOwnership(td.ownership);
    return { applied: true, target: "tower", hint: null };
  }
  if (isCenterHandoffEligible(ac, world)) {
    const ok = initiateCenterHandoff(ac, {
      world,
      log: world.sessionLog,
      simTimeMs: world.simTimeMs,
    });
    if (!ok) {
      return { applied: false, target: null, hint: null };
    }
    const td = ensureTrackDisplay(tracks, id);
    td.ownership = applyCenterOwnership(td.ownership);
    return { applied: true, target: "center", hint: null };
  }
  return { applied: false, target: null, hint: null };
}

/**
 * Backwards-compatible tower handoff selector wrapper.
 */
export function applyTowerHandoffToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const result = applyHandoffToSelection(tracks, world);
  return { applied: result.applied && result.target === "tower", hint: result.hint };
}
