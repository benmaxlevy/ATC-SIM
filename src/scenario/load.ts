import { latLonToNm } from "@core";
import type { LatLon, NmEastNorth } from "@core";
import kdem09Json from "./kdem-09.json";
import kdemIls09Json from "./kdem-ils09.json";
import kdemIls27Json from "./kdem-ils27.json";
import kdemJson from "./kdem.json";
import type {
  Approach,
  ArrivalSpawn,
  DepartureConfig,
  DepartureSpawn,
  DigitalMapCoastline,
  DigitalMapLocalizer,
  DigitalMapRangeRings,
  DigitalMapRunway,
  Fix,
  Runway,
  Scenario,
  ScenarioMaps,
  Spawn,
  SpawnPolicy,
  VideoMap,
} from "./types";
import { ARRIVAL_COUNT_MAX, ARRIVAL_COUNT_MIN, GI_TEXT_LINE_COUNT } from "./types";
import { loadCatalog } from "./procedures/loadCatalog";
import { loadMva } from "./mva";
import { parseRadarSites } from "./radarSites";
import {
  coastlineFromVideoMaps,
  loadVideoMapGroups,
  loadVideoMapSet,
  localizerFromVideoMaps,
  runwayFromVideoMaps,
} from "./loadVideoMaps";
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertFinite(value: unknown, path: string, prefix = "Scenario"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${prefix} ${path} must be a finite number`);
  }
  return value;
}

export const assertNumber = assertFinite;

export function assertString(
  value: unknown,
  path: string,
  prefix = "Scenario",
  options?: boolean | { nonEmpty?: boolean },
): string {
  const nonEmpty = typeof options === "boolean" ? options : options?.nonEmpty === true;
  if (typeof value !== "string" || (nonEmpty && value.length === 0)) {
    const requirement = nonEmpty ? "a non-empty string" : "a string";
    throw new Error(`${prefix} ${path} must be ${requirement}`);
  }
  return value;
}

export function assertArray(value: unknown, path: string, prefix = "Scenario"): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${prefix} ${path} must be an array`);
  }
  return value;
}

function assertLatLon(value: unknown, path: string): LatLon {
  if (!isRecord(value)) {
    throw new Error(`Scenario ${path} must be an object`);
  }
  return {
    latDeg: assertNumber(value.latDeg, `${path}.latDeg`),
    lonDeg: assertNumber(value.lonDeg, `${path}.lonDeg`),
  };
}

function assertNmEastNorth(value: unknown, path: string): NmEastNorth {
  if (!isRecord(value)) {
    throw new Error(`Scenario ${path} must be an object`);
  }
  return {
    xNm: assertNumber(value.xNm, `${path}.xNm`),
    yNm: assertNumber(value.yNm, `${path}.yNm`),
  };
}

function assertRunway(value: unknown, index: number): Runway {
  if (!isRecord(value)) {
    throw new Error(`Scenario runways[${index}] must be an object`);
  }
  return {
    id: assertString(value.id, `runways[${index}].id`),
    headingTrueDeg: assertNumber(value.headingTrueDeg, `runways[${index}].headingTrueDeg`),
    headingMagDeg: assertNumber(value.headingMagDeg, `runways[${index}].headingMagDeg`),
    lengthFt: assertNumber(value.lengthFt, `runways[${index}].lengthFt`),
    thresholdLatLon: assertLatLon(value.thresholdLatLon, `runways[${index}].thresholdLatLon`),
  };
}

function assertApproach(value: unknown, index: number): Approach {
  if (!isRecord(value)) {
    throw new Error(`Scenario approaches[${index}] must be an object`);
  }
  return {
    id: assertString(value.id, `approaches[${index}].id`),
    runwayId: assertString(value.runwayId, `approaches[${index}].runwayId`),
    type: assertString(value.type, `approaches[${index}].type`),
  };
}

