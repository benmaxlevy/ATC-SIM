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

/** Inclusive arrival count band. Default KDEM JSON has 6. */
export const ARRIVAL_COUNT_MIN = 4;
export const ARRIVAL_COUNT_MAX = 8;

/**
 * Explicit arrival aircraft. Count must be 4–8 (default KDEM has 6).
 * Phase 1 KDEM spawn box (enforced in spawn tests, not a schema lib):
 * xNm [+10, +22], yNm [+3, +12], headingDeg [80, 100], altitudeFt [6000, 10000]
 * multiple of 100, speedKt [210, 250]. DAL123 must spawn at heading 100 so
 * H270 / SHORTEST turns right toward the field (not a 180° tie from 090).
 */
export interface ArrivalSpawn {
  callsign: string;
  xNm: number;
  yNm: number;
  headingDeg: number;
  altitudeFt: number;
  speedKt: number;
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
  arrivals: ArrivalSpawn[];
}
