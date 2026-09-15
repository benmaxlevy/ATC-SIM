/**
 * Regional airport and airspace import orchestrator (T04-69).
 *
 * Combines local CIFP procedure/airspace data with local FAA NASR
 * airport and tower/controlled metadata to produce a validated regional
 * source model for KATL and synthetic facilities.
 *
 * Tool-only. Runtime `src/` must not import this module.
 */

import { parseFixedWidthCifp } from "./parseFixedWidth.ts";
import { enrichAirportsWithNasr, mergeNasrData, parseNasrApt, parseNasrTwr } from "./nasr.ts";
import { pointInRadius, selectAirspacesByRadius } from "./spatialIndex.ts";
import type {
  CifpDiagnostic,
  NormalizedAirspace,
  NormalizedAirport,
  SourceLatLon,
} from "./types.ts";

export interface RegionalSourceOptions {
  cifpPath: string;
  nasrAptPath: string;
  nasrTwrPath?: string;
  centerAirportId: string;
  radiusNm: number;
  outDir?: string;
  dryRun?: boolean;
  strict?: boolean;
  effectiveCycle?: string;
}

export interface RegionalCounts {
  totalAirports: number;
  totalAirspaces: number;
  selectedAirports: number;
  selectedAirspaces: number;
  toweredAirports: number;
  publicUseAirports: number;
  airspacesByClass: Record<string, number>;
}

export interface RegionalSourceResult {
  options: RegionalSourceOptions;
  arp: SourceLatLon;
  centerAirport: NormalizedAirport;
  selectedAirports: NormalizedAirport[];
  selectedAirspaces: NormalizedAirspace[];
  diagnostics: CifpDiagnostic[];
  counts: RegionalCounts;
  serialized: {
    airports: string;
    airspaces: string;
    regionalSource: string;
  };
}

export interface RegionalIo {
  readFile: (path: string) => string;
  writeFile: (path: string, body: string) => void;
  stderr: (body: string) => void;
  stdout: (body: string) => void;
}

