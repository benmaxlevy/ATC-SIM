/**
 * Geographic radius seed over `NormalizedCifpSource` (T04-32).
 *
 * Tool-only. T04-33 imports `selectByRadius` / `CifpRadiusSeed` and must not
 * reimplement this index. Runtime `src/` must not import this module.
 *
 * Radius is a geographic seed only. It does not walk SID/STAR/approach
 * references and does not claim to contain every procedure leg. Coordinates
 * stay source `latDeg` / `lonDeg`. Scenario-local ENU is never stored here.
 */

import { matchingRunways } from "./runwayIdentity.ts";
import type {
  CifpRecordIdentity,
  NormalizedAirport,
  NormalizedApproach,
  NormalizedCifpSource,
  NormalizedFix,
  NormalizedNavaid,
  NormalizedProcedureLeg,
  NormalizedRunway,
  NormalizedSid,
  NormalizedStar,
  SourceLatLon,
} from "./types.ts";

/** Mean Earth radius in nautical miles (6371 km / 1.852). */
export const EARTH_RADIUS_NM = 6371 / 1.852;

const DEG2RAD = Math.PI / 180;

export type CifpIndexedKind = "airport" | "runway" | "navaid" | "fix" | "star" | "sid" | "approach";

/** Intermediate index row keyed by stable `identity.key` and optional ICAO. */
export interface CifpIndexedRecord {
  kind: CifpIndexedKind;
  identity: CifpRecordIdentity;
  airportId?: string;
  /** Seedable lat/lon when the record has one. Never ENU. */
  position?: SourceLatLon;
}

export interface CifpSpatialIndex {
  byKey: ReadonlyMap<string, CifpIndexedRecord>;
  byAirportId: ReadonlyMap<string, NormalizedAirport>;
}

export interface SelectByRadiusOptions {
  airportId: string;
  /** Inclusive great-circle radius in nautical miles from the airport ARP. */
  radiusNm: number;
}

/**
 * Geographic seed for T04-33 closure. Selected records only — out-of-radius
 * procedure references stay in the full source until closure walks them.
 *
 * Units: `radiusNm` is nautical miles. `arp` is source degrees.
 */
export interface CifpRadiusSeed {
  airportId: string;
  radiusNm: number;
  arp: SourceLatLon;
  airports: NormalizedAirport[];
  runways: NormalizedRunway[];
  navaids: NormalizedNavaid[];
  fixes: NormalizedFix[];
  stars: NormalizedStar[];
  sids: NormalizedSid[];
  approaches: NormalizedApproach[];
}

export function greatCircleDistanceNm(from: SourceLatLon, to: SourceLatLon): number {
  assertFiniteLatLon(from, "from");
  assertFiniteLatLon(to, "to");
  const lat1 = from.latDeg * DEG2RAD;
  const lat2 = to.latDeg * DEG2RAD;
  const dLat = (to.latDeg - from.latDeg) * DEG2RAD;
  const dLon = wrapLonDeltaDeg(to.lonDeg - from.lonDeg) * DEG2RAD;
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const h = sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  const clamped = Math.min(1, Math.max(0, h));
  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
}

export function pointInRadius(
  origin: SourceLatLon,
  point: SourceLatLon,
  radiusNm: number,
): boolean {
  return greatCircleDistanceNm(origin, point) <= radiusNm;
}

export function buildSpatialIndex(source: NormalizedCifpSource): CifpSpatialIndex {
  const byKey = new Map<string, CifpIndexedRecord>();
  const byAirportId = new Map<string, NormalizedAirport>();
  const airportsById = firstByAirportId(source.airports);
  const fixesById = firstByFixId(source.fixes);

  for (const row of source.airports) {
    remember(byKey, {
      kind: "airport",
      identity: row.identity,
      airportId: row.airportId,
      position: row.arp,
    });
    if (!byAirportId.has(row.airportId)) {
      byAirportId.set(row.airportId, row);
    }
  }
  for (const row of source.runways) {
    remember(byKey, {
      kind: "runway",
      identity: row.identity,
      airportId: row.airportId,
      position: row.threshold,
    });
  }
  for (const row of source.navaids) {
    remember(byKey, {
      kind: "navaid",
      identity: row.identity,
      airportId: row.airportId,
      position: row.position,
    });
  }
  for (const row of source.fixes) {
    remember(byKey, {
      kind: "fix",
      identity: row.identity,
      airportId: row.airportId,
      position: row.position,
    });
  }
  for (const row of source.stars) {
    remember(byKey, {
      kind: "star",
      identity: row.identity,
      airportId: row.airportId,
      position: starSeedPosition(row, airportsById, fixesById),
    });
  }
  for (const row of source.sids) {
    remember(byKey, {
      kind: "sid",
      identity: row.identity,
      airportId: row.airportId,
      position: sidSeedPosition(row, airportsById, fixesById, source.runways),
    });
  }
  for (const row of source.approaches) {
    remember(byKey, {
      kind: "approach",
      identity: row.identity,
      airportId: row.airportId,
      position: approachSeedPosition(row, airportsById, fixesById, source.runways),
    });
  }

  return { byKey, byAirportId };
}

