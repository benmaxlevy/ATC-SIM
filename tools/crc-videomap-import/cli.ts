/**
 * Developer CLI for CRC GeoJSON → arp-enu-nm video maps (T04-37).
 * Not imported by `stepWorld` or the Vite app. Offline files only.
 *
 * Output `id` is the CRC ULID. Do not densify to 1–30. `starsId` stays in note.
 */
import { convertCrcArtccMaps, formatConvertReport, trainerVideoMapJson } from "./convert.ts";
import { crcGeojsonFilename } from "./identity.ts";
import { parseCrcArtccMaps } from "./parse.ts";
import { CRC_LOCAL_ARTCC_METADATA_PATH, CRC_LOCAL_VIDEOMAP_DIR } from "./paths.ts";
// @ts-expect-error tsconfig has no @types/node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
// @ts-expect-error tsconfig has no @types/node
import { dirname, join, resolve } from "node:path";
// @ts-expect-error tsconfig has no @types/node
import { argv, exit, stderr, stdout } from "node:process";
// @ts-expect-error tsconfig has no @types/node
import { pathToFileURL } from "node:url";

export interface CliArgs {
  metadataPath: string;
  mapsDir: string;
  arpLat: number;
  arpLon: number;
  outDir: string | null;
  dryRun: boolean;
}

export interface CliIo {
  readFile: (path: string) => string;
  writeFile: (path: string, body: string) => void;
  stdout: (body: string) => void;
  stderr: (body: string) => void;
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined || value.length === 0 || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseNumber(raw: string, flag: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${flag} must be a finite number`);
  }
  return value;
}

function parseArpPair(raw: string): { lat: number; lon: number } {
  const parts = raw.split(",");
  if (parts.length !== 2) {
    throw new Error("--arp must be LAT,LON");
  }
  return {
    lat: parseNumber(parts[0]!.trim(), "--arp lat"),
    lon: parseNumber(parts[1]!.trim(), "--arp lon"),
  };
}

export function parseCliArgs(args: string[]): CliArgs {
  let metadataPath: string | undefined;
  let mapsDir: string | undefined;
  let arpLat: number | undefined;
  let arpLon: number | undefined;
  let outDir: string | null = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--metadata") {
      metadataPath = requireValue(args, ++i, "--metadata");
      continue;
    }
    if (arg.startsWith("--metadata=")) {
      metadataPath = arg.slice("--metadata=".length);
      continue;
    }
    if (arg === "--maps") {
      mapsDir = requireValue(args, ++i, "--maps");
      continue;
    }
    if (arg.startsWith("--maps=")) {
      mapsDir = arg.slice("--maps=".length);
      continue;
    }
    if (arg === "--arp-lat") {
      arpLat = parseNumber(requireValue(args, ++i, "--arp-lat"), "--arp-lat");
      continue;
    }
    if (arg.startsWith("--arp-lat=")) {
      arpLat = parseNumber(arg.slice("--arp-lat=".length), "--arp-lat");
      continue;
    }
    if (arg === "--arp-lon") {
      arpLon = parseNumber(requireValue(args, ++i, "--arp-lon"), "--arp-lon");
      continue;
    }
    if (arg.startsWith("--arp-lon=")) {
      arpLon = parseNumber(arg.slice("--arp-lon=".length), "--arp-lon");
      continue;
    }
    if (arg === "--arp") {
      const pair = parseArpPair(requireValue(args, ++i, "--arp"));
      arpLat = pair.lat;
      arpLon = pair.lon;
      continue;
    }
    if (arg.startsWith("--arp=")) {
      const pair = parseArpPair(arg.slice("--arp=".length));
      arpLat = pair.lat;
      arpLon = pair.lon;
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
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (metadataPath === undefined || metadataPath.length === 0) {
    throw new Error(
      `Missing --metadata <path> (local CRC example: ${CRC_LOCAL_ARTCC_METADATA_PATH})`,
    );
  }
  if (mapsDir === undefined || mapsDir.length === 0) {
    throw new Error(`Missing --maps <dir> (local CRC example: ${CRC_LOCAL_VIDEOMAP_DIR})`);
  }
  if (arpLat === undefined || arpLon === undefined) {
    throw new Error(
      "Missing --arp-lat/--arp-lon or --arp LAT,LON (scenario ARP; do not bake KATL ENU)",
    );
  }
  if (!dryRun && (outDir === null || outDir.length === 0)) {
    throw new Error("Missing --out <dir> (or pass --dry-run)");
  }
  return { metadataPath, mapsDir, arpLat, arpLon, outDir, dryRun };
}

function parseJson(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in ${path}: ${message}`);
  }
}

function loadGeojsonByMapId(
  mapsDir: string,
  mapIds: readonly string[],
  io: CliIo,
): Map<string, unknown> {
  const loaded = new Map<string, unknown>();
  for (const id of mapIds) {
    const path = join(mapsDir, crcGeojsonFilename(id));
    let text: string;
    try {
      text = io.readFile(path);
    } catch {
      continue;
    }
    try {
      loaded.set(id, JSON.parse(text) as unknown);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      loaded.set(id, { type: "InvalidJson", error: message });
    }
  }
  return loaded;
}

export function runCli(args: string[], io: CliIo = defaultIo()): void {
  const parsed = parseCliArgs(args);
  const metadata = parseJson(io.readFile(parsed.metadataPath), parsed.metadataPath);
  const artcc = parseCrcArtccMaps(metadata);
  const geojsonByMapId = loadGeojsonByMapId(
    parsed.mapsDir,
    artcc.videoMaps.map((row) => row.id),
    io,
  );
  const batch = convertCrcArtccMaps(artcc, geojsonByMapId, {
    latDeg: parsed.arpLat,
    lonDeg: parsed.arpLon,
  });
  io.stderr(`${formatConvertReport(batch)}\n`);
  if (parsed.dryRun || parsed.outDir === null) {
    return;
  }
  for (const converted of batch.maps) {
    io.writeFile(
      join(parsed.outDir, `${converted.file.id}.json`),
      trainerVideoMapJson(converted.file),
    );
  }
}

function defaultIo(): CliIo {
  return {
    readFile: (path) => {
      if (!existsSync(path)) {
        throw new Error(`Missing file ${path}`);
      }
      return readFileSync(path, "utf8");
    },
    writeFile: (path, body) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
    },
    stdout: (body) => {
      stdout.write(body);
    },
    stderr: (body) => {
      stderr.write(body);
    },
  };
}

function isDirectRun(): boolean {
  const entry = argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  try {
    runCli(argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`crc-videomaps: ${message}\n`);
    exit(1);
  }
}
