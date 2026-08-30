/**
 * Offline CIFP parser (T04-08 comma subset + T04-31 fixed-width ARINC 424).
 *
 * Detects dialect, then either the original comma-separated fixture path or
 * fixed-width → `NormalizedCifpSource` → `ProcedureCatalog`. Real CIFP uses
 * lat/lon only. KDEM is not in CIFP.
 *
 * Not imported by `stepWorld` or the Vite app entry. Keep this under `tools/`.
 */

import { detectCifpDialect, parsePackedLat, parsePackedLon } from "./arincLayout.ts";
import { latLonToNm, type LatLon } from "./coordinates.ts";
import { emitCatalogFromSource } from "./normalize.ts";
import { parseFixedWidthCifp } from "./parseFixedWidth.ts";
import type { CifpSkipStats } from "./types.ts";
import type {
  AltConstraint,
  ApproachProcedure,
  ApproachType,
  GeoPoint,
  Navaid,
  NavaidKind,
  NavFix,
  NavFixKind,
  ProcedureCatalog,
  SpeedConstraint,
  StarLeg,
  StarProcedure,
  StarTransition,
} from "../../src/scenario/procedures/types.ts";

export type {
  CifpSkipStats,
  NormalizedCifpSource,
  NormalizedSid,
  NormalizedSidEnrouteTransition,
  NormalizedSidRunwayTransition,
} from "./types.ts";
export { parseFixedWidthCifp } from "./parseFixedWidth.ts";
export { emitCatalogFromSource } from "./normalize.ts";
export { detectCifpDialect, parsePackedLat, parsePackedLon } from "./arincLayout.ts";

const KNOWN_TYPES = new Set(["PA", "D", "DB", "PC", "EA", "PI", "GS", "PE", "PF"]);

const ID_RE = /^[A-Z0-9]{2,8}$/;

const APPROACH_TYPES = new Set<ApproachType>(["ILS", "LOC", "RNAV", "VOR", "NDB"]);

const FIX_KINDS = new Set<NavFixKind>(["WAYPOINT", "INTERSECTION", "FAF", "MAPT", "THRESHOLD"]);

const VHF_KINDS = new Set<NavaidKind>(["VOR", "VORDME"]);

const DEFAULT_LOC_LENGTH_NM = 18;
const DEFAULT_BEAM_HALF_WIDTH_DEG = 2.5;
const DEFAULT_TCH_FT = 50;

export interface CifpImportResult {
  catalog: ProcedureCatalog;
  skipped: CifpSkipStats;
}

interface CifpLine {
  type: string;
  fields: string[];
  lineNo: number;
}

interface StarBuild {
  star: StarProcedure;
  legTarget: "transition" | "common" | null;
  currentTransition: StarTransition | null;
}

export function parseCifpSubset(text: string): CifpImportResult {
  if (detectCifpDialect(text) === "fixed-width") {
    return emitCatalogFromSource(parseFixedWidthCifp(text));
  }
  const skipped: CifpSkipStats = { count: 0, byType: {} };
  const records: CifpLine[] = [];

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (raw.length === 0 || raw.startsWith("#")) {
      continue;
    }
    const fields = raw.split(",").map((part) => part.trim());
    const type = fields[0] ?? "";
    if (!KNOWN_TYPES.has(type)) {
      bumpSkip(skipped, skipLabel(type));
      continue;
    }
    records.push({ type, fields, lineNo: i + 1 });
  }

  const catalog = convertRecords(records);
  return { catalog, skipped };
}

function skipLabel(type: string): string {
  if (/^[A-Z]{1,4}$/.test(type)) {
    return type;
  }
  return "GARBAGE";
}

function bumpSkip(skipped: CifpSkipStats, type: string): void {
  skipped.count += 1;
  skipped.byType[type] = (skipped.byType[type] ?? 0) + 1;
}