export function selectByRadius(
  source: NormalizedCifpSource,
  options: SelectByRadiusOptions,
): CifpRadiusSeed {
  const airportId = options.airportId;
  const radiusNm = options.radiusNm;
  if (typeof airportId !== "string" || airportId.length === 0) {
    throw new Error("CIFP spatial index: airportId is required");
  }
  if (!Number.isFinite(radiusNm) || radiusNm < 0) {
    throw new Error(`CIFP spatial index: radiusNm must be a finite number >= 0 (got ${radiusNm})`);
  }

  const index = buildSpatialIndex(source);
  const airport = index.byAirportId.get(airportId);
  if (airport === undefined) {
    throw new Error(`CIFP spatial index: airport ${airportId} not in source`);
  }

  const origin = airport.arp;
  const inside = (point: SourceLatLon | undefined): boolean =>
    point !== undefined && pointInRadius(origin, point, radiusNm);

  const airportsById = firstByAirportId(source.airports);
  const fixesById = firstByFixId(source.fixes);

  return {
    airportId,
    radiusNm,
    arp: { latDeg: origin.latDeg, lonDeg: origin.lonDeg },
    airports: sortByKey(source.airports.filter((row) => inside(row.arp))),
    runways: sortByKey(source.runways.filter((row) => inside(row.threshold))),
    navaids: sortByKey(source.navaids.filter((row) => inside(row.position))),
    fixes: sortByKey(source.fixes.filter((row) => inside(row.position))),
    stars: sortByKey(
      source.stars.filter((row) =>
        starSeedPositions(row, airportsById, fixesById).some((pos) => inside(pos)),
      ),
    ),
    sids: sortByKey(
      source.sids.filter((row) =>
        sidSeedPositions(row, airportsById, fixesById, source.runways).some((pos) => inside(pos)),
      ),
    ),
    approaches: sortByKey(
      source.approaches.filter((row) =>
        approachSeedPositions(row, airportsById, fixesById, source.runways).some((pos) =>
          inside(pos),
        ),
      ),
    ),
  };
}

/** Deterministic pretty JSON for temp / gitignored pack intermediates. */
export function serializeRadiusSeed(seed: CifpRadiusSeed): string {
  return `${JSON.stringify(seed, null, 2)}\n`;
}

function wrapLonDeltaDeg(dLon: number): number {
  let delta = dLon;
  while (delta > 180) {
    delta -= 360;
  }
  while (delta < -180) {
    delta += 360;
  }
  return delta;
}

function assertFiniteLatLon(point: SourceLatLon, label: string): void {
  if (!Number.isFinite(point.latDeg) || !Number.isFinite(point.lonDeg)) {
    throw new Error(`CIFP spatial index: ${label} lat/lon must be finite`);
  }
}

function remember(byKey: Map<string, CifpIndexedRecord>, row: CifpIndexedRecord): void {
  if (!byKey.has(row.identity.key)) {
    byKey.set(row.identity.key, row);
  }
}

function sortByKey<T extends { identity: CifpRecordIdentity }>(rows: readonly T[]): T[] {
  return rows.slice().sort((a, b) => a.identity.key.localeCompare(b.identity.key));
}

function firstByAirportId(rows: readonly NormalizedAirport[]): Map<string, NormalizedAirport> {
  const map = new Map<string, NormalizedAirport>();
  for (const row of rows) {
    if (!map.has(row.airportId)) {
      map.set(row.airportId, row);
    }
  }
  return map;
}

function firstByFixId(rows: readonly NormalizedFix[]): Map<string, NormalizedFix> {
  const map = new Map<string, NormalizedFix>();
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, row);
    }
  }
  return map;
}

