/**
 * Regional catalog and satellite-arrival pack generator (T04-70).
 *
 * Extends the generic CIFP pack pipeline with a regional output mode that takes
 * the T04-69 source manifest / files, center airport, and radius.
 * Generates:
 *   - regional.json (manifest with schemaVersion, center ICAO, radius, source provenance)
 *   - regional-airports.json (airport rows with coordinates, operational status, eligibility, runways)
 *   - regional-airspace.json (controlled Class B/C/D and special use airspace boundaries)
 *   - airports/<ICAO>/ (generic closed ProcedureCatalog file sets for eligible destinations)
 *
 * Tool-only. Runtime `src/` must not import this module.
 */

import { stripRwPrefix } from "./runwayIdentity.ts";
import { emitClosedCatalogPack, type CatalogPackSerialized } from "./catalogWriter.ts";
import { radiusSeedToClosureSeed, writeCatalogPack } from "./pack.ts";
import { parseFixedWidthCifp } from "./parseFixedWidth.ts";
import { buildRegionalSource, type RegionalIo } from "./regionalSource.ts";
import { selectByRadius } from "./spatialIndex.ts";
import type {
  CifpDiagnostic,
  NormalizedAirport,
  NormalizedCifpSource,
  NormalizedRunway,
  SourceLatLon,
} from "./types.ts";

export interface RegionalPackOptions {
  cifpPath: string;
  nasrAptPath: string;
  nasrTwrPath?: string;
  centerAirportId: string;
  radiusNm: number;
  outDir?: string;
  dryRun?: boolean;
  strict?: boolean;
  effectiveCycle?: string;
  command?: string;
}

export interface RegionalRunwayRow {
  id: string;
  threshold: SourceLatLon;
  headingTrueDeg: number;
  headingMagDeg: number;
  lengthFt: number;
}

export interface RegionalAirportRow {
  icao: string;
  name: string;
  arp: SourceLatLon;
  fieldElevFt: number;
  magVarDeg: number;
  publicUse: boolean;
  towered: boolean;
  eligible: boolean;
  exclusionReason?: string;
  serviceMetadata?: {
    publicUse?: boolean;
    towered?: boolean;
    sourceFile?: string;
    sourceRecordId?: string;
    effectiveDate?: string;
    cycle?: string;
  };
  runways: RegionalRunwayRow[];
  hasPublishedApproaches: boolean;
  catalogRef?: string;
}

export interface RegionalAirspaceRow {
  id: string;
  name: string;
  type: "CONTROLLED" | "SPECIAL_USE";
  class?: string;
  specialUseKind?: string;
  centerAirportId?: string;
  lowerLimit: {
    altitudeFt?: number;
    unit: string;
    reference: string;
    rawAltitude?: string;
    rawUnit?: string;
  };
  upperLimit: {
    altitudeFt?: number;
    unit: string;
    reference: string;
    rawAltitude?: string;
    rawUnit?: string;
  };
  segments: {
    sequence: number;
    boundaryVia: string;
    boundaryViaType: string;
    position: SourceLatLon;
    arcOrigin?: SourceLatLon;
    arcDistanceNm?: number;
    arcBearingDeg?: number;
  }[];
}

export interface RegionalManifest {
  schemaVersion: 1;
  centerAirportId: string;
  radiusNm: number;
  source: {
    effectiveCycle?: string;
    families: string[];
    command?: string;
  };
  files: {
    airports: string;
    airspace: string;
  };
}

export interface RegionalAirportsFile {
  schemaVersion: 1;
  airports: RegionalAirportRow[];
}

export interface RegionalAirspaceFile {
  schemaVersion: 1;
  airspaces: RegionalAirspaceRow[];
}

export interface RegionalPackResult {
  options: RegionalPackOptions;
  arp: SourceLatLon;
  centerAirport: NormalizedAirport;
  airports: RegionalAirportRow[];
  airspaces: RegionalAirspaceRow[];
  eligibleAirports: RegionalAirportRow[];
  excludedAirports: RegionalAirportRow[];
  diagnostics: CifpDiagnostic[];
  manifest: RegionalManifest;
  catalogs: Record<string, CatalogPackSerialized>;
  serialized: {
    manifest: string;
    airports: string;
    airspace: string;
  };
}

