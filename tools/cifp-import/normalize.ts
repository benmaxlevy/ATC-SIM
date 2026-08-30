/**
 * Map `NormalizedCifpSource` onto the existing `ProcedureCatalog` JSON shape.
 *
 * ENU (`xNm` / `yNm`) is derived here from the selected airport ARP. Source
 * lat/lon is preserved on every point. Unsupported path terminators are never
 * emitted as straight-line SID/STAR/approach legs. SID catalog fields are
 * populated from `PD` records; SID flying stays out of this tool.
 */

import type {
  ApproachProcedure,
  GeoPoint,
  Navaid,
  NavFix,
  ProcedureCatalog,
  SidEnrouteTransition,
  SidProcedure,
  SidRunwayTransition,
  StarLeg,
  StarProcedure,
} from "../../src/scenario/procedures/types.ts";
import { latLonToNm, type LatLon } from "./coordinates.ts";
import {
  type CifpSkipStats,
  type NormalizedCifpSource,
  type NormalizedProcedureLeg,
  type NormalizedSid,
} from "./types.ts";

const DEFAULT_LOC_LENGTH_NM = 18;
const DEFAULT_BEAM_HALF_WIDTH_DEG = 2.5;
const DEFAULT_TCH_FT = 50;

const ORIGIN_NOTE =
  "Imported from a synthetic CIFP subset fixture (not a real FAA cycle). Local tangent NM from ARP using the phase 0 projector. KDEM remains the sim default.";

export interface NormalizeOptions {
  airportId?: string;
}

function firstRelevantError(
  source: NormalizedCifpSource,
  airportId: string | undefined,
): (typeof source.diagnostics)[number] | undefined {
  return source.diagnostics.find((row) => {
    if (row.severity !== "error") {
      return false;
    }
    if (airportId === undefined) {
      return true;
    }
    return row.airportId === undefined || row.airportId === airportId;
  });
}

