/**
 * Analog: CRC STARS TPA J-rings (`*J`) / ATPA DCB (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: DCB TPA draws a mileage circle 2 / 3 / 5 / 10 NM about the
 * **selected** track (if none selected: all F3-**owned** tracks). Default off,
 * 5 NM. Stroke uses TLS/tools color (`PALETTE.tools`), not CA red. ATPA is a
 * stored toggle with **no pairing engine and no cones**. CA remains T04-09
 * datablock text — not a 3 NM circle (circles here are TPA J-rings or ERAM DRI,
 * not CA). Not NAS STARS.
 *
 * Scope display only. Never a Command, readback, or intent.
 */

import type { Aircraft } from "@core";
import { pxPerNm, type ScopeCamera, type ScopeViewSize } from "./camera";
import { PALETTE } from "./palette";
import type { TrackOwnership } from "./ownership";

export const TPA_RADIUS_NM = [2, 3, 5, 10] as const;
export type TpaRadiusNm = (typeof TPA_RADIUS_NM)[number];
/** Documented session default: 5 NM, off. */
export const DEFAULT_TPA_RADIUS_NM: TpaRadiusNm = 5;
export const TPA_RING_SEGMENTS = 64;
export const TPA_STROKE_PX = 1;
/** TLS/tools analog. Never CA/MSAW red. */
export const TPA_STROKE_COLOR = PALETTE.tools;

export interface TpaState {
  on: boolean;
  radiusNm: TpaRadiusNm;
}

export interface AtpaState {
  /** Stub: stored for PREF; paints nothing. */
  on: boolean;
}

export const DEFAULT_TPA_STATE: TpaState = {
  on: false,
  radiusNm: DEFAULT_TPA_RADIUS_NM,
};

export const DEFAULT_ATPA_STATE: AtpaState = { on: false };

/**
 * World-NM polyline for a TPA J-ring about a track. Closed (first point
 * repeated at the end). Not a sprite. Not a CA halo.
 */
export function tpaRingPoints(
  eastNm: number,
  northNm: number,
  radiusNm: number,
  segments: number = TPA_RING_SEGMENTS,
): { eastNm: number; northNm: number }[] {
  const n = Math.max(8, segments);
  const pts: { eastNm: number; northNm: number }[] = [];
  for (let i = 0; i <= n; i += 1) {
    const theta = (i / n) * Math.PI * 2;
    pts.push({
      eastNm: eastNm + radiusNm * Math.sin(theta),
      northNm: northNm + radiusNm * Math.cos(theta),
    });
  }
  return pts;
}

/** Screen radius of a TPA ring: `radiusNm * pxPerNm` (same camera scale as maps). */
export function tpaScreenRadiusPx(
  radiusNm: number,
  camera: ScopeCamera,
  view: ScopeViewSize,
): number {
  return radiusNm * pxPerNm(camera, view);
}

export function stepTpaRadiusNm(current: TpaRadiusNm, delta: -1 | 1): TpaRadiusNm {
  const i = TPA_RADIUS_NM.indexOf(current);
  const next = i + delta;
  if (next < 0 || next >= TPA_RADIUS_NM.length) {
    return current;
  }
  return TPA_RADIUS_NM[next]!;
}

export function formatDcbTpaMiReadout(radiusNm: TpaRadiusNm): string {
  return String(radiusNm);
}

/**
 * Tracks that get a J-ring when TPA is on: the selected aircraft if any,
 * otherwise every F3-owned track. Unowned tracks are skipped when none is
 * selected. Display only.
 */
export function aircraftForTpaRings(
  tpaOn: boolean,
  selectedId: string | null,
  aircraft: readonly Aircraft[],
  tracks: Map<string, { ownership: TrackOwnership }>,
): Aircraft[] {
  if (!tpaOn) {
    return [];
  }
  if (selectedId) {
    const selected = aircraft.find((ac) => ac.id === selectedId);
    return selected ? [selected] : [];
  }
  return aircraft.filter((ac) => tracks.get(ac.id)?.ownership === "owned");
}

/**
 * ATPA stub: even when the DCB toggle is on, no pairing / cones / extra stroke.
 * Real ATPA (in-trail sequence) is out of scope.
 */
export function shouldPaintAtpaGeometry(_atpaOn: boolean): false {
  return false;
}
