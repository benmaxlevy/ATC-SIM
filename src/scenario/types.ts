import type { LatLon, NmEastNorth } from "@core";
import type { ProcedureCatalog } from "./procedures/types";
import type { LoadedVideoMap } from "./videoMapTypes";

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

/** Catalog id for a video map. Geometry lives in `video-maps/<ICAO>/`. */
export interface VideoMap {
  id: string;
}

/** Trainer-drawn runway slab in NM east/north of ARP. Not a GIS polygon. */
export interface DigitalMapRunway {
  id: string;
  thresholdEastNm: number;
  thresholdNorthNm: number;
  lengthNm: number;
  headingTrueDeg: number;
  widthNm: number;
}

/** Localizer feather authored in scenario JSON. Inbound course is runway heading. */
export interface DigitalMapLocalizer {
  runwayId: string;
  courseTrueDeg: number;
  featherLengthNm: number;
  halfWidthDeg: number;
}

/** Concentric range rings about airport ref, not the view center. */
export interface DigitalMapRangeRings {
  intervalNm: number;
  maxNm: number;
}

/**
 * Optional coastline polyline (NM east, NM north).
 * Fictional trainer shoreline — not a real coast and not OSM.
 */
export interface DigitalMapCoastline {
  enabled: boolean;
  polyline: [number, number][];
  note?: string;
}

/** KDEM digital / video map. Geometry is `video-maps/<ICAO>/` plus optional inline. */
export interface ScenarioMaps {
  videoMapSet?: string;
  videoMaps: VideoMap[];
  loadedVideoMaps: LoadedVideoMap[];
  runway?: DigitalMapRunway;
  localizer?: DigitalMapLocalizer;
  rangeRings?: DigitalMapRangeRings;
  coastline?: DigitalMapCoastline;
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
  /** ICAO type stub for FDB line 3. Display-only; omitted types skip line 3. */
  aircraftType?: string;
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
  maps: ScenarioMaps;
  spawns: Spawn[];
  arrivals: ArrivalSpawn[];
  /** Facility navaids / fixes / STAR / approaches. Loaded from `data/<icao>/`. */
  catalog: ProcedureCatalog;
}
