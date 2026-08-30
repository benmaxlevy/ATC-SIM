/**
 * Fixed-width FAA CIFP / ARINC 424-18 subset parser (T04-31).
 *
 * Emits `NormalizedCifpSource` only — no catalog, no ENU projection.
 * Continuation records and undocumented sections are skipped with counts.
 */

import {
  ARINC_COL,
  ARINC_RECORD_LENGTH,
  isPrimaryRecord,
  padRecord,
  parseFeet,
  parseFreqKhz,
  parseFreqMhz,
  parseHundredthsDeg,
  parseMagVarDeg,
  parsePackedLat,
  parsePackedLon,
  parseTenthsDeg,
  readField,
  readPackedLatLon,
  readTrim,
  sectionIdent,
} from "./arincLayout.ts";
import {
  isSupportedPathTerminator,
  isUnsupportedPathTerminator,
  type CifpDiagnostic,
  type CifpRecordIdentity,
  type NormalizedAirport,
  type NormalizedApproach,
  type NormalizedApproachType,
  type NormalizedCifpSource,
  type NormalizedFix,
  type NormalizedFixKind,
  type NormalizedNavaid,
  type NormalizedNavaidKind,
  type NormalizedProcedureLeg,
  type NormalizedRunway,
  type NormalizedSid,
  type NormalizedStar,
  type NormalizedAltConstraint,
  type NormalizedSpeedConstraint,
  type SourceLatLon,
  SID_COMMON_ROUTE_TYPES,
  SID_ENROUTE_ROUTE_TYPES,
  SID_QUALIFIED_ROUTE_TYPES,
  SID_RUNWAY_ROUTE_TYPES,
} from "./types.ts";

const ID_RE = /^[A-Z0-9]{2,8}$/;
/** Approach/SID/STAR identifiers in FAA CIFP may include hyphens (`H10-Z`, `RNV-A`). */
const PROCEDURE_ID_RE = /^[A-Z0-9][A-Z0-9-]{1,7}$/;
const ENROUTE_REGION = "ENRT";

interface RawLine {
  line: string;
  lineNo: number;
  section: string;
}

interface StarAcc {
  airportId: string;
  id: string;
  identity: CifpRecordIdentity;
  transitionLegs: Map<string, NormalizedProcedureLeg[]>;
  common: NormalizedProcedureLeg[];
}

interface ApproachAcc {
  airportId: string;
  id: string;
  identity: CifpRecordIdentity;
  type: NormalizedApproachType;
  runway: string;
  name: string;
  locNavaidId?: string;
  legs: NormalizedProcedureLeg[];
}

interface SidAcc {
  airportId: string;
  id: string;
  identity: CifpRecordIdentity;
  runwayLegs: Map<string, NormalizedProcedureLeg[]>;
  common: NormalizedProcedureLeg[];
  enrouteLegs: Map<string, NormalizedProcedureLeg[]>;
  initialClimbFt?: number;
}

