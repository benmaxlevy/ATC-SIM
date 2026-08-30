/**
 * Trainer video maps (CRC STARS MAPS analog, R07).
 * Files live under `src/scenario/video-maps/<ICAO>/`.
 * Coordinates are NM east/north of that airport's ARP (T00-04). Not OSM / tiles.
 *
 * Load `src/scenario/video-maps/<ICAO>/catalog.json` plus one JSON file per map.
 * Analog: CRC STARS MAPS video-map set per facility (R07). Trainer-authored
 * JSON only. Not OSM / tiles (R12). Range rings stay generated (RR), not files.
 */

import type { DigitalMapCoastline, DigitalMapLocalizer, DigitalMapRunway } from "./types";

export type VideoMapColor = "map" | "mapDim";

export type VideoMapRole = "runway" | "localizer" | "coastline";

export type VideoMapFeature =
  | {
      type: "polyline";
      closed: boolean;
      pointsNm: [number, number][];
    }
  | {
      type: "text";
      text: string;
      atNm: [number, number];
    }
  | {
      type: "runway";
      id: string;
      thresholdNm: [number, number];
      lengthNm: number;
      headingTrueDeg: number;
      widthNm: number;
      label: string;
    }
  | {
      type: "localizerFeather";
      runwayId: string;
      courseTrueDeg: number;
      featherLengthNm: number;
      halfWidthDeg: number;
    };

export interface VideoMapFile {
  id: string;
  name: string;
  note?: string;
  features: VideoMapFeature[];
}

export interface VideoMapCatalogEntry {
  id: string;
  file: string;
  /** DCB slot layout only. Omit for GEO-only maps. Never densify identity to 1–N. */
  dcbNumber?: number;
  /**
   * CRC STARS map ID. Optional so KDEM stays unlabeled. Never used as catalog `id`.
   * DCB group slots are a separate layout; do not densify this to 1–N.
   */
  starsId?: number;
  dcbLabel: string;
  role?: VideoMapRole;
  defaultOn: boolean;
  color: VideoMapColor;
}

/** One DCB layout cell. Empty `starsId` / missing `mapId` stays disabled. */
export interface VideoMapGroupSlot {
  position: { groupId: string; mainIndex?: number; submenuIndex?: number };
  starsId: number | null;
  mapId?: string;
}

export interface VideoMapGroup {
  id: string;
  /** Index in source `mapGroups` order. Default selected group is sourceIndex 0. */
  sourceIndex: number;
  tcps: string[];
  /** Always length 6. Trailing omitted MAIN cells are empty, not densified. */
  main: VideoMapGroupSlot[];
  /** Length 0..32. Preserves source nulls, duplicates, and omitted trailing slots. */
  submenu: VideoMapGroupSlot[];
}

/** Packed `video-maps/<ICAO>/groups.json` when present. KDEM has none. */
export interface VideoMapGroupSet {
  facilityId: string;
  facilityName: string;
  mapsAbsentFromGroups: string[];
  groups: VideoMapGroup[];
}

export interface VideoMapCatalog {
  icao: string;
  frame: "arp-enu-nm";
  note?: string;
  maps: VideoMapCatalogEntry[];
}

export interface LoadedVideoMap extends VideoMapCatalogEntry {
  name: string;
  note?: string;
  features: VideoMapFeature[];
}

const VIDEO_MAP_JSON = import.meta.glob<unknown>("./video-maps/*/*.json", {
  eager: true,
  import: "default",
});

import { assertFinite as assertFiniteVal, assertString as assertStringVal, isRecord } from "./load";

const assertFinite = (value: unknown, path: string): number =>
  assertFiniteVal(value, path, "Video map");
const assertString = (value: unknown, path: string): string =>
  assertStringVal(value, path, "Video map", true);

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
export function parseVideoMapFile(value: unknown, expectedId: string, path: string): VideoMapFile {
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

function parseOptionalDcbNumber(value: unknown, index: number): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const dcbNumber = assertFinite(value, `catalog.maps[${index}].dcbNumber`);
  if (!Number.isInteger(dcbNumber) || dcbNumber < 1) {
    throw new Error(`Video map catalog.maps[${index}].dcbNumber must be an integer ≥ 1`);
  }
  return dcbNumber;
}

function parseOptionalStarsId(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const starsId = assertFinite(value, path);
  if (!Number.isInteger(starsId) || starsId < 1) {
    throw new Error(`Video map ${path} must be an integer ≥ 1`);
  }
  return starsId;
}

/** CRC `starsId N` in converted map notes when catalog omits the field. */
export function starsIdFromNote(note: string | undefined): number | undefined {
  if (note === undefined) {
    return undefined;
  }
  const match = /starsId\s+(\d+)/.exec(note);
  if (match === null) {
    return undefined;
  }
  return parseOptionalStarsId(Number(match[1]), "note.starsId");
}

