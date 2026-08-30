/**
 * Generic local CIFP pack (T04-34).
 *
 * parse → `selectByRadius` → `CifpRadiusSeed` to `ClosureSeed` → closure /
 * catalog writer → ICAO `files` layout. No airport-id parse branch. Runtime
 * `src/` must not import this module.
 */

import { detectCifpDialect } from "./arincLayout.ts";
import {
  emitClosedCatalogPack,
  type CatalogPackSerialized,
  type ClosedCatalogPack,
} from "./catalogWriter.ts";
import type { ClosureCounts, ClosurePolicy, ClosureSeed } from "./closure.ts";
import { parseFixedWidthCifp } from "./parseFixedWidth.ts";
import { selectByRadius, type CifpRadiusSeed } from "./spatialIndex.ts";
import type { NormalizedCifpSource } from "./types.ts";

const ICAO_RE = /^[A-Z][A-Z0-9]{2,3}$/;

export const CATALOG_PACK_FILES = [
  "catalog.json",
  "vors.json",
  "ndbs.json",
  "ils.json",
  "fixes.json",
  "procedures.json",
  "sids.json",
] as const;

export interface PackCliArgs {
  inPath: string;
  airportId: string;
  radiusNm: number;
  sidIds?: string[];
  starIds?: string[];
  approachIds?: string[];
  outDir: string;
  dryRun: boolean;
}

export interface PackIo {
  readFile: (path: string) => string;
  writeFile: (path: string, body: string) => void;
  stdout: (body: string) => void;
  stderr: (body: string) => void;
}

export interface PackResult {
  seed: CifpRadiusSeed;
  closureSeed: ClosureSeed;
  policy: ClosurePolicy;
  pack: ClosedCatalogPack;
  outputPaths: string[];
}

export function parsePackCliArgs(args: string[]): PackCliArgs {
  let inPath: string | undefined;
  let airportRaw: string | undefined;
  let radiusRaw: string | undefined;
  let sidIds: string[] | undefined;
  let starIds: string[] | undefined;
  let approachIds: string[] | undefined;
  let outDir: string | undefined;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--in") {
      inPath = requireValue(args, ++i, "--in");
      continue;
    }
    if (arg.startsWith("--in=")) {
      inPath = arg.slice("--in=".length);
      continue;
    }
    if (arg === "--airport") {
      airportRaw = requireValue(args, ++i, "--airport");
      continue;
    }
    if (arg.startsWith("--airport=")) {
      airportRaw = arg.slice("--airport=".length);
      continue;
    }
    if (arg === "--radius") {
      radiusRaw = requireValue(args, ++i, "--radius");
      continue;
    }
    if (arg.startsWith("--radius=")) {
      radiusRaw = arg.slice("--radius=".length);
      continue;
    }
    if (arg === "--out") {
      outDir = requireValue(args, ++i, "--out");
      continue;
    }
    if (arg.startsWith("--out=")) {
      outDir = arg.slice("--out=".length);
      continue;
    }
    if (arg === "--sids" || arg.startsWith("--sids=")) {
      const taken = takeIdList(args, i, "--sids");
      sidIds = appendIds(sidIds, taken.values);
      i = taken.nextIndex;
      continue;
    }
    if (arg === "--stars" || arg.startsWith("--stars=")) {
      const taken = takeIdList(args, i, "--stars");
      starIds = appendIds(starIds, taken.values);
      i = taken.nextIndex;
      continue;
    }
    if (arg === "--approaches" || arg.startsWith("--approaches=")) {
      const taken = takeIdList(args, i, "--approaches");
      approachIds = appendIds(approachIds, taken.values);
      i = taken.nextIndex;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (inPath === undefined || inPath.length === 0) {
    throw new Error("Missing --in <path> (see tools/cifp-import/README.md)");
  }
  if (airportRaw === undefined || airportRaw.length === 0) {
    throw new Error("Missing --airport <ICAO>");
  }
  if (radiusRaw === undefined || radiusRaw.length === 0) {
    throw new Error("Missing --radius <NM>");
  }
  if (outDir === undefined || outDir.length === 0) {
    throw new Error("Missing --out <dir>");
  }

  const airportId = airportRaw.trim().toUpperCase();
  if (!ICAO_RE.test(airportId)) {
    throw new Error(`Invalid airport ${airportRaw} (expected 3–4 character ICAO)`);
  }

  const radiusNm = Number(radiusRaw);
  if (!Number.isFinite(radiusNm) || radiusNm < 0) {
    throw new Error(`Invalid radius ${radiusRaw} (expected a finite number >= 0 NM)`);
  }

  const parsed: PackCliArgs = {
    inPath,
    airportId,
    radiusNm,
    outDir,
    dryRun,
  };
  if (sidIds !== undefined) {
    parsed.sidIds = sidIds;
  }
  if (starIds !== undefined) {
    parsed.starIds = starIds;
  }
  if (approachIds !== undefined) {
    parsed.approachIds = approachIds;
  }
  return parsed;
}

export function radiusSeedToClosureSeed(seed: CifpRadiusSeed): ClosureSeed {
  return {
    airportId: seed.airportId,
    radiusNm: seed.radiusNm,
    selected: {
      airports: seed.airports,
      runways: seed.runways,
      navaids: seed.navaids,
      fixes: seed.fixes,
      stars: seed.stars,
      sids: seed.sids,
      approaches: seed.approaches,
    },
  };
}