export function parseFixedWidthCifp(text: string): NormalizedCifpSource {
  const diagnostics: CifpDiagnostic[] = [];
  const skippedByType: Record<string, number> = {};
  const bumpSkip = (type: string, lineNo?: number, airportId?: string): void => {
    skippedByType[type] = (skippedByType[type] ?? 0) + 1;
    diagnostics.push({
      severity: "skip",
      code: "SKIPPED_RECORD",
      message: `skipped ${type} record`,
      lineNo,
      airportId,
      section: type,
    });
  };

  const raw: RawLine[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const original = lines[i] ?? "";
    const trimmed = original.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("HDR")) {
      continue;
    }
    if (original.length < 80 || !/^[ST]/.test(original)) {
      bumpSkip("GARBAGE", i + 1);
      continue;
    }
    const line = padRecord(original);
    if (line.length < ARINC_RECORD_LENGTH - 4) {
      bumpSkip("GARBAGE", i + 1);
      continue;
    }
    const section = sectionIdent(line);
    raw.push({ line, lineNo: i + 1, section });
  }

  const airports: NormalizedAirport[] = [];
  const runways: NormalizedRunway[] = [];
  const navaids: NormalizedNavaid[] = [];
  const fixes: NormalizedFix[] = [];
  const seen = new Map<string, { json: string; lineNo: number }>();

  const stars = new Map<string, StarAcc>();
  const sids = new Map<string, SidAcc>();
  const approaches = new Map<string, ApproachAcc>();

  const remember = (
    identity: CifpRecordIdentity,
    payload: unknown,
    lineNo: number,
    section: string,
    airportId: string | undefined,
  ): boolean => {
    const json = JSON.stringify(payload);
    const prior = seen.get(identity.key);
    if (prior === undefined) {
      seen.set(identity.key, { json, lineNo });
      return true;
    }
    if (prior.json === json) {
      diagnostics.push({
        severity: "warning",
        code: "DUPLICATE_IDENTICAL",
        message: `duplicate identical ${section} ${identity.recordId} at line ${lineNo}`,
        lineNo,
        airportId,
        section,
        identity: identity.key,
      });
      return false;
    }
    diagnostics.push({
      severity: "error",
      code: "CONFLICTING_RECORD",
      message: `CIFP import: conflicting ${section} record ${identity.recordId} at line ${lineNo}${airportId ? ` (${airportId})` : ""}: lat/lon or field mismatch with line ${prior.lineNo}`,
      lineNo,
      airportId,
      section,
      identity: identity.key,
    });
    return false;
  };

  for (const row of raw) {
    try {
      switch (row.section) {
        case "PA": {
          if (!isPrimaryRecord(row.line, 22)) {
            bumpSkip("PA-CONT", row.lineNo);
            break;
          }
          const airport = parseAirport(row);
          if (
            remember(airport.identity, airportPayload(airport), row.lineNo, "PA", airport.airportId)
          ) {
            airports.push(airport);
          }
          break;
        }
        case "PG": {
          if (!isPrimaryRecord(row.line, 22)) {
            bumpSkip("PG-CONT", row.lineNo);
            break;
          }
          const runway = parseRunway(row);
          if (
            remember(runway.identity, runwayPayload(runway), row.lineNo, "PG", runway.airportId)
          ) {
            runways.push(runway);
          }
          break;
        }
        case "D": {
          if (!isPrimaryRecord(row.line, 22)) {
            bumpSkip("D-CONT", row.lineNo);
            break;
          }
          const navaid = parseVhf(row);
          if (remember(navaid.identity, navaidPayload(navaid), row.lineNo, "D", navaid.airportId)) {
            navaids.push(navaid);
          }
          break;
        }
        case "DB":
        case "PN":
        case "HN": {
          if (!isPrimaryRecord(row.line, 22)) {
            bumpSkip(`${row.section}-CONT`, row.lineNo);
            break;
          }
          const navaid = parseNdb(row);
          if (
            remember(
              navaid.identity,
              navaidPayload(navaid),
              row.lineNo,
              row.section,
              navaid.airportId,
            )
          ) {
            navaids.push(navaid);
          }
          break;
        }
        case "EA":
        case "PC": {
          if (!isPrimaryRecord(row.line, 22)) {
            bumpSkip(`${row.section}-CONT`, row.lineNo);
            break;
          }
          const fix = parseFix(row);
          if (remember(fix.identity, fixPayload(fix), row.lineNo, row.section, fix.airportId)) {
            fixes.push(fix);
          }
          break;
        }
        case "PI": {
          if (!isPrimaryRecord(row.line, 22)) {
            bumpSkip("PI-CONT", row.lineNo);
            break;
          }
          for (const navaid of parseLocalizerGlideslope(row)) {
            if (
              remember(navaid.identity, navaidPayload(navaid), row.lineNo, "PI", navaid.airportId)
            ) {
              navaids.push(navaid);
            }
          }
          break;
        }
        case "PM": {
          if (!isPrimaryRecord(row.line, 22)) {
            bumpSkip("PM-CONT", row.lineNo);
            break;
          }
          const marker = parseMarker(row);
          if (
            remember(marker.identity, navaidPayload(marker), row.lineNo, "PM", marker.airportId)
          ) {
            navaids.push(marker);
          }
          break;
        }
        case "PE": {
          if (!isPrimaryRecord(row.line, 39)) {
            bumpSkip("PE-CONT", row.lineNo);
            break;
          }
          ingestStarLeg(row, stars, diagnostics, skippedByType);
          break;
        }
        case "PF": {
          if (!isPrimaryRecord(row.line, 39)) {
            bumpSkip("PF-CONT", row.lineNo);
            break;
          }
          ingestApproachLeg(row, approaches, diagnostics, skippedByType);
          break;
        }
        case "PD": {
          if (!isPrimaryRecord(row.line, 39)) {
            bumpSkip("PD-CONT", row.lineNo);
            break;
          }
          ingestSidLeg(row, sids, diagnostics, skippedByType);
          break;
        }
        default:
          bumpSkip(row.section.trim().length > 0 ? row.section : "GARBAGE", row.lineNo);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        severity: "error",
        code: "MALFORMED_RECORD",
        message,
        lineNo: row.lineNo,
        section: row.section,
        airportId: optionalAirport(row.line, row.section),
      });
    }
  }

  return {
    dialect: "fixed-width",
    airports,
    runways,
    navaids,
    fixes,
    stars: finalizeStars(stars),
    sids: finalizeSids(sids),
    approaches: finalizeApproaches(approaches),
    diagnostics,
    skippedByType,
  };
}