function convertRecords(records: CifpLine[]): ProcedureCatalog {
  const pa = records.find((row) => row.type === "PA");
  if (pa === undefined) {
    throw new Error("CIFP import: missing PA airport record");
  }
  const airport = parsePa(pa);
  const arp: LatLon = airport.arp;

  const navaids: Navaid[] = [];
  const fixes: NavFix[] = [];
  const stars: StarProcedure[] = [];
  const approaches: ApproachProcedure[] = [];
  const starById = new Map<string, StarBuild>();

  for (const row of records) {
    switch (row.type) {
      case "PA":
        if (row !== pa) {
          throw new Error(`CIFP import: duplicate PA at line ${row.lineNo}`);
        }
        break;
      case "D":
        navaids.push(parseVhf(row, arp));
        break;
      case "DB":
        navaids.push(parseNdb(row, arp));
        break;
      case "PC":
      case "EA":
        fixes.push(parseFix(row, arp));
        break;
      case "PI":
        navaids.push(parseLoc(row, arp));
        break;
      case "GS":
        navaids.push(parseGs(row, arp));
        break;
      case "PE":
        applyStar(row, airport.airportId, starById, stars);
        break;
      case "PF":
        approaches.push(parseApproach(row, airport.airportId));
        break;
      default:
        break;
    }
  }

  const catalog: ProcedureCatalog = {
    schemaVersion: 1,
    airportId: airport.airportId,
    name: airport.name,
    magVarDeg: airport.magVarDeg,
    fieldElevFt: airport.fieldElevFt,
    arp: airport.arp,
    originNote: airport.originNote,
    navaids,
    fixes,
    stars,
    approaches,
    sids: [],
    atpaVolumes: [],
  };
  validateCatalog(catalog);
  return catalog;
}

function parsePa(row: CifpLine): {
  airportId: string;
  name: string;
  magVarDeg: number;
  fieldElevFt: number;
  arp: LatLon;
  originNote: string;
} {
  // PA,<icao>,<name>,<latPacked>,<lonPacked>,<magVarDeg>,<elevFt>
  requireMin(row, 7);
  return {
    airportId: assertId(row.fields[1], row, "airportId"),
    name: requireText(row.fields[2], row, "name"),
    magVarDeg: parseNumber(row.fields[5], row, "magVarDeg"),
    fieldElevFt: parseNumber(row.fields[6], row, "elevFt"),
    arp: {
      latDeg: parsePackedLatField(requireText(row.fields[3], row, "lat"), row),
      lonDeg: parsePackedLonField(requireText(row.fields[4], row, "lon"), row),
    },
    originNote:
      "Imported from a synthetic CIFP subset fixture (not a real FAA cycle). Local tangent NM from ARP using the phase 0 projector. KDEM remains the sim default.",
  };
}

function parseVhf(row: CifpLine, arp: LatLon): Navaid {
  // D,<id>,<name>,<kind>,<latPacked>,<lonPacked>,<freqMhz>,<class>
  requireMin(row, 8);
  const kindRaw = requireText(row.fields[3], row, "kind");
  if (!VHF_KINDS.has(kindRaw as NavaidKind)) {
    throw new Error(lineError(row, `VHF kind must be VOR or VORDME (got ${kindRaw})`));
  }
  const classRaw = requireText(row.fields[7], row, "class");
  if (classRaw !== "T" && classRaw !== "L" && classRaw !== "H") {
    throw new Error(lineError(row, `class must be T, L, or H (got ${classRaw})`));
  }
  return {
    id: assertId(row.fields[1], row, "id"),
    kind: kindRaw as NavaidKind,
    name: requireText(row.fields[2], row, "name"),
    ...projectPoint(row.fields[4], row.fields[5], arp, row),
    freqMhz: parseNumber(row.fields[6], row, "freqMhz"),
    class: classRaw,
  };
}

function parseNdb(row: CifpLine, arp: LatLon): Navaid {
  // DB,<id>,<name>,<latPacked>,<lonPacked>,<freqKhz>
  requireMin(row, 6);
  return {
    id: assertId(row.fields[1], row, "id"),
    kind: "NDB",
    name: requireText(row.fields[2], row, "name"),
    ...projectPoint(row.fields[3], row.fields[4], arp, row),
    freqKhz: parseNumber(row.fields[5], row, "freqKhz"),
  };
}

function parseFix(row: CifpLine, arp: LatLon): NavFix {
  // PC|EA,<id>,<kind>,<latPacked>,<lonPacked>
  requireMin(row, 5);
  const kindRaw = requireText(row.fields[2], row, "kind");
  if (!FIX_KINDS.has(kindRaw as NavFixKind)) {
    throw new Error(lineError(row, `fix kind is unknown: ${kindRaw}`));
  }
  return {
    id: assertId(row.fields[1], row, "id"),
    kind: kindRaw as NavFixKind,
    ...projectPoint(row.fields[3], row.fields[4], arp, row),
  };
}

