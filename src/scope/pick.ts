/**
 * Analog: CRC STARS click-select track (docs.virtualnas.net/crc/stars).
 * Trainer delta: 12 CSS px hit radius; tick click only (no datablock vs tick);
 * no F3 initiate. Not NAS STARS.
 *
 * Scope action: sets `selectedAircraftId` only. Never writes intent and never
 * emits a readback — radio still goes through the pilot agent.
 */

import { setSelectedAircraft, type Aircraft, type World } from "@core";
import { worldToCanvas, type Camera } from "./camera";

/** Frozen hit radius in CSS pixels (T01-11). Pixel-space so 40 NM range stays stable. */
export const HIT_RADIUS_CSS_PX = 12;

export function pickAircraftAt(
  world: World,
  cssX: number,
  cssY: number,
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number,
): Aircraft | null {
  let nearest: Aircraft | null = null;
  let nearestDist = Infinity;
  for (const ac of world.aircraft) {
    const p = worldToCanvas(ac.xNm, ac.yNm, cam, cssWidth, cssHeight);
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
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number = HIT_RADIUS_CSS_PX,
): Aircraft | null {
  const hit = pickAircraftAt(world, cssX, cssY, cam, cssWidth, cssHeight, radiusPx);
  setSelectedAircraft(world, hit?.id ?? null);
  return hit;
}