function parseAirport(row: RawLine): NormalizedAirport {
  const ctx = lineCtx(row);
  const airportId = requireId(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx, "airportId");
  const name = readTrim(row.line, ARINC_COL.NAME, 30) || airportId;
  const arp = requireLatLon(row.line, ARINC_COL.LAT, ARINC_COL.LON, ctx);
  const magVarDeg = parseMagVarDeg(readField(row.line, 52, 5), ctx);
  const fieldElevFt = parseFeet(readField(row.line, 57, 5), ctx) ?? 0;
  return {
    identity: ident("PA", airportId, airportId),
    airportId,
    name,
    magVarDeg,
    fieldElevFt,
    arp,
    lineNo: row.lineNo,
  };
}

function parseRunway(row: RawLine): NormalizedRunway {
  const ctx = lineCtx(row);
  const airportId = requireId(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx, "airportId");
  const runwayId = requireText(readTrim(row.line, ARINC_COL.IDENT, 5), ctx, "runwayId").replace(
    /\s+/g,
    "",
  );
  const threshold = requireLatLon(row.line, ARINC_COL.LAT, ARINC_COL.LON, ctx);
  const bearingDeg = parseTenthsDeg(readField(row.line, 28, 4), ctx);
  const lengthFt = parseFeet(readField(row.line, 23, 5), ctx);
  return {
    identity: ident("PG", airportId, runwayId),
    airportId,
    runwayId,
    threshold,
    ...(bearingDeg !== undefined ? { bearingDeg } : {}),
    ...(lengthFt !== undefined ? { lengthFt } : {}),
    lineNo: row.lineNo,
  };
}

function parseVhf(row: RawLine): NormalizedNavaid {
  const ctx = lineCtx(row);
  const airportId = optionalPointAirport(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx);
  const rawId = requireId(readTrim(row.line, ARINC_COL.IDENT, 4), ctx, "id");
  const name = readTrim(row.line, ARINC_COL.NAME, 30) || rawId;
  const position = requireVhfLatLon(row.line, ctx);
  const freqMhz = parseFreqMhz(readField(row.line, ARINC_COL.FREQ, 5), ctx);
  const classRaw = readField(row.line, ARINC_COL.NAVAID_CLASS, 5);
  const kind = vhfKind(classRaw);
  const id = isIlsDmeClass(classRaw) ? `${rawId}DME`.slice(0, 8) : rawId;
  const rangeClass = vhfClass(classRaw, readField(row.line, 85, 1));
  return {
    identity: ident("D", airportId, id, readIcaoRegion(row.line)),
    ...(airportId !== undefined ? { airportId } : {}),
    id,
    kind,
    name,
    position,
    ...(freqMhz !== undefined ? { freqMhz } : {}),
    ...(rangeClass !== undefined ? { class: rangeClass } : {}),
    lineNo: row.lineNo,
  };
}

function parseNdb(row: RawLine): NormalizedNavaid {
  const ctx = lineCtx(row);
  const airportId = optionalPointAirport(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx);
  const id = requireId(readTrim(row.line, ARINC_COL.IDENT, 4), ctx, "id");
  const name = readTrim(row.line, ARINC_COL.NAME, 30) || id;
  const position = requireLatLon(row.line, ARINC_COL.LAT, ARINC_COL.LON, ctx);
  const freqKhz = parseFreqKhz(readField(row.line, ARINC_COL.FREQ, 5), ctx);
  return {
    identity: ident(row.section, airportId, id, readIcaoRegion(row.line)),
    ...(airportId !== undefined ? { airportId } : {}),
    id,
    kind: "NDB",
    name,
    position,
    ...(freqKhz !== undefined ? { freqKhz } : {}),
    lineNo: row.lineNo,
  };
}

function parseFix(row: RawLine): NormalizedFix {
  const ctx = lineCtx(row);
  const airportId = optionalPointAirport(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx);
  const id = requireId(readTrim(row.line, ARINC_COL.IDENT, 5), ctx, "id");
  const position = requireLatLon(row.line, ARINC_COL.LAT, ARINC_COL.LON, ctx);
  const kind = fixKind(id, readField(row.line, 27, 3));
  return {
    identity: ident(row.section, airportId, id, readIcaoRegion(row.line)),
    ...(airportId !== undefined ? { airportId } : {}),
    id,
    kind,
    position,
    lineNo: row.lineNo,
  };
}