function normalizeDeg(deg: number): number {
  const norm = deg % 360;
  return norm < 0 ? norm + 360 : norm;
}

function computeMagneticHeading(trueHeadingDeg: number, magVarDeg: number): number {
  return normalizeDeg(Math.round((trueHeadingDeg - magVarDeg) * 10) / 10);
}

export function buildRegionalPack(
  cifpText: string,
  nasrAptText: string,
  nasrTwrText: string | undefined,
  options: RegionalPackOptions,
): RegionalPackResult {
  const strict = options.strict ?? true;
  const diagnostics: CifpDiagnostic[] = [];

  // 1. Build regional source (parses CIFP, NASR, enriches, selects by radius, validates)
  const regionalSource = buildRegionalSource(cifpText, nasrAptText, nasrTwrText, {
    cifpPath: options.cifpPath,
    nasrAptPath: options.nasrAptPath,
    nasrTwrPath: options.nasrTwrPath,
    centerAirportId: options.centerAirportId,
    radiusNm: options.radiusNm,
    dryRun: options.dryRun,
    strict,
    effectiveCycle: options.effectiveCycle,
  });

  diagnostics.push(...regionalSource.diagnostics);

  const cifpSource: NormalizedCifpSource =
    regionalSource.cifpSource ?? parseFixedWidthCifp(cifpText);

  // Group CIFP runways by airport ID
  const runwaysByAirport = new Map<string, NormalizedRunway[]>();
  for (const runway of cifpSource.runways) {
    const list = runwaysByAirport.get(runway.airportId) ?? [];
    list.push(runway);
    runwaysByAirport.set(runway.airportId, list);
  }

  const airportRows: RegionalAirportRow[] = [];
  const catalogs: Record<string, CatalogPackSerialized> = {};

  // Sort selected airports deterministically by ICAO
  const sortedAirports = [...regionalSource.selectedAirports].sort((a, b) =>
    a.airportId.localeCompare(b.airportId),
  );

  for (const apt of sortedAirports) {
    const icao = apt.airportId;
    const isCenter = icao.toUpperCase() === options.centerAirportId.toUpperCase();

    // Check runways
    const rawRunways = runwaysByAirport.get(icao) ?? [];
    const validRunways: RegionalRunwayRow[] = [];

    for (const r of rawRunways) {
      const id = stripRwPrefix(r.runwayId);
      if (
        r.bearingDeg !== undefined &&
        Number.isFinite(r.bearingDeg) &&
        r.lengthFt !== undefined &&
        Number.isFinite(r.lengthFt) &&
        r.lengthFt > 0 &&
        Number.isFinite(r.threshold.latDeg) &&
        Number.isFinite(r.threshold.lonDeg)
      ) {
        validRunways.push({
          id,
          threshold: r.threshold,
          headingTrueDeg: r.bearingDeg,
          headingMagDeg: computeMagneticHeading(r.bearingDeg, apt.magVarDeg),
          lengthFt: r.lengthFt,
        });
      }
    }

    // Sort runways deterministically by ID
    validRunways.sort((a, b) => a.id.localeCompare(b.id));

    // Determine eligibility:
    // AC3: "Only airports with source-proven towered and public-use status, valid runway geometry,
    // and an emitted catalog appear in the eligible destination lookup. CIFP-only and missing-status rows never qualify."
    const hasServiceMetadata = apt.serviceMetadata !== undefined;
    const towered =
      hasServiceMetadata && apt.serviceMetadata?.towered === true && apt.towered === true;
    const publicUse =
      hasServiceMetadata && apt.serviceMetadata?.publicUse === true && apt.publicUse === true;
    const hasValidRunways = validRunways.length > 0;

    let exclusionReason: string | undefined;
    if (!hasServiceMetadata) {
      exclusionReason = "missing_nasr_status";
    } else if (!publicUse) {
      exclusionReason = "private_use";
    } else if (!towered) {
      exclusionReason = "untowered";
    } else if (!hasValidRunways) {
      exclusionReason = "no_valid_runway";
    }

    let hasPublishedApproaches = false;
    let catalogRef: string | undefined;

    // If candidate is eligible, generate its catalog pack
    if (exclusionReason === undefined) {
      try {
        const seed = selectByRadius(cifpSource, {
          airportId: icao,
          radiusNm: options.radiusNm,
        });
        const closureSeed = radiusSeedToClosureSeed(seed);
        const policy = {
          kind: "airport-all" as const,
          onError: strict ? ("fail" as const) : ("report" as const),
        };
        const closedPack = emitClosedCatalogPack(cifpSource, closureSeed, policy);

        hasPublishedApproaches = closedPack.closure.closed.approaches.length > 0;
        catalogRef = isCenter ? "." : `airports/${icao}`;
        catalogs[catalogRef] = closedPack.serialized;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        diagnostics.push({
          severity: "warning",
          code: "CATALOG_GENERATION_FAILED",
          message: `Regional catalog generation failed for ${icao}: ${msg} (airport excluded from eligible lookup)`,
          airportId: icao,
        });
        exclusionReason = "catalog_error";
      }
    }

    const eligible = exclusionReason === undefined;

    const row: RegionalAirportRow = {
      icao,
      name: apt.name,
      arp: apt.arp,
      fieldElevFt: apt.fieldElevFt,
      magVarDeg: apt.magVarDeg,
      publicUse: apt.publicUse === true,
      towered: apt.towered === true,
      eligible,
      ...(exclusionReason ? { exclusionReason } : {}),
      ...(apt.serviceMetadata ? { serviceMetadata: apt.serviceMetadata } : {}),
      runways: validRunways,
      hasPublishedApproaches,
      ...(eligible && catalogRef ? { catalogRef } : {}),
    };

    airportRows.push(row);
  }

  // Sort airspaces deterministically by identity key
  const sortedAirspaces = [...regionalSource.selectedAirspaces].sort((a, b) =>
    a.identity.key.localeCompare(b.identity.key),
  );

  const airspaceRows: RegionalAirspaceRow[] = sortedAirspaces.map((airspace) => ({
    id: airspace.identity.key,
    name: airspace.name,
    type: airspace.type,
    ...(airspace.class ? { class: airspace.class } : {}),
    ...(airspace.specialUseKind ? { specialUseKind: airspace.specialUseKind } : {}),
    ...(airspace.centerAirportId ? { centerAirportId: airspace.centerAirportId } : {}),
    lowerLimit: {
      altitudeFt: airspace.lowerLimit.altitudeFt,
      unit: airspace.lowerLimit.unit,
      reference: airspace.lowerLimit.reference,
      rawAltitude: airspace.lowerLimit.rawAltitude,
      rawUnit: airspace.lowerLimit.rawUnit,
    },
    upperLimit: {
      altitudeFt: airspace.upperLimit.altitudeFt,
      unit: airspace.upperLimit.unit,
      reference: airspace.upperLimit.reference,
      rawAltitude: airspace.upperLimit.rawAltitude,
      rawUnit: airspace.upperLimit.rawUnit,
    },
    segments: airspace.segments.map((s) => ({
      sequence: s.sequence,
      boundaryVia: s.boundaryVia,
      boundaryViaType: s.boundaryViaType,
      position: s.position,
      ...(s.arcOrigin ? { arcOrigin: s.arcOrigin } : {}),
      ...(s.arcDistanceNm !== undefined ? { arcDistanceNm: s.arcDistanceNm } : {}),
      ...(s.arcBearingDeg !== undefined ? { arcBearingDeg: s.arcBearingDeg } : {}),
    })),
  }));

  const eligibleAirports = airportRows.filter((a) => a.eligible);
  const excludedAirports = airportRows.filter((a) => !a.eligible);

  const families = ["CIFP", "NASR_APT"];
  if (options.nasrTwrPath) {
    families.push("NASR_TWR");
  }

  const manifest: RegionalManifest = {
    schemaVersion: 1,
    centerAirportId: options.centerAirportId,
    radiusNm: options.radiusNm,
    source: {
      ...(options.effectiveCycle ? { effectiveCycle: options.effectiveCycle } : {}),
      families,
      ...(options.command ? { command: options.command } : {}),
    },
    files: {
      airports: "regional-airports.json",
      airspace: "regional-airspace.json",
    },
  };

  const airportsFile: RegionalAirportsFile = {
    schemaVersion: 1,
    airports: airportRows,
  };

  const airspaceFile: RegionalAirspaceFile = {
    schemaVersion: 1,
    airspaces: airspaceRows,
  };

  const serialized = {
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    airports: `${JSON.stringify(airportsFile, null, 2)}\n`,
    airspace: `${JSON.stringify(airspaceFile, null, 2)}\n`,
  };

  return {
    options,
    arp: regionalSource.arp,
    centerAirport: regionalSource.centerAirport,
    airports: airportRows,
    airspaces: airspaceRows,
    eligibleAirports,
    excludedAirports,
    diagnostics,
    manifest,
    catalogs,
    serialized,
  };
}

