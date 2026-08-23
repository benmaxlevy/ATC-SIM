/**
 * Analog: CRC STARS RANGE / CENTER (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: presets 5–60 NM (CRC also has 6/8/12/16/24); PageUp/Down + wheel
 * call `stepRange` (no wrap). DCB RANGE click uses `cycleRange` through the same
 * 8 presets (wrap 60→5). Right-drag (or middle-drag) slew is trainer sugar — not CRC.
 * No zoom-to-cursor (R12 browser-ATC anti-pattern). Not NAS STARS.
 *
 * Range is the nearest-edge NM of the rectangular PPI
 * (`pxPerNm = min(width, height) / 2 / rangeNm`). Corners of a wide/tall canvas
 * show extra NM. Changing range does not move the view center.
 */

export const RANGE_PRESETS_NM = [5, 10, 15, 20, 30, 40, 50, 60] as const;
export type RangeNm = (typeof RANGE_PRESETS_NM)[number];

export const DEFAULT_RANGE_NM: RangeNm = 20;

/** KDEM airport reference in local ENU NM (T00-04 / T00-05 ARP). */
export const AIRPORT_REF_EAST_NM = 0;
export const AIRPORT_REF_NORTH_NM = 0;

export interface ScopeCamera {
  rangeNm: RangeNm;
  /** World point drawn at PPI center. */
  centerEastNm: number;
  centerNorthNm: number;
}

/** CSS-pixel drawable size. Backing-store / DPR is applied before this mapping. */
export interface ScopeViewSize {
  widthPx: number;
  heightPx: number;
}

export const DEFAULT_SCOPE_CAMERA: ScopeCamera = {
  rangeNm: DEFAULT_RANGE_NM,
  centerEastNm: AIRPORT_REF_EAST_NM,
  centerNorthNm: AIRPORT_REF_NORTH_NM,
};

/** Nearest-edge pixels per NM of the rectangular PPI. Zero when the canvas has no size. */
export function pxPerNm(cam: ScopeCamera, view: ScopeViewSize): number {
  const minDim = Math.min(view.widthPx, view.heightPx);
  if (minDim <= 0 || cam.rangeNm <= 0) {
    return 0;
  }
  return minDim / 2 / cam.rangeNm;
}

export function nmToScreen(
  eastNm: number,
  northNm: number,
  cam: ScopeCamera,
  view: ScopeViewSize,
): { x: number; y: number } {
  const scale = pxPerNm(cam, view);
  const cx = view.widthPx / 2;
  const cy = view.heightPx / 2;
  return {
    x: cx + (eastNm - cam.centerEastNm) * scale,
    y: cy - (northNm - cam.centerNorthNm) * scale,
  };
}

export function screenToNm(
  x: number,
  y: number,
  cam: ScopeCamera,
  view: ScopeViewSize,
): { eastNm: number; northNm: number } {
  const scale = pxPerNm(cam, view);
  if (scale === 0) {
    return { eastNm: cam.centerEastNm, northNm: cam.centerNorthNm };
  }
  const cx = view.widthPx / 2;
  const cy = view.heightPx / 2;
  return {
    eastNm: cam.centerEastNm + (x - cx) / scale,
    northNm: cam.centerNorthNm - (y - cy) / scale,
  };
}

/** Canvas-center circle whose radius equals RANGE (nearest edge). Not a clip. */
export function rangeCircle(view: ScopeViewSize): { cx: number; cy: number; radiusPx: number } {
  return {
    cx: view.widthPx / 2,
    cy: view.heightPx / 2,
    radiusPx: Math.min(view.widthPx, view.heightPx) / 2,
  };
}

export function formatRangeReadout(rangeNm: RangeNm): string {
  return `RNG ${rangeNm}`;
}

/** DCB RANGE cell (T02-16). Glossary **range**, never zoom. */
export function formatDcbRangeReadout(rangeNm: RangeNm): string {
  return `RANGE ${rangeNm}`;
}

function presetIndex(rangeNm: RangeNm): number {
  return RANGE_PRESETS_NM.indexOf(rangeNm);
}

/**
 * Step one discrete range preset. `−1` = smaller NM (PageUp / RNG −);
 * `+1` = larger NM (PageDown / RNG +). No wrap at 5 or 60. Does not change center.
 */
export function stepRange(cam: ScopeCamera, delta: number): void {
  const i = presetIndex(cam.rangeNm);
  if (i < 0) {
    return;
  }
  const next = i + delta;
  if (next >= 0 && next < RANGE_PRESETS_NM.length) {
    cam.rangeNm = RANGE_PRESETS_NM[next]!;
  }
}

/** Smaller NM (PageUp / wheel up / RNG −). No wrap at 5. Does not change center. */
export function applyRangeIn(cam: ScopeCamera): void {
  stepRange(cam, -1);
}

/** Larger NM (PageDown / wheel down / RNG +). No wrap at 60. Does not change center. */
export function applyRangeOut(cam: ScopeCamera): void {
  stepRange(cam, 1);
}

/**
 * DCB RANGE click: next larger preset, wrapping 60→5. Same 8 presets as
 * PageUp/Down. Does not change center. Not zoom-to-cursor.
 */
export function cycleRange(cam: ScopeCamera): void {
  const i = presetIndex(cam.rangeNm);
  if (i < 0) {
    return;
  }
  cam.rangeNm = RANGE_PRESETS_NM[(i + 1) % RANGE_PRESETS_NM.length]!;
}

/**
 * Pan the view so the world follows a CSS-pixel drag.
 * Right-button (or middle-button) slew is trainer sugar — not CRC.
 */
export function applyPanScreenDelta(
  cam: ScopeCamera,
  dxPx: number,
  dyPx: number,
  view: ScopeViewSize,
): void {
  const scale = pxPerNm(cam, view);
  if (scale === 0) {
    return;
  }
  cam.centerEastNm -= dxPx / scale;
  cam.centerNorthNm += dyPx / scale;
}
