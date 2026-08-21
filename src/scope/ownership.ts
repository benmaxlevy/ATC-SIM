/**
 * Analog: CRC STARS INIT CNTL / F3 initiate track
 * (docs.virtualnas.net/crc/stars — R07). Real CRC associates a target with a
 * flight plan (callsign + slew; beacon must match). Owned datablocks there
 * turn white. VATSIMism: auto-associate only if callsign matches the plan —
 * we do not copy that.
 *
 * Trainer delta: F3 is a color stub only (unowned pale mint → owned green). No
 * NAS associate, no second facility, no beacon pairing. Selection is a
 * yellow box, independent of ownership. F3 is initiate track, not browser
 * find. F4 drop is trainer sugar, not STARS terminate / TERM CNTL. Not NAS
 * STARS.
 */

import { PALETTE } from "./palette";

export type TrackOwnership = "unowned" | "owned";

/** CRC analog: initiate track / INIT CNTL. Color only — not NAS association. */
export const INITIATE_TRACK_HELP =
  "F3 INIT TRACK (color only) — CRC analog initiate track. Not NAS association. F3 is initiate track, not browser find.";

/** Trainer sugar: owned → unowned. Not STARS terminate. */
export const DROP_TRACK_HELP = "F4 drop is trainer sugar, not STARS terminate.";

export const NO_SEL_HINT = "NO SEL";

export function applyInitiateTrack(_current: TrackOwnership): TrackOwnership {
  return "owned";
}

export function applyDropTrack(_current: TrackOwnership): TrackOwnership {
  return "unowned";
}

export function trackPaintColor(ownership: TrackOwnership): string {
  return ownership === "owned" ? PALETTE.owned : PALETTE.unowned;
}

/**
 * CSI-like one-char stub in/near the position symbol. Trainer sugar, not a
 * real NAS CSI field. `*` unowned; `G` after F3. Selected uses the yellow box,
 * not a third letter. F4 returns `*`.
 */
export function ownershipStubChar(ownership: TrackOwnership): "*" | "G" {
  return ownership === "owned" ? "G" : "*";
}
