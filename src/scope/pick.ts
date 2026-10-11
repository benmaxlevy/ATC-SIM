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
import { nmToScreen, screenToNm, type ScopeCamera } from "./camera";
import { pointInDatablock } from "./datablock";
import { handleTrackClick, handleTrackMiddleClick, type TrackDisplay } from "./trackDisplay";
import { datablockRenderSnapshotKey } from "./render/renderScopePaint";
import type { ScopeView } from "./scopeView";
import {
  cancelMinSepPending,
  isMinSepPending,
  isValidMinSepTrackInput,
  minSepInputFromReport,
} from "./minimumSeparation";
import { cancelRblPending, insertRangeBearingLine, type RblEndpoint } from "./rangeBearingLines";
import { cancelPreviewArea, rejectPreviewAreaWithReason } from "./previewArea";

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

/**
 * Check whether an aircraft is living in world, has a valid finite surveillance report,
 * and its displayed symbol lies inside the current rectangular PPI.
 */
export function isMinSepTargetEligibleAndDisplayed(
  world: World,
  view: ScopeView,
  aircraftId: string,
  cssWidth: number,
  cssHeight: number,
): boolean {
  const ac = world.aircraft.find((a) => a.id === aircraftId);
  if (!ac) {
    return false;
  }
  const td = view.tracks.get(aircraftId);
  const report = td?.lastReport;
  if (!report || !isValidMinSepTrackInput(minSepInputFromReport(report))) {
    return false;
  }
  if (!Number.isFinite(report.altitudeFt)) {
    return false;
  }
  const size = { widthPx: cssWidth, heightPx: cssHeight };
  const symPt = nmToScreen(report.xNm, report.yNm, view.camera, size);
  if (!Number.isFinite(symPt.x) || !Number.isFinite(symPt.y)) {
    return false;
  }
  if (symPt.x < 0 || symPt.x > cssWidth || symPt.y < 0 || symPt.y > cssHeight) {
    return false;
  }
  return true;
}

export type MinSepPickResult =
  { kind: "hit"; aircraftId: string } | { kind: "miss" } | { kind: "error"; error: "ILL TRK" };

/**
 * Report-aware hit testing for Minimum-Separation (MIN) selection.
 *
 * Rules:
 * - Only selects living aircraft with finite last surveillance reports.
 * - Displayed symbol must lie inside the current rectangular PPI.
 * - Datablock-first precedence using rendered datablock hit geometry.
 * - Unresolved equal-distance ties or malformed reports reject with "ILL TRK".
 * - Selection follows sampled report pose, never live truth.
 */
export function pickMinSepTargetAt(
  world: World,
  view: ScopeView,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
): MinSepPickResult {
  const size = { widthPx: cssWidth, heightPx: cssHeight };
  const snapshot = view.datablockRenderSnapshot;
  const snapshotValid = Boolean(
    snapshot &&
    snapshot.world === world &&
    snapshot.simTimeMs === world.simTimeMs &&
    snapshot.widthPx === cssWidth &&
    snapshot.heightPx === cssHeight &&
    snapshot.camera.rangeNm === view.camera.rangeNm &&
    snapshot.camera.centerEastNm === view.camera.centerEastNm &&
    snapshot.camera.centerNorthNm === view.camera.centerNorthNm,
  );

  // 1. Datablock-first precedence
  if (snapshotValid && snapshot) {
    const datablockHits: { ac: Aircraft; dist: number }[] = [];
    for (const ac of world.aircraft) {
      const presentation = snapshot.presentations.get(ac.id);
      const layout = snapshot.layouts.get(ac.id);
      if (
        presentation &&
        layout?.rect &&
        pointInDatablock(cssX, cssY, {
          x: layout.rect.x,
          y: layout.rect.y,
          w: layout.rect.width,
          h: layout.rect.height,
        })
      ) {
        // Datablock hit: verify eligibility
        if (!isMinSepTargetEligibleAndDisplayed(world, view, ac.id, cssWidth, cssHeight)) {
          return { kind: "error", error: "ILL TRK" };
        }
        const dist = Math.hypot(
          layout.rect.x + layout.rect.width / 2 - cssX,
          layout.rect.y + layout.rect.height / 2 - cssY,
        );
        datablockHits.push({ ac, dist });
      }
    }

    if (datablockHits.length > 0) {
      let minDist = Infinity;
      for (const h of datablockHits) {
        if (h.dist < minDist) minDist = h.dist;
      }
      const closest = datablockHits.filter((h) => Math.abs(h.dist - minDist) < 1e-4);
      const distinctIds = new Set(closest.map((h) => h.ac.id));
      if (distinctIds.size > 1) {
        return { kind: "error", error: "ILL TRK" };
      }
      return { kind: "hit", aircraftId: closest[0]!.ac.id };
    }
  }

  // 2. Report-backed symbol hit testing
  const symbolHits: { ac: Aircraft; dist: number }[] = [];
  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    const report = td?.lastReport;
    if (!report) {
      continue;
    }
    if (
      !Number.isFinite(report.xNm) ||
      !Number.isFinite(report.yNm) ||
      !Number.isFinite(report.reportedAtSimMs)
    ) {
      continue;
    }
    const symPt = nmToScreen(report.xNm, report.yNm, view.camera, size);
    if (!Number.isFinite(symPt.x) || !Number.isFinite(symPt.y)) {
      continue;
    }
    const dist = Math.hypot(symPt.x - cssX, symPt.y - cssY);
    if (dist <= HIT_RADIUS_CSS_PX) {
      if (!isMinSepTargetEligibleAndDisplayed(world, view, ac.id, cssWidth, cssHeight)) {
        return { kind: "error", error: "ILL TRK" };
      }
      symbolHits.push({ ac, dist });
    }
  }

  if (symbolHits.length > 0) {
    let minDist = Infinity;
    for (const h of symbolHits) {
      if (h.dist < minDist) minDist = h.dist;
    }
    const closest = symbolHits.filter((h) => Math.abs(h.dist - minDist) < 1e-4);
    const distinctIds = new Set(closest.map((h) => h.ac.id));
    if (distinctIds.size > 1) {
      return { kind: "error", error: "ILL TRK" };
    }
    return { kind: "hit", aircraftId: closest[0]!.ac.id };
  }

  return { kind: "miss" };
}