export function parseSourceForPack(text: string): NormalizedCifpSource {
  if (detectCifpDialect(text) !== "fixed-width") {
    throw new Error(
      "cifp-pack: --in must be fixed-width ARINC 424 CIFP (comma subset uses cifp:import)",
    );
  }
  return parseFixedWidthCifp(text);
}

export function closurePolicyFromPackArgs(args: PackCliArgs): ClosurePolicy {
  const explicit =
    args.sidIds !== undefined || args.starIds !== undefined || args.approachIds !== undefined;
  const onError = args.dryRun ? ("report" as const) : ("fail" as const);
  if (!explicit) {
    return { kind: "airport-all", onError };
  }
  return {
    kind: "explicit",
    sidIds: args.sidIds ?? [],
    starIds: args.starIds ?? [],
    approachIds: args.approachIds ?? [],
    onError,
  };
}

export function packFromText(text: string, args: PackCliArgs): PackResult {
  const source = parseSourceForPack(text);
  const seed = selectByRadius(source, {
    airportId: args.airportId,
    radiusNm: args.radiusNm,
  });
  const closureSeed = radiusSeedToClosureSeed(seed);
  const policy = closurePolicyFromPackArgs(args);
  const pack = emitClosedCatalogPack(source, closureSeed, policy);
  return {
    seed,
    closureSeed,
    policy,
    pack,
    outputPaths: outputPathsFor(args.outDir, pack.serialized),
  };
}

export function formatPackReport(result: PackResult, dryRun: boolean): string {
  const { pack, policy, outputPaths } = result;
  const { seedCounts, closedCounts, addedCounts, diagnostics } = pack.closure;
  const skipped = formatCountMap(pack.closure.closed.skippedByType);
  const unsupported = diagnostics
    .filter((row) => row.code === "UNSUPPORTED_ELEMENT")
    .map((row) => row.message);
  const lines = [
    dryRun ? "cifp-pack: dry-run" : "cifp-pack: write",
    `airport: ${pack.closure.airportId}`,
    `radiusNm: ${pack.closure.radiusNm ?? result.seed.radiusNm}`,
    `policy: ${policy.kind}`,
    `seed: ${formatCounts(seedCounts)}`,
    `closed: ${formatCounts(closedCounts)}`,
    `added: ${formatCounts(addedCounts)}`,
    `unsupported records: ${skipped}`,
  ];
  if (unsupported.length > 0) {
    lines.push(`unsupported elements: ${unsupported.length}`);
    for (const message of unsupported) {
      lines.push(`  ${message}`);
    }
  }
  lines.push("output:");
  for (const path of outputPaths) {
    lines.push(`  ${path}`);
  }
  return `${lines.join("\n")}\n`;
}

export function writeCatalogPack(
  serialized: CatalogPackSerialized,
  outDir: string,
  writeFile: (path: string, body: string) => void,
): string[] {
  const paths = outputPathsFor(outDir, serialized);
  const names = Object.keys(serialized).sort();
  for (let i = 0; i < names.length; i++) {
    const name = names[i]!;
    const body = serialized[name as keyof CatalogPackSerialized];
    if (body === undefined) {
      continue;
    }
    writeFile(paths[i]!, body);
  }
  return paths;
}

export function runPackCli(args: string[], io: PackIo): void {
  const parsed = parsePackCliArgs(args);
  const text = io.readFile(parsed.inPath);
  const result = packFromText(text, parsed);
  io.stderr(formatPackReport(result, parsed.dryRun));
  if (parsed.dryRun) {
    return;
  }
  writeCatalogPack(result.pack.serialized, parsed.outDir, io.writeFile);
}

function outputPathsFor(outDir: string, serialized: CatalogPackSerialized): string[] {
  const base = outDir.replace(/[\\/]+$/, "");
  return Object.keys(serialized)
    .sort()
    .filter((name) => serialized[name as keyof CatalogPackSerialized] !== undefined)
    .map((name) => `${base}/${name}`);
}

function formatCounts(counts: ClosureCounts): string {
  return [
    `airports=${counts.airports}`,
    `runways=${counts.runways}`,
    `navaids=${counts.navaids}`,
    `fixes=${counts.fixes}`,
    `stars=${counts.stars}`,
    `sids=${counts.sids}`,
    `approaches=${counts.approaches}`,
  ].join(" ");
}

function formatCountMap(byType: Record<string, number>): string {
  const parts = Object.keys(byType)
    .sort()
    .map((type) => `${type}=${byType[type]}`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

function appendIds(existing: string[] | undefined, extra: string[]): string[] {
  const out = existing === undefined ? [] : [...existing];
  for (const id of extra) {
    if (id.length === 0) {
      continue;
    }
    out.push(id.toUpperCase());
  }
  return out;
}

function takeIdList(
  args: string[],
  index: number,
  flag: string,
): { values: string[]; nextIndex: number } {
  const arg = args[index]!;
  if (arg.startsWith(`${flag}=`)) {
    return { values: splitIds(arg.slice(flag.length + 1)), nextIndex: index };
  }
  const values: string[] = [];
  let i = index + 1;
  if (args[i] === undefined || args[i]!.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  while (i < args.length) {
    const token = args[i]!;
    if (token.startsWith("--")) {
      break;
    }
    values.push(...splitIds(token));
    i += 1;
  }
  return { values, nextIndex: i - 1 };
}

function splitIds(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}
