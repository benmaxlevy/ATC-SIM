/**
 * Analog: CRC STARS RANGE / RR / Compass Rose overlay (docs.virtualnas.net/crc/stars — R07; JO 7110.65).
 * Generates compass rose tick marks and heading numerals on the outermost range ring:
 * - 72 radial tick marks at 5° intervals (0° to 355°).
 * - Minor ticks (5° not multiple of 10°): 4px inward.
 * - Medium ticks (10° not multiple of 30°): 8px inward.
 * - Major ticks (30° multiples: 0°, 30°, ..., 330°): 14px inward.
 * - 12 3-digit labels ("360", "030", ..., "330") radially inward from major ticks at radiusPx - 22px.
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

export interface CompassRoseGeometry {
  origin: ScreenPoint;
  radiusPx: number;
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

export function generateCompassRoseGeometry(
  origin: ScreenPoint,
  radiusPx: number,
  maxRadiusPx?: number,
): CompassRoseGeometry {
  const effectiveRadius =
    maxRadiusPx !== undefined && maxRadiusPx > 0
      ? Math.min(radiusPx, maxRadiusPx)
      : radiusPx;

  if (effectiveRadius <= 0) {
    return {
      origin,
      radiusPx: effectiveRadius,
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
    const sinAngle = Math.sin(angleRad);
    const cosAngle = Math.cos(angleRad);

    const x1 = origin.x + effectiveRadius * sinAngle;
    const y1 = origin.y - effectiveRadius * cosAngle;
    const rInner = effectiveRadius - tickLenPx;
    const x2 = origin.x + rInner * sinAngle;
    const y2 = origin.y - rInner * cosAngle;

    ticks.push({
      x1,
      y1,
      x2,
      y2,
      deg,
      kind,
    });

    if (kind === "major") {
      const rLabel = effectiveRadius - COMPASS_ROSE_LABEL_OFFSET_PX;
      const labelX = origin.x + rLabel * sinAngle;
      const labelY = origin.y - rLabel * cosAngle;
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
    radiusPx: effectiveRadius,
    ticks,
    labels,
  };
}