/**
 * Handle PPI left click when Minimum-Separation (MIN) entry is pending.
 * Returns true when consumed.
 * Intercepts all clicks on scope before ordinary target selection, handoff
 * acceptance, datablock toggle, list actions, and centering click.
 */
export function handleMinSepClick(
  view: ScopeView,
  world: World,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
  nowMs: number = Date.now(),
): boolean {
  if (!isMinSepPending(view)) {
    return false;
  }

  const pickResult = pickMinSepTargetAt(world, view, cssX, cssY, cssWidth, cssHeight);

  if (pickResult.kind === "miss") {
    // Empty PPI/list space clicks do not advance phase, clear selection, change maps/lists, or emit an error.
    return true;
  }

  if (pickResult.kind === "error") {
    cancelMinSepPending(view.minSep);
    rejectPreviewAreaWithReason(view.preview, nowMs, pickResult.error);
    return true;
  }

  const clickedId = pickResult.aircraftId;

  if (view.minSep.pendingFirstId === null) {
    // First target selection
    const eligible = isMinSepTargetEligibleAndDisplayed(
      world,
      view,
      clickedId,
      cssWidth,
      cssHeight,
    );
    if (!eligible) {
      cancelMinSepPending(view.minSep);
      rejectPreviewAreaWithReason(view.preview, nowMs, "ILL TRK");
      return true;
    }
    view.minSep.pendingFirstId = clickedId;
    view.minSep.lastError = null;
    return true;
  }

  // Second target selection
  const firstId = view.minSep.pendingFirstId;

  if (firstId === clickedId) {
    // Same target clicked twice
    cancelMinSepPending(view.minSep);
    rejectPreviewAreaWithReason(view.preview, nowMs, "DUP TRK");
    return true;
  }

  // Re-verify both first target and second target are living, have finite reports,
  // and have displayed symbols inside rectangular PPI.
  const firstValid = isMinSepTargetEligibleAndDisplayed(world, view, firstId, cssWidth, cssHeight);
  const secondValid = isMinSepTargetEligibleAndDisplayed(
    world,
    view,
    clickedId,
    cssWidth,
    cssHeight,
  );

  if (!firstValid || !secondValid) {
    cancelMinSepPending(view.minSep);
    rejectPreviewAreaWithReason(view.preview, nowMs, "ILL TRK");
    return true;
  }

  // Atomically replace active pair and complete preview
  view.minSep.activePair = {
    aircraftIdA: firstId,
    aircraftIdB: clickedId,
  };
  view.minSep.pendingFirstId = null;
  view.minSep.lastError = null;
  cancelPreviewArea(view.preview);

  return true;
}

