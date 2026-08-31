/**
 * IEM / NWS N0Q (super-res base reflectivity) RGB → dBZ.
 *
 * IEM paints CONUS N0Q to match the NWS NEXRAD display
 * (https://mesonet.agron.iastate.edu/docs/nexrad_composites/): values below
 * 0 dBZ and NODATA are black; the visual ramp follows the NWS 5 dBZ stops.
 * IEM N0Q tiles are already color-mapped PNG, not raw 0.5 dBZ indices.
 *
 * Official 5 dBZ stops use the common NWS Level-III hues (cyan → green →
 * yellow → orange → red → magenta → white). Extra stops at 18 / 36 / 41 /
 * 46 / 51 are linear RGB blends between neighbors so VIP edges can be
 * fixture-tested. 30 / 40 / 50 cite JO 7110.65.
 *
 * Transparent, black, and unknown RGB → no VIP (null).
 */

export interface N0qRampStop {
  dbz: number;
  r: number;
  g: number;
  b: number;
}

/** Documented N0Q-style stops. Order is increasing dBZ. */
export const N0Q_RGB_DBZ_RAMP: readonly N0qRampStop[] = [
  { dbz: 5, r: 0, g: 236, b: 236 },
  { dbz: 10, r: 1, g: 160, b: 246 },
  { dbz: 15, r: 0, g: 0, b: 246 },
  { dbz: 18, r: 0, g: 153, b: 98 },
  { dbz: 20, r: 0, g: 255, b: 0 },
  { dbz: 25, r: 0, g: 200, b: 0 },
  { dbz: 30, r: 0, g: 144, b: 0 },
  { dbz: 35, r: 255, g: 255, b: 0 },
  { dbz: 36, r: 250, g: 242, b: 0 },
  { dbz: 40, r: 231, g: 192, b: 0 },
  { dbz: 41, r: 236, g: 182, b: 0 },
  { dbz: 45, r: 255, g: 144, b: 0 },
  { dbz: 46, r: 255, g: 115, b: 0 },
  { dbz: 50, r: 255, g: 0, b: 0 },
  { dbz: 51, r: 247, g: 0, b: 0 },
  { dbz: 55, r: 214, g: 0, b: 0 },
  { dbz: 60, r: 192, g: 0, b: 0 },
  { dbz: 65, r: 255, g: 0, b: 255 },
  { dbz: 70, r: 153, g: 85, b: 201 },
  { dbz: 75, r: 255, g: 255, b: 255 },
];

/** Reject colors farther than this from every documented stop. */
const MAX_NEAREST_DIST_SQ = 48 * 48;

function distSq(r: number, g: number, b: number, stop: N0qRampStop): number {
  const dr = r - stop.r;
  const dg = g - stop.g;
  const db = b - stop.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Map one PNG pixel to dBZ. Transparent / black / unknown → null (no VIP).
 */
export function rgbToDbz(r: number, g: number, b: number, a: number = 255): number | null {
  if (a < 8) {
    return null;
  }
  if (r + g + b < 8) {
    return null;
  }
  let best: N0qRampStop | null = null;
  let bestDist = Infinity;
  for (const stop of N0Q_RGB_DBZ_RAMP) {
    const d = distSq(r, g, b, stop);
    if (d < bestDist) {
      bestDist = d;
      best = stop;
    }
    if (d === 0) {
      return stop.dbz;
    }
  }
  if (best === null || bestDist > MAX_NEAREST_DIST_SQ) {
    return null;
  }
  return best.dbz;
}
