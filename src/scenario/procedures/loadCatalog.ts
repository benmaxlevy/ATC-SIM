/**
 * Load a facility procedure catalog from `src/scenario/data/<dir>/`.
 * Directory path, not a KDEM-only function: a later importer can write
 * `data/<ICAO>/` in this same shape without a rewrite.
 *
 * Video maps are a separate MAPS catalog. This loader never joins STAR JSON
 * to `video-maps/` (AC5b).
 */

import type {
  AltConstraint,
  ApproachProcedure,
  ApproachType,
  MissedApproach,
  Navaid,
  NavaidKind,
  NavFix,
  NavFixKind,
  ProcedureCatalog,
  SidEnrouteTransition,
  SidLeg,
  SidProcedure,
  SidRunwayTransition,
  SpeedConstraint,
  StarLeg,
  StarProcedure,
  StarTransition,
} from "./types";

const DATA_JSON = import.meta.glob<unknown>("../data/*/*.json", {
  eager: true,
  import: "default",
});

const NAVAID_KINDS = new Set<NavaidKind>([
  "VOR",
  "VORDME",
  "NDB",
  "DME",
  "LOC",
  "GS",
  "OM",
  "MM",
  "IM",
]);

const FIX_KINDS = new Set<NavFixKind>(["WAYPOINT", "INTERSECTION", "FAF", "MAPT", "THRESHOLD"]);

const APPROACH_TYPES = new Set<ApproachType>(["ILS", "LOC", "RNAV", "VOR", "NDB"]);

const ALT_TYPES = new Set(["AT", "AT_OR_ABOVE", "AT_OR_BELOW"]);

const NAVAID_CLASSES = new Set(["T", "L", "H"]);

/** ILS DME ids (IDEMDME) are 7 chars; keep the ceiling at 8. */
const ID_RE = /^[A-Z0-9]{2,8}$/;

const REQUIRED_FILES = ["vors", "ndbs", "ils", "fixes", "procedures", "sids"] as const;

export interface CatalogFileSet {
  catalog: unknown;
  vors: unknown;
  ndbs: unknown;
  ils: unknown;
  fixes: unknown;
  procedures: unknown;
  sids: unknown;
}

import {
  assertArray as assertArrayVal,
  assertNumber as assertNumberVal,
  assertString as assertStringVal,
  isRecord,
} from "../load";

const assertNumber = (value: unknown, path: string): number =>
  assertNumberVal(value, path, "Catalog");
const assertString = (value: unknown, path: string): string =>
  assertStringVal(value, path, "Catalog");
const assertArray = (value: unknown, path: string): unknown[] =>
  assertArrayVal(value, path, "Catalog");

function optionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertNumber(value, path);
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertString(value, path);
}

function assertId(value: unknown, path: string): string {
  const id = assertString(value, path).toUpperCase();
  if (!ID_RE.test(id)) {
    throw new Error(
      `Catalog ${path} must be uppercase [A-Z0-9]{2,8} (got ${JSON.stringify(value)})`,
    );
  }
  return id;
}

function assertLatLon(value: unknown, path: string): { latDeg: number; lonDeg: number } {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  return {
    latDeg: assertNumber(value.latDeg, `${path}.latDeg`),
    lonDeg: assertNumber(value.lonDeg, `${path}.lonDeg`),
  };
}

function optionalLatLon(
  raw: Record<string, unknown>,
  path: string,
): { latDeg?: number; lonDeg?: number } {
  const latDeg = optionalNumber(raw.latDeg, `${path}.latDeg`);
  const lonDeg = optionalNumber(raw.lonDeg, `${path}.lonDeg`);
  return {
    ...(latDeg !== undefined ? { latDeg } : {}),
    ...(lonDeg !== undefined ? { lonDeg } : {}),
  };
}

function parseAltConstraint(value: unknown, path: string): AltConstraint {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const type = assertString(value.type, `${path}.type`);
  if (!ALT_TYPES.has(type)) {
    throw new Error(`Catalog ${path}.type is unknown: ${type}`);
  }
  return {
    type: type as AltConstraint["type"],
    altitudeFt: assertNumber(value.altitudeFt, `${path}.altitudeFt`),
  };
}

