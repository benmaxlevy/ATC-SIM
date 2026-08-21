import type { World } from "@core";
import { DEFAULT_CAMERA, type Camera } from "./camera";
import { drawPpi } from "./draw";
import { selectAircraftAt } from "./pick";

/**
 * Analog: CRC STARS display (docs.virtualnas.net/crc/stars).
 * Trainer delta: Canvas2D north-up PPI; rAF paints only after advanceWorld.
 * Not NAS STARS.
 */

export function fitCanvasToCss(
  canvas: HTMLCanvasElement,
  dpr: number,
): { cssWidth: number; cssHeight: number } {
  const cssWidth = Math.max(1, canvas.clientWidth);
  const cssHeight = Math.max(1, canvas.clientHeight);
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
  cam: Camera = DEFAULT_CAMERA,
): void {
  const rect = canvas.getBoundingClientRect();
  const cssX = clientX - rect.left;
  const cssY = clientY - rect.top;
  selectAircraftAt(world, cssX, cssY, cam, rect.width, rect.height);
}

/** Resize to device pixels, scale to CSS pixels, then draw rings / airport / tracks. */
export function paintPpi(
  canvas: HTMLCanvasElement,
  world: World,
  cam: Camera = DEFAULT_CAMERA,
  dpr: number = globalThis.devicePixelRatio || 1,
): void {
  const { cssWidth, cssHeight } = fitCanvasToCss(canvas, dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPpi(ctx, world, cam, cssWidth, cssHeight);
}
