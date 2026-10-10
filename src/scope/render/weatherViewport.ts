import type { ScopeViewSize } from "../camera";

export interface WeatherCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Clip in screen space before scaling a potentially much larger mosaic. */
export function weatherViewportCrop(
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  size: ScopeViewSize,
): WeatherCrop | undefined {
  if (width <= 0 || height <= 0 || w <= 0 || h <= 0) return undefined;
  const dx = Math.max(0, x);
  const dy = Math.max(0, y);
  const dw = Math.min(size.widthPx, x + w) - dx;
  const dh = Math.min(size.heightPx, y + h) - dy;
  if (dw <= 0 || dh <= 0) return undefined;
  return {
    sx: ((dx - x) / w) * width,
    sy: ((dy - y) / h) * height,
    sw: (dw / w) * width,
    sh: (dh / h) * height,
    dx,
    dy,
    dw,
    dh,
  };
}