function parseSpeedConstraint(value: unknown, path: string): SpeedConstraint {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const type = assertString(value.type, `${path}.type`);
  if (!ALT_TYPES.has(type)) {
    throw new Error(`Catalog ${path}.type is unknown: ${type}`);
  }
  return {
    type: type as SpeedConstraint["type"],
    speedKt: assertNumber(value.speedKt, `${path}.speedKt`),
  };
}

function parseStarLeg(value: unknown, path: string): StarLeg {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const leg: StarLeg = { fixId: assertId(value.fixId, `${path}.fixId`) };
  if (value.altConstraint !== undefined) {
    leg.altConstraint = parseAltConstraint(value.altConstraint, `${path}.altConstraint`);
  }
  if (value.speedConstraint !== undefined) {
    leg.speedConstraint = parseSpeedConstraint(value.speedConstraint, `${path}.speedConstraint`);
  }
  return leg;
}

function parseStarTransition(value: unknown, path: string): StarTransition {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  return {
    id: assertString(value.id, `${path}.id`),
    name: assertString(value.name, `${path}.name`),
    legs: assertArray(value.legs, `${path}.legs`).map((leg, i) =>
      parseStarLeg(leg, `${path}.legs[${i}]`),
    ),
  };
}

function parseStar(value: unknown, index: number): StarProcedure {
  const path = `stars[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const transitions = assertArray(value.transitions, `${path}.transitions`).map((item, i) =>
    parseStarTransition(item, `${path}.transitions[${i}]`),
  );
  const common = assertArray(value.common, `${path}.common`).map((leg, i) =>
    parseStarLeg(leg, `${path}.common[${i}]`),
  );
  const termination = assertString(value.termination, `${path}.termination`);
  if (termination !== "VECTORS") {
    throw new Error(`Catalog ${path}.termination must be VECTORS`);
  }
  const star: StarProcedure = {
    id: assertString(value.id, `${path}.id`),
    name: assertString(value.name, `${path}.name`),
    transitions,
    common,
    termination: "VECTORS",
  };
  const legCount = common.length + transitions.reduce((sum, t) => sum + t.legs.length, 0);
  if (legCount === 0) {
    throw new Error(`Catalog ${path} is empty (no transition or common legs)`);
  }
  return star;
}

function parseSidLeg(value: unknown, path: string): SidLeg {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const leg: SidLeg = { fixId: assertId(value.fixId, `${path}.fixId`) };
  if (value.altConstraint !== undefined) {
    leg.altConstraint = parseAltConstraint(value.altConstraint, `${path}.altConstraint`);
  }
  if (value.speedConstraint !== undefined) {
    leg.speedConstraint = parseSpeedConstraint(value.speedConstraint, `${path}.speedConstraint`);
  }
  return leg;
}

function parseSidRunwayTransition(value: unknown, path: string): SidRunwayTransition {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  return {
    runwayId: assertString(value.runwayId, `${path}.runwayId`),
    initialHeadingDeg: optionalNumber(value.initialHeadingDeg, `${path}.initialHeadingDeg`),
    initialClimbFt: optionalNumber(value.initialClimbFt, `${path}.initialClimbFt`),
    legs: assertArray(value.legs, `${path}.legs`).map((leg, i) =>
      parseSidLeg(leg, `${path}.legs[${i}]`),
    ),
  };
}

function parseSidEnrouteTransition(value: unknown, path: string): SidEnrouteTransition {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  return {
    id: assertString(value.id, `${path}.id`),
    name: assertString(value.name, `${path}.name`),
    legs: assertArray(value.legs, `${path}.legs`).map((leg, i) =>
      parseSidLeg(leg, `${path}.legs[${i}]`),
    ),
  };
}

function parseSid(value: unknown, index: number): SidProcedure {
  const path = `sids[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const runwayTransitions =
    value.runwayTransitions !== undefined
      ? assertArray(value.runwayTransitions, `${path}.runwayTransitions`).map((item, i) =>
          parseSidRunwayTransition(item, `${path}.runwayTransitions[${i}]`),
        )
      : undefined;
  const common = assertArray(value.common, `${path}.common`).map((leg, i) =>
    parseSidLeg(leg, `${path}.common[${i}]`),
  );
  const enrouteTransitions =
    value.enrouteTransitions !== undefined
      ? assertArray(value.enrouteTransitions, `${path}.enrouteTransitions`).map((item, i) =>
          parseSidEnrouteTransition(item, `${path}.enrouteTransitions[${i}]`),
        )
      : undefined;
  const initialClimbFt = optionalNumber(value.initialClimbFt, `${path}.initialClimbFt`);

  const sid: SidProcedure = {
    id: assertString(value.id, `${path}.id`),
    name: assertString(value.name, `${path}.name`),
    ...(runwayTransitions !== undefined ? { runwayTransitions } : {}),
    common,
    ...(enrouteTransitions !== undefined ? { enrouteTransitions } : {}),
    ...(initialClimbFt !== undefined ? { initialClimbFt } : {}),
  };

  const legCount =
    common.length +
    (runwayTransitions?.reduce((sum, t) => sum + t.legs.length, 0) ?? 0) +
    (enrouteTransitions?.reduce((sum, t) => sum + t.legs.length, 0) ?? 0);
  if (legCount === 0) {
    throw new Error(
      `Catalog ${path} is empty (no runway transition, common, or enroute transition legs)`,
    );
  }
  return sid;
}

function parseMissed(value: unknown, path: string): MissedApproach {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const directFixId = optionalString(value.directFixId, `${path}.directFixId`);
  return {
    headingDeg: assertNumber(value.headingDeg, `${path}.headingDeg`),
    climbToFt: assertNumber(value.climbToFt, `${path}.climbToFt`),
    ...(directFixId !== undefined ? { directFixId: directFixId.toUpperCase() } : {}),
  };
}

function parseApproach(value: unknown, index: number): ApproachProcedure {
  const path = `approaches[${index}]`;
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const type = assertString(value.type, `${path}.type`);
  if (!APPROACH_TYPES.has(type as ApproachType)) {
    throw new Error(`Catalog ${path}.type is unknown: ${type}`);
  }
  const approach: ApproachProcedure = {
    id: assertString(value.id, `${path}.id`),
    type: type as ApproachType,
    runway: assertString(value.runway, `${path}.runway`),
    name: assertString(value.name, `${path}.name`),
  };
  const locNavaidId = optionalString(value.locNavaidId, `${path}.locNavaidId`);
  const gsNavaidId = optionalString(value.gsNavaidId, `${path}.gsNavaidId`);
  const fafFixId = optionalString(value.fafFixId, `${path}.fafFixId`);
  const thresholdFixId = optionalString(value.thresholdFixId, `${path}.thresholdFixId`);
  if (locNavaidId !== undefined) {
    approach.locNavaidId = locNavaidId.toUpperCase();
  }
  if (gsNavaidId !== undefined) {
    approach.gsNavaidId = gsNavaidId.toUpperCase();
  }
  if (fafFixId !== undefined) {
    approach.fafFixId = fafFixId.toUpperCase();
  }
  if (thresholdFixId !== undefined) {
    approach.thresholdFixId = thresholdFixId.toUpperCase();
  }
  const courseDeg = optionalNumber(value.courseDeg, `${path}.courseDeg`);
  const lengthNm = optionalNumber(value.lengthNm, `${path}.lengthNm`);
  const beamHalfWidthDeg = optionalNumber(value.beamHalfWidthDeg, `${path}.beamHalfWidthDeg`);
  const gsAngleDeg = optionalNumber(value.gsAngleDeg, `${path}.gsAngleDeg`);
  const tchFt = optionalNumber(value.tchFt, `${path}.tchFt`);
  const fafDistanceNm = optionalNumber(value.fafDistanceNm, `${path}.fafDistanceNm`);
  const gsInterceptAltFt = optionalNumber(value.gsInterceptAltFt, `${path}.gsInterceptAltFt`);
  const daFt = optionalNumber(value.daFt, `${path}.daFt`);
  if (courseDeg !== undefined) {
    approach.courseDeg = courseDeg;
  }
  if (lengthNm !== undefined) {
    approach.lengthNm = lengthNm;
  }
  if (beamHalfWidthDeg !== undefined) {
    approach.beamHalfWidthDeg = beamHalfWidthDeg;
  }
  if (gsAngleDeg !== undefined) {
    approach.gsAngleDeg = gsAngleDeg;
  }
  if (tchFt !== undefined) {
    approach.tchFt = tchFt;
  }
  if (fafDistanceNm !== undefined) {
    approach.fafDistanceNm = fafDistanceNm;
  }
  if (gsInterceptAltFt !== undefined) {
    approach.gsInterceptAltFt = gsInterceptAltFt;
  }
  if (daFt !== undefined) {
    approach.daFt = daFt;
  }
  if (value.missed !== undefined) {
    approach.missed = parseMissed(value.missed, `${path}.missed`);
  }
  return approach;
}

function parseNavaid(value: unknown, path: string): Navaid {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const kind = assertString(value.kind, `${path}.kind`);
  if (!NAVAID_KINDS.has(kind as NavaidKind)) {
    throw new Error(`Catalog ${path}.kind is unknown: ${kind}`);
  }
  const navaid: Navaid = {
    id: assertId(value.id, `${path}.id`),
    kind: kind as NavaidKind,
    xNm: assertNumber(value.xNm, `${path}.xNm`),
    yNm: assertNumber(value.yNm, `${path}.yNm`),
    ...optionalLatLon(value, path),
  };
  const name = optionalString(value.name, `${path}.name`);
  if (name !== undefined) {
    navaid.name = name;
  }
  const freqMhz = optionalNumber(value.freqMhz, `${path}.freqMhz`);
  const freqKhz = optionalNumber(value.freqKhz, `${path}.freqKhz`);
  if (freqMhz !== undefined) {
    navaid.freqMhz = freqMhz;
  }
  if (freqKhz !== undefined) {
    navaid.freqKhz = freqKhz;
  }
  if (value.class !== undefined) {
    const navaidClass = assertString(value.class, `${path}.class`);
    if (!NAVAID_CLASSES.has(navaidClass)) {
      throw new Error(`Catalog ${path}.class must be T, L, or H`);
    }
    navaid.class = navaidClass as "T" | "L" | "H";
  }
  const courseDeg = optionalNumber(value.courseDeg, `${path}.courseDeg`);
  const lengthNm = optionalNumber(value.lengthNm, `${path}.lengthNm`);
  const beamHalfWidthDeg = optionalNumber(value.beamHalfWidthDeg, `${path}.beamHalfWidthDeg`);
  const gsAngleDeg = optionalNumber(value.gsAngleDeg, `${path}.gsAngleDeg`);
  const tchFt = optionalNumber(value.tchFt, `${path}.tchFt`);
  const pairedWith = optionalString(value.pairedWith, `${path}.pairedWith`);
  const note = optionalString(value.note, `${path}.note`);
  if (courseDeg !== undefined) {
    navaid.courseDeg = courseDeg;
  }
  if (lengthNm !== undefined) {
    navaid.lengthNm = lengthNm;
  }
  if (beamHalfWidthDeg !== undefined) {
    navaid.beamHalfWidthDeg = beamHalfWidthDeg;
  }
  if (gsAngleDeg !== undefined) {
    navaid.gsAngleDeg = gsAngleDeg;
  }
  if (tchFt !== undefined) {
    navaid.tchFt = tchFt;
  }
  if (pairedWith !== undefined) {
    navaid.pairedWith = pairedWith.toUpperCase();
  }
  if (note !== undefined) {
    navaid.note = note;
  }
  return navaid;
}

function parseFix(value: unknown, path: string): NavFix {
  if (!isRecord(value)) {
    throw new Error(`Catalog ${path} must be an object`);
  }
  const kind = assertString(value.kind, `${path}.kind`);
  if (!FIX_KINDS.has(kind as NavFixKind)) {
    throw new Error(`Catalog ${path}.kind is unknown: ${kind}`);
  }
  const fix: NavFix = {
    id: assertId(value.id, `${path}.id`),
    kind: kind as NavFixKind,
    xNm: assertNumber(value.xNm, `${path}.xNm`),
    yNm: assertNumber(value.yNm, `${path}.yNm`),
    ...optionalLatLon(value, path),
  };
  const formedBy = optionalString(value.formedBy, `${path}.formedBy`);
  const note = optionalString(value.note, `${path}.note`);
  if (formedBy !== undefined) {
    fix.formedBy = formedBy;
  }
  if (note !== undefined) {
    fix.note = note;
  }
  return fix;
}

function assertAirportId(value: unknown, path: string, expected: string): void {
  const airportId = assertString(value, path);
  if (airportId !== expected) {
    throw new Error(`Catalog ${path} ${airportId} does not match catalog.airportId ${expected}`);
  }
}

function collectResolveIds(navaids: Navaid[], fixes: NavFix[]): Set<string> {
  const ids = new Set<string>();
  const add = (id: string, path: string): void => {
    if (ids.has(id)) {
      throw new Error(`Catalog duplicate id ${id} (${path})`);
    }
    ids.add(id);
  };
  for (const navaid of navaids) {
    add(navaid.id, `navaid ${navaid.kind}`);
  }
  for (const fix of fixes) {
    add(fix.id, "fix");
  }
  return ids;
}

function requireRef(ids: Set<string>, id: string | undefined, path: string): void {
  if (id === undefined) {
    return;
  }
  if (!ids.has(id)) {
    throw new Error(`Catalog ${path} references unknown id ${id}`);
  }
}

function validateRefs(catalog: ProcedureCatalog, ids: Set<string>): void {
  for (const navaid of catalog.navaids) {
    requireRef(ids, navaid.pairedWith, `navaid ${navaid.id}.pairedWith`);
  }
  for (const star of catalog.stars) {
    for (const transition of star.transitions) {
      for (const [i, leg] of transition.legs.entries()) {
        requireRef(ids, leg.fixId, `STAR ${star.id} transition ${transition.id} legs[${i}].fixId`);
      }
    }
    for (const [i, leg] of star.common.entries()) {
      requireRef(ids, leg.fixId, `STAR ${star.id} common[${i}].fixId`);
    }
  }
  for (const sid of catalog.sids) {
    if (sid.runwayTransitions) {
      for (const rt of sid.runwayTransitions) {
        for (const [i, leg] of rt.legs.entries()) {
          requireRef(
            ids,
            leg.fixId,
            `SID ${sid.id} runwayTransition ${rt.runwayId} legs[${i}].fixId`,
          );
        }
      }
    }
    for (const [i, leg] of sid.common.entries()) {
      requireRef(ids, leg.fixId, `SID ${sid.id} common[${i}].fixId`);
    }
    if (sid.enrouteTransitions) {
      for (const et of sid.enrouteTransitions) {
        for (const [i, leg] of et.legs.entries()) {
          requireRef(ids, leg.fixId, `SID ${sid.id} enrouteTransition ${et.id} legs[${i}].fixId`);
        }
      }
    }
  }
  for (const approach of catalog.approaches) {
    requireRef(ids, approach.locNavaidId, `approach ${approach.id}.locNavaidId`);
    requireRef(ids, approach.gsNavaidId, `approach ${approach.id}.gsNavaidId`);
    requireRef(ids, approach.fafFixId, `approach ${approach.id}.fafFixId`);
    requireRef(ids, approach.thresholdFixId, `approach ${approach.id}.thresholdFixId`);
    requireRef(ids, approach.missed?.directFixId, `approach ${approach.id}.missed.directFixId`);
  }
}

/**
 * Assemble a catalog from already-read JSON objects. Used by `loadCatalog`
 * and by tests that mutate a copy to prove schema failures.
 */
export function parseCatalogFiles(files: CatalogFileSet): ProcedureCatalog {
  if (!isRecord(files.catalog)) {
    throw new Error("Catalog catalog.json must be an object");
  }
  const schemaVersion = assertNumber(files.catalog.schemaVersion, "schemaVersion");
  if (schemaVersion !== 1) {
    throw new Error("Catalog schemaVersion must be 1");
  }
  const airportId = assertString(files.catalog.airportId, "airportId");
  const fileMap = files.catalog.files;
  if (!isRecord(fileMap)) {
    throw new Error("Catalog files must be an object");
  }
  for (const key of REQUIRED_FILES) {
    if (typeof fileMap[key] !== "string" || fileMap[key].length === 0) {
      throw new Error(`Catalog files.${key} must be a non-empty string`);
    }
  }

  if (!isRecord(files.vors)) {
    throw new Error("Catalog vors.json must be an object");
  }
  if (!isRecord(files.ndbs)) {
    throw new Error("Catalog ndbs.json must be an object");
  }
  if (!isRecord(files.ils)) {
    throw new Error("Catalog ils.json must be an object");
  }
  if (!isRecord(files.fixes)) {
    throw new Error("Catalog fixes.json must be an object");
  }
  if (!isRecord(files.procedures)) {
    throw new Error("Catalog procedures.json must be an object");
  }
  if (!isRecord(files.sids)) {
    throw new Error("Catalog sids.json must be an object");
  }

  assertAirportId(files.vors.airportId, "vors.airportId", airportId);
  assertAirportId(files.ndbs.airportId, "ndbs.airportId", airportId);
  assertAirportId(files.ils.airportId, "ils.airportId", airportId);
  assertAirportId(files.fixes.airportId, "fixes.airportId", airportId);
  assertAirportId(files.procedures.airportId, "procedures.airportId", airportId);
  assertAirportId(files.sids.airportId, "sids.airportId", airportId);

  const vors = assertArray(files.vors.vors, "vors").map((item, i) =>
    parseNavaid(item, `vors[${i}]`),
  );
  const ndbs = assertArray(files.ndbs.ndbs, "ndbs").map((item, i) =>
    parseNavaid(item, `ndbs[${i}]`),
  );
  const ilsComponents = assertArray(files.ils.components, "ils.components").map((item, i) =>
    parseNavaid(item, `ils.components[${i}]`),
  );
  const navaids = [...vors, ...ndbs, ...ilsComponents];
  const fixes = assertArray(files.fixes.fixes, "fixes").map((item, i) =>
    parseFix(item, `fixes[${i}]`),
  );
  const stars = assertArray(files.procedures.stars, "stars").map(parseStar);
  const approaches = assertArray(files.procedures.approaches, "approaches").map(parseApproach);
  const sids = assertArray(files.sids.sids, "sids").map(parseSid);

  const originNote = optionalString(files.catalog.originNote, "originNote");
  const catalog: ProcedureCatalog = {
    schemaVersion: 1,
    airportId,
    name: assertString(files.catalog.name, "name"),
    magVarDeg: assertNumber(files.catalog.magVarDeg, "magVarDeg"),
    fieldElevFt: assertNumber(files.catalog.fieldElevFt, "fieldElevFt"),
    arp: assertLatLon(files.catalog.arp, "arp"),
    ...(originNote !== undefined ? { originNote } : {}),
    navaids,
    fixes,
    stars,
    approaches,
    sids,
  };
  const ids = collectResolveIds(navaids, fixes);
  validateRefs(catalog, ids);
  return catalog;
}

/** Last path segment, so `kdem` and `src/scenario/data/kdem` both work. */
export function catalogDirName(dir: string): string {
  const trimmed = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = trimmed.split("/").filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  if (last === undefined || last === "." || last === "..") {
    throw new Error(`Catalog directory is empty: ${JSON.stringify(dir)}`);
  }
  return last;
}

function readDataJson(dir: string, file: string): unknown {
  const path = `../data/${dir}/${file}`;
  if (!(path in DATA_JSON)) {
    throw new Error(`Missing catalog file ${path}`);
  }
  return DATA_JSON[path];
}

/**
 * Load `catalog.json` plus every file it lists from `src/scenario/data/<dir>/`.
 * Duplicate ids and dangling procedure refs throw; nothing partial is returned.
 */
export function loadCatalog(dir: string): ProcedureCatalog {
  const folder = catalogDirName(dir);
  const catalogJson = readDataJson(folder, "catalog.json");
  if (!isRecord(catalogJson) || !isRecord(catalogJson.files)) {
    throw new Error(`Catalog ${folder}/catalog.json must list files`);
  }
  const files = catalogJson.files;
  const readListed = (key: (typeof REQUIRED_FILES)[number]): unknown => {
    const name = files[key];
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(`Catalog files.${key} must be a non-empty string`);
    }
    return readDataJson(folder, name);
  };
  return parseCatalogFiles({
    catalog: catalogJson,
    vors: readListed("vors"),
    ndbs: readListed("ndbs"),
    ils: readListed("ils"),
    fixes: readListed("fixes"),
    procedures: readListed("procedures"),
    sids: readListed("sids"),
  });
}

export { findSidProcedure, sidRouteFixIds } from "./sidHelpers";
