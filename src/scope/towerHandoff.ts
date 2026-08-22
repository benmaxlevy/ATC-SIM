/**
 * Analog: CRC STARS handoff (docs.virtualnas.net/crc/stars — R07);
 * 7110.65 radar handoff (R01).
 * Trainer delta: Shift+H when loc/GS along-track ≤ 5 NM (still allowed until
 * DA). Sets LANDING + tower ownership color. Not NAS initiate/accept. Not a
 * readback. Not Command IR.
 */

import { acceptTowerHandoff, isTowerHandoffEligible, type World } from "@core";
import { applyTowerOwnership, NO_SEL_HINT } from "./ownership";
import { createTrackDisplay, type TrackDisplay } from "./trackDisplay";

function selectedLivingId(world: World): string | null {
  const id = world.selectedAircraftId;
  if (!id || !world.aircraft.some((ac) => ac.id === id)) {
    return null;
  }
  return id;
}

function ensureTrackDisplay(tracks: Map<string, TrackDisplay>, id: string): TrackDisplay {
  let td = tracks.get(id);
  if (!td) {
    td = createTrackDisplay();
    tracks.set(id, td);
  }
  return td;
}

/**
 * Always-on Shift+H: if the selected track is in the HO gate, accept tower
 * stub and paint tower color. No Command, no readback.
 */
export function applyTowerHandoffToSelection(
  tracks: Map<string, TrackDisplay>,
  world: World,
): { applied: boolean; hint: string | null } {
  const id = selectedLivingId(world);
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
