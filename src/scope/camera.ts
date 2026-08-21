/**
 * Analog: CRC STARS RANGE / CENTER (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: presets 5–60 NM (CRC also has 6/8/12/16/24); PageUp/Down + wheel,
 * no DCB RANGE menu yet. Middle-drag pan is trainer sugar — not CRC.
 * No zoom-to-cursor (R12 browser-ATC anti-pattern). Not NAS STARS.
 *
 * Range is the radius of the inscribed circle of the drawable PPI
 * (`pxPerNm = min(width, height) / 2 / rangeNm`). Corners of a square canvas
 * sit outside range. Changing range does not move the view center.
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

/** Inscribed-circle pixels per NM. Zero when the canvas has no size. */
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

/** Canvas-center circle whose radius equals range. */
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

function presetIndex(rangeNm: RangeNm): number {
  return RANGE_PRESETS_NM.indexOf(rangeNm);
}

/** Smaller NM (PageUp / wheel up). No wrap at 5. Does not change center. */
export function applyRangeIn(cam: ScopeCamera): void {
  const i = presetIndex(cam.rangeNm);
  if (i > 0) {
    cam.rangeNm = RANGE_PRESETS_NM[i - 1]!;
  }
}

/** Larger NM (PageDown / wheel down). No wrap at 60. Does not change center. */
export function applyRangeOut(cam: ScopeCamera): void {
  const i = presetIndex(cam.rangeNm);
  if (i >= 0 && i < RANGE_PRESETS_NM.length - 1) {
    cam.rangeNm = RANGE_PRESETS_NM[i + 1]!;
  }
}

/**
 * Pan the view so the world follows a CSS-pixel drag.
 * Middle-button drag is trainer sugar — not CRC.
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