function parseLoc(row: CifpLine, arp: LatLon): Navaid {
  // PI,<id>,<name>,<latPacked>,<lonPacked>,<freqMhz>,<courseDeg>[,lengthNm][,beamHalfWidthDeg]
  requireMin(row, 7);
  const lengthNm =
    row.fields[7] !== undefined && row.fields[7].length > 0
      ? parseNumber(row.fields[7], row, "lengthNm")
      : DEFAULT_LOC_LENGTH_NM;
  const beamHalfWidthDeg =
    row.fields[8] !== undefined && row.fields[8].length > 0
      ? parseNumber(row.fields[8], row, "beamHalfWidthDeg")
      : DEFAULT_BEAM_HALF_WIDTH_DEG;
  return {
    id: assertId(row.fields[1], row, "id"),
    kind: "LOC",
    name: requireText(row.fields[2], row, "name"),
    ...projectPoint(row.fields[3], row.fields[4], arp, row),
    freqMhz: parseNumber(row.fields[5], row, "freqMhz"),
    courseDeg: parseNumber(row.fields[6], row, "courseDeg"),
    lengthNm,
    beamHalfWidthDeg,
  };
}

function parseGs(row: CifpLine, arp: LatLon): Navaid {
  // GS,<id>,<name>,<latPacked>,<lonPacked>,<freqMhz>,<gsAngleDeg>[,tchFt]
  requireMin(row, 7);
  const tchFt =
    row.fields[7] !== undefined && row.fields[7].length > 0
      ? parseNumber(row.fields[7], row, "tchFt")
      : DEFAULT_TCH_FT;
  return {
    id: assertId(row.fields[1], row, "id"),
    kind: "GS",
    name: requireText(row.fields[2], row, "name"),
    ...projectPoint(row.fields[3], row.fields[4], arp, row),
    freqMhz: parseNumber(row.fields[5], row, "freqMhz"),
    gsAngleDeg: parseNumber(row.fields[6], row, "gsAngleDeg"),
    tchFt,
  };
}

function applyStar(
  row: CifpLine,
  airportId: string,
  starById: Map<string, StarBuild>,
  stars: StarProcedure[],
): void {
  // PE,<sub>,...
  requireMin(row, 3);
  const sub = requireText(row.fields[1], row, "sub");
  switch (sub) {
    case "H": {
      // PE,H,<icao>,<starId>,<starName>
      requireMin(row, 5);
      const icao = assertId(row.fields[2], row, "icao");
      if (icao !== airportId) {
        throw new Error(lineError(row, `STAR airport ${icao} does not match PA ${airportId}`));
      }
      const id = assertId(row.fields[3], row, "starId");
      if (starById.has(id)) {
        throw new Error(lineError(row, `duplicate STAR ${id}`));
      }
      const star: StarProcedure = {
        id,
        name: requireText(row.fields[4], row, "name"),
        transitions: [],
        common: [],
        termination: "VECTORS",
      };
      const build: StarBuild = { star, legTarget: null, currentTransition: null };
      starById.set(id, build);
      stars.push(star);
      return;
    }
    case "T": {
      // PE,T,<starId>,<transId>,<transName>
      requireMin(row, 5);
      const build = requireStar(row, starById);
      const transition: StarTransition = {
        id: requireText(row.fields[3], row, "transId"),
        name: requireText(row.fields[4], row, "transName"),
        legs: [],
      };
      build.star.transitions.push(transition);
      build.currentTransition = transition;
      build.legTarget = "transition";
      return;
    }
    case "C": {
      // PE,C,<starId>
      const build = requireStar(row, starById);
      build.legTarget = "common";
      build.currentTransition = null;
      return;
    }
    case "L": {
      // PE,L,<starId>,<fixId>,<altQual>,<altFt>[,<spdQual>,<spdKt>]
      requireMin(row, 6);
      const build = requireStar(row, starById);
      const leg = parseStarLeg(row);
      if (build.legTarget === "transition") {
        if (build.currentTransition === null) {
          throw new Error(lineError(row, "STAR leg has no current transition"));
        }
        build.currentTransition.legs.push(leg);
        return;
      }
      if (build.legTarget === "common") {
        build.star.common.push(leg);
        return;
      }
      throw new Error(lineError(row, "STAR leg before PE,T or PE,C"));
    }
    case "E": {
      // PE,E,<starId>,VECTORS
      requireMin(row, 4);
      const build = requireStar(row, starById);
      const term = requireText(row.fields[3], row, "termination");
      if (term !== "VECTORS") {
        throw new Error(lineError(row, `STAR termination must be VECTORS (got ${term})`));
      }
      build.star.termination = "VECTORS";
      return;
    }
    default:
      throw new Error(lineError(row, `unknown PE subrecord ${sub}`));
  }
}

