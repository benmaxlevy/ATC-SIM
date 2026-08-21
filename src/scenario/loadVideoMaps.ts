/**
 * Load `src/scenario/video-maps/<ICAO>/catalog.json` plus one JSON file per map.
 * Analog: CRC STARS MAPS video-map set per facility (R07). Trainer-authored
 * JSON only. Not OSM / tiles (R12). Range rings stay generated (RR), not files.
 */

import type { DigitalMapCoastline, DigitalMapLocalizer, DigitalMapRunway } from "./types";
import type {
  LoadedVideoMap,
  VideoMapCatalog,
  VideoMapCatalogEntry,
  VideoMapColor,
  VideoMapFeature,
  VideoMapFile,
  VideoMapRole,
} from "./videoMapTypes";

const VIDEO_MAP_JSON = import.meta.glob<unknown>("./video-maps/*/*.json", {
  eager: true,
  import: "default",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Video map ${path} must be a finite number`);
  }
  return value;
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Video map ${path} must be a non-empty string`);
  }
  return value;
}

function assertNmPair(value: unknown, path: string): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(`Video map ${path} must be [eastNm, northNm]`);
  }
  return [assertFinite(value[0], `${path}[0]`), assertFinite(value[1], `${path}[1]`)];
}

function parseColor(value: unknown, path: string): VideoMapColor {
  if (value === "map" || value === "mapDim") {
    return value;
  }
  throw new Error(`Video map ${path} must be "map" or "mapDim"`);
}

function parseRole(value: unknown, path: string): VideoMapRole | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "runway" || value === "localizer" || value === "coastline") {
    return value;
  }
  throw new Error(`Video map ${path} must be runway, localizer, or coastline`);
}

function parsePolylineFeature(raw: Record<string, unknown>, path: string): VideoMapFeature {
  if (!Array.isArray(raw.pointsNm) || raw.pointsNm.length < 2) {
    throw new Error(`Video map ${path}.pointsNm needs ≥2 points`);
  }
  return {
    type: "polyline",
    closed: raw.closed === true,
    pointsNm: raw.pointsNm.map((pt, i) => assertNmPair(pt, `${path}.pointsNm[${i}]`)),
  };
}

function parseFeature(value: unknown, path: string): VideoMapFeature {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error(`Video map ${path} must have a type`);
  }
  if (value.type === "polyline") {
    return parsePolylineFeature(value, path);
  }
  if (value.type === "text") {
    return {
      type: "text",
      text: assertString(value.text, `${path}.text`),
      atNm: assertNmPair(value.atNm, `${path}.atNm`),
    };
  }
  if (value.type === "runway") {
    return {
      type: "runway",
      id: assertString(value.id, `${path}.id`),
      thresholdNm: assertNmPair(value.thresholdNm, `${path}.thresholdNm`),
      lengthNm: assertFinite(value.lengthNm, `${path}.lengthNm`),
      headingTrueDeg: assertFinite(value.headingTrueDeg, `${path}.headingTrueDeg`),
      widthNm: assertFinite(value.widthNm, `${path}.widthNm`),
      label: assertString(value.label, `${path}.label`),
    };
  }
  if (value.type === "localizerFeather") {
    return {
      type: "localizerFeather",
      runwayId: assertString(value.runwayId, `${path}.runwayId`),
      courseTrueDeg: assertFinite(value.courseTrueDeg, `${path}.courseTrueDeg`),
      featherLengthNm: assertFinite(value.featherLengthNm, `${path}.featherLengthNm`),
      halfWidthDeg: assertFinite(value.halfWidthDeg, `${path}.halfWidthDeg`),
    };
  }
  throw new Error(`Video map ${path}.type is unknown: ${value.type}`);
}

/** Parse one `NNN-slug.json` video map. Catalog `id` must match the file. */
export function parseVideoMapFile(
  value: unknown,
  expectedId: string,
  path: string,
): VideoMapFile {
  if (!isRecord(value)) {
    throw new Error(`Video map ${path} must be an object`);
  }
  const id = assertString(value.id, `${path}.id`);
  if (id !== expectedId) {
    throw new Error(`Video map ${path}.id ${id} does not match catalog id ${expectedId}`);
  }
  if (!Array.isArray(value.features) || value.features.length === 0) {
    throw new Error(`Video map ${path}.features must be a non-empty array`);
  }
  const note = typeof value.note === "string" ? value.note : undefined;
  return {
    id,
    name: assertString(value.name, `${path}.name`),
    note,
    features: value.features.map((feature, i) => parseFeature(feature, `${path}.features[${i}]`)),
  };
}

