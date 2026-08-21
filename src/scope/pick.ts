/**
 * Analog: CRC STARS click-select track (docs.virtualnas.net/crc/stars).
 * Trainer delta: 12 CSS px hit radius around the **target** symbol
 * (datablock hits come in T02-04/T02-05); no F3 initiate. Not NAS STARS.
 *
 * Scope action: sets `selectedAircraftId` only. Never writes intent and never
 * emits a readback — radio still goes through the pilot agent.
 */

import { setSelectedAircraft, type Aircraft, type World } from "@core";
import { nmToScreen, type ScopeCamera } from "./camera";

/** Frozen hit radius in CSS pixels (T01-11). Pixel-space so range presets stay stable. */
export const HIT_RADIUS_CSS_PX = 12;

export function pickAircraftAt(
  world: World,
  cssX: number,
  cssY: number,
  cam: ScopeCamera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number,
): Aircraft | null {
  const view = { widthPx: cssWidth, heightPx: cssHeight };
  let nearest: Aircraft | null = null;
  let nearestDist = Infinity;
  for (const ac of world.aircraft) {
    const p = nmToScreen(ac.xNm, ac.yNm, cam, view);
    const dist = Math.hypot(p.x - cssX, p.y - cssY);
    if (dist <= radiusPx && dist < nearestDist) {
      nearest = ac;
      nearestDist = dist;
    }
  }
  return nearest;
}

/**
 * Hit-test then `setSelectedAircraft`. Miss (or empty canvas) clears selection.
 * Does not mutate intent, IDENT, or kinematics.
 */
export function selectAircraftAt(
  world: World,
  cssX: number,
  cssY: number,
  cam: ScopeCamera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number = HIT_RADIUS_CSS_PX,
): Aircraft | null {
  const hit = pickAircraftAt(world, cssX, cssY, cam, cssWidth, cssHeight, radiusPx);
  setSelectedAircraft(world, hit?.id ?? null);
  return hit;
}