function assertFix(value: unknown, index: number): Fix {
  if (!isRecord(value)) {
    throw new Error(`Scenario fixes[${index}] must be an object`);
  }
  return { id: assertString(value.id, `fixes[${index}].id`) };
}

function assertVideoMap(value: unknown, index: number): VideoMap {
  if (!isRecord(value)) {
    throw new Error(`Scenario maps.videoMaps[${index}] must be an object`);
  }
  return { id: assertString(value.id, `maps.videoMaps[${index}].id`) };
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Digital-map geometry is optional. Missing or malformed runway/loc/coast
 * must not throw: the scope boots with range rings only (T02-02).
 */
function parseMapRunway(value: unknown): DigitalMapRunway | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = typeof value.id === "string" ? value.id : undefined;
  const thresholdEastNm = optionalFiniteNumber(value.thresholdEastNm);
  const thresholdNorthNm = optionalFiniteNumber(value.thresholdNorthNm);
  const lengthNm = optionalFiniteNumber(value.lengthNm);
  const headingTrueDeg = optionalFiniteNumber(value.headingTrueDeg);
  const widthNm = optionalFiniteNumber(value.widthNm);
  if (
    id === undefined ||
    thresholdEastNm === undefined ||
    thresholdNorthNm === undefined ||
    lengthNm === undefined ||
    headingTrueDeg === undefined ||
    widthNm === undefined
  ) {
    return undefined;
  }
  return { id, thresholdEastNm, thresholdNorthNm, lengthNm, headingTrueDeg, widthNm };
}

function parseMapLocalizer(value: unknown): DigitalMapLocalizer | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const runwayId = typeof value.runwayId === "string" ? value.runwayId : undefined;
  const courseTrueDeg = optionalFiniteNumber(value.courseTrueDeg);
  const featherLengthNm = optionalFiniteNumber(value.featherLengthNm);
  const halfWidthDeg = optionalFiniteNumber(value.halfWidthDeg);
  if (
    runwayId === undefined ||
    courseTrueDeg === undefined ||
    featherLengthNm === undefined ||
    halfWidthDeg === undefined
  ) {
    return undefined;
  }
  return { runwayId, courseTrueDeg, featherLengthNm, halfWidthDeg };
}

function parseMapRangeRings(value: unknown): DigitalMapRangeRings | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const intervalNm = optionalFiniteNumber(value.intervalNm);
  const maxNm = optionalFiniteNumber(value.maxNm);
  if (intervalNm === undefined || maxNm === undefined || intervalNm <= 0 || maxNm <= 0) {
    return undefined;
  }
  return { intervalNm, maxNm };
}

function parseMapCoastline(value: unknown): DigitalMapCoastline | undefined {
  if (!isRecord(value) || typeof value.enabled !== "boolean" || !Array.isArray(value.polyline)) {
    return undefined;
  }
  const polyline: [number, number][] = [];
  for (const pt of value.polyline) {
    if (!Array.isArray(pt) || pt.length < 2) {
      continue;
    }
    const eastNm = pt[0];
    const northNm = pt[1];
    if (typeof eastNm !== "number" || typeof northNm !== "number") {
      continue;
    }
    if (!Number.isFinite(eastNm) || !Number.isFinite(northNm)) {
      continue;
    }
    polyline.push([eastNm, northNm]);
  }
  const note = typeof value.note === "string" ? value.note : undefined;
  return note === undefined
    ? { enabled: value.enabled, polyline }
    : { enabled: value.enabled, polyline, note };
}