function parseLocalizerGlideslope(row: RawLine): NormalizedNavaid[] {
  const ctx = lineCtx(row);
  const airportId = requireId(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx, "airportId");
  const locId = requireId(readTrim(row.line, ARINC_COL.IDENT, 4), ctx, "localizerId");
  const locPos = requireLatLon(row.line, ARINC_COL.LAT, ARINC_COL.LON, ctx);
  const freqMhz = parseFreqMhz(readField(row.line, ARINC_COL.FREQ, 5), ctx);
  const courseDeg = parseTenthsDeg(readField(row.line, 52, 4), ctx);
  const locWidthDeg = parseHundredthsDeg(readField(row.line, 84, 4), ctx);
  const gsAngleDeg = parseHundredthsDeg(readField(row.line, 88, 3), `${ctx} glideslope angle`);
  const tchRaw = readTrim(row.line, 96, 2);
  const tchFt = tchRaw.length > 0 ? Number(tchRaw) : undefined;
  if (tchFt !== undefined && !Number.isFinite(tchFt)) {
    throw new Error(`${ctx}: invalid TCH ${tchRaw}`);
  }
  const loc: NormalizedNavaid = {
    identity: ident("PI", airportId, locId),
    airportId,
    id: locId,
    kind: "LOC",
    name: locId,
    position: locPos,
    ...(freqMhz !== undefined ? { freqMhz } : {}),
    ...(courseDeg !== undefined ? { courseDeg } : {}),
    ...(locWidthDeg !== undefined ? { locWidthDeg } : {}),
    lineNo: row.lineNo,
  };
  const gsLat = readTrim(row.line, ARINC_COL.DME_LAT, 9);
  const gsLon = readTrim(row.line, ARINC_COL.DME_LON, 10);
  const out: NormalizedNavaid[] = [loc];
  if (gsLat.length > 0 && gsLon.length > 0) {
    const gsId = `${locId}GS`.slice(0, 8);
    out.push({
      identity: ident("PI-GS", airportId, gsId),
      airportId,
      id: gsId,
      kind: "GS",
      name: `${locId} GS`,
      position: {
        latDeg: parsePackedLat(gsLat, ctx),
        lonDeg: parsePackedLon(gsLon, ctx),
      },
      ...(gsAngleDeg !== undefined ? { gsAngleDeg } : {}),
      ...(tchFt !== undefined ? { tchFt } : {}),
      pairedLocId: locId,
      lineNo: row.lineNo,
    });
  }
  return out;
}

function parseMarker(row: RawLine): NormalizedNavaid {
  const ctx = lineCtx(row);
  const airportId = requireId(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx, "airportId");
  const locId = readTrim(row.line, ARINC_COL.IDENT, 4);
  const typeRaw = readTrim(row.line, 18, 3).toUpperCase();
  const kind: NormalizedNavaidKind =
    typeRaw.startsWith("IM") || typeRaw === "I"
      ? "IM"
      : typeRaw.startsWith("MM") || typeRaw === "M"
        ? "MM"
        : "OM";
  const rwy = readTrim(row.line, 28, 5).replace(/^RW/i, "");
  const id = `${kind}${rwy}`.replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const markerId = ID_RE.test(id) ? id : requireId(locId || "MK", ctx, "markerId");
  return {
    identity: ident("PM", airportId, `${markerId}:${kind}`),
    airportId,
    id: markerId,
    kind,
    name: markerId,
    position: requireLatLon(row.line, ARINC_COL.LAT, ARINC_COL.LON, ctx),
    ...(locId.length > 0 ? { pairedLocId: locId } : {}),
    lineNo: row.lineNo,
  };
}

function ingestStarLeg(
  row: RawLine,
  stars: Map<string, StarAcc>,
  diagnostics: CifpDiagnostic[],
  skippedByType: Record<string, number>,
): void {
  const ctx = lineCtx(row);
  const airportId = requireId(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx, "airportId");
  const starId = requireProcedureId(readTrim(row.line, ARINC_COL.IDENT, 6), ctx, "starId");
  const routeType = readField(row.line, 20, 1).trim();
  const transitionId = readTrim(row.line, 21, 5);
  const key = `PE:${airportId}:${starId}`;
  let acc = stars.get(key);
  if (acc === undefined) {
    acc = {
      airportId,
      id: starId,
      identity: ident("PE", airportId, starId),
      transitionLegs: new Map(),
      common: [],
    };
    stars.set(key, acc);
  }
  const leg = parseProcedureLeg(row, ctx);
  recordUnsupported(leg, diagnostics, skippedByType, airportId, "PE");
  const commonRoute = routeType === "2" || routeType === "5" || transitionId.length === 0;
  if (commonRoute) {
    acc.common.push(leg);
    return;
  }
  const transKey = transitionId.length > 0 ? transitionId : routeType || "T";
  const list = acc.transitionLegs.get(transKey) ?? [];
  list.push(leg);
  acc.transitionLegs.set(transKey, list);
}