/**
 * Check whether an aircraft is living in world, has a valid finite surveillance report,
 * and its displayed symbol lies inside the current rectangular PPI.
 * Unlike MIN, altitude filtering does not disqualify an aircraft symbol.
 */
export function isRblTargetEligibleAndDisplayed(
  world: World,
  view: ScopeView,
  aircraftId: string,
  cssWidth: number,
  cssHeight: number,
): boolean {
  const ac = world.aircraft.find((a) => a.id === aircraftId);
  if (!ac) {
    return false;
  }
  const td = view.tracks.get(aircraftId);
  const report = td?.lastReport;
  if (!report) {
    return false;
  }
  if (
    !Number.isFinite(report.xNm) ||
    !Number.isFinite(report.yNm) ||
    !Number.isFinite(report.reportedAtSimMs)
  ) {
    return false;
  }
  const size = { widthPx: cssWidth, heightPx: cssHeight };
  const symPt = nmToScreen(report.xNm, report.yNm, view.camera, size);
  if (!Number.isFinite(symPt.x) || !Number.isFinite(symPt.y)) {
    return false;
  }
  if (symPt.x < 0 || symPt.x > cssWidth || symPt.y < 0 || symPt.y > cssHeight) {
    return false;
  }
  return true;
}

export type RblPickResult =
  | { kind: "track"; aircraftId: string }
  | { kind: "static"; xNm: number; yNm: number }
  | { kind: "error"; error: "NO FLIGHT" };

/**
 * Pick target for Range-Bearing Line creation:
 * - Datablock-first precedence.
 * - Symbol hit testing for displayed tracks inside PPI.
 * - Equal-distance ties yield NO FLIGHT error.
 * - Empty PPI area click becomes static ENU coordinate.
 */
export function pickRblTargetAt(
  world: World,
  view: ScopeView,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
): RblPickResult {
  const size = { widthPx: cssWidth, heightPx: cssHeight };
  const snapshot = view.datablockRenderSnapshot;
  const snapshotValid = Boolean(
    snapshot &&
    snapshot.world === world &&
    snapshot.simTimeMs === world.simTimeMs &&
    snapshot.widthPx === cssWidth &&
    snapshot.heightPx === cssHeight &&
    snapshot.camera.rangeNm === view.camera.rangeNm &&
    snapshot.camera.centerEastNm === view.camera.centerEastNm &&
    snapshot.camera.centerNorthNm === view.camera.centerNorthNm,
  );

  // 1. Datablock-first precedence
  if (snapshotValid && snapshot) {
    const datablockHits: { ac: Aircraft; dist: number }[] = [];
    for (const ac of world.aircraft) {
      const presentation = snapshot.presentations.get(ac.id);
      const layout = snapshot.layouts.get(ac.id);
      if (
        presentation &&
        layout?.rect &&
        pointInDatablock(cssX, cssY, {
          x: layout.rect.x,
          y: layout.rect.y,
          w: layout.rect.width,
          h: layout.rect.height,
        })
      ) {
        if (!isRblTargetEligibleAndDisplayed(world, view, ac.id, cssWidth, cssHeight)) {
          return { kind: "error", error: "NO FLIGHT" };
        }
        const dist = Math.hypot(
          layout.rect.x + layout.rect.width / 2 - cssX,
          layout.rect.y + layout.rect.height / 2 - cssY,
        );
        datablockHits.push({ ac, dist });
      }
    }

    if (datablockHits.length > 0) {
      let minDist = Infinity;
      for (const h of datablockHits) {
        if (h.dist < minDist) minDist = h.dist;
      }
      const closest = datablockHits.filter((h) => Math.abs(h.dist - minDist) < 1e-4);
      const distinctIds = new Set(closest.map((h) => h.ac.id));
      if (distinctIds.size > 1) {
        return { kind: "error", error: "NO FLIGHT" };
      }
      return { kind: "track", aircraftId: closest[0]!.ac.id };
    }
  }

  // 2. Symbol hit testing
  const symbolHits: { ac: Aircraft; dist: number }[] = [];
  for (const ac of world.aircraft) {
    const td = view.tracks.get(ac.id);
    const report = td?.lastReport;
    if (!report) {
      continue;
    }
    if (
      !Number.isFinite(report.xNm) ||
      !Number.isFinite(report.yNm) ||
      !Number.isFinite(report.reportedAtSimMs)
    ) {
      continue;
    }
    const symPt = nmToScreen(report.xNm, report.yNm, view.camera, size);
    if (!Number.isFinite(symPt.x) || !Number.isFinite(symPt.y)) {
      continue;
    }
    const dist = Math.hypot(symPt.x - cssX, symPt.y - cssY);
    if (dist <= HIT_RADIUS_CSS_PX) {
      if (!isRblTargetEligibleAndDisplayed(world, view, ac.id, cssWidth, cssHeight)) {
        return { kind: "error", error: "NO FLIGHT" };
      }
      symbolHits.push({ ac, dist });
    }
  }

  if (symbolHits.length > 0) {
    let minDist = Infinity;
    for (const h of symbolHits) {
      if (h.dist < minDist) minDist = h.dist;
    }
    const closest = symbolHits.filter((h) => Math.abs(h.dist - minDist) < 1e-4);
    const distinctIds = new Set(closest.map((h) => h.ac.id));
    if (distinctIds.size > 1) {
      return { kind: "error", error: "NO FLIGHT" };
    }
    return { kind: "track", aircraftId: closest[0]!.ac.id };
  }

  // 3. Empty on-PPI click becomes static ENU coordinate
  const nm = screenToNm(cssX, cssY, view.camera, size);
  return { kind: "static", xNm: nm.eastNm, yNm: nm.northNm };
}