function parseCatalogEntry(value: unknown, index: number): VideoMapCatalogEntry {
  if (!isRecord(value)) {
    throw new Error(`Video map catalog.maps[${index}] must be an object`);
  }
  const dcbNumber = assertFinite(value.dcbNumber, `catalog.maps[${index}].dcbNumber`);
  if (!Number.isInteger(dcbNumber) || dcbNumber < 1) {
    throw new Error(`Video map catalog.maps[${index}].dcbNumber must be an integer ≥ 1`);
  }
  return {
    id: assertString(value.id, `catalog.maps[${index}].id`),
    file: assertString(value.file, `catalog.maps[${index}].file`),
    dcbNumber,
    dcbLabel: assertString(value.dcbLabel, `catalog.maps[${index}].dcbLabel`),
    role: parseRole(value.role, `catalog.maps[${index}].role`),
    defaultOn: value.defaultOn === true,
    color: parseColor(value.color, `catalog.maps[${index}].color`),
  };
}

function parseCatalog(value: unknown, icao: string): VideoMapCatalog {
  if (!isRecord(value)) {
    throw new Error(`Video map catalog for ${icao} must be an object`);
  }
  const catalogIcao = assertString(value.icao, "catalog.icao");
  if (catalogIcao !== icao) {
    throw new Error(`Video map catalog.icao ${catalogIcao} does not match folder ${icao}`);
  }
  if (value.frame !== "arp-enu-nm") {
    throw new Error(`Video map catalog.frame must be "arp-enu-nm"`);
  }
  if (!Array.isArray(value.maps) || value.maps.length === 0) {
    throw new Error(`Video map catalog.maps must be a non-empty array`);
  }
  const maps = value.maps.map(parseCatalogEntry);
  const ids = new Set<string>();
  for (const entry of maps) {
    if (ids.has(entry.id)) {
      throw new Error(`Video map catalog has duplicate id ${entry.id}`);
    }
    ids.add(entry.id);
  }
  const note = typeof value.note === "string" ? value.note : undefined;
  return { icao: catalogIcao, frame: "arp-enu-nm", note, maps };
}

function jsonPath(icao: string, file: string): string {
  return `./video-maps/${icao}/${file}`;
}

function readJson(icao: string, file: string): unknown {
  const path = jsonPath(icao, file);
  if (!(path in VIDEO_MAP_JSON)) {
    throw new Error(`Missing video map file ${path}`);
  }
  return VIDEO_MAP_JSON[path];
}

export function loadVideoMapSet(icao: string): LoadedVideoMap[] {
  const catalog = parseCatalog(readJson(icao, "catalog.json"), icao);
  return catalog.maps.map((entry) => {
    const file = parseVideoMapFile(readJson(icao, entry.file), entry.id, `${icao}/${entry.file}`);
    return {
      ...entry,
      name: file.name,
      note: file.note,
      features: file.features,
    };
  });
}

export function runwayFromVideoMaps(maps: LoadedVideoMap[]): DigitalMapRunway | undefined {
  for (const map of maps) {
    if (map.role !== "runway") {
      continue;
    }
    const feature = map.features.find((item) => item.type === "runway");
    if (!feature || feature.type !== "runway") {
      continue;
    }
    return {
      id: feature.id,
      thresholdEastNm: feature.thresholdNm[0],
      thresholdNorthNm: feature.thresholdNm[1],
      lengthNm: feature.lengthNm,
      headingTrueDeg: feature.headingTrueDeg,
      widthNm: feature.widthNm,
    };
  }
  return undefined;
}

export function localizerFromVideoMaps(maps: LoadedVideoMap[]): DigitalMapLocalizer | undefined {
  for (const map of maps) {
    if (map.role !== "localizer") {
      continue;
    }
    const feature = map.features.find((item) => item.type === "localizerFeather");
    if (!feature || feature.type !== "localizerFeather") {
      continue;
    }
    return {
      runwayId: feature.runwayId,
      courseTrueDeg: feature.courseTrueDeg,
      featherLengthNm: feature.featherLengthNm,
      halfWidthDeg: feature.halfWidthDeg,
    };
  }
  return undefined;
}

export function coastlineFromVideoMaps(maps: LoadedVideoMap[]): DigitalMapCoastline | undefined {
  for (const map of maps) {
    if (map.role !== "coastline") {
      continue;
    }
    const feature = map.features.find((item) => item.type === "polyline");
    if (!feature || feature.type !== "polyline") {
      continue;
    }
    return {
      enabled: map.defaultOn,
      polyline: feature.pointsNm,
      note: map.note,
    };
  }
  return undefined;
}
