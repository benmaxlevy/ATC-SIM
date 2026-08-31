import type { LatLon, NmEastNorth } from "@core";
import type { MvaChart } from "./mva";
import type { ProcedureCatalog } from "./procedures/types";
import type { LoadedVideoMap, VideoMapGroupSet } from "./loadVideoMaps";

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

/** Concentric **range rings**. Runtime origin is ScopeView (airport ref by default). */
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
  /** Present when `video-maps/<ICAO>/groups.json` exists. DCB layout, not identity. */
  videoMapGroups?: VideoMapGroupSet;
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

/** Facility GI TEXT slots. Empty string = unused; those cells stay inert. */
export const GI_TEXT_LINE_COUNT = 10;

/**
 * Explicit arrival aircraft. Count must be 4–8 (default KDEM has 6).
 * Playable default (`spawnPolicy: "star-inbound"`) takes pose from
 * `assignStarRoutes`, not JSON xy. The T01-04 downwind box (xNm [+10, +22],
 * yNm [+3, +12], headingDeg [80, 100], altitudeFt [6000, 10000] multiple of
 * 100, speedKt [210, 250], DAL123 heading 100) lives on
 * `testdata/scenarios/kdem-downwind.json` (`spawnPolicy: "authored"`).
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
  /**
   * Spawn on this STAR with VIA armed (T04-12). Positions stay in JSON.
   * Requires `transitionId`. Ignored when `spawnPolicy` is `star-inbound`.
   */
  starId?: string;
  /** STAR transition (`N` / `S` on DEM1). Required when `starId` is set. */
  transitionId?: string;
}

export interface DepartureSpawn {
  callsign: string;
  sidId: string;
  transitionId: string;
  assignedAltitudeFt: number;
  aircraftType?: string;
  scheduledSimMs?: number;
}

export type DeparturePolicy = "none" | "auto" | "authored";

export interface DepartureConfig {
  policy: DeparturePolicy;
  ratePerHour?: number;
  departures?: DepartureSpawn[];
}

/** How arrivals get pose. Omitted JSON → `authored` (ils27 bit-stable). */
export type SpawnPolicy = "authored" | "star-inbound";

/** Trainer-authored site kind. Not a NAS sensor class. */
export type RadarSiteKind = "asr" | "airport";

/**
 * Default site range when JSON omits `rangeNm`.
 * Coverage at report time is T02-75; load only stores the authored radius.
 */
export const RADAR_SITE_DEFAULT_RANGE_NM = 60;

/**
 * Default airport/ASR report period when JSON omits `periodMs`.
 * FUSED 1.0 s sampling is T02-75; this default is the single-site / MULTI period.
 */
export const RADAR_SITE_DEFAULT_PERIOD_MS = 4800;

/**
 * Trainer-authored display fixture; not NAS adaptation or a live sensor.
 *
 * R07 (CRC / vNAS STARS SITE FUSED / MULTI) and R04 (FAA STARS / TAMR) supply
 * display vocabulary only. Rows are simulator fixtures with configurable range
 * and period — not certified surveillance or official site adaptation.
 *
 * Authored JSON may use local ENU (`xNm`/`yNm`) or lat/lon (`latDeg`/`lonDeg`).
 * Exactly one complete pair is required. Loaded form is always ENU relative to
 * the scenario ARP via `latLonToNm`.
 */
export type RadarSite = {
  id: string;
  name: string;
  kind: RadarSiteKind;
  xNm: number;
  yNm: number;
  rangeNm: number;
  periodMs: number;
};

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
  /** Optional departure traffic configuration. */
  departureConfig?: DepartureConfig;
  /**
   * Ten GI TEXT slots (CRC analog). Empty string = unused. Authored trainer
   * copy (ATIS letter / runway / approach) — not a live METAR download.
   */
  giTextLines: string[];
  /**
   * Configured airports for live METAR weather fetch and SSA altimeter display.
   * [0] = primary airport (drives Line 3 altimeter); [1..] = satellite airports.
   * When omitted, defaults to [icao]. Scenario JSON config only — no runtime command.
   */
  ssaWeatherAirports?: string[];
  /** `authored` = JSON xy. `star-inbound` = seeded catalog pose. Default authored. */
  spawnPolicy: SpawnPolicy;
  /** Facility navaids / fixes / STAR / approaches. Loaded from `data/<icao>/`. */
  catalog: ProcedureCatalog;
  /** Trainer MVA polygons. Null when the facility has no `*-mva.json`. */
  mva: MvaChart | null;
  /**
   * Trainer-authored radar sites. Omitted JSON loads as `[]`.
   * Empty means implicit FUSED for T02-75 (no site-selection entries, not
   * “no surveillance”). This ticket does not sample or paint.
   */
  radarSites: RadarSite[];
}