function requireStar(row: CifpLine, starById: Map<string, StarBuild>): StarBuild {
  const starId = assertId(row.fields[2], row, "starId");
  const build = starById.get(starId);
  if (build === undefined) {
    throw new Error(lineError(row, `STAR ${starId} has no PE,H header`));
  }
  return build;
}

function parseStarLeg(row: CifpLine): StarLeg {
  const leg: StarLeg = {
    fixId: assertId(row.fields[3], row, "fixId"),
    altConstraint: parseAlt(row.fields[4], row.fields[5], row),
  };
  if (row.fields[6] !== undefined && row.fields[6].length > 0) {
    leg.speedConstraint = parseSpeed(row.fields[6], row.fields[7], row);
  }
  return leg;
}

function parseApproach(row: CifpLine, airportId: string): ApproachProcedure {
  // PF,<icao>,<appId>,<type>,<runway>,<name>,<locId>,<gsId>,<fafId>,<thrId>,<courseDeg>
  //    [,<lengthNm>][,<beam>][,<gsAngle>][,<tch>][,<fafDist>][,<gsIntAlt>][,<daFt>]
  //    [,<missHdg>][,<missClimb>][,<missFix>]
  requireMin(row, 11);
  const icao = assertId(row.fields[1], row, "icao");
  if (icao !== airportId) {
    throw new Error(lineError(row, `approach airport ${icao} does not match PA ${airportId}`));
  }
  const typeRaw = requireText(row.fields[3], row, "type");
  if (!APPROACH_TYPES.has(typeRaw as ApproachType)) {
    throw new Error(lineError(row, `approach type is unknown: ${typeRaw}`));
  }
  const lengthNm = optionalNumber(row.fields[11], row, "lengthNm") ?? DEFAULT_LOC_LENGTH_NM;
  const beamHalfWidthDeg =
    optionalNumber(row.fields[12], row, "beamHalfWidthDeg") ?? DEFAULT_BEAM_HALF_WIDTH_DEG;
  const tchFt = optionalNumber(row.fields[14], row, "tchFt") ?? DEFAULT_TCH_FT;
  const missedHeading = optionalNumber(row.fields[18], row, "missed.headingDeg");
  const missedClimb = optionalNumber(row.fields[19], row, "missed.climbToFt");
  const missedFix = optionalText(row.fields[20]);

  const approach: ApproachProcedure = {
    id: assertId(row.fields[2], row, "id"),
    type: typeRaw as ApproachType,
    runway: requireText(row.fields[4], row, "runway"),
    name: requireText(row.fields[5], row, "name"),
    locNavaidId: optionalId(row.fields[6], row, "locNavaidId"),
    gsNavaidId: optionalId(row.fields[7], row, "gsNavaidId"),
    fafFixId: optionalId(row.fields[8], row, "fafFixId"),
    thresholdFixId: optionalId(row.fields[9], row, "thresholdFixId"),
    courseDeg: parseNumber(row.fields[10], row, "courseDeg"),
    lengthNm,
    beamHalfWidthDeg,
    tchFt,
  };
  const gsAngleDeg = optionalNumber(row.fields[13], row, "gsAngleDeg");
  if (gsAngleDeg !== undefined) {
    approach.gsAngleDeg = gsAngleDeg;
  }
  const fafDistanceNm = optionalNumber(row.fields[15], row, "fafDistanceNm");
  if (fafDistanceNm !== undefined) {
    approach.fafDistanceNm = fafDistanceNm;
  }
  const gsInterceptAltFt = optionalNumber(row.fields[16], row, "gsInterceptAltFt");
  if (gsInterceptAltFt !== undefined) {
    approach.gsInterceptAltFt = gsInterceptAltFt;
  }
  const daFt = optionalNumber(row.fields[17], row, "daFt");
  if (daFt !== undefined) {
    approach.daFt = daFt;
  }
  if (missedHeading !== undefined && missedClimb !== undefined) {
    approach.missed = {
      headingDeg: missedHeading,
      climbToFt: missedClimb,
      ...(missedFix !== undefined
        ? { directFixId: assertId(missedFix, row, "missed.directFixId") }
        : {}),
    };
  }
  return approach;
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
  for (const approach of catalog.approaches) {
    requireRef(approach.locNavaidId, `approach ${approach.id}.locNavaidId`);
    requireRef(approach.gsNavaidId, `approach ${approach.id}.gsNavaidId`);
    requireRef(approach.fafFixId, `approach ${approach.id}.fafFixId`);
    requireRef(approach.thresholdFixId, `approach ${approach.id}.thresholdFixId`);
    requireRef(approach.missed?.directFixId, `approach ${approach.id}.missed.directFixId`);
  }
}