function firstSupportedFixPosition(
  legs: readonly NormalizedProcedureLeg[],
  fixesById: ReadonlyMap<string, NormalizedFix>,
): SourceLatLon | undefined {
  for (const leg of legs) {
    if (!leg.supported || leg.fixId === undefined) {
      continue;
    }
    const fix = fixesById.get(leg.fixId);
    if (fix !== undefined) {
      return fix.position;
    }
  }
  return undefined;
}

function airportArp(
  airportId: string,
  airportsById: ReadonlyMap<string, NormalizedAirport>,
): SourceLatLon | undefined {
  return airportsById.get(airportId)?.arp;
}

function starSeedPositions(
  star: NormalizedStar,
  airportsById: ReadonlyMap<string, NormalizedAirport>,
  fixesById: ReadonlyMap<string, NormalizedFix>,
): SourceLatLon[] {
  const positions: SourceLatLon[] = [];
  const arp = airportArp(star.airportId, airportsById);
  if (arp !== undefined) {
    positions.push(arp);
  }
  const transitionLegs = star.transitions.flatMap((transition) => transition.legs);
  const firstFix = firstSupportedFixPosition([...transitionLegs, ...star.common], fixesById);
  if (firstFix !== undefined) {
    positions.push(firstFix);
  }
  return positions;
}

function sidSeedPositions(
  sid: NormalizedSid,
  airportsById: ReadonlyMap<string, NormalizedAirport>,
  fixesById: ReadonlyMap<string, NormalizedFix>,
  runways: readonly NormalizedRunway[],
): SourceLatLon[] {
  const positions: SourceLatLon[] = [];
  const arp = airportArp(sid.airportId, airportsById);
  if (arp !== undefined) {
    positions.push(arp);
  }
  const runwayLegs = sid.runwayTransitions.flatMap((transition) => transition.legs);
  const enrouteLegs = sid.enrouteTransitions.flatMap((transition) => transition.legs);
  const firstFix = firstSupportedFixPosition(
    [...runwayLegs, ...sid.common, ...enrouteLegs],
    fixesById,
  );
  if (firstFix !== undefined) {
    positions.push(firstFix);
  }
  for (const transition of sid.runwayTransitions) {
    const runway = matchingRunways(runways, transition.runwayId, sid.airportId)[0];
    if (runway !== undefined) {
      positions.push(runway.threshold);
      break;
    }
  }
  return positions;
}

function approachSeedPositions(
  approach: NormalizedApproach,
  airportsById: ReadonlyMap<string, NormalizedAirport>,
  fixesById: ReadonlyMap<string, NormalizedFix>,
  runways: readonly NormalizedRunway[],
): SourceLatLon[] {
  const positions: SourceLatLon[] = [];
  const arp = airportArp(approach.airportId, airportsById);
  if (arp !== undefined) {
    positions.push(arp);
  }
  const firstFix = firstSupportedFixPosition(approach.legs, fixesById);
  if (firstFix !== undefined) {
    positions.push(firstFix);
  }
  const threshold =
    approach.thresholdFixId !== undefined
      ? fixesById.get(approach.thresholdFixId)?.position
      : undefined;
  if (threshold !== undefined) {
    positions.push(threshold);
  }
  const runway = matchingRunways(runways, approach.runway, approach.airportId)[0];
  if (runway !== undefined) {
    positions.push(runway.threshold);
  }
  return positions;
}

function starSeedPosition(
  star: NormalizedStar,
  airportsById: ReadonlyMap<string, NormalizedAirport>,
  fixesById: ReadonlyMap<string, NormalizedFix>,
): SourceLatLon | undefined {
  return starSeedPositions(star, airportsById, fixesById)[0];
}

function sidSeedPosition(
  sid: NormalizedSid,
  airportsById: ReadonlyMap<string, NormalizedAirport>,
  fixesById: ReadonlyMap<string, NormalizedFix>,
  runways: readonly NormalizedRunway[],
): SourceLatLon | undefined {
  return sidSeedPositions(sid, airportsById, fixesById, runways)[0];
}

function approachSeedPosition(
  approach: NormalizedApproach,
  airportsById: ReadonlyMap<string, NormalizedAirport>,
  fixesById: ReadonlyMap<string, NormalizedFix>,
  runways: readonly NormalizedRunway[],
): SourceLatLon | undefined {
  return approachSeedPositions(approach, airportsById, fixesById, runways)[0];
}