function parseCatalogEntry(value: unknown, index: number): VideoMapCatalogEntry {
  if (!isRecord(value)) {
    throw new Error(`Video map catalog.maps[${index}] must be an object`);
  }
  const dcbNumber = parseOptionalDcbNumber(value.dcbNumber, index);
  const starsId = parseOptionalStarsId(value.starsId, `catalog.maps[${index}].starsId`);
  return {
    id: assertString(value.id, `catalog.maps[${index}].id`),
    file: assertString(value.file, `catalog.maps[${index}].file`),
    ...(dcbNumber !== undefined ? { dcbNumber } : {}),
    ...(starsId !== undefined ? { starsId } : {}),
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

/** Parse a video-map catalog document. `dcbNumber` is optional layout, not identity. */
export function parseVideoMapCatalog(value: unknown, icao: string): VideoMapCatalog {
  return parseCatalog(value, icao);
}

function jsonPath(icao: string, file: string): string {
  return `./video-maps/${icao}/${file}`;
}

function hasVideoMapJson(icao: string, file: string): boolean {
  return jsonPath(icao, file) in VIDEO_MAP_JSON;
}

function readJson(icao: string, file: string): unknown {
  const path = jsonPath(icao, file);
  if (!(path in VIDEO_MAP_JSON)) {
    throw new Error(`Missing video map file ${path}`);
  }
  return VIDEO_MAP_JSON[path];
}

function parseGroupSlot(value: unknown, path: string): VideoMapGroupSlot {
  if (!isRecord(value)) {
    throw new Error(`Video map ${path} must be an object`);
  }
  if (!isRecord(value.position) || typeof value.position.groupId !== "string") {
    throw new Error(`Video map ${path}.position.groupId must be a string`);
  }
  const mainIndex =
    value.position.mainIndex === undefined
      ? undefined
      : assertFinite(value.position.mainIndex, `${path}.position.mainIndex`);
  const submenuIndex =
    value.position.submenuIndex === undefined
      ? undefined
      : assertFinite(value.position.submenuIndex, `${path}.position.submenuIndex`);
  const starsId =
    value.starsId === null
      ? null
      : (parseOptionalStarsId(value.starsId, `${path}.starsId`) ?? null);
  const mapId = typeof value.mapId === "string" ? value.mapId : undefined;
  if (starsId === null && mapId !== undefined) {
    throw new Error(`Video map ${path} empty slot cannot have mapId`);
  }
  return {
    position: {
      groupId: value.position.groupId,
      ...(mainIndex !== undefined ? { mainIndex } : {}),
      ...(submenuIndex !== undefined ? { submenuIndex } : {}),
    },
    starsId,
    ...(mapId !== undefined ? { mapId } : {}),
  };
}

function parseVideoMapGroup(value: unknown, index: number): VideoMapGroup {
  if (!isRecord(value)) {
    throw new Error(`Video map groups.groups[${index}] must be an object`);
  }
  if (!Array.isArray(value.main) || value.main.length !== 6) {
    throw new Error(`Video map groups.groups[${index}].main must have 6 slots`);
  }
  if (!Array.isArray(value.submenu) || value.submenu.length > 32) {
    throw new Error(`Video map groups.groups[${index}].submenu must have 0–32 slots`);
  }
  const sourceIndex = assertFinite(value.sourceIndex, `groups.groups[${index}].sourceIndex`);
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
    throw new Error(`Video map groups.groups[${index}].sourceIndex must be an integer ≥ 0`);
  }
  if (!Array.isArray(value.tcps) || value.tcps.some((tcp) => typeof tcp !== "string")) {
    throw new Error(`Video map groups.groups[${index}].tcps must be a string array`);
  }
  return {
    id: assertString(value.id, `groups.groups[${index}].id`),
    sourceIndex,
    tcps: value.tcps as string[],
    main: value.main.map((slot, i) => parseGroupSlot(slot, `groups.groups[${index}].main[${i}]`)),
    submenu: value.submenu.map((slot, i) =>
      parseGroupSlot(slot, `groups.groups[${index}].submenu[${i}]`),
    ),
  };
}

/** Parse packed `groups.json`. Layout only — never renumbers map identity. */
export function parseVideoMapGroups(value: unknown, icao: string): VideoMapGroupSet {
  if (!isRecord(value)) {
    throw new Error(`Video map groups for ${icao} must be an object`);
  }
  if (!Array.isArray(value.mapsAbsentFromGroups)) {
    throw new Error(`Video map groups.mapsAbsentFromGroups must be an array`);
  }
  if (!Array.isArray(value.groups) || value.groups.length === 0) {
    throw new Error(`Video map groups.groups must be a non-empty array`);
  }
  const mapsAbsentFromGroups = value.mapsAbsentFromGroups.map((id, i) =>
    assertString(id, `groups.mapsAbsentFromGroups[${i}]`),
  );
  const groups = value.groups.map(parseVideoMapGroup);
  const ids = new Set<string>();
  for (const group of groups) {
    if (ids.has(group.id)) {
      throw new Error(`Video map groups has duplicate id ${group.id}`);
    }
    ids.add(group.id);
  }
  return {
    facilityId: assertString(value.facilityId, "groups.facilityId"),
    facilityName: assertString(value.facilityName, "groups.facilityName"),
    mapsAbsentFromGroups,
    groups,
  };
}

export function loadVideoMapSet(icao: string): LoadedVideoMap[] {
  const catalog = parseCatalog(readJson(icao, "catalog.json"), icao);
  return catalog.maps.map((entry) => {
    const file = parseVideoMapFile(readJson(icao, entry.file), entry.id, `${icao}/${entry.file}`);
    const starsId = entry.starsId ?? starsIdFromNote(file.note);
    return {
      ...entry,
      ...(starsId !== undefined ? { starsId } : {}),
      name: file.name,
      note: file.note,
      features: file.features,
    };
  });
}

/**
 * Load `video-maps/<ICAO>/groups.json` when present. Missing file is KDEM-style
 * dcbNumber layout, not an error. No facility-id branch.
 */
export function loadVideoMapGroups(icao: string): VideoMapGroupSet | undefined {
  if (!hasVideoMapJson(icao, "groups.json")) {
    return undefined;
  }
  return parseVideoMapGroups(readJson(icao, "groups.json"), icao);
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