function parseScenarioMaps(maps: Record<string, unknown>): ScenarioMaps {
  const videoMapSet =
    typeof maps.videoMapSet === "string" && maps.videoMapSet.length > 0
      ? maps.videoMapSet
      : undefined;
  const loadedVideoMaps = videoMapSet === undefined ? [] : loadVideoMapSet(videoMapSet);
  const videoMapGroups = videoMapSet === undefined ? undefined : loadVideoMapGroups(videoMapSet);
  const listed =
    maps.videoMaps === undefined && videoMapSet !== undefined
      ? loadedVideoMaps.map((map) => ({ id: map.id }))
      : assertArray(maps.videoMaps, "maps.videoMaps").map(assertVideoMap);
  return {
    videoMapSet,
    videoMaps: listed,
    loadedVideoMaps,
    ...(videoMapGroups !== undefined ? { videoMapGroups } : {}),
    runway: parseMapRunway(maps.runway) ?? runwayFromVideoMaps(loadedVideoMaps),
    localizer: parseMapLocalizer(maps.localizer) ?? localizerFromVideoMaps(loadedVideoMaps),
    rangeRings: parseMapRangeRings(maps.rangeRings),
    coastline: parseMapCoastline(maps.coastline) ?? coastlineFromVideoMaps(loadedVideoMaps),
  };
}

function assertSpawn(value: unknown, index: number): Spawn {
  if (!isRecord(value)) {
    throw new Error(`Scenario spawns[${index}] must be an object`);
  }
  return {
    id: assertString(value.id, `spawns[${index}].id`),
    kind: assertString(value.kind, `spawns[${index}].kind`),
    runwayId: assertString(value.runwayId, `spawns[${index}].runwayId`),
    offsetNm: assertNmEastNorth(value.offsetNm, `spawns[${index}].offsetNm`),
  };
}

function assertArrival(value: unknown, index: number): ArrivalSpawn {
  if (!isRecord(value)) {
    throw new Error(`Scenario arrivals[${index}] must be an object`);
  }
  const callsign = assertString(value.callsign, `arrivals[${index}].callsign`).toUpperCase();
  if (callsign.length === 0) {
    throw new Error(`Scenario arrivals[${index}].callsign must be non-empty`);
  }
  const aircraftType = parseOptionalAircraftType(
    value.aircraftType,
    `arrivals[${index}].aircraftType`,
  );
  const star = parseOptionalStarSpawn(value, index);
  return {
    callsign,
    xNm: assertNumber(value.xNm, `arrivals[${index}].xNm`),
    yNm: assertNumber(value.yNm, `arrivals[${index}].yNm`),
    headingDeg: assertNumber(value.headingDeg, `arrivals[${index}].headingDeg`),
    altitudeFt: assertNumber(value.altitudeFt, `arrivals[${index}].altitudeFt`),
    speedKt: assertNumber(value.speedKt, `arrivals[${index}].speedKt`),
    ...(aircraftType ? { aircraftType } : {}),
    ...star,
  };
}

/** STAR + transition for spawn-on-VIA. Both required when either is present. */
function parseOptionalStarSpawn(
  value: Record<string, unknown>,
  index: number,
): { starId: string; transitionId: string } | Record<string, never> {
  const hasStar = value.starId != null;
  const hasTransition = value.transitionId != null;
  if (!hasStar && !hasTransition) {
    return {};
  }
  if (!hasStar || !hasTransition) {
    throw new Error(
      `Scenario arrivals[${index}] must set both starId and transitionId when spawning on a STAR`,
    );
  }
  const starId = assertString(value.starId, `arrivals[${index}].starId`).toUpperCase();
  const transitionId = assertString(
    value.transitionId,
    `arrivals[${index}].transitionId`,
  ).toUpperCase();
  if (starId.length === 0 || transitionId.length === 0) {
    throw new Error(`Scenario arrivals[${index}] starId/transitionId must be non-empty`);
  }
  return { starId, transitionId };
}

