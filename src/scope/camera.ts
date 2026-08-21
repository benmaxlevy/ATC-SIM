/**
 * Analog: CRC STARS range / center (docs.virtualnas.net/crc/stars).
 * Trainer delta: fixed 40 NM, north-up only; no range keys or off-center UI. Not NAS STARS.
 *
 * Mapping: `pxPerNm = min(cssWidth, cssHeight) / (2 * rangeNm)` so a `rangeNm`
 * radius fits in the smaller canvas dimension. Origin (airport ref) is the
 * canvas center. +x NM = east = right; +y NM = north = up the screen.
 */

export const DEFAULT_RANGE_NM = 40;

export interface Camera {
  rangeNm: number;
  centerXNm: number;
  centerYNm: number;
}

export const DEFAULT_CAMERA: Camera = {
  rangeNm: DEFAULT_RANGE_NM,
  centerXNm: 0,
  centerYNm: 0,
};

/** Pixels per NM so `rangeNm` reaches the nearer of half-width / half-height. */
export function pxPerNm(cam: Camera, cssWidth: number, cssHeight: number): number {
  return Math.min(cssWidth, cssHeight) / (2 * cam.rangeNm);
}

export function worldToCanvas(
  xNm: number,
  yNm: number,
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
): { x: number; y: number } {
  const scale = pxPerNm(cam, cssWidth, cssHeight);
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  return {
    x: cx + (xNm - cam.centerXNm) * scale,
    y: cy - (yNm - cam.centerYNm) * scale,
  };
}

/** Inverse of `worldToCanvas`. CSS pixels in, NM out. Used by T01-11 pick. */
export function canvasToWorld(
  x: number,
  y: number,
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
): { xNm: number; yNm: number } {
  const scale = pxPerNm(cam, cssWidth, cssHeight);
  const cx = cssWidth / 2;
  const cy = cssHeight / 2;
  return {
    xNm: cam.centerXNm + (x - cx) / scale,
    yNm: cam.centerYNm - (y - cy) / scale,
  };
}