function projectPoint(
  latField: string | undefined,
  lonField: string | undefined,
  arp: LatLon,
  row: CifpLine,
): GeoPoint {
  const latDeg = parsePackedLatField(requireText(latField, row, "lat"), row);
  const lonDeg = parsePackedLonField(requireText(lonField, row, "lon"), row);
  const en = latLonToNm({ latDeg, lonDeg }, arp);
  return {
    xNm: cleanNm(en.xNm),
    yNm: cleanNm(en.yNm),
    latDeg,
    lonDeg,
  };
}

function parsePackedLatField(text: string, row: CifpLine): number {
  try {
    return parsePackedLat(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(lineError(row, message));
  }
}

function parsePackedLonField(text: string, row: CifpLine): number {
  try {
    return parsePackedLon(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(lineError(row, message));
  }
}

function parseAlt(qual: string | undefined, alt: string | undefined, row: CifpLine): AltConstraint {
  return {
    type: mapRestriction(requireText(qual, row, "altQual"), row),
    altitudeFt: parseNumber(alt, row, "altitudeFt"),
  };
}

function parseSpeed(
  qual: string | undefined,
  spd: string | undefined,
  row: CifpLine,
): SpeedConstraint {
  return {
    type: mapRestriction(requireText(qual, row, "spdQual"), row),
    speedKt: parseNumber(spd, row, "speedKt"),
  };
}

function mapRestriction(qual: string, row: CifpLine): "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW" {
  switch (qual) {
    case "+":
    case "A":
    case "AT_OR_ABOVE":
      return "AT_OR_ABOVE";
    case "-":
    case "B":
    case "AT_OR_BELOW":
      return "AT_OR_BELOW";
    case "@":
    case "AT":
      return "AT";
    default:
      throw new Error(lineError(row, `unknown altitude/speed qualifier ${qual}`));
  }
}

function optionalNumber(
  value: string | undefined,
  row: CifpLine,
  field: string,
): number | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return parseNumber(value, row, field);
}

function optionalText(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

function optionalId(value: string | undefined, row: CifpLine, field: string): string | undefined {
  const text = optionalText(value);
  if (text === undefined) {
    return undefined;
  }
  return assertId(text, row, field);
}

function parseNumber(value: string | undefined, row: CifpLine, field: string): number {
  const text = requireText(value, row, field);
  const n = Number(text);
  if (!Number.isFinite(n)) {
    throw new Error(lineError(row, `${field} must be a finite number (got ${text})`));
  }
  return n;
}

function assertId(value: string | undefined, row: CifpLine, field: string): string {
  const id = requireText(value, row, field).toUpperCase();
  if (!ID_RE.test(id)) {
    throw new Error(lineError(row, `${field} must be uppercase [A-Z0-9]{2,8} (got ${id})`));
  }
  return id;
}

function requireText(value: string | undefined, row: CifpLine, field: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(lineError(row, `missing ${field}`));
  }
  return value;
}

function requireMin(row: CifpLine, n: number): void {
  if (row.fields.length < n) {
    throw new Error(lineError(row, `expected at least ${n} fields, got ${row.fields.length}`));
  }
}

function lineError(row: CifpLine, message: string): string {
  return `CIFP import line ${row.lineNo}: ${message}`;
}

function cleanNm(n: number): number {
  const rounded = Math.round(n * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
}