function ingestSidLeg(
  row: RawLine,
  sids: Map<string, SidAcc>,
  diagnostics: CifpDiagnostic[],
  skippedByType: Record<string, number>,
): void {
  const ctx = lineCtx(row);
  const airportId = requireId(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx, "airportId");
  const sidId = requireProcedureId(readTrim(row.line, ARINC_COL.IDENT, 6), ctx, "sidId");
  const routeType = readField(row.line, 20, 1);
  const transitionId = readTrim(row.line, 21, 5);
  const bucket = classifySidRoute(routeType, transitionId);
  if (bucket === undefined) {
    const label = routeType.trim() || "PD";
    skippedByType[label] = (skippedByType[label] ?? 0) + 1;
    diagnostics.push({
      severity: "skip",
      code: "SKIPPED_SID_ROUTE",
      message: `skipped SID route type ${routeType.trim() || "(empty)"} on ${sidId}`,
      lineNo: row.lineNo,
      airportId,
      section: "PD",
    });
    return;
  }
  const key = `PD:${airportId}:${sidId}`;
  let acc = sids.get(key);
  if (acc === undefined) {
    acc = {
      airportId,
      id: sidId,
      identity: ident("PD", airportId, sidId),
      runwayLegs: new Map(),
      common: [],
      enrouteLegs: new Map(),
    };
    sids.set(key, acc);
  }
  const transAlt = parseFeet(readField(row.line, 95, 5), ctx);
  if (transAlt !== undefined && acc.initialClimbFt === undefined) {
    acc.initialClimbFt = transAlt;
  }
  const leg = parseProcedureLeg(row, ctx);
  recordUnsupported(leg, diagnostics, skippedByType, airportId, "PD");
  if (bucket.kind === "common") {
    acc.common.push(leg);
    return;
  }
  if (bucket.kind === "runway") {
    const list = acc.runwayLegs.get(bucket.key) ?? [];
    list.push(leg);
    acc.runwayLegs.set(bucket.key, list);
    return;
  }
  const list = acc.enrouteLegs.get(bucket.key) ?? [];
  list.push(leg);
  acc.enrouteLegs.set(bucket.key, list);
}

function classifySidRoute(
  routeType: string,
  transitionId: string,
): { kind: "runway" | "common" | "enroute"; key: string } | undefined {
  const rt = routeType.trim();
  const qualified = (SID_QUALIFIED_ROUTE_TYPES as readonly string[]).includes(rt);
  if (
    (SID_RUNWAY_ROUTE_TYPES as readonly string[]).includes(rt) ||
    (qualified && /^RW/i.test(transitionId))
  ) {
    if (transitionId.length === 0) {
      return undefined;
    }
    return { kind: "runway", key: runwayIdFromSidTransition(transitionId) };
  }
  if (
    (SID_COMMON_ROUTE_TYPES as readonly string[]).includes(rt) ||
    (qualified && transitionId.length === 0)
  ) {
    return { kind: "common", key: "" };
  }
  if (
    (SID_ENROUTE_ROUTE_TYPES as readonly string[]).includes(rt) ||
    (qualified && transitionId.length > 0)
  ) {
    if (transitionId.length === 0) {
      return undefined;
    }
    return { kind: "enroute", key: transitionId };
  }
  if (/^RW/i.test(transitionId)) {
    return { kind: "runway", key: runwayIdFromSidTransition(transitionId) };
  }
  return undefined;
}

function runwayIdFromSidTransition(transitionId: string): string {
  const stripped = transitionId.replace(/^RW/i, "").replace(/\s+/g, "");
  return stripped.length > 0 ? stripped : transitionId;
}

function ingestApproachLeg(
  row: RawLine,
  approaches: Map<string, ApproachAcc>,
  diagnostics: CifpDiagnostic[],
  skippedByType: Record<string, number>,
): void {
  const ctx = lineCtx(row);
  const airportId = requireId(readTrim(row.line, ARINC_COL.AIRPORT_ID, 4), ctx, "airportId");
  const appId = requireProcedureId(readTrim(row.line, ARINC_COL.IDENT, 6), ctx, "approachId");
  const routeType = readField(row.line, 20, 1);
  const mapped = mapApproachType(routeType);
  if (mapped === undefined && routeType.trim() !== "Z" && routeType.trim() !== "A") {
    const label = routeType.trim() || "PF";
    skippedByType[label] = (skippedByType[label] ?? 0) + 1;
    diagnostics.push({
      severity: "skip",
      code: "SKIPPED_APPROACH_ROUTE",
      message: `skipped approach route type ${routeType} on ${appId}`,
      lineNo: row.lineNo,
      airportId,
      section: "PF",
    });
    return;
  }
  const key = `PF:${airportId}:${appId}`;
  let acc = approaches.get(key);
  if (acc === undefined) {
    const runway = runwayFromApproach(appId, readTrim(row.line, 21, 5));
    const type = mapped ?? "ILS";
    acc = {
      airportId,
      id: appId,
      identity: ident("PF", airportId, appId),
      type,
      runway,
      name: `${type} RWY ${runway}`,
      legs: [],
    };
    approaches.set(key, acc);
  } else if (mapped !== undefined) {
    acc.type = mapped;
    acc.name = `${mapped} RWY ${acc.runway}`;
  }
  const recNav = readTrim(row.line, 51, 4);
  if (recNav.length >= 2 && acc.locNavaidId === undefined && ID_RE.test(recNav.toUpperCase())) {
    acc.locNavaidId = recNav.toUpperCase();
  }
  const leg = parseProcedureLeg(row, ctx);
  recordUnsupported(leg, diagnostics, skippedByType, airportId, "PF");
  acc.legs.push(leg);
}

