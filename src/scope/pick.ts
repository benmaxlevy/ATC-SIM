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
import {
  pointInLayoutBounds,
  solveDatablockLayout,
  type DatablockLayoutInput,
} from "./datablockLayout";
import { aircraftAtReport } from "./surveillance";
import { collectDatablockProtectedGeometry } from "./render/renderScopePaint";
import type { ScopeView } from "./scopeView";

/** Frozen hit radius in CSS pixels (T01-11). Pixel-space so range presets stay stable. */
export const HIT_RADIUS_CSS_PX = 12;

export interface DatablockPickView {
  tracks: Map<
    string,
    {
      datablockMode: DatablockMode;
      leaderDir?: LeaderDir;
      leaderLengthPx?: number;
      scratchpad?: string;
      queriedUntilSimMs?: number;
      beaconatorUntilSimMs?: number;
      lastReport?: TrackDisplay["lastReport"];
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
  const candidates: DatablockLayoutInput[] = [];
  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    if (!td?.lastReport) {
      continue;
    }
    const shown = aircraftAtReport(ac, td.lastReport);
    if (!inAltitudeFilter(shown.altitudeFt, view.altitudeFilter)) {
      continue;
    }
    const p = nmToScreen(shown.xNm, shown.yNm, cam, size);
    if (!pointInLayoutBounds(p, { x: 0, y: 0, width: cssWidth, height: cssHeight })) {
      continue;
    }
    const ho = handoffFor(world, ac.id);
    let mode = td?.datablockMode ?? (td?.ownership === "owned" ? "full" : "partial");
    if (ho.kind === "inbound" || ho.kind === "departure") {
      mode = "full";
    }
    if (view.beaconatorActive && mode === "partial") {
      mode = "full";
    }
    const dir = td?.leaderDir ?? DEFAULT_LEADER_DIR;
    const isQueried = (td?.queriedUntilSimMs ?? 0) > world.simTimeMs;
    const squawk = td?.squawk ?? ac.squawk;
    const trackBeaconator = (td?.beaconatorUntilSimMs ?? 0) > world.simTimeMs;
    const callsign = (view.beaconatorActive || trackBeaconator) && squawk ? squawk : ac.callsign;
    let handoffSectorId: string | undefined;
    if (ho.kind === "inbound") {
      handoffSectorId = ho.fromSectorId;
    } else if (ho.kind === "departure") {
      handoffSectorId = ho.fromSectorId === "TWR" ? "T" : ho.fromSectorId;
    } else if (ho.kind === "outbound") {
      handoffSectorId = ho.toSectorId;
    } else if (ho.kind === "pointout_inbound") {
      handoffSectorId = ho.fromSectorId;
    } else if (ho.kind === "pointout_outbound") {
      handoffSectorId = ho.toSectorId;
    }
    const base = linesForDatablock({ ...shown, callsign, squawk }, mode, {
      modeCVisible: view.modeCVisible,
      scratchpad: td?.scratchpad ?? "",
      handoffSectorId,
      queried: isQueried,
      simTimeMs: world.simTimeMs,
    });
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
    const leaderLen = td?.leaderLengthPx ?? view.leaderLengthPx;
    const rect = datablockRect(p.x, p.y, lines, cell, lineH, dir, leaderLen);
    candidates.push({
      aircraftId: ac.id,
      targetPoint: p,
      preferredRect: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
      metrics: { widthPx: rect.w, heightPx: rect.h },
      leaderDir: dir,
      leaderLengthPx: leaderLen ?? 36,
      displayPriority: mode === "full" ? "full" : mode === "partial" ? "partial" : "limited",
      selected: world.selectedAircraftId === ac.id,
    });
  }
  const obstacleView = isFullScopeView(view) ? view : undefined;
  const protectedGeometry = obstacleView
    ? collectDatablockProtectedGeometry(world, obstacleView, {
        widthPx: cssWidth,
        heightPx: cssHeight,
      })
    : undefined;
  const layouts = solveDatablockLayout(candidates, {
    bounds: { x: 0, y: 0, width: cssWidth, height: cssHeight },
    protectedGeometry,
  });
  const layoutById = new Map(layouts.map((layout) => [layout.aircraftId, layout]));
  for (const ac of world.aircraft) {
    const layout = layoutById.get(ac.id);
    if (
      !layout?.rect ||
      !pointInDatablock(cssX, cssY, {
        x: layout.rect.x,
        y: layout.rect.y,
        w: layout.rect.width,
        h: layout.rect.height,
      })
    ) {
      continue;
    }
    // Layout rectangles can be displaced from their target. Score the hit by
    // the resolved datablock itself; using the target point makes coincident
    // targets always select the first aircraft when displaced rectangles touch.
    const dist = Math.hypot(
      layout.rect.x + layout.rect.width / 2 - cssX,
      layout.rect.y + layout.rect.height / 2 - cssY,
    );
    if (dist < nearestDist) {
      nearest = ac;
      nearestDist = dist;
    }
  }
  return nearest;
}

function isFullScopeView(view: DatablockPickView): view is DatablockPickView & ScopeView {
  const candidate = view as DatablockPickView & Partial<ScopeView>;
  return Boolean(candidate.camera && candidate.tpa && candidate.atpa && candidate.charSizes);
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
