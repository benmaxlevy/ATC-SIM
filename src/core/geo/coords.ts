/** Geodetic degrees, WGS84 spherical approximation. */
export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

/** Local ENU, origin = facility ARP. +x east, +y north, NM. */
export interface NmEastNorth {
  xNm: number;
  yNm: number;
}

/** 1 NM = 1 arc-minute of latitude (spherical). */
const NM_PER_DEG_LAT = 60;

function originCosLat(origin: LatLon): number {
  if (Math.abs(origin.latDeg) >= 90) {
    throw new RangeError("ENU origin latitude cannot be at a pole (|latDeg| >= 90)");
  }
  return Math.cos((origin.latDeg * Math.PI) / 180);
}

/** Convert geodetic degrees to local ENU NM using `origin` latitude for the east scale. */
export function latLonToNm(point: LatLon, origin: LatLon): NmEastNorth {
  const cosLat = originCosLat(origin);
  return {
    xNm: (point.lonDeg - origin.lonDeg) * NM_PER_DEG_LAT * cosLat,
    yNm: (point.latDeg - origin.latDeg) * NM_PER_DEG_LAT,
  };
}

/** Inverse of `latLonToNm`. Same origin cosine (tangent plane, not per-point). */
export function nmToLatLon(en: NmEastNorth, origin: LatLon): LatLon {
  const cosLat = originCosLat(origin);
  return {
    latDeg: origin.latDeg + en.yNm / NM_PER_DEG_LAT,
    lonDeg: origin.lonDeg + en.xNm / (NM_PER_DEG_LAT * cosLat),
  };
}

/**
 * True heading in `[0, 360)`. `0` is north (+y), `90` is east (+x).
 * `360` and multiples normalize to `0`.
 */
export function normalizeHeadingDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
