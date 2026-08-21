import type { World } from "@core";
import { DEFAULT_SCOPE_CAMERA, type ScopeCamera } from "./camera";
import { cssPointFromClient, handlePpiLeftClick } from "./ppiPointer";
import { renderScope } from "./renderScope";
import type { ScopeView } from "./scopeView";

/**
 * Analog: CRC STARS RANGE / CENTER display (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: Canvas2D north-up PPI; rAF paints only after advanceWorld.
 * Resize recomputes pixels and does not reset center/range unless size is 0.
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
  cam: ScopeCamera = DEFAULT_SCOPE_CAMERA,
  dpr: number = globalThis.devicePixelRatio || 1,
): void {
  const { cssWidth, cssHeight } = fitCanvasToCss(canvas, dpr);
  if (cssWidth === 0 || cssHeight === 0) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderScope(ctx, world, cam, cssWidth, cssHeight);
}