export function buildRegionalSource(
  cifpText: string,
  nasrAptText: string,
  nasrTwrText: string | undefined,
  options: RegionalSourceOptions,
): RegionalSourceResult {
  const diagnostics: CifpDiagnostic[] = [];
  const strict = options.strict ?? true;

  // 1. Parse CIFP
  const cifpSource = parseFixedWidthCifp(cifpText);
  diagnostics.push(...cifpSource.diagnostics);

  // 2. Parse NASR
  const datasets: import("./nasr.ts").NasrDataset[] = [];
  const aptResult = parseNasrApt(nasrAptText, options.nasrAptPath);
  datasets.push(aptResult);

  if (nasrTwrText !== undefined && nasrTwrText.trim().length > 0) {
    const twrResult = parseNasrTwr(nasrTwrText, options.nasrTwrPath ?? "nasr-twr");
    datasets.push(twrResult);
  }

  const nasrMerged = mergeNasrData(datasets);

  // 3. Enrich CIFP airports with NASR metadata
  const enrichedResult = enrichAirportsWithNasr(cifpSource.airports, nasrMerged);
  diagnostics.push(...enrichedResult.diagnostics);
  const enrichedAirports = enrichedResult.enriched;

  // 4. Locate center airport
  const centerAirport = enrichedAirports.find(
    (a) => a.airportId.toUpperCase() === options.centerAirportId.toUpperCase(),
  );

  if (centerAirport === undefined) {
    diagnostics.push({
      severity: "error",
      code: "AIRPORT_NOT_FOUND",
      message: `CIFP regional import: center airport '${options.centerAirportId}' not found in source CIFP`,
      airportId: options.centerAirportId,
    });
  }

  const origin = centerAirport?.arp ?? { latDeg: 0, lonDeg: 0 };

  // 5. Select airports and airspaces by radius
  const selectedAirports =
    centerAirport !== undefined
      ? enrichedAirports
          .filter((a) => pointInRadius(origin, a.arp, options.radiusNm))
          .sort((a, b) => a.identity.key.localeCompare(b.identity.key))
      : [];

  const selectedAirspaces =
    centerAirport !== undefined
      ? selectAirspacesByRadius(cifpSource.airspaces, origin, options.radiusNm)
      : [];

  // 6. Strict validation rules
  if (strict) {
    // 6a. Each selected airport must have NASR service metadata
    for (const apt of selectedAirports) {
      if (apt.serviceMetadata === undefined) {
        diagnostics.push({
          severity: "error",
          code: "MISSING_AIRPORT_SERVICE_METADATA",
          message: `CIFP regional import: selected airport ${apt.airportId} (line ${apt.lineNo}) lacks required NASR service metadata`,
          lineNo: apt.lineNo,
          airportId: apt.airportId,
          section: "PA",
        });
      }
    }

    // 6b. Each selected airspace must have valid vertical limits and units
    for (const airspace of selectedAirspaces) {
      const lower = airspace.lowerLimit;
      const upper = airspace.upperLimit;

      if (
        lower.unit === "UNKNOWN" ||
        lower.unit === "NOT_SPECIFIED" ||
        upper.unit === "UNKNOWN" ||
        upper.unit === "NOT_SPECIFIED"
      ) {
        diagnostics.push({
          severity: "error",
          code: "INVALID_AIRSPACE_VERTICAL_LIMITS",
          message: `CIFP regional import: airspace ${airspace.identity.key} has invalid or unspecified altitude unit (lower: ${lower.unit}, upper: ${upper.unit})`,
          lineNo: airspace.sourceLineNo,
          section: airspace.identity.section,
          airportId: airspace.centerAirportId,
        });
      }

      if (lower.altitudeFt === undefined && lower.unit !== "GND" && lower.reference !== "SURFACE") {
        diagnostics.push({
          severity: "error",
          code: "INVALID_AIRSPACE_VERTICAL_LIMITS",
          message: `CIFP regional import: airspace ${airspace.identity.key} has non-surface lower limit with missing altitude value`,
          lineNo: airspace.sourceLineNo,
          section: airspace.identity.section,
          airportId: airspace.centerAirportId,
        });
      }

      if (upper.altitudeFt === undefined) {
        diagnostics.push({
          severity: "error",
          code: "INVALID_AIRSPACE_VERTICAL_LIMITS",
          message: `CIFP regional import: airspace ${airspace.identity.key} has missing upper altitude value`,
          lineNo: airspace.sourceLineNo,
          section: airspace.identity.section,
          airportId: airspace.centerAirportId,
        });
      }

      if (
        lower.altitudeFt !== undefined &&
        upper.altitudeFt !== undefined &&
        lower.altitudeFt > upper.altitudeFt
      ) {
        diagnostics.push({
          severity: "error",
          code: "INVALID_AIRSPACE_VERTICAL_LIMITS",
          message: `CIFP regional import: airspace ${airspace.identity.key} lower limit ${lower.altitudeFt} exceeds upper limit ${upper.altitudeFt}`,
          lineNo: airspace.sourceLineNo,
          section: airspace.identity.section,
          airportId: airspace.centerAirportId,
        });
      }
    }
  }

  // Count statistics
  const airspacesByClass: Record<string, number> = {};
  for (const a of selectedAirspaces) {
    const label = a.class ?? a.specialUseKind ?? "OTHER";
    airspacesByClass[label] = (airspacesByClass[label] ?? 0) + 1;
  }

  const counts: RegionalCounts = {
    totalAirports: enrichedAirports.length,
    totalAirspaces: cifpSource.airspaces.length,
    selectedAirports: selectedAirports.length,
    selectedAirspaces: selectedAirspaces.length,
    toweredAirports: selectedAirports.filter((a) => a.serviceMetadata?.towered === true).length,
    publicUseAirports: selectedAirports.filter((a) => a.serviceMetadata?.publicUse === true).length,
    airspacesByClass,
  };

  const regionalSourcePayload = {
    centerAirportId: options.centerAirportId,
    radiusNm: options.radiusNm,
    arp: origin,
    effectiveCycle: options.effectiveCycle,
    counts,
    airports: selectedAirports,
    airspaces: selectedAirspaces,
    diagnostics,
  };

  const serialized = {
    airports: `${JSON.stringify(selectedAirports, null, 2)}\n`,
    airspaces: `${JSON.stringify(selectedAirspaces, null, 2)}\n`,
    regionalSource: `${JSON.stringify(regionalSourcePayload, null, 2)}\n`,
  };

  return {
    options,
    arp: origin,
    centerAirport: centerAirport ?? {
      identity: {
        key: `PA:${options.centerAirportId}:${options.centerAirportId}`,
        section: "PA",
        recordId: options.centerAirportId,
        airportId: options.centerAirportId,
      },
      airportId: options.centerAirportId,
      name: options.centerAirportId,
      magVarDeg: 0,
      fieldElevFt: 0,
      arp: origin,
      lineNo: 0,
    },
    selectedAirports,
    selectedAirspaces,
    diagnostics,
    counts,
    serialized,
  };
}