export function formatRegionalPackReport(result: RegionalPackResult, dryRun = false): string {
  const lines: string[] = [];
  lines.push("cifp regional pack:");
  lines.push(
    `  center: ${result.options.centerAirportId} at ${result.arp.latDeg.toFixed(4)}, ${result.arp.lonDeg.toFixed(4)}`,
  );
  lines.push(`  radius: ${result.options.radiusNm} NM`);
  if (result.options.effectiveCycle) {
    lines.push(`  cycle:  ${result.options.effectiveCycle}`);
  }
  lines.push(
    `  airports: ${result.airports.length} total (eligible=${result.eligibleAirports.length}, excluded=${result.excludedAirports.length})`,
  );
  for (const apt of result.eligibleAirports) {
    lines.push(
      `    eligible: ${apt.icao} (${apt.name}) runways=${apt.runways.length} approaches=${apt.hasPublishedApproaches ? "yes" : "none"}`,
    );
  }
  for (const apt of result.excludedAirports) {
    lines.push(`    excluded: ${apt.icao} (${apt.name}) reason=${apt.exclusionReason}`);
  }
  lines.push(`  airspaces: ${result.airspaces.length}`);
  lines.push(`  catalogs:  ${Object.keys(result.catalogs).length} catalog packs`);

  const errors = result.diagnostics.filter((d) => d.severity === "error");
  const warnings = result.diagnostics.filter((d) => d.severity === "warning");
  lines.push(`  diagnostics: ${errors.length} error(s), ${warnings.length} warning(s)`);

  if (errors.length > 0) {
    lines.push("errors:");
    for (const e of errors) {
      lines.push(`  [${e.code}] ${e.message}`);
    }
  }

  if (dryRun) {
    lines.push("[dry-run: no files written]");
  }

  return `${lines.join("\n")}\n`;
}