function parseProcedureLeg(row: RawLine, ctx: string): NormalizedProcedureLeg {
  const sequence = Number(readTrim(row.line, 27, 3) || "0");
  const fixRaw = readTrim(row.line, 30, 5);
  const pathTerminator = readTrim(row.line, 48, 2).toUpperCase();
  const desc = readField(row.line, 40, 4);
  const missed = desc[3] === "M" || readField(row.line, 20, 1) === "Z";
  const courseDeg = parseTenthsDeg(readField(row.line, 71, 4), ctx);
  const altConstraint = parseAltConstraint(row.line, ctx);
  const speedConstraint = parseSpeedConstraint(row.line, ctx);
  const supported = isSupportedPathTerminator(pathTerminator);
  return {
    sequence: Number.isFinite(sequence) ? sequence : 0,
    ...(fixRaw.length >= 2 ? { fixId: fixRaw.toUpperCase() } : {}),
    pathTerminator,
    supported,
    ...(altConstraint !== undefined ? { altConstraint } : {}),
    ...(speedConstraint !== undefined ? { speedConstraint } : {}),
    ...(courseDeg !== undefined ? { courseDeg } : {}),
    missed,
    lineNo: row.lineNo,
    routeType: readField(row.line, 20, 1),
    transitionId: readTrim(row.line, 21, 5),
  };
}

function parseAltConstraint(line: string, ctx: string): NormalizedAltConstraint | undefined {
  const qual = readField(line, 83, 1);
  const alt = parseFeet(readField(line, 85, 5), ctx);
  if (alt === undefined) {
    return undefined;
  }
  return { type: mapRestriction(qual), altitudeFt: alt };
}

function parseSpeedConstraint(line: string, ctx: string): NormalizedSpeedConstraint | undefined {
  const spdRaw = readTrim(line, 100, 3);
  if (spdRaw.length === 0) {
    return undefined;
  }
  if (!/^\d+$/.test(spdRaw)) {
    throw new Error(`${ctx}: invalid speed ${spdRaw}`);
  }
  const qual = readField(line, 118, 1);
  return { type: mapRestriction(qual), speedKt: Number(spdRaw) };
}

function mapRestriction(qual: string): "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW" {
  switch (qual.trim()) {
    case "+":
    case "C":
      return "AT_OR_ABOVE";
    case "-":
    case "B":
      return "AT_OR_BELOW";
    default:
      return "AT";
  }
}

function recordUnsupported(
  leg: NormalizedProcedureLeg,
  diagnostics: CifpDiagnostic[],
  skippedByType: Record<string, number>,
  airportId: string,
  section: string,
): void {
  if (leg.supported) {
    return;
  }
  const label = isUnsupportedPathTerminator(leg.pathTerminator)
    ? leg.pathTerminator
    : leg.pathTerminator.length > 0
      ? leg.pathTerminator
      : "UNK-LEG";
  skippedByType[label] = (skippedByType[label] ?? 0) + 1;
  diagnostics.push({
    severity: "skip",
    code: "UNSUPPORTED_LEG",
    message: `unsupported path terminator ${label} skipped (not emitted as a straight leg)`,
    lineNo: leg.lineNo,
    airportId,
    section,
  });
}

function finalizeStars(stars: Map<string, StarAcc>): NormalizedStar[] {
  const out: NormalizedStar[] = [];
  for (const acc of stars.values()) {
    acc.common.sort(bySeq);
    const transitions = [...acc.transitionLegs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, legs]) => ({
        id,
        name: id,
        legs: [...legs].sort(bySeq),
      }));
    out.push({
      identity: acc.identity,
      airportId: acc.airportId,
      id: acc.id,
      name: acc.id,
      transitions,
      common: acc.common,
    });
  }
  out.sort((a, b) => a.identity.key.localeCompare(b.identity.key));
  return out;
}

function headingFromLegs(legs: NormalizedProcedureLeg[]): number | undefined {
  return legs.find((leg) => leg.courseDeg !== undefined)?.courseDeg;
}

function climbFromLegs(legs: NormalizedProcedureLeg[]): number | undefined {
  return legs.find((leg) => leg.altConstraint !== undefined)?.altConstraint?.altitudeFt;
}

function finalizeSids(sids: Map<string, SidAcc>): NormalizedSid[] {
  const out: NormalizedSid[] = [];
  for (const acc of sids.values()) {
    acc.common.sort(bySeq);
    const runwayTransitions = [...acc.runwayLegs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([runwayId, legs]) => {
        const sorted = [...legs].sort(bySeq);
        const initialHeadingDeg = headingFromLegs(sorted);
        const initialClimbFt = climbFromLegs(sorted);
        return {
          runwayId,
          ...(initialHeadingDeg !== undefined ? { initialHeadingDeg } : {}),
          ...(initialClimbFt !== undefined ? { initialClimbFt } : {}),
          legs: sorted,
        };
      });
    const enrouteTransitions = [...acc.enrouteLegs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, legs]) => ({
        id,
        name: id,
        legs: [...legs].sort(bySeq),
      }));
    const fromRunways = runwayTransitions
      .map((row) => row.initialClimbFt)
      .find((value) => value !== undefined);
    const fromCommon = climbFromLegs(acc.common);
    const initialClimbFt = acc.initialClimbFt ?? fromRunways ?? fromCommon;
    out.push({
      identity: acc.identity,
      airportId: acc.airportId,
      id: acc.id,
      name: acc.id,
      runwayTransitions,
      common: acc.common,
      enrouteTransitions,
      ...(initialClimbFt !== undefined ? { initialClimbFt } : {}),
    });
  }
  out.sort((a, b) => a.identity.key.localeCompare(b.identity.key));
  return out;
}

