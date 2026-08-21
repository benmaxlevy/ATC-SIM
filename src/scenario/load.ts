import { latLonToNm } from "@core";
import type { LatLon, NmEastNorth } from "@core";
import kdemJson from "./kdem.json";
import type {
  Approach,
  ArrivalSpawn,
  DigitalMapCoastline,
  DigitalMapLocalizer,
  DigitalMapRangeRings,
  DigitalMapRunway,
  Fix,
  Runway,
  Scenario,
  ScenarioMaps,
  Spawn,
  VideoMap,
} from "./types";
import { ARRIVAL_COUNT_MAX, ARRIVAL_COUNT_MIN } from "./types";
import {
  coastlineFromVideoMaps,
  loadVideoMapSet,
  localizerFromVideoMaps,
  runwayFromVideoMaps,
} from "./loadVideoMaps";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Scenario ${path} must be a finite number`);
  }
  return value;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`Scenario ${path} must be a string`);
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
  const listed =
    maps.videoMaps === undefined && videoMapSet !== undefined
      ? loadedVideoMaps.map((map) => ({ id: map.id }))
      : assertArray(maps.videoMaps, "maps.videoMaps").map(assertVideoMap);
  return {
    videoMapSet,
    videoMaps: listed,
    loadedVideoMaps,
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
  return {
    callsign,
    xNm: assertNumber(value.xNm, `arrivals[${index}].xNm`),
    yNm: assertNumber(value.yNm, `arrivals[${index}].yNm`),
    headingDeg: assertNumber(value.headingDeg, `arrivals[${index}].headingDeg`),
    altitudeFt: assertNumber(value.altitudeFt, `arrivals[${index}].altitudeFt`),
    speedKt: assertNumber(value.speedKt, `arrivals[${index}].speedKt`),
    ...(aircraftType ? { aircraftType } : {}),
  };
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

function assertArrivals(value: unknown): ArrivalSpawn[] {
  const raw = assertArray(value, "arrivals");
  if (raw.length < ARRIVAL_COUNT_MIN || raw.length > ARRIVAL_COUNT_MAX) {
    throw new Error(
      `Scenario arrivals must have ${ARRIVAL_COUNT_MIN}-${ARRIVAL_COUNT_MAX} aircraft (got ${raw.length})`,
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

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Scenario ${path} must be an array`);
  }
  return value;
}

/**
 * Runtime-check a scenario JSON object. Does not require `icao === "KDEM"`:
 * `icao` must be a string. Always recomputes `arpNm` via `latLonToNm(arp, arp)`.
 */
export function assertScenario(s: unknown): Scenario {
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
    arrivals: assertArrivals(s.arrivals),
  };
}

/** Load fictional KDEM (Demo Field) and fill `arpNm` from T00-04 helpers. */
export function loadKdem(): Scenario {
  return assertScenario(kdemJson);
}