export function parseRegionalPackCliArgs(args: string[]): RegionalPackOptions {
  let cifpPath: string | undefined;
  let nasrAptPath: string | undefined;
  let nasrTwrPath: string | undefined;
  let centerAirportId: string | undefined;
  let radiusRaw: string | undefined;
  let outDir: string | undefined;
  let dryRun = false;
  let strict = true;
  let effectiveCycle: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--cifp" || arg === "--in") {
      cifpPath = requireArgValue(args, ++i, arg);
      continue;
    }
    if (arg.startsWith("--cifp=") || arg.startsWith("--in=")) {
      cifpPath = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--nasr-apt" || arg === "--apt") {
      nasrAptPath = requireArgValue(args, ++i, arg);
      continue;
    }
    if (arg.startsWith("--nasr-apt=") || arg.startsWith("--apt=")) {
      nasrAptPath = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--nasr-twr" || arg === "--twr") {
      nasrTwrPath = requireArgValue(args, ++i, arg);
      continue;
    }
    if (arg.startsWith("--nasr-twr=") || arg.startsWith("--twr=")) {
      nasrTwrPath = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--airport" || arg === "--center") {
      centerAirportId = requireArgValue(args, ++i, arg);
      continue;
    }
    if (arg.startsWith("--airport=") || arg.startsWith("--center=")) {
      centerAirportId = arg.slice(arg.indexOf("=") + 1);
      continue;
    }
    if (arg === "--radius") {
      radiusRaw = requireArgValue(args, ++i, "--radius");
      continue;
    }
    if (arg.startsWith("--radius=")) {
      radiusRaw = arg.slice("--radius=".length);
      continue;
    }
    if (arg === "--out") {
      outDir = requireArgValue(args, ++i, "--out");
      continue;
    }
    if (arg.startsWith("--out=")) {
      outDir = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--cycle") {
      effectiveCycle = requireArgValue(args, ++i, "--cycle");
      continue;
    }
    if (arg.startsWith("--cycle=")) {
      effectiveCycle = arg.slice("--cycle=".length);
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--no-strict") {
      strict = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (cifpPath === undefined || cifpPath.length === 0) {
    throw new Error("Missing --cifp <path> (see tools/cifp-import/README.md)");
  }
  if (nasrAptPath === undefined || nasrAptPath.length === 0) {
    throw new Error("Missing --nasr-apt <path> (see tools/cifp-import/README.md)");
  }
  if (centerAirportId === undefined || centerAirportId.length === 0) {
    throw new Error("Missing --airport <ICAO>");
  }
  if (radiusRaw === undefined || radiusRaw.length === 0) {
    throw new Error("Missing --radius <NM>");
  }
  if (!dryRun && (outDir === undefined || outDir.length === 0)) {
    throw new Error("Missing --out <dir> (required unless --dry-run is set)");
  }

  const radiusNm = Number(radiusRaw);
  if (!Number.isFinite(radiusNm) || radiusNm < 0) {
    throw new Error(`Invalid radius ${radiusRaw} (expected a finite number >= 0 NM)`);
  }

  return {
    cifpPath,
    nasrAptPath,
    nasrTwrPath,
    centerAirportId: centerAirportId.trim().toUpperCase(),
    radiusNm,
    outDir,
    dryRun,
    strict,
    effectiveCycle,
    command: `cifp:regional-pack --airport ${centerAirportId.trim().toUpperCase()} --radius ${radiusNm}`,
  };
}

