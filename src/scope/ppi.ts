import { acceptPointout, handoffFor, setSelectedAircraft, type World } from "@core";
import { expireFilterEntry } from "./altitudeFilter";
import {
  cancelPreviewArea,
  expirePreviewArea,
  previewFlidMatchesSlew,
  previewRelocateListId,
  previewTrackingSlew,
  rejectPreviewArea,
  rejectPreviewCntl,
  type PreviewArmedAction,
} from "./previewArea";
import {
  applyStarsChordAction,
  cancelStarsChordEntry,
  commitStarsChord,
  expireStarsChordEntry,
  rejectStarsChordEntry,
} from "./starsChord";
import { applyPanScreenDelta, screenToNm, type ScopeViewSize } from "./camera";
import { DEFAULT_LEADER_DIR, leaderDirFromStarsClock } from "./leader";
import {
  HIT_RADIUS_CSS_PX,
  middleClickAircraftAt,
  pickAircraftAt,
  pickAircraftHitAt,
  selectOrAcceptAircraftAt,
  type AircraftPickHit,
} from "./pick";
import { renderScope } from "./renderScope";
import { centerOnWorld, recordLastClick, setRangeRingOrigin, type ScopeView } from "./scopeView";
import { normalizedClickAnchor, relocateSystemList } from "./systemLists";
import {
  acceptInboundOnClick,
  applyBeaconatorSlewToId,
  applyDropTrackToId,
  applyInitiateTrackToId,
  ensureTrackDisplay,
  setLeaderDirForId,
  toggleTrackHighlight,
  toggleTrackPdbFdb,
} from "./trackDisplay";

function viewSize(widthPx: number, heightPx: number): ScopeViewSize {
  return { widthPx, heightPx };
}

function trackingFlidMatches(
  view: ScopeView,
  action: PreviewArmedAction,
  aircraftId: string,
  world: World,
): boolean {
  if (action.type !== "initCntl" && action.type !== "termCntl") {
    return true;
  }
  if (action.flid) {
    const saved = view.preview.flid;
    view.preview.flid = action.flid;
    const ok = previewFlidMatchesSlew(view.preview, aircraftId, world);
    view.preview.flid = saved;
    return ok;
  }
  return previewFlidMatchesSlew(view.preview, aircraftId, world);
}

function clearTrackingSlew(view: ScopeView): void {
  cancelPreviewArea(view.preview);
  cancelStarsChordEntry(view.starsChordEntry);
  view.starsChordArmed = null;
}

/**
 * Command-then-slew apply. Empty click does not call this. Returns true when
 * the arm/buffer is consumed (applied or INV). False keeps the arm.
 */
function applyTrackingSlewHit(
  view: ScopeView,
  world: World,
  hit: AircraftPickHit,
  action: PreviewArmedAction,
): boolean {
  const id = hit.aircraft.id;
  if (!trackingFlidMatches(view, action, id, world)) {
    rejectPreviewCntl(view.preview, Date.now());
    cancelStarsChordEntry(view.starsChordEntry);
    view.starsChordArmed = null;
    return true;
  }
  switch (action.type) {
    case "initCntl":
      applyInitiateTrackToId(view.tracks, world, id);
      setSelectedAircraft(world, id);
      clearTrackingSlew(view);
      return true;
    case "termCntl": {
      const td = ensureTrackDisplay(view.tracks, id);
      if (hit.region === "datablock") {
        toggleTrackPdbFdb(td);
      } else {
        applyDropTrackToId(view.tracks, world, id);
      }
      setSelectedAircraft(world, id);
      clearTrackingSlew(view);
      return true;
    }
    case "acceptHandoff": {
      const ho = handoffFor(world, id);
      if (ho.kind !== "inbound") {
        return false;
      }
      acceptInboundOnClick(view.tracks, world, id);
      setSelectedAircraft(world, id);
      clearTrackingSlew(view);
      return true;
    }
    case "ackPointout": {
      const ho = handoffFor(world, id);
      const td = ensureTrackDisplay(view.tracks, id);
      if (ho.kind === "pointout_inbound" && ho.status === "pending") {
        acceptPointout(world, id);
        td.pointoutAccepted = true;
        td.pointoutRejected = false;
      } else {
        toggleTrackHighlight(td);
      }
      setSelectedAircraft(world, id);
      clearTrackingSlew(view);
      return true;
    }
    case "setLeaderDir":
      setLeaderDirForId(view.tracks, world, id, leaderDirFromStarsClock(action.starsDir));
      setSelectedAircraft(world, id);
      clearTrackingSlew(view);
      return true;
    case "resetLeaderDir":
      setLeaderDirForId(view.tracks, world, id, view.defaultLeaderDir ?? DEFAULT_LEADER_DIR);
      setSelectedAircraft(world, id);
      clearTrackingSlew(view);
      return true;
    case "beaconatorSlew":
      if (!applyBeaconatorSlewToId(view.tracks, world, id)) {
        return false;
      }
      setSelectedAircraft(world, id);
      clearTrackingSlew(view);
      return true;
    default:
      return false;
  }
}