export function emitCatalogFromSource(
  source: NormalizedCifpSource,
  options: NormalizeOptions = {},
): { catalog: ProcedureCatalog; skipped: CifpSkipStats } {
  const firstError = firstRelevantError(source, options.airportId);
  if (firstError !== undefined) {
    throw new Error(firstError.message);
  }

  const airport =
    options.airportId !== undefined
      ? source.airports.find((row) => row.airportId === options.airportId)
      : source.airports[0];
  if (airport === undefined) {
    throw new Error(
      options.airportId !== undefined
        ? `CIFP import: missing PA airport record for ${options.airportId}`
        : "CIFP import: missing PA airport record",
    );
  }
  if (options.airportId === undefined && source.airports.length > 1) {
    throw new Error(
      `CIFP import: ${source.airports.length} PA airports; select one (T04-34 pack CLI)`,
    );
  }

  const skippedByType: Record<string, number> = { ...source.skippedByType };
  const bumpSkip = (type: string): void => {
    skippedByType[type] = (skippedByType[type] ?? 0) + 1;
  };

  const arp: LatLon = airport.arp;
  const airportId = airport.airportId;

  const navaids: Navaid[] = [];
  for (const row of source.navaids) {
    if (row.airportId !== undefined && row.airportId !== airportId) {
      continue;
    }
    navaids.push(toNavaid(row, arp));
  }
  navaids.splice(0, navaids.length, ...keepCloserToOrigin(navaids));

  const fixes: NavFix[] = [];
  const fixIds = new Set<string>();
  for (const row of source.fixes) {
    if (row.airportId !== undefined && row.airportId !== airportId) {
      continue;
    }
    fixes.push(toFix(row, arp));
    fixIds.add(row.id);
  }
  const uniqueFixes = keepCloserToOrigin(fixes);
  fixes.splice(0, fixes.length, ...uniqueFixes);
  fixIds.clear();
  for (const row of uniqueFixes) {
    fixIds.add(row.id);
  }
  for (const row of source.runways) {
    if (row.airportId !== airportId) {
      continue;
    }
    if (fixIds.has(row.runwayId)) {
      continue;
    }
    fixes.push({
      id: row.runwayId,
      kind: "THRESHOLD",
      ...project(row.threshold, arp),
    });
    fixIds.add(row.runwayId);
  }

  const stars: StarProcedure[] = [];
  for (const row of source.stars) {
    if (row.airportId !== airportId) {
      continue;
    }
    const transitions = row.transitions
      .map((transition) => ({
        id: transition.id,
        name: transition.name,
        legs: supportedFixLegs(transition.legs),
      }))
      .filter((transition) => transition.legs.length > 0);
    const common = supportedFixLegs(row.common);
    if (transitions.length === 0 && common.length === 0) {
      bumpSkip("EMPTY_STAR");
      continue;
    }
    stars.push({
      id: row.id,
      name: row.name,
      transitions,
      common,
      termination: "VECTORS",
    });
  }

  const approaches: ApproachProcedure[] = [];
  for (const row of source.approaches) {
    if (row.airportId !== airportId) {
      continue;
    }
    const loc = navaids.find((nav) => nav.kind === "LOC" && nav.id === row.locNavaidId);
    const gs = navaids.find((nav) => nav.kind === "GS" && nav.id === row.gsNavaidId);
    const locByRunway =
      loc ??
      navaids.find(
        (nav) =>
          nav.kind === "LOC" && (row.locNavaidId === undefined || nav.id === row.locNavaidId),
      );
    const gsByLoc =
      gs ??
      navaids.find(
        (nav) =>
          nav.kind === "GS" &&
          (row.gsNavaidId === undefined ||
            nav.id === row.gsNavaidId ||
            nav.id === `${locByRunway?.id}GS`),
      );
    const faf = fixes.find((fix) => fix.id === row.fafFixId);
    const thr = fixes.find((fix) => fix.id === row.thresholdFixId);
    const fafDistanceNm =
      faf !== undefined && thr !== undefined
        ? Math.round(Math.hypot(faf.xNm - thr.xNm, faf.yNm - thr.yNm) * 1e6) / 1e6
        : undefined;
    const gsInterceptAltFt = row.legs.find(
      (leg) => leg.fixId === row.fafFixId && leg.altConstraint !== undefined,
    )?.altConstraint?.altitudeFt;
    const beamHalfWidthDeg =
      locByRunway !== undefined && locByRunway.beamHalfWidthDeg !== undefined
        ? locByRunway.beamHalfWidthDeg
        : DEFAULT_BEAM_HALF_WIDTH_DEG;
    const approach: ApproachProcedure = {
      id: row.id,
      type: row.type,
      runway: row.runway,
      name: row.name,
      locNavaidId: locByRunway?.id ?? row.locNavaidId,
      gsNavaidId: gsByLoc?.id ?? row.gsNavaidId,
      fafFixId: row.fafFixId,
      thresholdFixId: row.thresholdFixId,
      courseDeg: row.courseDeg ?? locByRunway?.courseDeg,
      lengthNm: locByRunway?.lengthNm ?? DEFAULT_LOC_LENGTH_NM,
      beamHalfWidthDeg,
      tchFt: gsByLoc?.tchFt ?? row.tchFt ?? DEFAULT_TCH_FT,
    };
    const gsAngle = row.gsAngleDeg ?? gsByLoc?.gsAngleDeg;
    if (gsAngle !== undefined) {
      approach.gsAngleDeg = gsAngle;
    }
    if (fafDistanceNm !== undefined) {
      approach.fafDistanceNm = fafDistanceNm;
    }
    if (gsInterceptAltFt !== undefined) {
      approach.gsInterceptAltFt = gsInterceptAltFt;
    }
    if (row.daFt !== undefined) {
      approach.daFt = row.daFt;
    }
    if (row.missedHeadingDeg !== undefined && row.missedClimbFt !== undefined) {
      approach.missed = {
        headingDeg: row.missedHeadingDeg,
        climbToFt: row.missedClimbFt,
        ...(row.missedFixId !== undefined ? { directFixId: row.missedFixId } : {}),
      };
    }
    approaches.push(approach);
  }

  const catalog: ProcedureCatalog = {
    schemaVersion: 1,
    airportId,
    name: airport.name,
    magVarDeg: airport.magVarDeg,
    fieldElevFt: airport.fieldElevFt,
    arp: airport.arp,
    originNote: ORIGIN_NOTE,
    navaids,
    fixes,
    stars,
    approaches,
    sids: emitSids(source, airportId, bumpSkip),
    atpaVolumes: [],
  };
  validateCatalog(catalog);
  return {
    catalog,
    skipped: {
      count: Object.values(skippedByType).reduce((sum, n) => sum + n, 0),
      byType: skippedByType,
    },
  };
}