/**
 * Handle PPI left click for Range-Bearing Line creation:
 * - If view is in RBL entry (either bare *T entered, or first endpoint staged),
 *   processes the click as endpoint 1 or endpoint 2.
 * - Returns true when consumed.
 */
export function handleRblClick(
  view: ScopeView,
  world: World,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
  nowMs: number = Date.now(),
): boolean {
  const isAwaitingFirstClick =
    view.preview.entryOrigin === "literalSplat" &&
    view.preview.phase === "entry" &&
    view.preview.buffer.trim().toUpperCase() === "*T";
  const isAwaitingSecondEndpoint = view.rbl.pendingFirstEndpoint !== null;

  if (!isAwaitingFirstClick && !isAwaitingSecondEndpoint) {
    return false;
  }

  const pickResult = pickRblTargetAt(world, view, cssX, cssY, cssWidth, cssHeight);
  if (pickResult.kind === "error") {
    cancelRblPending(view.rbl);
    rejectPreviewAreaWithReason(view.preview, nowMs, pickResult.error);
    return true;
  }

  const endpoint: RblEndpoint =
    pickResult.kind === "track"
      ? { kind: "track", aircraftId: pickResult.aircraftId }
      : { kind: "static", xNm: pickResult.xNm, yNm: pickResult.yNm };

  if (view.rbl.pendingFirstEndpoint === null) {
    // First endpoint resolved via click
    view.rbl.pendingFirstEndpoint = endpoint;
    // Clear preview buffer and transition to stage 2
    view.preview.phase = "entry";
    view.preview.buffer = "";
    view.preview.entryOrigin = "literalSplat";
    view.preview.mnemonic = "RBL";
    view.preview.flid = null;
    view.preview.rejection = null;
    return true;
  }

  // Second endpoint resolved via click -> commit immediately!
  const firstEndpoint = view.rbl.pendingFirstEndpoint;
  // If first endpoint was a track, revalidate that it is still alive and has a report
  if (firstEndpoint.kind === "track") {
    const report = view.tracks.get(firstEndpoint.aircraftId)?.lastReport;
    if (
      !world.aircraft.some((aircraft) => aircraft.id === firstEndpoint.aircraftId) ||
      !report ||
      !Number.isFinite(report.xNm) ||
      !Number.isFinite(report.yNm) ||
      !Number.isFinite(report.reportedAtSimMs)
    ) {
      cancelRblPending(view.rbl);
      rejectPreviewAreaWithReason(view.preview, nowMs, "NO FLIGHT");
      return true;
    }
  }

  // Check capacity after first-track revalidation.
  if (view.rbl.lines.size >= 9) {
    cancelRblPending(view.rbl);
    rejectPreviewAreaWithReason(view.preview, nowMs, "CAPACITY");
    return true;
  }

  // Attempt atomic insertion
  const inserted = insertRangeBearingLine(
    view.rbl,
    firstEndpoint,
    endpoint,
    view.tracks,
    world.simTimeMs,
  );
  if (!inserted) {
    cancelRblPending(view.rbl);
    rejectPreviewAreaWithReason(view.preview, nowMs, "CAPACITY");
    return true;
  }

  // Successful creation! Clear pending first endpoint and cancel preview
  view.rbl.pendingFirstEndpoint = null;
  cancelPreviewArea(view.preview);
  return true;
}
