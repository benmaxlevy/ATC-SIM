/**
 * Analog: CRC STARS RANGE / RR / Compass Rose overlay (docs.virtualnas.net/crc/stars — R07; JO 7110.65).
 * Generates compass rose tick marks and heading numerals on the rectangular border of the radar scope:
 * - Rectangular border bounds with 1px inset from canvas edge (e.g. [1, widthPx - 1] x [1, heightPx - 1]).
 * - 72 radial tick marks at 5° intervals (0° to 355°) radiating from origin to rectangular perimeter.
 * - Minor ticks (5° not multiple of 10°): 4px inward.
 * - Medium ticks (10° not multiple of 30°): 8px inward.
 * - Major ticks (30° multiples: 0°, 30°, ..., 330°): 14px inward.
 * - 12 3-digit labels ("360", "030", ..., "330") radially inward from major ticks by 22px.
 * - Angle math: 0° is North (up, -y), 90° is East (right, +x), 180° is South (down, +y), 270° is West (left, -x).
 */

import type { ScreenPoint } from "./mapLayers";

export type CompassRoseTickKind = "minor" | "medium" | "major";

export interface CompassRoseTick {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  deg: number;
  kind: CompassRoseTickKind;
}

export interface CompassRoseLabel {
  text: string;
  x: number;
  y: number;
  deg: number;
}

export interface CompassRoseRectBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type CompassRoseBoundsInput =
  | { widthPx: number; heightPx: number }
  | CompassRoseRectBounds;

export interface CompassRoseGeometry {
  origin: ScreenPoint;
  bounds: CompassRoseRectBounds;
  ticks: CompassRoseTick[];
  labels: CompassRoseLabel[];
}

export const COMPASS_ROSE_TICK_INTERVAL_DEG = 5;
export const COMPASS_ROSE_MINOR_TICK_PX = 4;
export const COMPASS_ROSE_MEDIUM_TICK_PX = 8;
export const COMPASS_ROSE_MAJOR_TICK_PX = 14;
export const COMPASS_ROSE_LABEL_OFFSET_PX = 22;

export function formatCompassRoseHeading(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  if (normalized === 0) {
    return "360";
  }
  return String(normalized).padStart(3, "0");
}

export function normalizeCompassRoseBounds(bounds: CompassRoseBoundsInput): CompassRoseRectBounds {
  if ("widthPx" in bounds && "heightPx" in bounds) {
    return {
      minX: 1,
      minY: 1,
      maxX: bounds.widthPx - 1,
      maxY: bounds.heightPx - 1,
    };
  }
  return {
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  };
}

export function generateCompassRoseGeometry(
  origin: ScreenPoint,
  bounds: CompassRoseBoundsInput,
): CompassRoseGeometry {
  const rectBounds = normalizeCompassRoseBounds(bounds);

  if (
    !Number.isFinite(rectBounds.minX) ||
    !Number.isFinite(rectBounds.minY) ||
    !Number.isFinite(rectBounds.maxX) ||
    !Number.isFinite(rectBounds.maxY) ||
    rectBounds.maxX <= rectBounds.minX ||
    rectBounds.maxY <= rectBounds.minY
  ) {
    return {
      origin,
      bounds: rectBounds,
      ticks: [],
      labels: [],
    };
  }

  const ticks: CompassRoseTick[] = [];
  const labels: CompassRoseLabel[] = [];

  for (let deg = 0; deg < 360; deg += COMPASS_ROSE_TICK_INTERVAL_DEG) {
    let kind: CompassRoseTickKind;
    let tickLenPx: number;

    if (deg % 30 === 0) {
      kind = "major";
      tickLenPx = COMPASS_ROSE_MAJOR_TICK_PX;
    } else if (deg % 10 === 0) {
      kind = "medium";
      tickLenPx = COMPASS_ROSE_MEDIUM_TICK_PX;
    } else {
      kind = "minor";
      tickLenPx = COMPASS_ROSE_MINOR_TICK_PX;
    }

    const angleRad = (deg * Math.PI) / 180;
    const dx = Math.sin(angleRad);
    const dy = -Math.cos(angleRad);

    // Compute ray-box intersection with rectangular bounds
    let t = Infinity;
    if (dy < -1e-9) {
      const tTop = (rectBounds.minY - origin.y) / dy;
      if (tTop > 0 && tTop < t) {
        t = tTop;
      }
    } else if (dy > 1e-9) {
      const tBottom = (rectBounds.maxY - origin.y) / dy;
      if (tBottom > 0 && tBottom < t) {
        t = tBottom;
      }
    }

    if (dx > 1e-9) {
      const tRight = (rectBounds.maxX - origin.x) / dx;
      if (tRight > 0 && tRight < t) {
        t = tRight;
      }
    } else if (dx < -1e-9) {
      const tLeft = (rectBounds.minX - origin.x) / dx;
      if (tLeft > 0 && tLeft < t) {
        t = tLeft;
      }
    }

    if (!Number.isFinite(t) || t <= 0) {
      continue;
    }

    const bx = origin.x + t * dx;
    const by = origin.y + t * dy;

    const x1 = bx;
    const y1 = by;
    const x2 = bx - tickLenPx * dx;
    const y2 = by - tickLenPx * dy;

    ticks.push({
      x1,
      y1,
      x2,
      y2,
      deg,
      kind,
    });

    if (kind === "major") {
      const labelX = bx - COMPASS_ROSE_LABEL_OFFSET_PX * dx;
      const labelY = by - COMPASS_ROSE_LABEL_OFFSET_PX * dy;
      labels.push({
        text: formatCompassRoseHeading(deg),
        x: labelX,
        y: labelY,
        deg,
      });
    }
  }

  return {
    origin,
    bounds: rectBounds,
    ticks,
    labels,
  };
}