function emitSids(
  source: NormalizedCifpSource,
  airportId: string,
  bumpSkip: (type: string) => void,
): SidProcedure[] {
  const sids: SidProcedure[] = [];
  for (const row of source.sids) {
    if (row.airportId !== airportId) {
      continue;
    }
    const converted = toSidProcedure(row);
    if (converted === undefined) {
      bumpSkip("EMPTY_SID");
      continue;
    }
    sids.push(converted);
  }
  return sids;
}

function toSidProcedure(row: NormalizedSid): SidProcedure | undefined {
  const runwayTransitions: SidRunwayTransition[] = row.runwayTransitions
    .map((transition) => {
      const legs = supportedFixLegs(transition.legs);
      const out: SidRunwayTransition = {
        runwayId: transition.runwayId,
        legs,
      };
      if (transition.initialHeadingDeg !== undefined) {
        out.initialHeadingDeg = transition.initialHeadingDeg;
      }
      if (transition.initialClimbFt !== undefined) {
        out.initialClimbFt = transition.initialClimbFt;
      }
      return out;
    })
    .filter(
      (transition) =>
        transition.legs.length > 0 ||
        transition.initialHeadingDeg !== undefined ||
        transition.initialClimbFt !== undefined,
    );
  const common = supportedFixLegs(row.common);
  const enrouteTransitions: SidEnrouteTransition[] = row.enrouteTransitions
    .map((transition) => ({
      id: transition.id,
      name: transition.name,
      legs: supportedFixLegs(transition.legs),
    }))
    .filter((transition) => (transition.legs?.length ?? 0) > 0);
  if (runwayTransitions.length === 0 && common.length === 0 && enrouteTransitions.length === 0) {
    return undefined;
  }
  const sid: SidProcedure = {
    id: row.id,
    name: row.name,
    common,
  };
  if (runwayTransitions.length > 0) {
    sid.runwayTransitions = runwayTransitions;
  }
  if (enrouteTransitions.length > 0) {
    sid.enrouteTransitions = enrouteTransitions;
  }
  if (row.initialClimbFt !== undefined) {
    sid.initialClimbFt = row.initialClimbFt;
  }
  return sid;
}

function supportedFixLegs(legs: NormalizedProcedureLeg[]): StarLeg[] {
  const out: StarLeg[] = [];
  for (const leg of legs) {
    if (!leg.supported || leg.fixId === undefined) {
      continue;
    }
    const starLeg: StarLeg = { fixId: leg.fixId };
    if (leg.altConstraint !== undefined) {
      starLeg.altConstraint = leg.altConstraint;
    }
    if (leg.speedConstraint !== undefined) {
      starLeg.speedConstraint = leg.speedConstraint;
    }
    out.push(starLeg);
  }
  return out;
}

function keepCloserToOrigin<T extends { id: string; xNm: number; yNm: number }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    const prior = byId.get(row.id);
    if (prior === undefined) {
      byId.set(row.id, row);
      continue;
    }
    const nextDist = row.xNm * row.xNm + row.yNm * row.yNm;
    const priorDist = prior.xNm * prior.xNm + prior.yNm * prior.yNm;
    if (nextDist < priorDist) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

function toNavaid(
  row: {
    id: string;
    kind: Navaid["kind"];
    name?: string;
    position: LatLon;
    freqMhz?: number;
    freqKhz?: number;
    class?: "T" | "L" | "H";
    courseDeg?: number;
    gsAngleDeg?: number;
    tchFt?: number;
    locWidthDeg?: number;
  },
  arp: LatLon,
): Navaid {
  const navaid: Navaid = {
    id: row.id,
    kind: row.kind,
    name: row.name,
    ...project(row.position, arp),
  };
  if (row.freqMhz !== undefined) {
    navaid.freqMhz = row.freqMhz;
  }
  if (row.freqKhz !== undefined) {
    navaid.freqKhz = row.freqKhz;
  }
  if (row.class !== undefined) {
    navaid.class = row.class;
  }
  if (row.courseDeg !== undefined) {
    navaid.courseDeg = row.courseDeg;
  }
  if (row.gsAngleDeg !== undefined) {
    navaid.gsAngleDeg = row.gsAngleDeg;
  }
  if (row.tchFt !== undefined) {
    navaid.tchFt = row.tchFt;
  }
  if (row.kind === "LOC") {
    navaid.lengthNm = DEFAULT_LOC_LENGTH_NM;
    navaid.beamHalfWidthDeg =
      row.locWidthDeg !== undefined ? row.locWidthDeg / 2 : DEFAULT_BEAM_HALF_WIDTH_DEG;
  }
  return navaid;
}