export function cssPointFromClient(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
): { x: number; y: number } {
  return { x: clientX - rect.left, y: clientY - rect.top };
}

/** Left click: record world point for End, then accept inbound HO if pending and select. */
export function handlePpiLeftClick(
  view: ScopeView,
  world: World,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
  commandText?: string,
): void {
  const size = viewSize(cssWidth, cssHeight);
  const nm = screenToNm(cssX, cssY, view.camera, size);
  recordLastClick(view, nm.eastNm, nm.northNm);
  const relocateId = previewRelocateListId(view.preview);
  if (relocateId) {
    const anchor = normalizedClickAnchor(cssX, cssY, cssWidth, cssHeight);
    if (relocateSystemList(view, relocateId, anchor.x, anchor.y)) {
      cancelPreviewArea(view.preview);
      cancelStarsChordEntry(view.starsChordEntry);
      view.starsChordArmed = null;
      return;
    }
  }
  if (view.placeCenterArmed) {
    centerOnWorld(view, nm.eastNm, nm.northNm);
    view.placeCenterArmed = false;
  } else if (view.placeRangeRingArmed) {
    setRangeRingOrigin(view, nm.eastNm, nm.northNm);
    view.placeRangeRingArmed = false;
  } else {
    const tracking = previewTrackingSlew(view.preview);
    if (tracking) {
      const hit = pickAircraftHitAt(
        world,
        cssX,
        cssY,
        view.camera,
        cssWidth,
        cssHeight,
        HIT_RADIUS_CSS_PX,
        view,
      );
      if (hit && applyTrackingSlewHit(view, world, hit, tracking)) {
        return;
      }
    } else if (view.starsChordEntry.phase === "entry" || view.starsChordArmed) {
      // Live or armed * chord: slew applies the command and must not also accept inbound HO.
      const hit = pickAircraftAt(
        world,
        cssX,
        cssY,
        view.camera,
        cssWidth,
        cssHeight,
        HIT_RADIUS_CSS_PX,
        view,
      );
      if (hit) {
        if (view.starsChordEntry.phase === "entry") {
          const committed = commitStarsChord(view.starsChordEntry.buffer);
          if (committed.kind === "action") {
            setSelectedAircraft(world, hit.id);
            applyStarsChordAction(view, world, committed.action);
            cancelStarsChordEntry(view.starsChordEntry);
            view.starsChordArmed = null;
            if (view.preview.phase === "entry" && view.preview.buffer.startsWith("*")) {
              cancelPreviewArea(view.preview);
            }
            return;
          }
          rejectStarsChordEntry(view.starsChordEntry, Date.now());
          if (view.preview.phase === "entry" && view.preview.buffer.startsWith("*")) {
            rejectPreviewArea(view.preview, Date.now());
          }
          // Incomplete/invalid: do not swallow the click.
        } else if (view.starsChordArmed) {
          setSelectedAircraft(world, hit.id);
          applyStarsChordAction(view, world, view.starsChordArmed);
          view.starsChordArmed = null;
          return;
        }
      }
    }
  }
  selectOrAcceptAircraftAt(
    world,
    view.tracks,
    cssX,
    cssY,
    view.camera,
    cssWidth,
    cssHeight,
    HIT_RADIUS_CSS_PX,
    view,
    commandText,
  );
}

/** Middle click: toggle STARS Cyan highlight on target. */
export function handlePpiMiddleClick(
  view: ScopeView,
  world: World,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
): void {
  middleClickAircraftAt(
    world,
    view.tracks,
    cssX,
    cssY,
    view.camera,
    cssWidth,
    cssHeight,
    HIT_RADIUS_CSS_PX,
    view,
  );
}