/** ICAO type stub for FDB line 3. Optional; 2–4 A–Z0–9. Display-only. */
function parseOptionalAircraftType(value: unknown, path: string): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Scenario ${path} must be a string when present`);
  }
  const type = value.toUpperCase();
  if (!/^[A-Z0-9]{2,4}$/.test(type)) {
    throw new Error(`Scenario ${path} must be 2–4 A–Z0–9 (got ${JSON.stringify(value)})`);
  }
  return type;
}

function assertArrivals(
  value: unknown,
  bounds: { min: number; max: number } = { min: ARRIVAL_COUNT_MIN, max: ARRIVAL_COUNT_MAX },
): ArrivalSpawn[] {
  const raw = assertArray(value, "arrivals");
  if (raw.length < bounds.min || raw.length > bounds.max) {
    throw new Error(
      `Scenario arrivals must have ${bounds.min}-${bounds.max} aircraft (got ${raw.length})`,
    );
  }
  const arrivals = raw.map(assertArrival);
  const seen = new Set<string>();
  for (const arrival of arrivals) {
    if (seen.has(arrival.callsign)) {
      throw new Error(`Scenario arrivals have duplicate callsign ${arrival.callsign}`);
    }
    seen.add(arrival.callsign);
  }
  return arrivals;
}

/**
 * Ten GI TEXT strings. Omitted → ten empty slots (second facility still loads).
 * Present → must be length 10; each entry a string. Empty string = unused.
 * Authored trainer copy — never fetched METAR.
 */
function parseGiTextLines(value: unknown): string[] {
  const lines = Array.from({ length: GI_TEXT_LINE_COUNT }, () => "");
  if (value == null) {
    return lines;
  }
  if (!Array.isArray(value) || value.length !== GI_TEXT_LINE_COUNT) {
    throw new Error(`Scenario giTextLines must be an array of ${GI_TEXT_LINE_COUNT} strings`);
  }
  for (let i = 0; i < GI_TEXT_LINE_COUNT; i++) {
    const slot = value[i];
    if (typeof slot !== "string") {
      throw new Error(`Scenario giTextLines[${i}] must be a string`);
    }
    lines[i] = slot;
  }
  return lines;
}

function parseSsaWeatherAirports(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("Scenario ssaWeatherAirports must be an array of strings");
  }
  return value.map((code, i) => assertString(code, `ssaWeatherAirports[${i}]`, "Scenario", { nonEmpty: true }));
}

function parseSpawnPolicy(value: unknown): SpawnPolicy {
  if (value == null) {
    return "authored";
  }
  if (value === "authored" || value === "star-inbound") {
    return value;
  }
  throw new Error('Scenario spawnPolicy must be "authored" or "star-inbound"');
}

function parseDepartureSpawn(value: unknown, index: number): DepartureSpawn {
  if (!isRecord(value)) {
    throw new Error(`Scenario departureConfig.departures[${index}] must be an object`);
  }
  const callsign = assertString(
    value.callsign,
    `departureConfig.departures[${index}].callsign`,
  ).toUpperCase();
  if (callsign.length === 0) {
    throw new Error(`Scenario departureConfig.departures[${index}].callsign must be non-empty`);
  }
  const aircraftType = parseOptionalAircraftType(
    value.aircraftType,
    `departureConfig.departures[${index}].aircraftType`,
  );
  const scheduledSimMs =
    value.scheduledSimMs === undefined
      ? undefined
      : assertNumber(value.scheduledSimMs, `departureConfig.departures[${index}].scheduledSimMs`);
  return {
    callsign,
    sidId: assertString(value.sidId, `departureConfig.departures[${index}].sidId`).toUpperCase(),
    transitionId: assertString(
      value.transitionId,
      `departureConfig.departures[${index}].transitionId`,
    ).toUpperCase(),
    assignedAltitudeFt: assertNumber(
      value.assignedAltitudeFt,
      `departureConfig.departures[${index}].assignedAltitudeFt`,
    ),
    ...(aircraftType ? { aircraftType } : {}),
    ...(scheduledSimMs !== undefined ? { scheduledSimMs } : {}),
  };
}

function parseDepartureConfig(value: unknown): DepartureConfig | undefined {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("Scenario departureConfig must be an object");
  }
  const policy = value.policy;
  if (policy !== "none" && policy !== "auto" && policy !== "authored") {
    throw new Error('Scenario departureConfig.policy must be "none", "auto", or "authored"');
  }
  const config: DepartureConfig = { policy };
  if (value.ratePerHour !== undefined) {
    config.ratePerHour = assertNumber(value.ratePerHour, "departureConfig.ratePerHour");
  }
  if (value.departures !== undefined) {
    config.departures = assertArray(value.departures, "departureConfig.departures").map(
      parseDepartureSpawn,
    );
  }
  return config;
}

export interface AssertScenarioOptions {
  /** Default KDEM student pack is 4–8. Phase 4 ILS demo may spawn 1–2. */
  arrivalCountMin?: number;
  arrivalCountMax?: number;
}

/**
 * Runtime-check a scenario JSON object. Does not require `icao === "KDEM"`:
 * `icao` must be a string. Always recomputes `arpNm` via `latLonToNm(arp, arp)`.
 */
export function assertScenario(s: unknown, options?: AssertScenarioOptions): Scenario {
  if (!isRecord(s)) {
    throw new Error("Scenario must be an object");
  }

  const icao = assertString(s.icao, "icao");
  const runwaysRaw = assertArray(s.runways, "runways");
  if (runwaysRaw.length === 0) {
    throw new Error("Scenario runways must be a non-empty array");
  }

  const arp = assertLatLon(s.arp, "arp");
  const maps = s.maps;
  if (!isRecord(maps)) {
    throw new Error("Scenario maps must be an object");
  }

  const catalog = loadCatalog(icao.toLowerCase());
  const departureConfig = parseDepartureConfig(s.departureConfig);

  return {
    id: assertString(s.id, "id"),
    name: assertString(s.name, "name"),
    icao,
    magVarDeg: assertNumber(s.magVarDeg, "magVarDeg"),
    fieldElevFt: assertNumber(s.fieldElevFt, "fieldElevFt"),
    arp,
    arpNm: latLonToNm(arp, arp),
    activeRunwayId: assertString(s.activeRunwayId, "activeRunwayId"),
    runways: runwaysRaw.map(assertRunway),
    approaches: assertArray(s.approaches, "approaches").map(assertApproach),
    fixes: assertArray(s.fixes, "fixes").map(assertFix),
    maps: parseScenarioMaps(maps),
    spawns: assertArray(s.spawns, "spawns").map(assertSpawn),
    arrivals: assertArrivals(s.arrivals, {
      min: options?.arrivalCountMin ?? ARRIVAL_COUNT_MIN,
      max: options?.arrivalCountMax ?? ARRIVAL_COUNT_MAX,
    }),
    spawnPolicy: parseSpawnPolicy(s.spawnPolicy),
    giTextLines: parseGiTextLines(s.giTextLines),
    ...(parseSsaWeatherAirports(s.ssaWeatherAirports)
      ? { ssaWeatherAirports: parseSsaWeatherAirports(s.ssaWeatherAirports) }
      : {}),
    ...(departureConfig ? { departureConfig } : {}),
    catalog,
    mva: loadMva(icao),
    radarSites: parseRadarSites(s.radarSites, arp),
  };
}

/** Load fictional KDEM (Demo Field) and fill `arpNm` from T00-04 helpers. */
export function loadKdem(): Scenario {
  return assertScenario(kdemJson);
}

/** Phase 4 playable slice: KDEM East Flow (Runway 09). */
export function loadKdem09(): Scenario {
  return assertScenario(kdem09Json);
}

/** Phase 4 playable slice: DAL123 on DEM1 north + AAL45 on DEM1 south at SEMAX. */
export function loadKdemIls27(): Scenario {
  return assertScenario(kdemIls27Json, { arrivalCountMin: 1, arrivalCountMax: ARRIVAL_COUNT_MAX });
}

/** Phase 4 playable slice: DAL123 on DEM1 west-north + AAL45 on DEM1 west-south at WSMAX. */
export function loadKdemIls09(): Scenario {
  return assertScenario(kdemIls09Json, { arrivalCountMin: 1, arrivalCountMax: ARRIVAL_COUNT_MAX });
}
