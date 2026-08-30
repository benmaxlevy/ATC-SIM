/**
 * Local-tangent NM conversion for CRC GeoJSON (T04-37).
 *
 * Copied from `tools/cifp-import/coordinates.ts` so this tool never imports
 * `src/`. Runtime must never import this module.
 */

export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

export interface NmEastNorth {
  xNm: number;
  yNm: number;
}

const NM_PER_DEG_LAT = 60;

function originCosLat(origin: LatLon): number {
  if (Math.abs(origin.latDeg) >= 90) {
    throw new RangeError("ENU origin latitude cannot be at a pole (|latDeg| >= 90)");
  }
  return Math.cos((origin.latDeg * Math.PI) / 180);
}

/** Convert WGS84 lat/lon to local NM without importing runtime simulation code. */
export function latLonToNm(point: LatLon, origin: LatLon): NmEastNorth {
  const cosLat = originCosLat(origin);
  return {
    xNm: (point.lonDeg - origin.lonDeg) * NM_PER_DEG_LAT * cosLat,
    yNm: (point.latDeg - origin.latDeg) * NM_PER_DEG_LAT,
  };
}