/** Double-click empty PPI: center there. Track hits stay as select-only. */
export function handlePpiDoubleClick(
  view: ScopeView,
  world: World,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
): void {
  const hit = pickAircraftAt(
    world,
    cssX,
    cssY,
    view.camera,
    cssWidth,
    cssHeight,
    HIT_RADIUS_CSS_PX,
    view,
  );
  if (hit) {
    return;
  }
  const nm = screenToNm(cssX, cssY, view.camera, viewSize(cssWidth, cssHeight));
  recordLastClick(view, nm.eastNm, nm.northNm);
  centerOnWorld(view, nm.eastNm, nm.northNm);
}

/** Right-button (2) or middle-button (1) drag slew. Trainer sugar — not CRC. */
export function isPpiSlewButton(button: number): boolean {
  return button === 1 || button === 2;
}

/** `buttons` bitfield: 2 = right, 4 = middle. */
export function isPpiSlewHeld(buttons: number): boolean {
  return (buttons & 2) !== 0 || (buttons & 4) !== 0;
}

/** Right-drag or middle-drag pan. Trainer sugar — not CRC. */
export function handlePpiPanDelta(
  view: ScopeView,
  dxPx: number,
  dyPx: number,
  cssWidth: number,
  cssHeight: number,
): void {
  applyPanScreenDelta(view.camera, dxPx, dyPx, viewSize(cssWidth, cssHeight));
}

/**
 * Analog: CRC STARS RANGE / CENTER display (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: Canvas2D north-up PPI; rAF paints only after advanceWorld.
 * Resize recomputes pixels and does not reset center/range unless size is 0.
 * T02-10 DCB cells sit on this glass beside the canvas, so clientWidth/Height is
 * already the drawable PPI minus DCB thickness on the docked edge.
 * Not NAS STARS.
 */

export function fitCanvasToCss(
  canvas: HTMLCanvasElement,
  dpr: number,
): { cssWidth: number; cssHeight: number } {
  const cssWidth = Math.max(0, canvas.clientWidth);
  const cssHeight = Math.max(0, canvas.clientHeight);
  if (cssWidth === 0 || cssHeight === 0) {
    return { cssWidth, cssHeight };
  }
  const pixelW = Math.max(1, Math.round(cssWidth * dpr));
  const pixelH = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pixelW) {
    canvas.width = pixelW;
  }
  if (canvas.height !== pixelH) {
    canvas.height = pixelH;
  }
  return { cssWidth, cssHeight };
}

/**
 * Canvas click → CSS pixels via `getBoundingClientRect` (not raw offsetX).
 * Hit-test is 12 CSS px in pixel space. Scope action only: selection, no readback.
 */
export function handlePpiCanvasClick(
  canvas: HTMLCanvasElement,
  world: World,
  clientX: number,
  clientY: number,
  view: ScopeView,
  commandText?: string,
): void {
  const rect = canvas.getBoundingClientRect();
  const { x, y } = cssPointFromClient(clientX, clientY, rect);
  handlePpiLeftClick(view, world, x, y, rect.width, rect.height, commandText);
}

/**
 * Canvas middle click -> toggle STARS Cyan highlight on target.
 */
export function handlePpiCanvasMiddleClick(
  canvas: HTMLCanvasElement,
  world: World,
  clientX: number,
  clientY: number,
  view: ScopeView,
): void {
  const rect = canvas.getBoundingClientRect();
  const { x, y } = cssPointFromClient(clientX, clientY, rect);
  handlePpiMiddleClick(view, world, x, y, rect.width, rect.height);
}

/** Resize to device pixels, scale to CSS pixels, then draw the clipped PPI. */
export function paintPpi(
  canvas: HTMLCanvasElement,
  world: World,
  view: ScopeView,
  dpr: number = globalThis.devicePixelRatio || 1,
): void {
  const { cssWidth, cssHeight } = fitCanvasToCss(canvas, dpr);
  if (cssWidth <= 0 || cssHeight <= 0) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  expireFilterEntry(view.filterEntry, view.altitudeFilter, Date.now());
  expireStarsChordEntry(view.starsChordEntry, Date.now());
  expirePreviewArea(view.preview, Date.now());
  renderScope(ctx, world, view, cssWidth, cssHeight);
}
