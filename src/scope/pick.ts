/**
 * Analog: CRC STARS click-select track (docs.virtualnas.net/crc/stars).
 * T04-17: CRC “To accept the handoff, simply slew the track” — first click on a
 * pending inbound accepts (owned **white** FDB, T02-08) then selects. Further
 * clicks keep select / FDB toggle. F3 INIT CNTL on a pending inbound is the
 * same `acceptInboundHandoff` helper (T04-16). Not a Command. Not NAS STARS.
 *
 * CA halo is **not** drawn: CRC conflict-alert CA is static `CA` text + tone, not a 3 NM circle
 * (circles are TPA J-rings or ERAM DRI).
 *
 * Scope action: may clear inbound HO; never writes intent and never emits a
 * readback — radio still goes through the pilot agent.
 */

import { handoffFor, setSelectedAircraft, type Aircraft, type World } from "@core";
import { inAltitudeFilter, type AltitudeFilter } from "./altitudeFilter";
import { nmToScreen, type ScopeCamera } from "./camera";
import {
  datablockRect,
  linesForDatablock,
  pointInDatablock,
  withInboundHandoffCue,
  type DatablockMode,
} from "./datablock";
import {
  DATABLOCK_LINE_HEIGHT_PX,
  DEFAULT_DATABLOCK_CELL_PX,
  datablockLineHeightPx,
} from "./fonts";
import { DEFAULT_LEADER_DIR, type LeaderDir } from "./leader";
import { handleTrackClick, handleTrackMiddleClick, type TrackDisplay } from "./trackDisplay";

/** Frozen hit radius in CSS pixels (T01-11). Pixel-space so range presets stay stable. */
export const HIT_RADIUS_CSS_PX = 12;

export interface DatablockPickView {
  tracks: Map<
    string,
    {
      datablockMode: DatablockMode;
      leaderDir?: LeaderDir;
      scratchpad?: string;
      queriedUntilSimMs?: number;
      beaconatorUntilSimMs?: number;
      squawk?: string;
      ownership?: string;
    }
  >;
  modeCVisible: boolean;
  datablockCellWidthPx: number;
  /** Out-of-filter tracks have no datablock to hit; the target still picks. */
  altitudeFilter: AltitudeFilter;
  charSizePx?: number;
  leaderLengthPx?: number;
  beaconatorActive?: boolean;
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
    let mode = td?.datablockMode ?? (td?.ownership === "owned" ? "full" : "partial");
    if (view.beaconatorActive && mode === "partial") {
      mode = "full";
    }
    const dir = td?.leaderDir ?? DEFAULT_LEADER_DIR;
    const isQueried = (td?.queriedUntilSimMs ?? 0) > world.simTimeMs;
    const squawk = td?.squawk ?? ac.squawk;
    const trackBeaconator = (td?.beaconatorUntilSimMs ?? 0) > world.simTimeMs;
    const callsign = (view.beaconatorActive || trackBeaconator) && squawk ? squawk : ac.callsign;
    const base = linesForDatablock(
      { ...ac, callsign, squawk },
      mode,
      view.modeCVisible,
      td?.scratchpad ?? "",
      { queried: isQueried },
      world.simTimeMs,
    );
    const ho = handoffFor(world, ac.id);
    let line1 = base.line1;
    if (ho.kind === "pointout_inbound" && ho.status === "pending") {
      line1 = `${base.line1} PO`;
    } else if (ho.kind === "pointout_outbound" && ho.status === "pending") {
      line1 = `${base.line1} PO ${ho.toSectorId}`;
    } else if (mode !== "limited" && mode !== "partial") {
      line1 = withInboundHandoffCue(base.line1, ho);
    }
    const lines = { ...base, line1 };
    const lineH = datablockLineHeightPx(view.charSizePx ?? DATABLOCK_LINE_HEIGHT_PX);
    const rect = datablockRect(p.x, p.y, lines, cell, lineH, dir, view.leaderLengthPx);
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

export type AircraftPickRegion = "datablock" | "symbol";

export type AircraftPickHit = {
  aircraft: Aircraft;
  region: AircraftPickRegion;
};

function pickSymbolAt(
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
 * Prefer the datablock rectangle, then the target symbol. Lets TERM CNTL
 * distinguish `/` datablock PDB↔FDB from symbol drop.
 */
export function pickAircraftHitAt(
  world: World,
  cssX: number,
  cssY: number,
  cam: ScopeCamera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number,
  datablockView?: DatablockPickView,
): AircraftPickHit | null {
  if (datablockView) {
    const blockHit = pickDatablockAt(world, cssX, cssY, cam, cssWidth, cssHeight, datablockView);
    if (blockHit) {
      return { aircraft: blockHit, region: "datablock" };
    }
  }
  const symbol = pickSymbolAt(world, cssX, cssY, cam, cssWidth, cssHeight, radiusPx);
  if (symbol) {
    return { aircraft: symbol, region: "symbol" };
  }
  return null;
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
  return (
    pickAircraftHitAt(world, cssX, cssY, cam, cssWidth, cssHeight, radiusPx, datablockView)
      ?.aircraft ?? null
  );
}

/**
 * Hit-test then `setSelectedAircraft`. Miss (or empty canvas) clears selection.
 * Does not mutate intent, IDENT, or kinematics. Does not accept inbound HO —
 * PPI left-click uses `selectOrAcceptAircraftAt`.
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

/**
 * CRC slew analog: pending inbound → `acceptInboundHandoff` + owned white, then select.
 * Clicking unowned track toggles PDB ↔ Green FDB; clicking unassociated queries ground speed.
 */
export function selectOrAcceptAircraftAt(
  world: World,
  tracks: Map<string, TrackDisplay>,
  cssX: number,
  cssY: number,
  cam: ScopeCamera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number = HIT_RADIUS_CSS_PX,
  datablockView?: DatablockPickView,
  commandText?: string,
): Aircraft | null {
  const hit = pickAircraftAt(world, cssX, cssY, cam, cssWidth, cssHeight, radiusPx, datablockView);
  if (hit) {
    handleTrackClick(tracks, world, hit.id, commandText);
  }
  setSelectedAircraft(world, hit?.id ?? null);
  return hit;
}

/**
 * Middle-click track analog: toggle STARS Cyan highlight on datablock.
 */
export function middleClickAircraftAt(
  world: World,
  tracks: Map<string, TrackDisplay>,
  cssX: number,
  cssY: number,
  cam: ScopeCamera,
  cssWidth: number,
  cssHeight: number,
  radiusPx: number = HIT_RADIUS_CSS_PX,
  datablockView?: DatablockPickView,
): Aircraft | null {
  const hit = pickAircraftAt(world, cssX, cssY, cam, cssWidth, cssHeight, radiusPx, datablockView);
  if (hit) {
    handleTrackMiddleClick(tracks, world, hit.id);
  }
  return hit;
}
