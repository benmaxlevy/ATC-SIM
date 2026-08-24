import type { World } from "@core";
import { expireFilterEntry } from "./altitudeFilter";
import { applyPanScreenDelta, screenToNm, type ScopeViewSize } from "./camera";
import { HIT_RADIUS_CSS_PX, pickAircraftAt, selectOrAcceptAircraftAt } from "./pick";
import { renderScope } from "./renderScope";
import { centerOnWorld, recordLastClick, setRangeRingOrigin, type ScopeView } from "./scopeView";

function viewSize(widthPx: number, heightPx: number): ScopeViewSize {
  return { widthPx, heightPx };
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
): void {
  const size = viewSize(cssWidth, cssHeight);
  const nm = screenToNm(cssX, cssY, view.camera, size);
  recordLastClick(view, nm.eastNm, nm.northNm);
  if (view.placeCenterArmed) {
    centerOnWorld(view, nm.eastNm, nm.northNm);
    view.placeCenterArmed = false;
  } else if (view.placeRangeRingArmed) {
    setRangeRingOrigin(view, nm.eastNm, nm.northNm);
    view.placeRangeRingArmed = false;
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
): void {
  const rect = canvas.getBoundingClientRect();
  const { x, y } = cssPointFromClient(clientX, clientY, rect);
  handlePpiLeftClick(view, world, x, y, rect.width, rect.height);
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
  renderScope(ctx, world, view, cssWidth, cssHeight);
}