function toFix(row: { id: string; kind: NavFix["kind"]; position: LatLon }, arp: LatLon): NavFix {
  return {
    id: row.id,
    kind: row.kind,
    ...project(row.position, arp),
  };
}

function project(point: LatLon, arp: LatLon): GeoPoint {
  const en = latLonToNm(point, arp);
  return {
    xNm: cleanNm(en.xNm),
    yNm: cleanNm(en.yNm),
    latDeg: point.latDeg,
    lonDeg: point.lonDeg,
  };
}

function cleanNm(n: number): number {
  const rounded = Math.round(n * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}

function validateCatalog(catalog: ProcedureCatalog): void {
  const ids = new Set<string>();
  const addId = (id: string, path: string): void => {
    if (ids.has(id)) {
      throw new Error(`CIFP import: duplicate id ${id} (${path})`);
    }
    ids.add(id);
  };
  for (const navaid of catalog.navaids) {
    addId(navaid.id, `navaid`);
  }
  for (const fix of catalog.fixes) {
    addId(fix.id, `fix`);
  }

  const requireRef = (id: string | undefined, path: string): void => {
    if (id === undefined) {
      return;
    }
    if (!ids.has(id)) {
      throw new Error(`CIFP import: unknown id ${id} (${path})`);
    }
  };

  for (const star of catalog.stars) {
    if (star.transitions.length === 0 && star.common.length === 0) {
      throw new Error(`CIFP import: STAR ${star.id} has no legs`);
    }
    for (const transition of star.transitions) {
      for (const [i, leg] of transition.legs.entries()) {
        requireRef(leg.fixId, `STAR ${star.id} transition ${transition.id} legs[${i}].fixId`);
      }
    }
    for (const [i, leg] of star.common.entries()) {
      requireRef(leg.fixId, `STAR ${star.id} common[${i}].fixId`);
    }
  }
  for (const sid of catalog.sids) {
    const runwayCount = sid.runwayTransitions?.length ?? 0;
    const enrouteCount = sid.enrouteTransitions?.length ?? 0;
    if (runwayCount === 0 && sid.common.length === 0 && enrouteCount === 0) {
      throw new Error(`CIFP import: SID ${sid.id} has no legs`);
    }
    for (const transition of sid.runwayTransitions ?? []) {
      for (const [i, leg] of transition.legs.entries()) {
        requireRef(leg.fixId, `SID ${sid.id} runway ${transition.runwayId} legs[${i}].fixId`);
      }
    }
    for (const [i, leg] of sid.common.entries()) {
      requireRef(leg.fixId, `SID ${sid.id} common[${i}].fixId`);
    }
    for (const transition of sid.enrouteTransitions ?? []) {
      for (const [i, leg] of (transition.legs ?? []).entries()) {
        requireRef(leg.fixId, `SID ${sid.id} enroute ${transition.id} legs[${i}].fixId`);
      }
      for (const rwy of transition.runwayTransitions ?? []) {
        for (const [i, leg] of rwy.legs.entries()) {
          requireRef(
            leg.fixId,
            `SID ${sid.id} enroute ${transition.id} runway ${rwy.runwayId} legs[${i}].fixId`,
          );
        }
      }
    }
  }
  for (const approach of catalog.approaches) {
    requireRef(approach.locNavaidId, `approach ${approach.id}.locNavaidId`);
    requireRef(approach.gsNavaidId, `approach ${approach.id}.gsNavaidId`);
    requireRef(approach.fafFixId, `approach ${approach.id}.fafFixId`);
    requireRef(approach.thresholdFixId, `approach ${approach.id}.thresholdFixId`);
    requireRef(approach.missed?.directFixId, `approach ${approach.id}.missed.directFixId`);
  }
}