export function runRegionalPackCli(args: string[], io: RegionalIo): void {
  const options = parseRegionalPackCliArgs(args);

  let cifpText: string;
  try {
    cifpText = io.readFile(options.cifpPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.stderr(`cifp-import error: unable to read CIFP source '${options.cifpPath}': ${msg}\n`);
    throw new Error(`MISSING_SOURCE_FILE: unable to read CIFP source '${options.cifpPath}'`);
  }

  let nasrAptText: string;
  try {
    nasrAptText = io.readFile(options.nasrAptPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.stderr(
      `cifp-import error: unable to read NASR APT source '${options.nasrAptPath}': ${msg}\n`,
    );
    throw new Error(`MISSING_SOURCE_FILE: unable to read NASR APT source '${options.nasrAptPath}'`);
  }

  let nasrTwrText: string | undefined;
  if (options.nasrTwrPath !== undefined) {
    try {
      nasrTwrText = io.readFile(options.nasrTwrPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      io.stderr(
        `cifp-import error: unable to read NASR TWR source '${options.nasrTwrPath}': ${msg}\n`,
      );
      throw new Error(
        `MISSING_SOURCE_FILE: unable to read NASR TWR source '${options.nasrTwrPath}'`,
      );
    }
  }

  const result = buildRegionalPack(cifpText, nasrAptText, nasrTwrText, options);
  io.stderr(formatRegionalPackReport(result, options.dryRun));

  const errorCount = result.diagnostics.filter((d) => d.severity === "error").length;
  if (errorCount > 0) {
    throw new Error(`cifp regional pack failed with ${errorCount} error(s) (no files written)`);
  }

  if (options.dryRun || options.outDir === undefined) {
    return;
  }

  const base = options.outDir.replace(/[\\/]+$/, "");
  io.writeFile(`${base}/regional.json`, result.serialized.manifest);
  io.writeFile(`${base}/regional-airports.json`, result.serialized.airports);
  io.writeFile(`${base}/regional-airspace.json`, result.serialized.airspace);

  for (const [ref, packSerialized] of Object.entries(result.catalogs)) {
    const targetDir = ref === "." ? base : `${base}/${ref}`;
    writeCatalogPack(packSerialized, targetDir, io.writeFile);
  }
}

function requireArgValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
