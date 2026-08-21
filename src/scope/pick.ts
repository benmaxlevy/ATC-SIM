/**
 * Analog: CRC STARS click-select track (docs.virtualnas.net/crc/stars).
 * Trainer delta: 12 CSS px hit radius around the **target** symbol, plus the
 * **datablock** rectangle (T02-04). F3 initiate is a color stub (T02-08), not
 * click-to-own. Not NAS STARS.
 *
 * Scope action: sets `selectedAircraftId` only. Never writes intent and never
 * emits a readback — radio still goes through the pilot agent.
 */

import { setSelectedAircraft, type Aircraft, type World } from "@core";
import { inAltitudeFilter, type AltitudeFilter } from "./altitudeFilter";
import { nmToScreen, type ScopeCamera } from "./camera";
import {
  datablockRect,
  linesForDatablock,
  pointInDatablock,
  type DatablockMode,
} from "./datablock";
import { DATABLOCK_LINE_HEIGHT_PX, DEFAULT_DATABLOCK_CELL_PX } from "./fonts";
import { DEFAULT_LEADER_DIR, type LeaderDir } from "./leader";

/** Frozen hit radius in CSS pixels (T01-11). Pixel-space so range presets stay stable. */
export const HIT_RADIUS_CSS_PX = 12;

export interface DatablockPickView {
  tracks: Map<string, { datablockMode: DatablockMode; leaderDir?: LeaderDir; scratchpad?: string }>;
  modeCVisible: boolean;
  datablockCellWidthPx: number;
  /** Out-of-filter tracks have no datablock to hit; the target still picks. */
  altitudeFilter: AltitudeFilter;
}

function pickDatablockAt(
  world: World,
  cssX: number,
  cssY: number,
  cam: ScopeCamera,
  cssWidth: number,
  cssHeight: number,
  view: DatablockPickView,
): Aircraft | null {
  const size = { widthPx: cssWidth, heightPx: cssHeight };
  const cell =
    view.datablockCellWidthPx > 0 ? view.datablockCellWidthPx : DEFAULT_DATABLOCK_CELL_PX;
  let nearest: Aircraft | null = null;
  let nearestDist = Infinity;
  for (const ac of world.aircraft) {
    if (!inAltitudeFilter(ac.altitudeFt, view.altitudeFilter)) {
      continue;
    }
    const p = nmToScreen(ac.xNm, ac.yNm, cam, size);
    const td = view.tracks.get(ac.id);
    const mode = td?.datablockMode ?? "full";
    const dir = td?.leaderDir ?? DEFAULT_LEADER_DIR;
    const lines = linesForDatablock(ac, mode, view.modeCVisible, td?.scratchpad ?? "");
    const rect = datablockRect(p.x, p.y, lines, cell, DATABLOCK_LINE_HEIGHT_PX, dir);
    if (!pointInDatablock(cssX, cssY, rect)) {
      continue;
    }
    const dist = Math.hypot(p.x - cssX, p.y - cssY);
    if (dist < nearestDist) {
      nearest = ac;
      nearestDist = dist;
    }
  }
  return nearest;
}

export function pickAircraftAt(
  world: World,
  cssX: number,
  cssY: number,
  cam: ScopeCamera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number,
  datablockView?: DatablockPickView,
): Aircraft | null {
  if (datablockView) {
    const blockHit = pickDatablockAt(world, cssX, cssY, cam, cssWidth, cssHeight, datablockView);
    if (blockHit) {
      return blockHit;
    }
  }
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
  datablockView?: DatablockPickView,
): Aircraft | null {
  const hit = pickAircraftAt(world, cssX, cssY, cam, cssWidth, cssHeight, radiusPx, datablockView);
  setSelectedAircraft(world, hit?.id ?? null);
  return hit;
}
