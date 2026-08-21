import type { LatLon, NmEastNorth } from "@core";

/** One runway. Heading true = magnetic at KDEM (mag var 0). */
export interface Runway {
  id: string;
  headingTrueDeg: number;
  headingMagDeg: number;
  lengthFt: number;
  thresholdLatLon: LatLon;
}

/** Approach stub. Geometry (glideslope, intercept) is phase 4. */
export interface Approach {
  id: string;
  runwayId: string;
  type: string;
}

/** Named fix stub. Procedure geometry is phase 4. */
export interface Fix {
  id: string;
}

/** Digital / video map polyline stub. Empty at KDEM in phase 0. */
export interface VideoMap {
  id: string;
}

/** Spawn template. Offset is world ENU NM relative to ARP. */
export interface Spawn {
  id: string;
  kind: string;
  runwayId: string;
  offsetNm: NmEastNorth;
}

/**
 * Facility scenario: spawn rules, active runway, maps, traffic mix.
 * `arpNm` is filled on load via `latLonToNm(arp, arp)`, not stored as sim state.
 */
export interface Scenario {
  id: string;
  name: string;
  icao: string;
  magVarDeg: number;
  fieldElevFt: number;
  arp: LatLon;
  arpNm: NmEastNorth;
  activeRunwayId: string;
  runways: Runway[];
  approaches: Approach[];
  fixes: Fix[];
  maps: { videoMaps: VideoMap[] };
  spawns: Spawn[];
}
