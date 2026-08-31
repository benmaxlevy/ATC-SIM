import { latLonToNm, type LatLon } from "@core";
import { assertArray, assertFinite, assertString, isRecord } from "./load";
import {
  RADAR_SITE_DEFAULT_PERIOD_MS,
  RADAR_SITE_DEFAULT_RANGE_NM,
  type RadarSite,
  type RadarSiteKind,
} from "./types";

/**
 * T02-75 contract: `radarSites: []` is implicit FUSED, not “no surveillance.”
 * Consumers must not invent SITE entries from an empty list.
 */
export function isImplicitFusedSurveillance(radarSites: readonly RadarSite[]): boolean {
  return radarSites.length === 0;
}

function parseKind(value: unknown, path: string): RadarSiteKind {
  if (value === "asr" || value === "airport") {
    return value;
  }
  throw new Error(`Scenario ${path} must be "asr" or "airport"`);
}

function parsePositiveFinite(value: unknown, path: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const n = assertFinite(value, path);
  if (n <= 0) {
    throw new Error(`Scenario ${path} must be a positive finite number`);
  }
  return n;
}

function keyPresent(value: Record<string, unknown>, key: string): boolean {
  return value[key] !== undefined;
}

function parseSitePosition(
  value: Record<string, unknown>,
  path: string,
  arp: LatLon,
): { xNm: number; yNm: number } {
  const hasX = keyPresent(value, "xNm");
  const hasY = keyPresent(value, "yNm");
  const hasLat = keyPresent(value, "latDeg");
  const hasLon = keyPresent(value, "lonDeg");
  const hasEnu = hasX || hasY;
  const hasLatLon = hasLat || hasLon;

  if (hasEnu && hasLatLon) {
    throw new Error(`Scenario ${path} must use exactly one of xNm/yNm or latDeg/lonDeg (not both)`);
  }
  if (hasEnu) {
    if (!hasX || !hasY) {
      throw new Error(`Scenario ${path} ENU position requires both xNm and yNm`);
    }
    return {
      xNm: assertFinite(value.xNm, `${path}.xNm`),
      yNm: assertFinite(value.yNm, `${path}.yNm`),
    };
  }
  if (hasLatLon) {
    if (!hasLat || !hasLon) {
      throw new Error(`Scenario ${path} lat/lon position requires both latDeg and lonDeg`);
    }
    return latLonToNm(
      {
        latDeg: assertFinite(value.latDeg, `${path}.latDeg`),
        lonDeg: assertFinite(value.lonDeg, `${path}.lonDeg`),
      },
      arp,
    );
  }
  throw new Error(`Scenario ${path} must have either xNm/yNm or latDeg/lonDeg`);
}

function parseRadarSite(value: unknown, index: number, arp: LatLon): RadarSite {
  const path = `radarSites[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`Scenario ${path} must be an object`);
  }
  const id = assertString(value.id, `${path}.id`, "Scenario", { nonEmpty: true });
  const name = assertString(value.name, `${path}.name`, "Scenario", { nonEmpty: true });
  const kind = parseKind(value.kind, `${path}.kind`);
  const { xNm, yNm } = parseSitePosition(value, path, arp);
  return {
    id,
    name,
    kind,
    xNm,
    yNm,
    rangeNm: parsePositiveFinite(value.rangeNm, `${path}.rangeNm`, RADAR_SITE_DEFAULT_RANGE_NM),
    periodMs: parsePositiveFinite(value.periodMs, `${path}.periodMs`, RADAR_SITE_DEFAULT_PERIOD_MS),
  };
}

/**
 * Validate and normalize authored radar sites. Omitted / null → `[]`.
 * Invalid rows throw; they are never dropped.
 */
export function parseRadarSites(value: unknown, arp: LatLon): RadarSite[] {
  if (value == null) {
    return [];
  }
  const raw = assertArray(value, "radarSites");
  const sites = raw.map((row, index) => parseRadarSite(row, index, arp));
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]!;
    if (seenIds.has(site.id)) {
      throw new Error(`Scenario radarSites[${i}].id "${site.id}" is not unique`);
    }
    if (seenNames.has(site.name)) {
      throw new Error(`Scenario radarSites[${i}].name "${site.name}" is not unique`);
    }
    seenIds.add(site.id);
    seenNames.add(site.name);
  }
  return sites;
}
