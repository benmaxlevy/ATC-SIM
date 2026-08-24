import type { World } from "@core";
import { applyPanScreenDelta, screenToNm, type ScopeViewSize } from "./camera";
import { HIT_RADIUS_CSS_PX, pickAircraftAt, selectOrAcceptAircraftAt } from "./pick";
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
