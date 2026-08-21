import type { World } from "@core";
import { applyPanScreenDelta, screenToNm, type ScopeViewSize } from "./camera";
import { HIT_RADIUS_CSS_PX, pickAircraftAt, selectAircraftAt } from "./pick";
import { centerOnWorld, recordLastClick, type ScopeView } from "./scopeView";

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

/** Left click: record world point for End, then hit-test select. */
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
  }
  selectAircraftAt(world, cssX, cssY, view.camera, cssWidth, cssHeight, HIT_RADIUS_CSS_PX, view);
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

/** Middle-button drag pan. Trainer sugar — not CRC. */
export function handlePpiPanDelta(
  view: ScopeView,
  dxPx: number,
  dyPx: number,
  cssWidth: number,
  cssHeight: number,
): void {
  applyPanScreenDelta(view.camera, dxPx, dyPx, viewSize(cssWidth, cssHeight));
}