function finalizeApproaches(approaches: Map<string, ApproachAcc>): NormalizedApproach[] {
  const out: NormalizedApproach[] = [];
  for (const acc of approaches.values()) {
    acc.legs.sort(bySeq);
    const faf = acc.legs.find((leg) => leg.fixId !== undefined && !leg.missed && isFafish(leg));
    const recNavLegs = acc.legs.filter((leg) => leg.courseDeg !== undefined && !leg.missed);
    const courseDeg = recNavLegs.find((leg) => leg.courseDeg !== undefined)?.courseDeg;
    const missedLegs = acc.legs.filter((leg) => leg.missed || leg.routeType === "Z");
    const missedFix = missedLegs.find(
      (leg) => leg.fixId !== undefined && isSupportedPathTerminator(leg.pathTerminator),
    );
    const missedHeading = missedLegs.find((leg) => leg.courseDeg !== undefined);
    const missedClimb = missedLegs.find((leg) => leg.altConstraint !== undefined);
    const thresholdFix = acc.legs.find(
      (leg) => leg.fixId !== undefined && /^RW/i.test(leg.fixId) && !leg.missed,
    );
    out.push({
      identity: acc.identity,
      airportId: acc.airportId,
      id: acc.id,
      type: acc.type,
      runway: acc.runway,
      name: acc.name,
      ...(acc.locNavaidId !== undefined ? { locNavaidId: acc.locNavaidId } : {}),
      ...(acc.locNavaidId !== undefined ? { gsNavaidId: `${acc.locNavaidId}GS`.slice(0, 8) } : {}),
      ...(faf?.fixId !== undefined ? { fafFixId: faf.fixId } : {}),
      ...(thresholdFix?.fixId !== undefined
        ? { thresholdFixId: thresholdFix.fixId }
        : { thresholdFixId: `RW${acc.runway}` }),
      ...(courseDeg !== undefined ? { courseDeg } : {}),
      ...(missedHeading?.courseDeg !== undefined
        ? { missedHeadingDeg: missedHeading.courseDeg }
        : {}),
      ...(missedClimb?.altConstraint !== undefined
        ? { missedClimbFt: missedClimb.altConstraint.altitudeFt }
        : {}),
      ...(missedFix?.fixId !== undefined ? { missedFixId: missedFix.fixId } : {}),
      legs: acc.legs,
    });
  }
  out.sort((a, b) => a.identity.key.localeCompare(b.identity.key));
  return out;
}

function isFafish(leg: NormalizedProcedureLeg): boolean {
  const id = leg.fixId ?? "";
  return id.startsWith("FI") || id.includes("FAF");
}

function bySeq(a: NormalizedProcedureLeg, b: NormalizedProcedureLeg): number {
  return a.sequence - b.sequence || a.lineNo - b.lineNo;
}

function mapApproachType(routeType: string): NormalizedApproachType | undefined {
  switch (routeType.trim()) {
    case "I":
      return "ILS";
    case "L":
    case "B":
    case "X":
    case "T":
    case "G":
      return "LOC";
    case "R":
    case "H":
    case "P":
    case "F":
    case "J":
      return "RNAV";
    case "V":
    case "S":
    case "D":
      return "VOR";
    case "N":
    case "Q":
      return "NDB";
    default:
      return undefined;
  }
}

function runwayFromApproach(appId: string, transitionId: string): string {
  const fromTrans = transitionId.replace(/^RW/i, "");
  if (/^\d{1,2}[LCR]?$/.test(fromTrans)) {
    return fromTrans;
  }
  const match = /(\d{1,2}[LCR]?)/.exec(appId);
  return match?.[1] ?? appId;
}

function isIlsDmeClass(classRaw: string): boolean {
  const c0 = classRaw[0] ?? " ";
  const c1 = classRaw[1] ?? " ";
  return c1 === "I" || c0 === "I";
}

function vhfKind(classRaw: string): NormalizedNavaidKind {
  const c0 = classRaw[0] ?? " ";
  const c1 = classRaw[1] ?? " ";
  const hasDme = classRaw.includes("D") || classRaw.includes("T") || c1 === "I";
  if (c0 === "V" && hasDme) {
    return "VORDME";
  }
  if (c0 === "V") {
    return "VOR";
  }
  if (c0 === "D" || c0 === "T" || c1 === "D" || c1 === "T" || c1 === "I" || c0 === "I") {
    return "DME";
  }
  return "VOR";
}

