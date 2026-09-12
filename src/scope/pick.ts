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

import { setSelectedAircraft, type Aircraft, type World } from "@core";
import { nmToScreen, type ScopeCamera } from "./camera";
import { pointInDatablock } from "./datablock";
import { handleTrackClick, handleTrackMiddleClick, type TrackDisplay } from "./trackDisplay";
import { datablockRenderSnapshotKey } from "./render/renderScopePaint";
import type { ScopeView } from "./scopeView";

/** Frozen hit radius in CSS pixels (T01-11). Pixel-space so range presets stay stable. */
export const HIT_RADIUS_CSS_PX = 12;

export interface DatablockPickView {
  tracks: Map<
    string,
    {
      lastReport?: TrackDisplay["lastReport"];
    }
  >;
  /** Rendered ScopeView snapshot supplies datablock content and hit rectangles. */
  datablockRenderSnapshot?: ScopeView["datablockRenderSnapshot"];
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
  if (!isFullScopeView(view)) return null;
  const snapshot = view.datablockRenderSnapshot;
  if (
    snapshot?.world !== world ||
    snapshot.simTimeMs !== world.simTimeMs ||
    snapshot.widthPx !== cssWidth ||
    snapshot.heightPx !== cssHeight ||
    snapshot.camera.rangeNm !== cam.rangeNm ||
    snapshot.camera.centerEastNm !== cam.centerEastNm ||
    snapshot.camera.centerNorthNm !== cam.centerNorthNm ||
    snapshot.viewKey !== datablockRenderSnapshotKey(view, world)
  )
    return null;
  let nearest: Aircraft | null = null;
  let nearestDist = Infinity;
  for (const ac of world.aircraft) {
    const presentation = snapshot.presentations.get(ac.id);
    const layout = snapshot.layouts.get(ac.id);
    if (
      !presentation ||
      !layout?.rect ||
      !pointInDatablock(cssX, cssY, {
        x: layout.rect.x,
        y: layout.rect.y,
        w: layout.rect.width,
        h: layout.rect.height,
      })
    )
      continue;
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