export function formatRegionalReport(result: RegionalSourceResult, dryRun = false): string {
  const lines: string[] = [];
  lines.push("cifp regional import:");
  lines.push(
    `  center: ${result.options.centerAirportId} at ${result.arp.latDeg.toFixed(4)}, ${result.arp.lonDeg.toFixed(4)}`,
  );
  lines.push(`  radius: ${result.options.radiusNm} NM`);
  if (result.options.effectiveCycle) {
    lines.push(`  cycle:  ${result.options.effectiveCycle}`);
  }
  lines.push(
    `  airports: ${result.counts.selectedAirports} selected of ${result.counts.totalAirports} (towered=${result.counts.toweredAirports} public=${result.counts.publicUseAirports})`,
  );
  const airspaceDetail = Object.keys(result.counts.airspacesByClass)
    .sort()
    .map((k) => `${k}=${result.counts.airspacesByClass[k]}`)
    .join(" ");
  lines.push(
    `  airspaces: ${result.counts.selectedAirspaces} selected of ${result.counts.totalAirspaces}${airspaceDetail.length > 0 ? ` (${airspaceDetail})` : ""}`,
  );

  const errors = result.diagnostics.filter((d) => d.severity === "error");
  const warnings = result.diagnostics.filter((d) => d.severity === "warning");
  const skips = result.diagnostics.filter((d) => d.severity === "skip");

  lines.push(
    `  diagnostics: ${errors.length} error(s), ${warnings.length} warning(s), ${skips.length} skip(s)`,
  );

  if (errors.length > 0) {
    lines.push("errors:");
    for (const e of errors) {
      lines.push(`  [${e.code}] ${e.message}${e.lineNo ? ` (line ${e.lineNo})` : ""}`);
    }
  }

  if (dryRun) {
    lines.push("[dry-run: no files written]");
  }

  return `${lines.join("\n")}\n`;
}

export function parseRegionalCliArgs(args: string[]): RegionalSourceOptions {
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
  };
}

export function runRegionalCli(args: string[], io: RegionalIo): void {
  const options = parseRegionalCliArgs(args);

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

  const result = buildRegionalSource(cifpText, nasrAptText, nasrTwrText, options);
  io.stderr(formatRegionalReport(result, options.dryRun));

  const errorCount = result.diagnostics.filter((d) => d.severity === "error").length;
  if (errorCount > 0) {
    throw new Error(`cifp regional import failed with ${errorCount} error(s) (no files written)`);
  }

  if (options.dryRun || options.outDir === undefined) {
    return;
  }

  const base = options.outDir.replace(/[\\/]+$/, "");
  io.writeFile(`${base}/airports.json`, result.serialized.airports);
  io.writeFile(`${base}/airspaces.json`, result.serialized.airspaces);
  io.writeFile(`${base}/regional-source.json`, result.serialized.regionalSource);
}

function requireArgValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
