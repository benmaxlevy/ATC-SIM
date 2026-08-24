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

import { acceptTowerHandoff, isTowerHandoffEligible, type World } from "@core";
import { PALETTE } from "./palette";
import { ensureTrackDisplay, selectedTrackId, type TrackDisplay } from "./trackDisplay";

export type TrackOwnership = "unowned" | "owned" | "tower";

/** CRC analog: initiate track / INIT CNTL. Color only — not NAS association. */
export const INITIATE_TRACK_HELP =
  "F3 INIT TRACK (color only) — CRC analog initiate track. Not NAS association. F3 is initiate track, not browser find.";

/** Trainer sugar: owned → unowned. Not STARS terminate. */
export const DROP_TRACK_HELP = "F4 drop is trainer sugar, not STARS terminate.";

/** CRC analog: radar handoff. Color + LANDING stub — not NAS initiate/accept. */
export const TOWER_HANDOFF_HELP =
  "Shift+H tower handoff stub (loc/GS inside 5 NM, until DA). LANDING + tower color. Not a readback. Not NAS handoff.";

export function applyInitiateTrack(_current: TrackOwnership): TrackOwnership {
  return "owned";
}

export function applyDropTrack(_current: TrackOwnership): TrackOwnership {
  return "unowned";
}

export function applyTowerOwnership(_current: TrackOwnership): TrackOwnership {
  return "tower";
}

export const NO_SEL_HINT = "NO SEL";

export function trackPaintColor(ownership: TrackOwnership): string {
  return PALETTE[ownership];
}

/**
 * CSI-like one-char stub in/near the position symbol. Trainer sugar, not a
 * real NAS CSI field. `*` unowned; `G` after F3. Selected uses the yellow box,
 * not a third letter. F4 returns `*`.
 */
export function ownershipStubChar(ownership: TrackOwnership): "*" | "G" | "T" {
  if (ownership === "owned") {
    return "G";
  }
  if (ownership === "tower") {
    return "T";
  }
  return "*";
}

/**
 * Always-on Shift+H: if the selected track is in the HO gate, accept tower
 * stub and paint tower color. No Command, no readback.
 */
export function applyTowerHandoffToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const id = selectedTrackId(world);
  if (!id) {
    return { applied: false, hint: NO_SEL_HINT };
  }
  const ac = world.aircraft.find((item) => item.id === id);
  if (!ac || !isTowerHandoffEligible(ac, world)) {
    return { applied: false, hint: null };
  }
  const ok = acceptTowerHandoff(ac, {
    log: world.sessionLog,
    simTimeMs: world.simTimeMs,
  });
  if (!ok) {
    return { applied: false, hint: null };
  }
  const td = ensureTrackDisplay(tracks, id);
  td.ownership = applyTowerOwnership(td.ownership);
  return { applied: true, hint: null };
}