function vhfClass(classRaw: string, figureOfMerit: string): "T" | "L" | "H" | undefined {
  for (const ch of classRaw) {
    if (ch === "T" || ch === "L" || ch === "H") {
      return ch;
    }
  }
  if (figureOfMerit === "1") {
    return "T";
  }
  if (figureOfMerit === "2") {
    return "L";
  }
  if (figureOfMerit === "3") {
    return "H";
  }
  return undefined;
}

function fixKind(id: string, typeField: string): NormalizedFixKind {
  if (/^RW\d/i.test(id)) {
    return "THRESHOLD";
  }
  const t = typeField.toUpperCase();
  if (t.includes("M") || /^MISS/i.test(id)) {
    return "MAPT";
  }
  if (t.includes("F")) {
    return "FAF";
  }
  return "INTERSECTION";
}

function requireVhfLatLon(line: string, ctx: string): SourceLatLon {
  const vor = readPackedLatLon(line, ARINC_COL.LAT, ARINC_COL.LON);
  const dme = readPackedLatLon(line, ARINC_COL.DME_LAT, ARINC_COL.DME_LON);
  const packed = vor ?? dme;
  if (packed === undefined) {
    throw new Error(`${ctx}: missing coordinate`);
  }
  return {
    latDeg: parsePackedLat(packed.lat, ctx),
    lonDeg: parsePackedLon(packed.lon, ctx),
  };
}

function requireLatLon(
  line: string,
  latStart: number,
  lonStart: number,
  ctx: string,
): SourceLatLon {
  const packed = readPackedLatLon(line, latStart, lonStart);
  if (packed === undefined) {
    throw new Error(`${ctx}: missing coordinate`);
  }
  return {
    latDeg: parsePackedLat(packed.lat, ctx),
    lonDeg: parsePackedLon(packed.lon, ctx),
  };
}

function optionalPointAirport(value: string, ctx: string): string | undefined {
  if (value.length === 0 || value === ENROUTE_REGION) {
    return undefined;
  }
  return requireId(value, ctx, "airportId");
}

function requireProcedureId(value: string, ctx: string, field: string): string {
  const id = requireText(value, ctx, field).toUpperCase();
  if (!PROCEDURE_ID_RE.test(id)) {
    throw new Error(`${ctx}: ${field} must be uppercase [A-Z0-9-]{2,8} (got ${id})`);
  }
  return id;
}

function requireId(value: string, ctx: string, field: string): string {
  const id = requireText(value, ctx, field).toUpperCase();
  if (!ID_RE.test(id)) {
    throw new Error(`${ctx}: ${field} must be uppercase [A-Z0-9]{2,8} (got ${id})`);
  }
  return id;
}

function requireText(value: string, ctx: string, field: string): string {
  if (value.length === 0) {
    throw new Error(`${ctx}: missing ${field}`);
  }
  return value;
}

function ident(
  section: string,
  airportId: string | undefined,
  recordId: string,
  region?: string,
): CifpRecordIdentity {
  const owner = airportId ?? (region !== undefined && region.length > 0 ? region : undefined);
  const key = `${section}:${owner ?? "_"}:${recordId}`;
  return {
    key,
    section,
    ...(airportId !== undefined ? { airportId } : {}),
    recordId,
  };
}

function readIcaoRegion(line: string): string {
  return readTrim(line, 20, 2);
}

function lineCtx(row: RawLine): string {
  const airport = optionalAirport(row.line, row.section);
  const where = airport ? ` (${airport}/${row.section})` : ` (${row.section})`;
  return `CIFP import line ${row.lineNo}${where}`;
}

function optionalAirport(line: string, section: string): string | undefined {
  if (
    section.startsWith("P") ||
    section.startsWith("H") ||
    section === "D" ||
    section === "DB" ||
    section === "EA"
  ) {
    const raw = readTrim(line, ARINC_COL.AIRPORT_ID, 4);
    if (raw.length === 0 || raw === ENROUTE_REGION) {
      return undefined;
    }
    return raw;
  }
  return undefined;
}

function airportPayload(row: NormalizedAirport): unknown {
  return {
    airportId: row.airportId,
    name: row.name,
    magVarDeg: row.magVarDeg,
    fieldElevFt: row.fieldElevFt,
    arp: row.arp,
  };
}

function runwayPayload(row: NormalizedRunway): unknown {
  return { runwayId: row.runwayId, threshold: row.threshold, bearingDeg: row.bearingDeg };
}

function navaidPayload(row: NormalizedNavaid): unknown {
  return {
    id: row.id,
    kind: row.kind,
    position: row.position,
    freqMhz: row.freqMhz,
    freqKhz: row.freqKhz,
    courseDeg: row.courseDeg,
  };
}

function fixPayload(row: NormalizedFix): unknown {
  return { id: row.id, kind: row.kind, position: row.position };
}
