/**
 * Parse CRC ARTCC JSON video-map metadata into the T04-36 normalized schema.
 *
 * Offline. Caller supplies already-loaded JSON (tests use in-repo fixtures).
 * Do not fetch vNAS. Do not import this module from `src/`.
 */

import type {
  CrcBrightnessCategory,
  CrcMapGroupSource,
  CrcVideoMapId,
  NormalizedCrcArtccMaps,
  NormalizedCrcStarsFacility,
  NormalizedCrcVideoMap,
} from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`CRC video map ${path} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`CRC video map ${path} must be a string when present`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`CRC video map ${path} must be a boolean when present`);
  }
  return value;
}

function optionalStarsId(value: unknown, path: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`CRC video map ${path} must be an integer when present`);
  }
  return value;
}

function parseBrightness(value: unknown, path: string): CrcBrightnessCategory | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "A" || value === "B") {
    return value;
  }
  throw new Error(`CRC video map ${path} must be "A" or "B"`);
}

function parseTags(value: unknown, path: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new Error(`CRC video map ${path} must be an array of strings`);
  }
  return value;
}

function parseVideoMapIdList(value: unknown, path: string): CrcVideoMapId[] {
  if (!Array.isArray(value)) {
    throw new Error(`CRC video map ${path} must be an array of ULIDs`);
  }
  return value.map((id, i) => {
    if (typeof id !== "string") {
      throw new Error(`CRC video map ${path}[${i}] must be a ULID string, not ${typeof id}`);
    }
    return assertString(id, `${path}[${i}]`);
  });
}

function parseGroupMapIds(value: unknown, path: string): Array<number | null> {
  if (!Array.isArray(value)) {
    throw new Error(`CRC video map ${path} must be an array`);
  }
  return value.map((slot, i) => {
    if (slot === null) {
      return null;
    }
    if (typeof slot !== "number" || !Number.isInteger(slot)) {
      throw new Error(
        `CRC video map ${path}[${i}] must be a starsId integer or null (not a ULID or dense DCB index)`,
      );
    }
    return slot;
  });
}

function parseMapGroup(value: unknown, path: string): CrcMapGroupSource {
  if (!isRecord(value)) {
    throw new Error(`CRC video map ${path} must be an object`);
  }
  const tcpsRaw = value.tcps;
  if (
    tcpsRaw !== undefined &&
    (!Array.isArray(tcpsRaw) || tcpsRaw.some((tcp) => typeof tcp !== "string"))
  ) {
    throw new Error(`CRC video map ${path}.tcps must be an array of strings`);
  }
  return {
    id: assertString(value.id, `${path}.id`),
    mapIds: parseGroupMapIds(value.mapIds, `${path}.mapIds`),
    tcps: tcpsRaw === undefined ? [] : tcpsRaw,
  };
}

function parseStarsConfiguration(
  value: unknown,
  path: string,
): Pick<NormalizedCrcStarsFacility, "videoMapIds" | "mapGroups"> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error(`CRC video map ${path} must be an object`);
  }
  return {
    videoMapIds: parseVideoMapIdList(value.videoMapIds, `${path}.videoMapIds`),
    mapGroups: Array.isArray(value.mapGroups)
      ? value.mapGroups.map((group, i) => parseMapGroup(group, `${path}.mapGroups[${i}]`))
      : [],
  };
}

function parseStarsFacility(value: unknown, path: string): NormalizedCrcStarsFacility | undefined {
  if (!isRecord(value)) {
    throw new Error(`CRC video map ${path} must be an object`);
  }
  const stars = parseStarsConfiguration(value.starsConfiguration, `${path}.starsConfiguration`);
  if (stars === undefined) {
    return undefined;
  }
  const facilityType = optionalString(value.type, `${path}.type`);
  return {
    facilityId: assertString(value.id, `${path}.id`),
    facilityName:
      optionalString(value.name, `${path}.name`) ?? assertString(value.id, `${path}.id`),
    ...(facilityType !== undefined ? { facilityType } : {}),
    videoMapIds: stars.videoMapIds,
    mapGroups: stars.mapGroups,
  };
}

export function parseCrcVideoMap(value: unknown, path: string): NormalizedCrcVideoMap {
  if (!isRecord(value)) {
    throw new Error(`CRC video map ${path} must be an object`);
  }
  const alwaysVisible = optionalBoolean(value.starsAlwaysVisible, `${path}.starsAlwaysVisible`);
  const lastUpdatedAt = optionalString(value.lastUpdatedAt, `${path}.lastUpdatedAt`);
  const shortName = optionalString(value.shortName, `${path}.shortName`);
  const sourceFilename = optionalString(value.sourceFileName, `${path}.sourceFilename`);
  const starsId = optionalStarsId(value.starsId, `${path}.starsId`);
  const brightness = parseBrightness(
    value.starsBrightnessCategory,
    `${path}.starsBrightnessCategory`,
  );
  const tdm = optionalBoolean(value.tdmOnly, `${path}.tdmOnly`) ?? false;
  return {
    id: assertString(value.id, `${path}.id`),
    ...(starsId !== undefined ? { starsId } : {}),
    title: assertString(value.name, `${path}.name`),
    ...(shortName !== undefined ? { shortName } : {}),
    ...(sourceFilename !== undefined ? { sourceFilename } : {}),
    ...(brightness !== undefined ? { brightness } : {}),
    tdm,
    tags: parseTags(value.tags, `${path}.tags`),
    ...(alwaysVisible !== undefined ? { alwaysVisible } : {}),
    ...(lastUpdatedAt !== undefined ? { lastUpdatedAt } : {}),
  };
}

export function parseCrcArtccMaps(value: unknown): NormalizedCrcArtccMaps {
  if (!isRecord(value)) {
    throw new Error("CRC ARTCC document must be an object");
  }
  if (!Array.isArray(value.videoMaps)) {
    throw new Error("CRC ARTCC videoMaps must be an array");
  }
  const videoMaps = value.videoMaps.map((row, i) => parseCrcVideoMap(row, `videoMaps[${i}]`));
  const seen = new Set<string>();
  for (const map of videoMaps) {
    if (seen.has(map.id)) {
      throw new Error(`CRC ARTCC videoMaps has duplicate ULID ${map.id}`);
    }
    seen.add(map.id);
  }
  const facility = isRecord(value.facility) ? value.facility : undefined;
  const children =
    facility !== undefined && Array.isArray(facility.childFacilities)
      ? facility.childFacilities
      : [];
  const starsFacilities: NormalizedCrcStarsFacility[] = [];
  for (const [i, child] of children.entries()) {
    const parsed = parseStarsFacility(child, `facility.childFacilities[${i}]`);
    if (parsed !== undefined) {
      starsFacilities.push(parsed);
    }
  }
  const artccId = optionalString(value.id, "id");
  return {
    ...(artccId !== undefined ? { artccId } : {}),
    videoMaps,
    starsFacilities,
  };
}

export function starsFacilityById(
  artcc: NormalizedCrcArtccMaps,
  facilityId: string,
): NormalizedCrcStarsFacility {
  const hit = artcc.starsFacilities.find((row) => row.facilityId === facilityId);
  if (hit === undefined) {
    throw new Error(`CRC ARTCC has no STARS facility ${facilityId}`);
  }
  return hit;
}
